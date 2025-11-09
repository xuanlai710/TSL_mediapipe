// --- 設定與常數 ---
//想法:加倒數計時器、要請使用者比完後離開嗎，還是保留現在
// 狀態變數
let isCameraRunning = false;
let cameraStream = null; // 用於儲存 Camera 實例以便停止
const EXAM_DURATION_SECONDS = 8; // 設定考試時間秒
// --- 測驗流程狀態 (用於串接 quiz.js) ---
let currentQuizIndex = 0; // 測驗總進度中的當前索引
let totalQuizLength = 1; // 測驗總長度 (至少為 1)
let targetSignWord = "對不起"; // 當前關卡目標單字


// DOM 元素 (使用 try-catch 確保所有元素都存在)
let videoElement, canvasElement, canvasCtx, titleChange, statusMessage, predictionDisplayDebug, cameraToggleButton, resultFeedback, resultText, countdownTimer, timeRemainingDisplay,progressBar;

//API設定
const FLASK_API_URL = 'http://192.168.150.236:5000/predict'; // Flask API 端點
const MAX_FRAME_HISTORY = 30; // 後端模型需要的固定幀數 (對應Python的FRAME_LEN)
const API_SEND_INTERVAL = 5; // 每隔 ? 幀就發送一次數據給 API
let frameCounter = 0;
let predictionData = []; // 用於累積最近 MAX_FRAME_HISTORY 幀的數據

// --- 平滑邏輯設定 (解決中途判定問題) ---
const HISTORY_LENGTH = 15; // 判斷大小 (最近15幀)
const MATCH_THRESHOLD = 6; // 窗口中必須有 幀匹配才判定成功
const CONFIDENCE_THRESHOLD = 0.6; // 僅考慮信心度大於此值的預測
let matchHistory = []; // 用於儲存最近 N 幀的匹配狀態 (true/false)

let pendingJudge = false; // 防止重複顯示
let timeoutHandle = null; // 控制逾時顯示
let judgeDelayHandle = null; // 延遲顯示用
let countdownInterval = null; //用於儲存 setInterval 句柄，提供平滑的倒數效果
let isFirstFrameProcessed = false; // 新增：追蹤是否已成功處理第一幀 (修正延遲問題的關鍵)
let startTime = 0; // 用於計算剩餘時間

// --- MediaPipe 設定 ---
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

//在DOM 載入後初始化所有DOM引用

function initializeDOM() {
    try {
        videoElement = document.getElementById('camera-stream');// 抓取 ID 為 'camera-stream'
        canvasElement = document.getElementById('output-canvas');
        canvasCtx = canvasElement.getContext('2d');//Canvas 元素的內建方法，要求瀏覽器提供一個 2D 繪圖環境。
        titleChange = document.getElementById('titlechange');//目前題目
        statusMessage = document.getElementById('status-message');//目前小提醒
        predictionDisplayDebug = document.getElementById('prediction-display-debug');//模型輸出: 之後會刪掉
        cameraToggleButton = document.getElementById('camera-toggle-btn');//控制鏡頭是否開啟按鈕
        skipButton = document.getElementById('skip-btn');//失敗後刪除鍵
        resultFeedback = document.getElementById('result-feedback');//結果顯示 之後可能刪掉
        resultText = document.getElementById('result-text');//
        icon = document.getElementById('result-icon');
        countdownTimer = document.getElementById('countdown-timer');
        timeRemainingDisplay = document.getElementById('time-remaining');
        progressBar = document.getElementById('progress-bar'); //抓取 progress-bar 元素
        
        // 檢查關鍵元素是否存在
        if (!videoElement || !canvasElement || !cameraToggleButton || !countdownTimer || !timeRemainingDisplay || !progressBar || !skipButton) {
            console.error("DOM 錯誤: 找不到所有必要的 HTML 元素 。請檢查 ID 是否正確。");
            statusMessage.textContent = "初始化失敗：缺少關鍵 HTML 元素。";
            return false;
        }

        // --- 讀取 Session 進度並更新 UI ---
        const savedIndex = sessionStorage.getItem('currentQuizIndex');
        const savedLength = sessionStorage.getItem('totalQuizLength');
        const savedTarget = sessionStorage.getItem('targetSignWord');
        if (savedIndex !== null && savedLength !== null && savedTarget !== null) {
            // 字串轉換為以十進位表示的整數
            currentQuizIndex = parseInt(savedIndex);
            totalQuizLength = parseInt(savedLength);
            targetSignWord = savedTarget;
        }

        // 初始狀態設定
        cameraToggleButton.textContent = "啟動鏡頭"; 
        // 使用從 sessionStorage 讀取或預設的目標單字
        titleChange.textContent = targetSignWord; 
        // 初始隱藏 顯示結果、倒數計時器 、skipbtn
        resultFeedback.classList.add('d-none');
        countdownTimer.classList.add('d-none');
        skipButton.classList.add('d-none'); 
        // 初始化顯示時間
        timeRemainingDisplay.textContent = `${EXAM_DURATION_SECONDS}.00`; 
        
        // 設定 Canvas 初始尺寸 (用於佔位)

        updateProgress(); // 呼叫更新進度條
        // 設定事件監聽器
        cameraToggleButton.addEventListener('click', toggleCamera);
        skipButton.addEventListener('click', skipExam);

        console.log("DOM 元素初始化成功。");
        return true;
    } catch (e) {
        console.error("初始化 DOM 時發生錯誤:", e);
        return false;
    }
}

