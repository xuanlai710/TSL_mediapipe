// js/person_profile.js

$(document).ready(function() {
    
    // 負責渲染課程列表
    function renderCollectedLessons(stageFilter = '所有階段') {
        const $container = $('#lessons-container');
        $container.empty();
        
        // 從 localStorage 取得最新的資料
        let allCollectedLessons = JSON.parse(localStorage.getItem('collectedLessons')) || [];

        if (allCollectedLessons.length === 0) {
            $container.html('<p class="text-center text-muted mt-5">您尚未收藏任何課程。</p>');
            return;
        }

        // 1. 根據篩選條件過濾課程
        let filteredLessons = allCollectedLessons;
        if (stageFilter !== '所有階段') {
            const stageNumberMatch = stageFilter.match(/\d+/); 
            if (stageNumberMatch) {
                const stageNumber = stageNumberMatch[0]; // 從 "第一階段" 取得 "1"
                filteredLessons = allCollectedLessons.filter(lesson => String(lesson.stage) === stageNumber);
            }
        }
        
        // 如果過濾後沒有課程
        if (filteredLessons.length === 0) {
            $container.html(`<p class="text-center text-muted mt-5">在 ${stageFilter} 中沒有收藏的課程。</p>`);
            return;
        }

        // 2. 根據階段分組
        const groupedLessons = filteredLessons.reduce((acc, lesson) => {
            const stageName = `第${lesson.stage}階段`;
            if (!acc[stageName]) {
                acc[stageName] = [];
            }
            acc[stageName].push(lesson);
            return acc;
        }, {});
        
        // 3. 建立列表結構 (使用 Bootstrap Accordion 讓內容整潔)
        const $accordion = $('<div class="accordion" id="accordionCollected"></div>');
        
        // 使用 sortedKeys 確保階段順序正確 (例如: 第1階段, 第2階段, ...)
        const sortedKeys = Object.keys(groupedLessons).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });

        sortedKeys.forEach(stage => {
            const stageId = stage.replace(/[^\w]/g, ''); // 清理階段名稱用於 ID
            
            // 預設展開第一個階段 (如果只篩選一個階段，也會展開)
            const isFirst = sortedKeys[0] === stage; 

            const $stageAccordionItem = $(`
                <div class="accordion-item">
                    <h2 class="accordion-header" id="heading-${stageId}">
                        <button class="accordion-button ${isFirst ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${stageId}" aria-expanded="${isFirst}" aria-controls="collapse-${stageId}">
                            ${stage} (${groupedLessons[stage].length} 門)
                        </button>
                    </h2>
                    <div id="collapse-${stageId}" class="accordion-collapse collapse ${isFirst ? 'show' : ''}" aria-labelledby="heading-${stageId}" data-bs-parent="#accordionCollected">
                        <div class="accordion-body p-0">
                            <ul class="list-group list-group-flush">
                                </ul>
                        </div>
                    </div>
                </div>
            `);

            const $lessonsList = $stageAccordionItem.find('ul');
            groupedLessons[stage].forEach(lesson => {
                const $lessonItem = $(`
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${lesson.title}
                        <button type="button" class="btn btn-sm btn-outline-danger remove-btn" data-id="${lesson.id}">
                            <i class="bi bi-trash-fill"></i> 移除
                        </button>
                    </li>
                `);
                $lessonsList.append($lessonItem);
            });
            
            $accordion.append($stageAccordionItem);
        });
        
        $container.append($accordion);
        
        // 4. 重新綁定 '移除' 按鈕事件
        $('.remove-btn').on('click', handleRemoveLesson);
    }
    
    // 處理課程移除邏輯
    function handleRemoveLesson() {
        if (!confirm('確定要移除此收藏課程嗎？')) {
            return;
        }
        
        const lessonIdToRemove = $(this).data('id');
        
        // 1. 從 localStorage 移除
        let collectedLessons = JSON.parse(localStorage.getItem('collectedLessons')) || [];
        let newCollected = collectedLessons.filter(item => item.id !== lessonIdToRemove);
        localStorage.setItem('collectedLessons', JSON.stringify(newCollected));
        
        // 2. 重新渲染列表 (使用當前的篩選條件)
        renderCollectedLessons($('#dropdownMenuButton').text().trim());
        
        // 3. 更新個人檔案頁面上 '已收藏' 卡片的計數
        updateCollectionCount(newCollected.length);
    }

    // 更新個人檔案頁面上 '已收藏' 課程的數量
    function updateCollectionCount(count) {
        // 假設 '已收藏' 的數量顯示在 class 為 text-danger fw-bold mb-1 的 h3 標籤
        $('.col').last().find('h3.text-danger').text(count);
    }

    // Offcanvas 顯示事件：在 Offcanvas 打開前載入課程
    $('#offcanvasExample').on('show.bs.offcanvas', function () {
        // 重設篩選為 '所有階段' 並載入
        $('#dropdownMenuButton').text('所有階段');
        renderCollectedLessons('所有階段'); 
        
        // 更新計數 (確保 Offcanvas 打開時，卡片上的數字是正確的)
        let collectedLessons = JSON.parse(localStorage.getItem('collectedLessons')) || [];
        updateCollectionCount(collectedLessons.length);
    });
    
    // 下拉選單篩選事件
    $('.stage-filter-btn').on('click', function(e) {
        e.preventDefault();
        const stageText = $(this).text().trim();
        
        // 更新下拉選單按鈕的文字
        $('#dropdownMenuButton').text(stageText);
        
        // 執行篩選渲染
        renderCollectedLessons(stageText);
    });

    // 初次載入時，更新個人檔案頁面上 '已收藏' 卡片的計數
    let initialCollected = JSON.parse(localStorage.getItem('collectedLessons')) || [];
    updateCollectionCount(initialCollected.length);
});