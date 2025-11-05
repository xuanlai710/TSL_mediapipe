// 1. 選取 Loading 畫面和內容區塊的 DOM 元素
const loadingOverlay = document.getElementById('loading-overlay');
const mainContent = document.getElementById('main-content');

// --- Loading 畫面的切換函式 ---
function showLoading() {
    // 顯示 Loading
    loadingOverlay.classList.remove('loading-hidden');
    loadingOverlay.classList.add('loading-visible');
    // 同時隱藏主要內容，確保用戶看不到舊資料
    mainContent.style.display = 'none'; 
}

function hideLoading() {
    // 隱藏 Loading
    loadingOverlay.classList.remove('loading-visible');
    loadingOverlay.classList.add('loading-hidden');
    // 顯示主要內容
    mainContent.style.display = 'block'; 
}


// --- API 請求函式：實現 Loading 邏輯的核心 ---
async function loadExamData(examId) {
    
    // 步驟 A: 在發送請求前，立即顯示 Loading 畫面
    showLoading(); 

    try {
        // 假設您使用 Axios 向後端請求測驗 JSON 資料
        const response = await axios.get(`/api/exams/${examId}`);
        const examData = response.data;
        
        // 步驟 C: 成功取得資料後，將資料渲染到測驗按鈕 (這裡放您渲染 HTML 的函式)
        renderExamButtons(examData);
        
    } catch (error) {
        // 步驟 D: 處理錯誤，例如網路斷線或後端錯誤
        console.error("載入測驗資料失敗:", error);
        mainContent.innerHTML = '<h2>很抱歉，無法載入測驗題目。</h2>';
        mainContent.style.display = 'block';
        
    } finally {
        // 步驟 E: 無論成功或失敗，最後一定要隱藏 Loading 畫面
        // 確保畫面不會一直停在 Loading 狀態
        hideLoading(); 
    }
}

// 範例：在網頁載入後，立即開始載入第一份測驗資料
document.addEventListener('DOMContentLoaded', () => {
    loadExamData(1); 
});

// 註：如果您在函式中遇到 .classList.add/remove 不支援，可以改用 jQuery:
// $('#loading-overlay').removeClass('loading-hidden').addClass('loading-visible');