//---------------更新進度條 --------------------
function updateProgress(isSuccess = false) {
    let progressIndex = currentQuizIndex;
    if (isSuccess) {
        // 成功時，進度條移動到下一關卡的位置
        progressIndex = currentQuizIndex + 1; 
    }
    
    // 計算百分比
    const displayProgress = Math.min(100, (progressIndex / totalQuizLength) * 100);

    progressBar.style.width = displayProgress + '%';
    progressBar.setAttribute('aria-valuenow', displayProgress);
}

// --- 計時器邏輯 ---
function updateCountdown() {
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = Math.max(0, EXAM_DURATION_SECONDS - elapsed);
    
    if (remaining <= 0.01) {
        // 時間到，逾時處理在 toggleCamera 啟動時的 timeoutHandle 負責
        timeRemainingDisplay.textContent = "0.00";
        stopCountdown();
        return; 
    }
    
    // 更新顯示，保留兩位小數
    timeRemainingDisplay.textContent = remaining.toFixed(2);
    // 接近結束時變色提醒
    if (remaining <= 3) {
        timeRemainingDisplay.classList.remove('text-primary');
        timeRemainingDisplay.classList.add('text-danger');
    } else {
        timeRemainingDisplay.classList.remove('text-danger');
        timeRemainingDisplay.classList.add('text-primary');
    }
}

function startCountdown() {
    stopCountdown(); // 確保開始前先清除舊的計時器
    
    // 顯示計時器
    countdownTimer.classList.remove('d-none'); 
    timeRemainingDisplay.textContent = `${EXAM_DURATION_SECONDS}.00秒`;
    timeRemainingDisplay.classList.remove('text-danger');
    timeRemainingDisplay.classList.add('text-primary');
    
    // 啟動倒數計時
    startTime = Date.now();
    countdownInterval = setInterval(updateCountdown, 50); // 每 50ms 更新一次，提供平滑的倒數效果
    console.log(`倒數計時器啟動，總時間 ${EXAM_DURATION_SECONDS} 秒。`);
}

function stopCountdown() {
    if (countdownInterval !== null) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        console.log("倒數計時器停止。");
    }
    // 停止時隱藏計時器，並重設顯示時間
    if (countdownTimer) {
        countdownTimer.classList.add('d-none');
    }
    if (timeRemainingDisplay) {
        timeRemainingDisplay.textContent = `${EXAM_DURATION_SECONDS}.00`;
    }
}
/** 重新開始測驗 */
function retryExam() {
    // 移除結果和失敗按鈕
    resultFeedback.classList.add('d-none');
    skipButton.classList.add('d-none');
    
    // 重新設定 UI 狀態
    statusMessage.textContent = `請點擊「啟動鏡頭」再次嘗試。`;
    cameraToggleButton.textContent = "啟動鏡頭";
    cameraToggleButton.classList.remove('btn-danger', 'btn-success');
    cameraToggleButton.classList.add('btn-primary');
    
    // 重新綁定正常的 toggleCamera 事件
    cameraToggleButton.removeEventListener('click', redirectToQuiz);
    cameraToggleButton.removeEventListener('click', retryExam);
    cameraToggleButton.addEventListener('click', toggleCamera);//開啟/關閉鏡頭
    
    // 清除 session 失敗標記
    sessionStorage.removeItem('examResult');
    
    // 重設狀態變數
    pendingJudge = false;
    isFirstFrameProcessed = false;
    stopCountdown();
}
/** 成功後導航至下一關 */
function redirectToQuiz() {
    // 1. 設置成功標記
    sessionStorage.setItem('currentQuizIndex', currentQuizIndex); // 儲存當前索引，quiz.js 會自動 +1
    sessionStorage.setItem('examResult', 'success');

    // 2. 導向回 quiz.html
    window.location.href = '../測驗環境js版/quiz.html'; 
}

