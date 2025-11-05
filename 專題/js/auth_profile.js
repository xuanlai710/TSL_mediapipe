// js/auth_profile.js

$(document).ready(function() {

    // =================================================================
    // 輔助函式：模擬資料庫操作
    // =================================================================

    /**
     * 從 localStorage 取得所有使用者資料
     * @returns {Array<Object>} 使用者物件陣列
     */
    function getUsers() {
        return JSON.parse(localStorage.getItem('users')) || [];
    }

    /**
     * 儲存所有使用者資料到 localStorage
     * @param {Array<Object>} users 使用者物件陣列
     */
    function saveUsers(users) {
        localStorage.setItem('users', JSON.stringify(users));
    }

    /**
     * 設定目前登入的使用者 ID
     * @param {string|null} userId 登入的使用者 ID
     */
    function setCurrentUser(userId) {
        if (userId) {
            localStorage.setItem('currentUserId', userId);
        } else {
            localStorage.removeItem('currentUserId');
        }
    }

    /**
     * 根據 ID 取得單個使用者資料
     * @param {string} userId
     * @returns {Object|undefined} 使用者物件
     */
    function getUserById(userId) {
        const users = getUsers();
        return users.find(u => u.id === userId);
    }

    // =================================================================
    // 登入/註冊模組 (Main_web.html & Person_web.html 皆適用)
    // =================================================================
    
    // 判斷當前是登入還是註冊 Modal
    let isLoginModal = true; 

    // 每次開啟 Modal 時，重設標題和按鈕文字
    $('#staticBackdrop').on('show.bs.modal', function (event) {
        // 判斷是從主頁的登入按鈕開啟，還是從個人頁面的某處開啟
        const button = $(event.relatedTarget); 
        const isFromLogin = button.data('bs-target') === '#staticBackdrop' && 
                            button.text().trim() === '個人檔案'; // 假設 '個人檔案' 是開啟登入的按鈕文字

        // 如果是主頁的登入按鈕，則顯示登入模式
        if (isFromLogin) {
             setupLoginModal();
        } 
        // 否則保持當前模式 (例如，如果個人頁面只有一個 Modal)
    });
    
    function setupLoginModal() {
        isLoginModal = true;
        const $modal = $('#staticBackdrop');
        $modal.find('.modal-title').text('登入');
        $modal.find('.modal-footer button:eq(0)').text('註冊').removeClass('btn-primary').addClass('btn-secondary'); // 註冊按鈕
        $modal.find('.modal-footer button:eq(1)').text('確認').removeClass('btn-secondary').addClass('btn-primary'); // 確認(登入)按鈕
        // 清除輸入欄位
        $modal.find('#account-input').val(''); 
        $modal.find('#password-input').val('');
    }

    function setupRegisterModal() {
        isLoginModal = false;
        const $modal = $('#staticBackdrop');
        $modal.find('.modal-title').text('註冊');
        $modal.find('.modal-footer button:eq(0)').text('登入').removeClass('btn-primary').addClass('btn-secondary'); // 登入按鈕
        $modal.find('.modal-footer button:eq(1)').text('確認').removeClass('btn-secondary').addClass('btn-primary'); // 確認(註冊)按鈕
        // 清除輸入欄位
        $modal.find('#account-input').val(''); 
        $modal.find('#password-input').val('');
    }

    // 處理 Modal 腳部按鈕點擊
    $('#staticBackdrop').on('click', '.modal-footer button', function() {
        const $btn = $(this);
        
        if ($btn.text().trim() === '確認') {
            // 處理登入或註冊
            handleAuthAction();
            
        } else if ($btn.text().trim() === '註冊') {
            // 從登入切換到註冊
            setupRegisterModal();
            
        } else if ($btn.text().trim() === '登入') {
            // 從註冊切換到登入
            setupLoginModal();
        }
    });

    /**
     * 處理登入或註冊的主要邏輯
     */
    function handleAuthAction() {
        const $modal = $('#staticBackdrop');
        const account = $modal.find('#account-input').val().trim();
        const password = $modal.find('#password-input').val().trim();

        if (!account || !password) {
            alert('帳號和密碼都不能為空。');
            return;
        }

        const users = getUsers();
        const existingUser = users.find(u => u.account === account);

        if (isLoginModal) {
            // ** 登入邏輯 **
            if (existingUser && existingUser.password === password) {
                // 成功登入
                setCurrentUser(existingUser.id);
                // 導向個人檔案頁面
                alert('登入成功！');
                window.location.href = '../個人檔案/person_web.html';
                
            } else if (!existingUser) {
                // 沒有資料 -> 跳出警示並導向註冊
                alert('查無此帳號，請先註冊。');
                setupRegisterModal(); // 切換到註冊畫面
                
            } else {
                // 密碼錯誤
                alert('密碼錯誤！');
            }

        } else {
            // ** 註冊邏輯 **
            if (existingUser) {
                // 資料已重複
                alert('此帳號已存在，請直接登入。');
                
            } else {
                // 成功註冊
                const newUser = {
                    id: 'user-' + Date.now(), // 簡單的唯一 ID
                    account: account,
                    password: password,
                    name: '新用戶',
                    hand: '右手',
                    gender: '男',
                    avatar: 'https://i.imgur.com/FrDYNVm.jpg', // 預設頭像
                    // 其他個人檔案資料
                };
                
                users.push(newUser);
                saveUsers(users);
                setCurrentUser(newUser.id);

                alert('註冊成功！自動登入。');
                // 導向個人檔案頁面
                window.location.href = '../個人檔案/person_web.html';
            }
        }
    }

    // =================================================================
    // 個人檔案頁面初始化與編輯 (僅 Person_web.html 適用)
    // =================================================================
    
    // 僅在個人檔案頁面執行
    if ($('#persondata').length) { 
        
        const currentUserId = localStorage.getItem('currentUserId');
        let currentUser = null;
        
        if (currentUserId) {
            currentUser = getUserById(currentUserId);
            // 載入個人資料到頁面
            if (currentUser) {
                loadProfile(currentUser);
            } else {
                // 資料遺失，強制登出
                handleLogout(); 
            }
        } else {
            // 未登入，導向主頁
            alert('請先登入！');
            window.location.href = '../專題主頁/main_web.html'; 
            return;
        }

        // 編輯按鈕點擊事件 (修正: 綁定到 button 元素，避免因類別變動導致事件失效)
        $('#persondata').on('click', 'button', function() {
            const $btn = $(this);
            const buttonText = $btn.text().trim(); 

            // 確保只處理 '編輯' 或 '儲存' 按鈕，並且它屬於 persondata 區塊
            if (buttonText === '編輯') {
                enableEditing();
                $btn.text('儲存');
                $btn.removeClass('btn-outline-secondary').addClass('btn-success');
            } else if (buttonText === '儲存') {
                // 儲存邏輯
                // 檢查 currentUser 是否存在，這是 saveProfile 依賴的
                if (!currentUser) {
                    alert('錯誤：無法找到當前用戶資料進行儲存。請重新登入。');
                    return;
                }
                
                saveProfile(currentUser);
                
                // 恢復按鈕狀態
                $btn.text('編輯');
                $btn.removeClass('btn-success').addClass('btn-outline-secondary');
                disableEditing();
            }
            // 其他按鈕 (如登出) 會被忽略，由其他事件處理
        });
        // 登出按鈕
        $('#logout-btn').on('click', function(e) {
            e.preventDefault();
            handleLogout();
        });
    }

    // js/auth_profile.js - 修正後的 loadProfile 函式

    /**
     * 將使用者資料載入到個人檔案頁面
     * @param {Object} user 使用者物件
     */
    function loadProfile(user) {
        // 姓名：直接設定完整的 <li> 內容，並確保創建 <span id="profile-name">
        $('#persondata li:eq(0)').html(`<strong>名稱：</strong><span id="profile-name">${user.name}</span>`);
        
        // 用戶編號 (使用 ID)
        $('#persondata li:eq(1)').html(`<strong>用戶編號：</strong><span class="badge bg-info">${user.id}</span>`);

        // 慣用手：現在使用 value 匹配
        $(`#persondata input[name="handOptions"][value="${user.hand}"]`).prop('checked', true);
        
        // 性別：現在使用 value 匹配
        $(`#persondata input[name="genderOptions"][value="${user.gender}"]`).prop('checked', true);
        
        // 頭像
        $('#persondata img').attr('src', user.avatar);

        disableEditing(); // 預設為不可編輯
    }

    /**
     * 啟用個人資料編輯模式
     */
    function enableEditing() {
        const $nameSpan = $('#profile-name');
        const currentName = $nameSpan.text();
        
        // 姓名轉換為 Input
        $nameSpan.replaceWith(`<input type="text" class="form-control-sm" id="edit-name" value="${currentName}">`);
        
        // 慣用手和性別啟用
        $('#persondata input[name="handOptions"]').prop('disabled', false);
        $('#persondata input[name="genderOptions"]').prop('disabled', false);
        
        // 啟用頭像編輯 (這裡只做一個簡單的提示，實際修改需要檔案上傳邏輯)
        const $avatarBtn = $('#persondata img').closest('.col-4').find('.btn-outline-secondary');
        $avatarBtn.after('<small class="text-muted d-block mt-1" id="avatar-tip"> (點擊頭像可替換圖片)</small>');
        $('#persondata img').css('cursor', 'pointer').on('click', promptAvatarChange);
    }
    
    /**
     * 禁用個人資料編輯模式
     */
    function disableEditing() {
        const $nameInput = $('#edit-name');
        if ($nameInput.length) {
            const newName = $nameInput.val();
            // 姓名轉換回 Span
            $nameInput.replaceWith(`<span id="profile-name">${newName}</span>`);
        }
        
        // 慣用手和性別禁用
        $('#persondata input[name="handOptions"]').prop('disabled', true);
        $('#persondata input[name="genderOptions"]').prop('disabled', true);
        
        // 移除頭像編輯提示
        $('#avatar-tip').remove();
        $('#persondata img').css('cursor', 'default').off('click', promptAvatarChange);
    }

    /**
     * 模擬頭像替換 (需搭配後端或實際檔案上傳)
     */
    function promptAvatarChange() {
        const newUrl = prompt("請輸入新的頭像圖片網址：");
        if (newUrl) {
             $('#persondata img').attr('src', newUrl);
        }
    }

    // js/auth_profile.js - 修正後的 saveProfile 函式

        /**
         * 儲存更新後的個人資料
         * @param {Object} user 當前使用者物件
         */
        function saveProfile(user) {
            const newName = $('#edit-name').val().trim();
            // 直接讀取被選中 Radio Button 的 value 屬性 (右手/左手)
            const newHand = $('#persondata input[name="handOptions"]:checked').val(); 
            // 直接讀取被選中 Radio Button 的 value 屬性 (男/女)
            const newGender = $('#persondata input[name="genderOptions"]:checked').val();
            const newAvatar = $('#persondata img').attr('src');

            // 檢查是否取得新值
            if (!newName || !newHand || !newGender) {
                alert('儲存失敗：請檢查所有欄位是否已選擇/輸入。');
                return;
            }

            user.name = newName;
            user.hand = newHand;
            user.gender = newGender;
            user.avatar = newAvatar;

            // 更新 localStorage 中的所有使用者資料
            const users = getUsers();
            const userIndex = users.findIndex(u => u.id === user.id);
            if (userIndex !== -1) {
                users[userIndex] = user;
                saveUsers(users); // 假設 saveUsers 函式已經定義
                alert('資料更新成功！');
            } else {
                alert('儲存失敗：找不到使用者資料。請重新登入。');
            }
        }

    /**
     * 處理登出邏輯
     */
    function handleLogout() {
        setCurrentUser(null);
        alert('您已登出。');
        window.location.href = '../專題主頁/main_web.html';
    }

    /**
     * 處理登出邏輯
     */
    function handleLogout() {
        setCurrentUser(null);
        alert('您已登出。');
        window.location.href = '../專題主頁/main_web.html';
    }

    // =================================================================
    // ▼▼▼▼▼ 請將以下所有程式碼貼到 auth_profile.js 的結尾 ▼▼▼▼▼
    // =================================================================
    
    // =================================================================
    // 側邊欄個人檔案 (Sidebar Profile Widget)
    // 適用於 test_web.html 和 lesson_web.html
    // =================================================================
    
    // 檢查頁面上是否存在 .pdata 容器
    if ($('.pdata').length > 0) {
        const currentUserId = localStorage.getItem('currentUserId');
        
        if (currentUserId) {
            // --- 使用者已登入 ---
            const currentUser = getUserById(currentUserId); // 重複使用您現有的函式
            
            if (currentUser) {
                renderLoggedInSidebar(currentUser);
            } else {
                // Edge Case: 有 ID 但找不到資料 (例如資料被清除)
                renderLoggedOutSidebar();
                setCurrentUser(null); // 清除無效的 ID
            }
        } else {
            // --- 使用者未登入 ---
            renderLoggedOutSidebar();
        }
    }

    /**
     * 渲染「登出」狀態的側邊欄
     * (使用 test_web.html 的 HTML 結構)
     */
    function renderLoggedOutSidebar() {
        const loggedOutHtml = `
            <p>個人檔案</p>
            <div class="preson_state">
                <p>請先點擊上方 "個人檔案" <br>做登入/註冊</p>
            </div>`;
        
        // 將 HTML 注入到 .pdata 容器中
        $('.pdata').html(loggedOutHtml);
    }

    /**
     * 渲染「登入」狀態的側邊欄
     * (使用 lesson_web.html 的 HTML 結構，並填入動態資料)
     */
    function renderLoggedInSidebar(user) {
        
        // 從 localStorage 讀取 lesson_class.js 儲存的學習狀態
        // (注意: "已完成關卡" 標籤目前顯示的是 "已完成課程" 數量)
        const checkedLessons = JSON.parse(localStorage.getItem('checkedLessons')) || [];
        const collectedLessons = JSON.parse(localStorage.getItem('collectedLessons')) || [];
        
        // (注意: "登入天數" 需要複雜的邏輯，目前暫時顯示 1)
        const loginDays = 1; 

        const loggedInHtml = `
            <p>個人檔案</p>
            <div class="preson_state">
                <div class="text-center">
                    <img src="${user.avatar}" class="img-fluid rounded-circle border p-1" style="width: 100px; height: 100px;" alt="用戶頭像">
                </div>
                <div class="p_name">
                    <p>${user.name}</p>
                    <span class="badge bg-info">${user.id}</span>
                </div>
                <div class="text-center"> 
                    <div class="col">
                        <div class="card bg-light p-3 h-100">
                            <p class="text-secondary mb-1 small">已完成課程</p>
                            <h3 class="text-primary fw-bold mb-0">${checkedLessons.length}</h3> 
                        </div>
                    </div>
                    <div class="col">
                        <div class="card bg-light p-3 h-100">
                            <p class="text-secondary mb-1 small">登入天數</p>
                            <h3 class="text-dark fw-bold mb-1">${loginDays}</h3> 
                            <button class="btn btn-sm btn-outline-warning mt-1">打卡</button>
                        </div>
                    </div>
                    <div class="col">
                        <div class="card bg-light p-3 h-100">
                            <p class="text-secondary mb-1 small">已收藏</p>
                            <h3 class="text-danger fw-bold mb-1">${collectedLessons.length}</h3> 
                            <a href="#" class="small text-sm text-decoration-none" id="sidebar-view-collected" data-bs-toggle="offcanvas" data-bs-target="#offcanvasExample" role="button" aria-controls="offcanvasExample">查看</a>
                        </div>
                    </div>
                </div>
            </div>`;

        // 將 HTML 注入到 .pdata 容器中
        $('.pdata').html(loggedInHtml);
        
        // ** (重要) 檢查「查看」按鈕 **
        // 只有 lesson_web.html 有 offcanvas 彈窗
        // 如果在 test_web.html 頁面 (找不到 #offcanvasExample)，就隱藏「查看」按鈕
        if ($('#offcanvasExample').length === 0) {
            $('#sidebar-view-collected').hide();
        }
    }
    
});