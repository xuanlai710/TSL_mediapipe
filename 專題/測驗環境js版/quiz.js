$(document).ready(function() {

    // 題目資料庫
    // 在這裡定義所有的題目
    // 確保 image 和 videoUrl 路徑正確
    const quizData = [
        {
            type: 'signLanguageExam', 
            questionText: '手語實作關卡 - 爸爸',
            targetWord: '爸爸',
            // 跳轉目標 URL，包含返回時需帶回的總問題數和當前進度
            targetUrl: '../關卡三/exam_web3.html'
        },
        {
            type: 'signLanguageExam', 
            questionText: '手語實作關卡 - 媽媽',
            targetWord: '媽媽',
            targetUrl: '../關卡三/exam_web3.html'
        },
        {
            type: 'signLanguageExam', 
            questionText: '手語實作關卡 - 哥哥',
            targetWord: '哥哥',
            targetUrl: '../關卡三/exam_web3.html'
        },
        {
            type: 'imageSelect', // 圖片選擇題
            questionText: '爸爸',
            correctAnswer: '爸爸',
            options: [
                { text: '爸爸', image: '../img/爸爸.png' },
                { text: '媽媽', image: '../img/媽媽.png' },
                { text: '哥哥', image: '../img/哥哥.png' }
            ]
        },
        {
            type: 'imageSelect',
            questionText: '媽媽',
            correctAnswer: '媽媽',
            options: [ // 選項可以隨機排列
                { text: '哥哥', image: '../img/哥哥.png' },
                { text: '爸爸', image: '../img/爸爸.png' },
                { text: '媽媽', image: '../img/媽媽.png' }
            ]
        },
        {
            type: 'imageSelect',
            questionText: '哥哥',
            correctAnswer: '哥哥',
            options: [
                { text: '媽媽', image: '../img/媽媽.png' },
                { text: '哥哥', image: '../img/哥哥.png' },
                { text: '爸爸', image: '../img/爸爸.png' }
            ]
        },
        {
            type: 'gifSelect', 
            gifUrl: '../img/dad.gif', // 更改為 gifUrl 並提供您的 .gif 檔案路徑
            correctAnswer: '爸爸',
            options: ['爸爸', '媽媽', '哥哥']
        },
        {
            type: 'gifSelect', 
            gifUrl: '../img/bro.gif', // 更改為 gifUrl 並提供您的 .gif 檔案路徑
            correctAnswer: '哥哥',
            options: ['爸爸', '媽媽', '哥哥']
        },
        {
            type: 'gifSelect', 
            gifUrl: '../img/mom.gif', // 更改為 gifUrl 並提供您的 .gif 檔案路徑
            correctAnswer: '媽媽',
            options: ['爸爸', '媽媽', '哥哥']
        },
        // ... 在此處新增更多題目
        
    ];

    // 狀態變數
    let currentQuestionIndex = 0;
    let selectedAnswer = null;
    const totalQuestions = quizData.length;

    // DOM 元素快取
    const quizContent = $('#quiz-content');//測驗內容div
    const progressBar = $('#progress-bar');//進度條
    const btnSkip = $('#btn-skip');//跳過按鈕
    const btnCheck = $('#btn-check');//繼續按鈕
    const feedbackSection = $('#feedback-section');//顯示正確或錯誤
    const feedbackImg = $('#feedback-img');//顯示打勾或打叉
    const feedbackText = $('#feedback-text');//顯示回應文字
    const correctAnswerText = $('#correct-answer-text');//顯示正確答案
    const btnBackToMenu = $('#btn-back-to-menu');

    // --- 核心修正：檢查 Session Storage 結果以更新進度 ---
    function checkSessionForExamResult() {
        const totalLength = sessionStorage.getItem('totalQuizLength');
        const savedIndex = sessionStorage.getItem('currentQuizIndex');
        const result = sessionStorage.getItem('examResult');

        if (totalLength && savedIndex && result) {
            // 優先從 sessionStorage 恢復進度
            currentQuestionIndex = parseInt(savedIndex);

            if (result === 'success' || result === 'skip') {
                // 如果是成功或跳過，則前進到下一題
                currentQuestionIndex++;
                console.log(`從實作關卡返回，進度已推進至: ${currentQuestionIndex}`);
            }
            
            // 清除所有實作關卡相關的 session 狀態
            sessionStorage.removeItem('currentQuizIndex');
            sessionStorage.removeItem('totalQuizLength');
            sessionStorage.removeItem('examResult');
            sessionStorage.removeItem('targetSignWord');
        }
    }
    // ----------------------------------------------------
    /** 載入指定索引的題目 */
    function loadQuestion(index) {
        //顯示測驗完成
        if (index >= totalQuestions) { 
            showQuizComplete();
            return;
        }

        const question = quizData[index];

         // *** 處理手勢識別關卡跳轉 ***
        if (question.type === 'signLanguageExam') {
            handleSignLanguageExam(question);
            return;
        }
        let html = '';

        //問題類別分類
        if (question.type === 'imageSelect') {
            html = buildImageSelectLayout(question);
        } else if (question.type === 'gifSelect') {
            html = buildGIFSelectLayout(question);
        }

        quizContent.html(html);
        updateProgress();
        resetFooter();//重製footer
    }

    /** 處理手語實作關卡 (跳轉) */
    function handleSignLanguageExam(question) {
        // 1. 將當前進度 (index) 存入 sessionStorage
        sessionStorage.setItem('totalQuizLength', totalQuestions);
        sessionStorage.setItem('currentQuizIndex', currentQuestionIndex);
        sessionStorage.setItem('targetSignWord', question.targetWord);

        // 2. 顯示跳轉提示畫面
        quizContent.html(`
            <div class="faq">
                <p class="titlefaq">即將進行實作測驗</p>
                <p id="titlechange">下一關：${question.questionText} (${question.targetWord})</p>
                <div class="mt-4">
                    <p class="text-muted">請點擊下方按鈕開始進行手語實作。</p>
                </div>
            </div>
        `);
        
        // 3. 調整按鈕以進行跳轉
        btnSkip.hide();
        btnCheck.off('click').find('p').text('開始實作');
        btnCheck.removeClass('disabled btn-danger btn-success').addClass('btn-primary').prop('disabled', false);
        
        // 4. 新增跳轉事件
        btnCheck.one('click', function() {
            // 跳轉到 exam_web3.html
            window.location.href = question.targetUrl;
        });
        
        updateProgress(); // 更新進度條
    }

    /** 建立圖片題的 HTML (只顯示圖片，不顯示文字) */
    function buildImageSelectLayout(question) {
        const optionsHtml = question.options.map(option => `
            <button class="ans answer-option" data-value="${option.text}">
                <div class="card" style="width: 15rem; height: 18rem;">
                    <img src="${option.image}" class="card-img-top" alt="${option.text}">
                </div>
            </button>
        `).join('');

        return `
            <div class="faq1">
                <p class="titlefaq">請問哪一個是</p>
                <p id="titlechange">${question.questionText}</p>
                <div class="selection">
                    ${optionsHtml}
                </div>
            </div>`;
    }
    /** 建立影片題的 HTML */
    function buildGIFSelectLayout(question) {
        const optionsHtml = question.options.map((option, index) => `
            <a href="#" class="w-100 d-flex align-items-center p-3 border border-secondary rounded text-decoration-none answer-option" data-value="${option}">
                <span class="d-inline-block border border-secondary rounded px-2 py-1 me-3">
                    ${index + 1}
                </span>
                <span>${option}</span>
            </a>
        `).join('');

        return `
            <div class="faq2" style="width: 25rem;">
                <p class="titlefaq">根據影片選擇正確的答案</p>
                <div style="width: 40rem;" id="titlechange">
                    <img src="${question.gifUrl}" alt="Sign Language GIF" class="img-fluid rounded border">
                </div>
                <div class="d-flex flex-column gap-2 mt-3" style="width: 30rem;">
                    ${optionsHtml}
                </div>
            </div>`;
    }

    /** 更新進度條 */
    function updateProgress() {
        const progressPercent = ((currentQuestionIndex) / totalQuestions) * 100;
        //修改CSS，產生進度條的動畫
        progressBar.css('width', progressPercent + '%').attr('aria-valuenow', progressPercent);
    }

    /** 重設底部按鈕狀態 */
    function resetFooter() {
        // (新) 移除底部的顏色
        $('#footer-section').removeClass('bg-success-subtle bg-danger-subtle');
        
        selectedAnswer = null;
        feedbackSection.hide();
        correctAnswerText.hide();
        btnSkip.show();
        
        // (新) 確保按鈕恢復為主要的藍色
        btnCheck.addClass('disabled btn-primary')
                .removeClass('btn-success btn-danger')
                .prop('disabled', true)
                .find('p').text('繼續');
                
        $('.answer-option').removeClass('selected');
    }

    /** 顯示測驗完成 */
    function showQuizComplete() {
        quizContent.html('<div class="faq"><p class="titlefaq">恭喜您！</p><p id="titlechange">已完成所有練習</p></div>');
        progressBar.css('width', '100%').attr('aria-valuenow', 100).removeClass('bg-info').addClass('bg-success');
        // 隱藏原本的測驗按鈕
        btnSkip.hide();
        btnCheck.hide();
        feedbackSection.hide();
        
        // 顯示「回到關卡列表」按鈕
        btnBackToMenu.show();
    }

    /** 檢查答案 */
    function checkAnswer() {
        const currentQuestion = quizData[currentQuestionIndex];
        const isCorrect = (selectedAnswer === currentQuestion.correctAnswer);

        showFeedback(isCorrect, false);
    }

    /** 顯示回饋 (答對/答錯/跳過) */
    function showFeedback(isCorrect, isSkipped) {
        btnSkip.hide(); // 隱藏跳過按鈕
        btnCheck.removeClass('disabled').prop('disabled', false).find('p').text('下一題');
        
   
        // 找到 footer 區塊
        const footer = $('#footer-section');
        // 移除舊的顏色 class
        footer.removeClass('bg-success-subtle bg-danger-subtle');
        
        // 找到「下一題」按鈕
        const btnNext = btnCheck.find('p');
        // 移除舊的按鈕 class
        btnCheck.removeClass('btn-success btn-danger').addClass('btn-primary');

        if (isSkipped) {
            feedbackImg.attr('src', '../img/wrong.png');
            feedbackText.text('錯誤');
            correctAnswerText.text('正確答案: ' + quizData[currentQuestionIndex].correctAnswer).show();
            
            // (新) 底部改為淺紅色
            footer.addClass('bg-danger-subtle'); 
            // (新) 按鈕改為紅色
            btnCheck.removeClass('btn-primary').addClass('btn-danger');

        } else if (isCorrect) {
            feedbackImg.attr('src', '../img/right.png'); 
            feedbackText.text('太棒了');
            correctAnswerText.hide();
            
            // (新) 底部改為淺綠色
            footer.addClass('bg-success-subtle'); 
            // (新) 按鈕改為綠色
            btnCheck.removeClass('btn-primary').addClass('btn-success');

        } else {
            feedbackImg.attr('src', '../img/wrong.png');
            feedbackText.text('錯誤');
            correctAnswerText.text('正確答案: ' + quizData[currentQuestionIndex].correctAnswer).show();
            
            // (新) 底部改為淺紅色
            footer.addClass('bg-danger-subtle'); 
            // (新) 按鈕改為紅色
            btnCheck.removeClass('btn-primary').addClass('btn-danger');
        }

        feedbackSection.css('display', 'flex');
        
        // 將按鈕文字改為「下一題」
        btnCheck.removeClass('disabled').prop('disabled', false).find('p').text('下一題');
    }


    // 事件監聽

    // (A) 監聽答案選擇 (使用事件委派)
    quizContent.on('click', '.answer-option', function(e) {
        e.preventDefault(); // 防止 <a> 標籤跳轉

        // 移除其他選項的選中狀態
        $('.answer-option').removeClass('selected');
        // 將當前點擊的選項設為選中
        $(this).addClass('selected');

        selectedAnswer = $(this).data('value');
        
        // 啟用「繼續」按鈕
        btnCheck.removeClass('disabled').prop('disabled', false);
    });

    // (B) 監聽「繼續 / 下一題」按鈕
    btnCheck.on('click', function() {
        if ($(this).prop('disabled')) return; // 如果按鈕被禁用，則不執行

        const buttonText = $(this).find('p').text();

        if (buttonText === '繼續') {
            checkAnswer();
        } else if (buttonText === '下一題') {
            currentQuestionIndex++;
            loadQuestion(currentQuestionIndex);
        }
    });

    // (C) 監聽「跳過」按鈕
    btnSkip.on('click', function() {
        showFeedback(false, true); // (答錯, 是跳過)
    });


    // 啟動測驗
    checkSessionForExamResult(); //啟動前檢查是否從實作關卡返回
    loadQuestion(currentQuestionIndex);

});