/** 跳過測驗 (失敗並導航至下一關) */
function skipExam() {
    // 1. 設置跳過標記
    sessionStorage.setItem('currentQuizIndex', currentQuizIndex); // 儲存當前索引，quiz.js 會自動 +1
    sessionStorage.setItem('examResult', 'skip'); // 使用 'skip' 標記跳過

    // 2. 導向回 quiz.html
    window.location.href = '../測驗環境js版/quiz.html'; 
}

//---抓取節點---
function formatLandmarks(results) {
    const left_landmarks = [];
    const right_landmarks = [];

    if (results.multiHandLandmarks) {
        results.multiHandLandmarks.forEach((landmarks, index) => {
            // MediaPipe 的 handedness 標籤是 'Left' 或 'Right'
            const handType = results.multiHandedness[index].label;
            
            //分配給後端
            if (handType === 'Left') {
                left_landmarks.push(landmarks.map(lm => [lm.x, lm.y, lm.z]));
            } else if (handType === 'Right') {
                right_landmarks.push(landmarks.map(lm => [lm.x, lm.y, lm.z]));
            }
        });
    }
    const zeroHand = Array(21).fill([0, 0, 0]);
    //沒抓到則回傳21*(0,0,0)
    const leftOutput = left_landmarks.length > 0 ? left_landmarks[0] : zeroHand;
    const rightOutput = right_landmarks.length > 0 ? right_landmarks[0] : zeroHand;
    return {
        left: leftOutput, // 格式: [[x0,y0,z0], [x1,y1,z1], ..., [x20,y20,z20]]
        right: rightOutput
    };
}
//---判斷邏輯 ---
function showFeedback(isSuccess, message) {
    // 顯示結果
    resultFeedback.classList.remove('d-none');
    
    // 儲存進度結果
    sessionStorage.setItem('examResult', isSuccess ? 'success' : 'fail');
    
    //成功失敗訊息和圖示顯示
    if (isSuccess) {
            icon.src = '../img/right.png';
            resultText.textContent = message ;
            resultText.classList.remove('text-danger');
            resultText.classList.add('text-success');
    } else {
        icon.src = '../img/wrong.png';
        resultText.textContent = message;
        resultText.classList.remove('text-success');
        resultText.classList.add('text-danger');
    }

    // 清理狀態
    matchHistory = [];
    predictionData = [];
    frameCounter = 0;
    pendingJudge = false;

    clearTimeout(timeoutHandle);
    clearTimeout(judgeDelayHandle);
    stopCountdown(); //確保停止計時器
    isFirstFrameProcessed = false;
    
    // 確保鏡頭已停止
    if (isCameraRunning) {
        console.log("結果已顯示，停止鏡頭。");
        cameraStream.stop();
        isCameraRunning = false;
        cameraStream = null;
    }
        
    // 移除舊的 toggleCamera 監聽器，準備綁定新的按鈕功能
    cameraToggleButton.removeEventListener('click', toggleCamera); //開啟/關閉鏡頭
    cameraToggleButton.removeEventListener('click', retryExam); // 移除可能的 retry 監聽器
    cameraToggleButton.removeEventListener('click', redirectToQuiz); // 移除可能的 success 監聽器
    skipButton.classList.add('d-none'); // 預設隱藏跳過按鈕 (失敗時會重新顯示)

    if (isSuccess) {
        // --- 成功：顯示「下一關」按鈕並更新進度條 ---
        updateProgress(true); // 更新進度條到下一關的位置
        
        cameraToggleButton.textContent = "下一關";
        cameraToggleButton.classList.remove('btn-danger', 'btn-primary');
        cameraToggleButton.classList.add('btn-success');
        
        // 綁定跳轉事件
        cameraToggleButton.addEventListener('click', redirectToQuiz, { once: true });
        
        statusMessage.textContent = "恭喜您！請點擊「下一關」繼續。";
    } else {
        // --- 失敗/超時：顯示「重新做」和「跳過」按鈕 ---
        // 進度條保持不變 (updateProgress() 在此處不需要呼叫)
        
        cameraToggleButton.textContent = "重新做";
        cameraToggleButton.classList.remove('btn-success', 'btn-primary');
        cameraToggleButton.classList.add('btn-danger');
        
        skipButton.classList.remove('d-none'); // 顯示跳過按鈕
        
        // 綁定重新做事件 (skipExam 已在 initializeDOM 綁定)
        cameraToggleButton.addEventListener('click', retryExam, { once: true });
        
        statusMessage.textContent = "實作失敗。您可以重試或跳過。";
    }
}
//平滑處理預測結果
function checkSmoothing(predictedLabel, confidence) {//預測中文結果，信心值
    const currentTarget = titleChange.textContent; // 中文題目直接比對
    // 1. 判斷當前幀是否匹配目標詞彙並超過信心度閾值
    const isMatch = predictedLabel === currentTarget && confidence > CONFIDENCE_THRESHOLD;
    // 2. 將目前結果放入歷史確認
    matchHistory.push(isMatch);
    if (matchHistory.length > HISTORY_LENGTH) 
        matchHistory.shift();// 保持歷史記錄長度
        
    // 3. 計算匹配成功的幀數
    const successfulMatches = matchHistory.filter(Boolean).length;
    
    // 4. 更新偵錯訊息，顯示平滑狀態
    predictionDisplayDebug.textContent += `\n平滑狀態: ${successfulMatches} / ${HISTORY_LENGTH} 幀匹配，需達標: ${MATCH_THRESHOLD}`;

    // 5. 執行最終判定
      if (!pendingJudge && successfulMatches >= MATCH_THRESHOLD) {
        pendingJudge = true;
        showFeedback(true, `正確！`,);
    }
}
//發送資料到 API
async function sendToAPI(historyData) {
    try {
        // 組合API需要的格式
        const leftFrames = historyData.map(d => d.left);
        const rightFrames = historyData.map(d => d.right);

        const response = await axios.post(FLASK_API_URL, {
            left: leftFrames,
            right: rightFrames
        });
        
        const result = response.data;
        const confidencePercent = (result.confidence * 100).toFixed(2);
        
        // 更新偵錯訊息 (基礎 API 輸出)
        predictionDisplayDebug.textContent = `狀態: 鏡頭運行中... (API 成功)\n` +
                                             `預測結果 (中): ${result.label}\n` +
                                            //  `預測結果 (英): ${result.english_label}\n` +
                                             `信心度: ${confidencePercent}%\n`;
                                             
        // 只在沒有判定結果時才檢查
        if (!pendingJudge) checkSmoothing(result.label, result.confidence);
        
    } catch (error) {
        // 處理 API 錯誤
        if (error.code === 'ERR_NETWORK' || error.response?.status >= 500) {
            predictionDisplayDebug.textContent = `狀態: 鏡頭運行中... (API 錯誤)\n` +
                                                 `連線錯誤或後端模型未運行 (請檢查 Flask 伺服器狀態)`;
        } else {
            predictionDisplayDebug.textContent = `狀態: 鏡頭運行中... (API 錯誤)\n` +
                                                 `發生錯誤: ${error.message}`;
        }
        // API 連線失敗時，清空歷史，防止數據累積錯誤
        matchHistory = [];
    }
}

