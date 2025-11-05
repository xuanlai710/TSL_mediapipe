// --- 設定與常數 ---
//想法:加倒數計時器、要請使用者比完後離開嗎，還是保留現在
// 遊戲狀態變數
let isCameraRunning = false;
let cameraStream = null; // 用於儲存 Camera 實例以便停止

// DOM 元素 (使用 try-catch 確保所有元素都存在)
let videoElement, canvasElement, canvasCtx, titleChange, statusMessage, predictionDisplayDebug, cameraToggleButton, resultFeedback, resultText;

//API設定
const FLASK_API_URL = 'http://192.168.0.234:5000/predict'; // 您的 Flask API 端點
const MAX_FRAME_HISTORY = 30; // 後端模型需要的固定幀數 (對應 Python 中的 FRAME_LEN)
const API_SEND_INTERVAL = 5; // 每隔 1 幀就發送一次數據給 API
let frameCounter = 0;
let predictionData = []; // 用於累積最近 MAX_FRAME_HISTORY 幀的數據

// --- 平滑邏輯設定 (解決中途判定問題) ---
const HISTORY_LENGTH = 15; // 判斷大小 (最近 20 幀)
const MATCH_THRESHOLD = 6; // 窗口中必須有 幀匹配才判定成功
const CONFIDENCE_THRESHOLD = 0.6; // 僅考慮信心度大於此值的預測
let matchHistory = []; // 用於儲存最近 N 幀的匹配狀態 (true/false)

let pendingJudge = false; // 防止重複顯示
let timeoutHandle = null; // 控制逾時顯示
let judgeDelayHandle = null; // 延遲顯示用

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
        resultFeedback = document.getElementById('result-feedback');//結果顯示 之後可能刪掉
        resultText = document.getElementById('result-text');//
        //feedback = document.getElementById('result-feedback');
        icon = document.getElementById('result-icon');
        //text = document.getElementById('result-text');
        
        // 檢查關鍵元素是否存在
        if (!videoElement || !canvasElement || !cameraToggleButton) {
            console.error("DOM 錯誤: 找不到所有必要的 HTML 元素 (e.g., video, canvas, button)。請檢查 ID 是否正確。");
            statusMessage.textContent = "初始化失敗：缺少關鍵 HTML 元素。";
            return false;
        }

        // 初始狀態設定
        cameraToggleButton.textContent = "啟動鏡頭"; 
        titleChange.textContent = "爸爸";
        resultFeedback.classList.add('d-none');
        
        // 設定 Canvas 初始尺寸 (用於佔位)

        // 設定事件監聽器
        cameraToggleButton.addEventListener('click', toggleCamera);

        console.log("DOM 元素初始化成功。");
        return true;
    } catch (e) {
        console.error("初始化 DOM 時發生錯誤:", e);
        return false;
    }
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

    if (isSuccess) {
            icon.src = '../img/right.png';
            resultText.textContent = message ;
            resultText.classList.remove('text-danger');
            resultText.classList.add('text-success');//Bootstrap 的文字顏色類別 (text-success / text-danger)
    } else {
        icon.src = '../img/wrong.png';
        resultText.textContent = message;
        resultText.classList.remove('text-success');
        resultText.classList.add('text-danger');
    }
    matchHistory = [];
    predictionData = [];
    frameCounter = 0;
    pendingJudge = false;

    clearTimeout(timeoutHandle);
    clearTimeout(judgeDelayHandle);
    if (isCameraRunning) {
        console.log("結果已顯示，停止鏡頭。");
        cameraStream.stop();
        isCameraRunning = false;
        cameraStream = null;
        cameraToggleButton.textContent = "啟動鏡頭";
        cameraToggleButton.classList.remove('btn-danger');
        cameraToggleButton.classList.add('btn-primary');
        statusMessage.textContent = "鏡頭已自動停止。";
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

        // 延遲 1.5 秒再顯示正確
        judgeDelayHandle = setTimeout(() => {
        showFeedback(true, `正確！你成功比出了「${currentTarget}」`, '#198754');
        }, 1000);
    }
    
    // // 當前模式下，只確保中性狀態訊息顯示
    // statusMessage.textContent = `鏡頭已啟動。請做出 "${titleChange.textContent}" 的動作。 (等待穩定)`;
    // resultFeedback.classList.add('d-none');
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
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 4});
            drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});
        }
        // predictionDisplayDebug.textContent +=  `幀數: ${frameCounter} | 累積幀數: ${predictionData.length} / ${MAX_FRAME_HISTORY}\n` +
        //                                     `Canvas 尺寸: ${canvasWidth}x${canvasHeight}\n` +
        //                                     `偵測到手部: ${results.multiHandHandedness.map(h => h.label).join(', ')}\n`;&& results.multiHandHandedness
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


/**
 * 啟動/停止鏡頭
 */
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
        resultFeedback.classList.add('d-none');
        // 只有鏡頭停止時才清空所有累積數據
        predictionData = [];
        matchHistory = [];
        frameCounter = 0;
        clearTimeout(timeoutHandle);
        clearTimeout(judgeDelayHandle);
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
                    isCameraRunning = true;//鏡頭正在執行
                    videoElement.play();
                    
                    // 確保 video metadata 載入後，MediaPipe 的 onResults 會處理尺寸更新                    
                    cameraToggleButton.textContent = "停止鏡頭";
                    cameraToggleButton.disabled = false;
                    cameraToggleButton.classList.remove('btn-primary');
                    cameraToggleButton.classList.add('btn-danger');
                    statusMessage.textContent = `鏡頭已啟動。請做出 "${titleChange.textContent}" 的動作。`;
                    predictionDisplayDebug.textContent = "狀態: 鏡頭運行中...";
                    console.log("MediaPipe Camera 成功啟動！");

                    // 啟動 5 秒逾時倒數
                    timeoutHandle = setTimeout(() => {
                    if (!pendingJudge) {
                        showFeedback(false, `超時未完成「${titleChange.textContent}」`);
                    }
                    }, 8000);
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
                });
        } catch (error) {
            console.error("啟動鏡頭時發生同步錯誤:", error);
            statusMessage.textContent = `嚴重錯誤：程式碼執行失敗。請檢查控制台。`;
            cameraToggleButton.textContent = "啟動鏡頭";
            cameraToggleButton.disabled = false;
        }
    }
}

// 確保在 DOM 載入後執行初始化
window.onload = initializeDOM;
