// js/lesson_actions.js

$(document).ready(function() {
    
    // 載入 localStorage 中的課程狀態，並更新按鈕外觀
    function loadLessonStates() {
        // 載入收藏狀態
        let collectedLessons = JSON.parse(localStorage.getItem('collectedLessons')) || [];
        collectedLessons.forEach(lesson => {
            let $btn = $(`.card[data-title="${lesson.title}"]`).find('.collect-btn');
            if ($btn.length) {
                $btn.removeClass('btn-danger')
                    .addClass('btn-success')
                    // 使用 Bootstrap Icon (bi-bookmark-check-fill) 和文字
                    .html('<i class="bi bi-bookmark-check-fill"></i> 已收藏'); 
            }
        });

        // 載入學習CHECK狀態
        let checkedLessons = JSON.parse(localStorage.getItem('checkedLessons')) || [];
        checkedLessons.forEach(lessonId => {
            let $btn = $(`.card[data-title="${lessonTitle}"]`).find('.check-btn');
            if ($btn.length) {
                $btn.removeClass('btn-primary')
                    .addClass('btn-success')
                    // 使用 Bootstrap Icon (bi-check-circle-fill) 和文字
                    .html('<i class="bi bi-check-circle-fill"></i> 已完成');
            }
        });
    }

    loadLessonStates();

    // '收藏' 按鈕點擊事件
    $('.collect-btn').on('click', function(e) {
        e.preventDefault();
        let $btn = $(this);
        let $card = $btn.closest('.card');
        let lessonId = $card.data('id');
        let lessonTitle = $card.data('title');
        // 確保 lesson_web.html 中的卡片有 data-stage 屬性
        let lessonStage = $card.data('stage'); 
        let collectedLessons = JSON.parse(localStorage.getItem('collectedLessons')) || [];
        
        if ($btn.hasClass('btn-danger')) {
            // 執行收藏操作
            $btn.removeClass('btn-danger')
                .addClass('btn-success')
                .html('<i class="bi bi-bookmark-check-fill"></i> 已收藏');
            
            // 儲存課程資料 (ID, 標題, 階段) 到 localStorage
            collectedLessons.push({id: lessonId, title: lessonTitle, stage: lessonStage});
            // 確保資料唯一性
            let uniqueCollected = [...new Map(collectedLessons.map(item => [item.title, item])).values()];
            localStorage.setItem('collectedLessons', JSON.stringify(uniqueCollected));

        } else {
            // 取消收藏操作
            $btn.removeClass('btn-success')
                .addClass('btn-danger')
                .html('收藏');
            
            // 從 localStorage 移除
            let newCollected = collectedLessons.filter(item => item.title !== lessonTitle);
            localStorage.setItem('collectedLessons', JSON.stringify(newCollected));
        }
    });

    // '學習CHECK' 按鈕點擊事件
    $('.check-btn').on('click', function(e) {
        e.preventDefault();
        let $btn = $(this);
        let lessonTitle = $btn.closest('.card').data('title');
        let checkedLessons = JSON.parse(localStorage.getItem('checkedLessons')) || [];

        if ($btn.hasClass('btn-primary')) {
            // 執行 CHECK/完成
            $btn.removeClass('btn-primary')
                .addClass('btn-success')
                .html('<i class="bi bi-check-circle-fill"></i> 已完成');
            
            // 儲存已完成 ID 到 localStorage
            if (!checkedLessons.includes(lessonTitle)) {
                checkedLessons.push(lessonTitle);
            }
            localStorage.setItem('checkedLessons', JSON.stringify(checkedLessons));

        } else {
            // 取消 CHECK/完成
            $btn.removeClass('btn-success')
                .addClass('btn-primary')
                .html('學習CHECK');
            
            // 從 localStorage 移除
            let newChecked = checkedLessons.filter(title => title !== lessonTitle);
            localStorage.setItem('checkedLessons', JSON.stringify(newChecked));
        }
    });
});