/// --- 核心處理函數 ---

function onResults(results) {
    if (!isCameraRunning) return;
    
    //繪製結果 (Canvas 尺寸與影像一致)
    canvasElement.width = results.image.width;
    canvasElement.height = results.image.height; 
    
    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    //繪製背景影像
    canvasCtx.drawImage(results.image, 0, 0, canvasWidth, canvasHeight);
    
    //繪製手部骨架
    if (results.multiHandLandmarks   && typeof HAND_CONNECTIONS !== 'undefined') {
        // --- 修正延遲問題：在第一次成功處理手部幀時才啟動計時器 ---
        if (isCameraRunning && !isFirstFrameProcessed) {
            isFirstFrameProcessed = true;
            
            // 啟動倒數計時器
            startCountdown(); 
            
            // 啟動逾時倒數 (使用常數 EXAM_DURATION_SECONDS)超時未完成「${titleChange.textContent}」
            timeoutHandle = setTimeout(() => {
                if (!pendingJudge) {
                    showFeedback(false, `判定失敗！`);
                }
            }, EXAM_DURATION_SECONDS * 1000);
            
            // 更新狀態為準備就緒
            statusMessage.textContent = `鏡頭已啟動。請做出 "${titleChange.textContent}" 的動作。`; 
            console.log("MediaPipe 成功處理第一幀，計時開始！");
        }
        //繪製節點
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
            drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});
        }
        // 數據累積與發送
        const currentLandmarks = formatLandmarks(results);
        // 將當前幀數據推入歷史記錄
        predictionData.push(currentLandmarks);
        // 保持歷史記錄長度為 MAX_FRAME_HISTORY 幀
        if (predictionData.length > MAX_FRAME_HISTORY) {
            predictionData.shift(); // 移除最舊的一幀
        }

        // 每隔 API_SEND_INTERVAL 幀發送一次數據 (即時串流)
        if (frameCounter % API_SEND_INTERVAL === 0 && predictionData.length === MAX_FRAME_HISTORY) {
            sendToAPI(predictionData);
        }
        
        frameCounter++;
        
    } // else {
    //     predictionDisplayDebug.textContent += `狀態: 偵測不到手部，正在傳送空數據。`;
    // }
    canvasCtx.restore();
}

//-----------啟動/停止鏡頭
function toggleCamera() {
     if (isCameraRunning) {
        // 停止邏輯
        console.log("嘗試停止鏡頭...");
        if (cameraStream) {
            cameraStream.stop();
            cameraStream = null;
        }
        isCameraRunning = false;
        cameraToggleButton.textContent = "啟動鏡頭";
        cameraToggleButton.classList.remove('btn-danger');
        cameraToggleButton.classList.add('btn-primary');
        statusMessage.textContent = "鏡頭已停止。";
        predictionDisplayDebug.textContent = "狀態: 尚未啟動鏡頭";
        resultFeedback.classList.add('d-none');//隱藏結果顯示
        predictionData = [];//累積一段時間節點數據
        matchHistory = [];//存放API回傳判斷結果
        frameCounter = 0;//目前累積總幀數
        clearTimeout(timeoutHandle);
        clearTimeout(judgeDelayHandle);
        stopCountdown();
        isFirstFrameProcessed = false;//尚未開始第一次偵測節點
        skipButton.classList.add('d-none'); // 手動停止時隱藏跳過按鈕
        console.log("鏡頭已停止。");
    }
    else {
        // 啟動邏輯
        cameraToggleButton.textContent = "載入中...";
        cameraToggleButton.disabled = true;
        statusMessage.textContent = "正在請求鏡頭權限...";
        
        try {
            if (typeof Camera === 'undefined') {
                throw new Error("Camera 函式未定義。請檢查 camera_utils.js 是否載入成功。");
            }
            
            console.log("創建 MediaPipe Camera 實例...");
            cameraStream = new Camera(videoElement, {
                onFrame: async () => {
                    await hands.send({ image: videoElement });
                },
            });

            console.log("呼叫cameraStream.start()...");
            cameraStream.start()
                .then(() => {
                    isCameraRunning = true;
                    videoElement.play();
                    
                    cameraToggleButton.textContent = "停止鏡頭";
                    cameraToggleButton.disabled = false;
                    cameraToggleButton.classList.remove('btn-primary');
                    cameraToggleButton.classList.add('btn-danger');
                    statusMessage.textContent = `鏡頭已啟動。請做出 "${titleChange.textContent}" 的動作。(等待 MediaPipe 載入...)`;
                    predictionDisplayDebug.textContent = "狀態: 鏡頭運行中...";
                    console.log("MediaPipe Camera 成功啟動！");
                })
                .catch(error => {
                    console.error("無法啟動鏡頭 (Promise Catch):", error);
                    let errorName = error.name || error.message;
                    let displayMessage = `錯誤：無法存取鏡頭。請檢查權限及是否有其他程式佔用。錯誤類型: ${errorName}`;
                    
                    if (errorName === 'NotFoundError') {
                         displayMessage = "錯誤：找不到鏡頭設備。請確認鏡頭是否連接正確或內建鏡頭是否啟用。";
                    }

                    statusMessage.textContent = displayMessage;
                    cameraToggleButton.textContent = "啟動鏡頭";
                    cameraToggleButton.disabled = false;
                    cameraStream = null;
                    isCameraRunning = false;
                    stopCountdown();
                });
        } catch (error) {
            console.error("啟動鏡頭時發生同步錯誤:", error);
            statusMessage.textContent = `嚴重錯誤：程式碼執行失敗。請檢查控制台。`;
            cameraToggleButton.textContent = "啟動鏡頭";
            cameraToggleButton.disabled = false;
            stopCountdown();
        }
    }
}

// 確保在 DOM 載入後執行初始化
window.onload = initializeDOM;
