/**
 * app.js
 * アプリケーションのすべてのロジックを管理します。
 * Google認証、メール/パスワード認証、ユーザー設定（アバター/名前編集・テーマ切り替え）、
 * およびユーザー検索によるDM機能を含みます。
 */

import { 
    auth, database, GoogleAuthProvider, 
    signInWithPopup, signOut, onAuthStateChanged, sendPasswordResetEmail,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
    ref, push, onChildAdded, onChildRemoved, onValue, remove, set, get, serverTimestamp 
} from './firebase.js';

/*=============================================================================
  1. DOM要素の取得
=============================================================================*/
// ログインUI関連
const loginOverlay = document.getElementById('login-overlay');
const loginErrorMessage = document.getElementById('login-error-message');
const loginTabs = document.getElementById('login-tabs');
const tabSocial = document.getElementById('tab-content-social');
const tabEmailLogin = document.getElementById('tab-content-email-login');
const tabEmailRegister = document.getElementById('tab-content-email-register');

// ログインボタン
const btnLoginGoogle = document.getElementById('btn-login-google');

// メールフォーム関連
const emailLoginForm = document.getElementById('email-login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const btnForgotPassword = document.getElementById('btn-forgot-password');

const emailRegisterForm = document.getElementById('email-register-form');
const registerNameInput = document.getElementById('register-name');
const registerEmailInput = document.getElementById('register-email');
const registerPasswordInput = document.getElementById('register-password');

// 設定ガイド
const btnToggleGuide = document.getElementById('btn-toggle-guide');
const guideBody = document.getElementById('guide-body');

// ユーザープロフィール表示関連
const myAvatar = document.getElementById('my-avatar');
const myName = document.getElementById('my-name');
const myRoleBadge = document.getElementById('my-role-badge');
const myRoleText = document.getElementById('my-role-text');
const btnLogout = document.getElementById('btn-logout');

// 設定モーダル関連
const btnSettingsOpen = document.getElementById('btn-settings-open');
const settingsModal = document.getElementById('settings-modal');
const btnSettingsClose = document.getElementById('btn-settings-close');
const settingsForm = document.getElementById('settings-form');
const settingsNameInput = document.getElementById('settings-name');
const settingsPhotoInput = document.getElementById('settings-photo');
const settingsThemeToggle = document.getElementById('settings-theme-toggle');

// サイドバー・ナビゲーション
const tabMenuLis = document.querySelectorAll('#tab-menu li');
const roomList = document.getElementById('room-list');

// DM検索UI関連
const dmSearchContainer = document.getElementById('dm-search-container');
const dmSearchInput = document.getElementById('dm-search-input');
const dmSearchResults = document.getElementById('dm-search-results');

// メインチャット画面
const currentRoomNameEl = document.getElementById('current-room-name');
const btnAudioCall = document.getElementById('btn-audio-call');
const btnVideoCall = document.getElementById('btn-video-call');
const btnAdminDashboard = document.getElementById('btn-admin-dashboard');
const chatMessages = document.getElementById('chat-messages');

// メッセージ送信フォーム
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const testRoleSelect = document.getElementById('test-role-select');

// 通話モーダル
const callModal = document.getElementById('call-modal');
const videoPlaceholder = document.getElementById('video-placeholder');
const callStatusText = document.getElementById('call-status-text');
const btnMute = document.getElementById('btn-mute');
const btnCameraOff = document.getElementById('btn-camera-off');
const btnHangup = document.getElementById('btn-hangup');

// 管理者ダッシュボード
const adminDashboardModal = document.getElementById('admin-dashboard-modal');
const btnCloseDashboard = document.getElementById('btn-close-dashboard');
const userTableBody = document.getElementById('user-table-body');

/*=============================================================================
  2. 状態管理（State）
=============================================================================*/
let currentUser = null;
let currentRole = 'user'; 
let currentMode = 'open'; 
let currentRoomId = 'general'; 
let currentRoomName = 'General'; 
let activeListeners = []; 
let dmsListListener = null; // 自身のDMリスト更新監視用

// モードごとの固定部屋データ（オープンチャットとプライベートチャット）
const staticRooms = {
    open: [
        { id: 'general', name: '# 総合 (General)' },
        { id: 'random', name: '# 雑談 (Random)' },
        { id: 'announcement', name: '# お知らせ (Announcement)' }
    ],
    private: [
        { id: 'dev-team', name: '🔒 開発チーム' },
        { id: 'design-team', name: '🔒 デザインチーム' }
    ]
};

// DMリスト（動的にDBから取得して格納します）
let activeDms = [];

/*=============================================================================
  3. テーマ設定の初期化
=============================================================================*/
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        settingsThemeToggle.checked = true;
    } else {
        document.body.classList.remove('light-theme');
        settingsThemeToggle.checked = false;
    }
}
initTheme();

/*=============================================================================
  4. ログイン画面の制御と各種認証
=============================================================================*/
function showLoginError(message) {
    loginErrorMessage.textContent = message;
    loginErrorMessage.classList.remove('hidden');
}

function clearLoginError() {
    loginErrorMessage.textContent = '';
    loginErrorMessage.classList.add('hidden');
}

// タブメニューの切り替え
loginTabs.addEventListener('click', (e) => {
    if (e.target.tagName !== 'LI') return;
    
    Array.from(loginTabs.children).forEach(li => li.classList.remove('active'));
    e.target.classList.add('active');
    
    const targetTab = e.target.getAttribute('data-tab');
    tabSocial.classList.add('hidden');
    tabEmailLogin.classList.add('hidden');
    tabEmailRegister.classList.add('hidden');
    
    clearLoginError();
    
    if (targetTab === 'social') {
        tabSocial.classList.remove('hidden');
    } else if (targetTab === 'email-login') {
        tabEmailLogin.classList.remove('hidden');
    } else if (targetTab === 'email-register') {
        tabEmailRegister.classList.remove('hidden');
    }
});

btnToggleGuide.addEventListener('click', () => {
    btnToggleGuide.classList.toggle('open');
    guideBody.classList.toggle('hidden');
});

// エラー日本語変換
function getErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email': return 'メールアドレスの形式が正しくありません。';
        case 'auth/user-disabled': return 'このアカウントは無効化されています。';
        case 'auth/user-not-found': return 'アカウントが見つかりません。新規登録を行ってください。';
        case 'auth/wrong-password': return 'パスワードが間違っています。';
        case 'auth/email-already-in-use': return 'このメールアドレスは既に登録されています。';
        case 'auth/weak-password': return 'パスワードは6文字以上で設定してください。';
        case 'auth/popup-closed-by-user': return 'ログインポップアップが閉じられました。再度お試しください。';
        case 'auth/unauthorized-domain': return 'このドメインは認証が許可されていません。Firebase設定をご確認ください。';
        case 'auth/invalid-credential': return 'ログイン情報が正しくありません。メールアドレスまたはパスワードを確認してください。';
        default: return `ログインエラーが発生しました。 (${errorCode})`;
    }
}

// Googleログイン
btnLoginGoogle.addEventListener('click', async () => {
    clearLoginError();
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        showLoginError(getErrorMessage(error.code));
    }
});

// メールログイン
emailLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginError();
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginEmailInput.value = '';
        loginPasswordInput.value = '';
    } catch (error) {
        showLoginError(getErrorMessage(error.code));
    }
});

// パスワードリセット
btnForgotPassword.addEventListener('click', async () => {
    clearLoginError();
    const email = loginEmailInput.value.trim();
    if (!email) {
        showLoginError('メールアドレスを入力した状態でこのボタンを押してください。');
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        alert('パスワード再設定メールを送信しました。受信トレイをご確認ください。');
    } catch (error) {
        showLoginError(getErrorMessage(error.code));
    }
});

// メールアドレスでの新規登録
emailRegisterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginError();
    const name = registerNameInput.value.trim();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value;
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        
        registerNameInput.value = '';
        registerEmailInput.value = '';
        registerPasswordInput.value = '';
    } catch (error) {
        showLoginError(getErrorMessage(error.code));
    }
});

// ログアウト処理
btnLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error(error);
    }
});

/*=============================================================================
  5. ログイン状態の監視とロールUI適用
=============================================================================*/
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        // voton.admin@gmail.comは強制的に管理者 (admin)
        let initialRole = 'user';
        if (user.email === 'voton.admin@gmail.com') {
            initialRole = 'admin';
        }
        
        if (!snapshot.exists()) {
            await set(userRef, {
                uid: user.uid,
                displayName: user.displayName || user.email?.split('@')[0] || '名無し',
                email: user.email || '',
                photoURL: user.photoURL || 'https://via.placeholder.com/40',
                role: initialRole,
                createdAt: serverTimestamp()
            });
            currentRole = initialRole;
        } else {
            const userData = snapshot.val();
            if (user.email === 'voton.admin@gmail.com') {
                currentRole = 'admin';
                if (userData.role !== 'admin') {
                    await set(ref(database, `users/${user.uid}/role`), 'admin');
                }
            } else {
                currentRole = userData.role || 'user';
            }
        }
        
        // UIの初期化
        loginOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        myAvatar.src = user.photoURL || 'https://via.placeholder.com/40';
        myName.textContent = user.displayName || user.email?.split('@')[0] || '名無し';
        testRoleSelect.value = currentRole;
        
        updateRoleUI(currentRole);
        
        // ログイン中のユーザー専用のDMリスト同期を開始
        startDmsListSync();
        
        // 初期部屋の読み込み
        renderRoomList(currentMode);
        switchRoom(staticRooms.open[0].id, staticRooms.open[0].name);

    } else {
        currentUser = null;
        loginOverlay.classList.remove('hidden');
        appContainer.classList.add('hidden');
        adminDashboardModal.classList.add('hidden');
        settingsModal.classList.add('hidden');
        callModal.classList.add('hidden');
        
        stopDmsListSync();
        clearDatabaseListeners();
    }
});

function updateRoleUI(role) {
    currentRole = role;
    
    myRoleBadge.innerHTML = '';
    myRoleBadge.className = '';
    myName.className = 'user-name';
    btnAdminDashboard.classList.add('hidden');
    
    if (role === 'admin') {
        myRoleBadge.innerHTML = '🛡️✔️';
        myRoleBadge.className = 'badge-admin';
        myName.classList.add('role-admin');
        myRoleText.textContent = 'システム管理者 (Admin)';
        btnAdminDashboard.classList.remove('hidden');
    } else if (role === 'official') {
        myRoleBadge.className = 'badge-official';
        myRoleText.textContent = '公式アカウント (Official)';
    } else {
        myRoleText.textContent = '一般ユーザー (User)';
    }
}

testRoleSelect.addEventListener('change', (e) => {
    updateRoleUI(e.target.value);
});

/*=============================================================================
  6. ユーザー設定（プロフィール編集・テーマ切り替え）
=============================================================================*/
// 設定モーダルを開く
btnSettingsOpen.addEventListener('click', () => {
    if (!currentUser) return;
    settingsNameInput.value = currentUser.displayName || '';
    settingsPhotoInput.value = currentUser.photoURL || '';
    settingsModal.classList.remove('hidden');
});

// 設定モーダルを閉じる
btnSettingsClose.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

// 設定を保存する
settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    const newName = settingsNameInput.value.trim();
    const newPhoto = settingsPhotoInput.value.trim();
    
    try {
        // Firebase Auth の更新
        await updateProfile(currentUser, {
            displayName: newName,
            photoURL: newPhoto || 'https://via.placeholder.com/40'
        });
        
        // Realtime Database の更新
        const userRef = ref(database, `users/${currentUser.uid}`);
        await set(ref(database, `users/${currentUser.uid}/displayName`), newName);
        await set(ref(database, `users/${currentUser.uid}/photoURL`), newPhoto || 'https://via.placeholder.com/40');
        
        // サイドバーのUIを即時更新
        myAvatar.src = newPhoto || 'https://via.placeholder.com/40';
        myName.textContent = newName;
        
        alert('設定を保存しました。');
        settingsModal.classList.add('hidden');
    } catch (err) {
        console.error('設定保存エラー:', err);
        alert('設定の保存に失敗しました。');
    }
});

// テーマ切り替えトグル
settingsThemeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
    }
});

/*=============================================================================
  7. ナビゲーションと部屋切り替え（DM検索連携）
=============================================================================*/
tabMenuLis.forEach(li => {
    li.addEventListener('click', (e) => {
        tabMenuLis.forEach(tab => tab.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        currentMode = e.currentTarget.getAttribute('data-mode');
        
        // DMモード選択時のみ検索バーを表示
        if (currentMode === 'dm') {
            dmSearchContainer.classList.remove('hidden');
        } else {
            dmSearchContainer.classList.add('hidden');
            dmSearchResults.classList.add('hidden');
            dmSearchInput.value = '';
        }
        
        renderRoomList(currentMode);
        
        // そのモードの最初の部屋へ切り替え
        if (currentMode === 'dm') {
            if (activeDms.length > 0) {
                switchRoom(activeDms[0].chatId, `@ ${activeDms[0].partnerName}`);
            } else {
                currentRoomId = '';
                currentRoomNameEl.textContent = 'DMを開始するには検索して選択してください';
                chatMessages.innerHTML = '';
            }
        } else {
            const firstRoom = staticRooms[currentMode][0];
            switchRoom(firstRoom.id, firstRoom.name);
        }
    });
});

// 部屋リストの描画処理
function renderRoomList(mode) {
    roomList.innerHTML = '';
    
    if (mode === 'dm') {
        // DMリストの描画
        activeDms.forEach(dm => {
            const li = document.createElement('li');
            li.innerHTML = `<img src="${dm.partnerPhoto}" class="msg-avatar" style="width:24px; height:24px;"> @ ${dm.partnerName}`;
            if (dm.chatId === currentRoomId) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => {
                switchRoom(dm.chatId, `@ ${dm.partnerName}`);
                document.querySelectorAll('#room-list li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
            });
            roomList.appendChild(li);
        });
    } else {
        // 静的部屋（オープン、プライベート）の描画
        const rooms = staticRooms[mode];
        rooms.forEach(room => {
            const li = document.createElement('li');
            li.textContent = room.name;
            if (room.id === currentRoomId) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => {
                switchRoom(room.id, room.name);
                document.querySelectorAll('#room-list li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
            });
            roomList.appendChild(li);
        });
    }
}

/*=============================================================================
  8. ユーザー検索によるDMの開始
=============================================================================*/
// ユーザー検索のイベント処理
dmSearchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim().toLowerCase();
    dmSearchResults.innerHTML = '';
    
    if (!query) {
        dmSearchResults.classList.add('hidden');
        return;
    }
    
    try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);
        
        let foundUsers = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const user = child.val();
                // 自身を除外し、かつ検索文字列に部分一致するユーザーを検索
                if (user.uid !== currentUser.uid && user.displayName.toLowerCase().includes(query)) {
                    foundUsers.push(user);
                }
            });
        }
        
        if (foundUsers.length > 0) {
            foundUsers.forEach(user => {
                const li = document.createElement('li');
                li.innerHTML = `<img src="${user.photoURL || 'https://via.placeholder.com/30'}"> <span>${user.displayName}</span>`;
                
                li.addEventListener('click', async () => {
                    await startNewDm(user);
                    dmSearchInput.value = '';
                    dmSearchResults.classList.add('hidden');
                });
                
                dmSearchResults.appendChild(li);
            });
            dmSearchResults.classList.remove('hidden');
        } else {
            const li = document.createElement('li');
            li.textContent = '見つかりませんでした';
            dmSearchResults.appendChild(li);
            dmSearchResults.classList.remove('hidden');
        }
    } catch (err) {
        console.error('ユーザー検索エラー:', err);
    }
});

// 新しいDMを開始する処理
async function startNewDm(partnerUser) {
    const myUid = currentUser.uid;
    const partnerUid = partnerUser.uid;
    
    // UIDをソートして結合し、ユニークなチャットIDを生成
    const chatId = myUid < partnerUid ? `${myUid}_${partnerUid}` : `${partnerUid}_${myUid}`;
    
    // 自分側のDMリストに登録
    const myDmRef = ref(database, `users/${myUid}/dms/${chatId}`);
    await set(myDmRef, {
        chatId: chatId,
        partnerUid: partnerUid,
        partnerName: partnerUser.displayName,
        partnerPhoto: partnerUser.photoURL || 'https://via.placeholder.com/40',
        lastUpdated: serverTimestamp()
    });
    
    // 相手側のDMリストに登録
    const partnerDmRef = ref(database, `users/${partnerUid}/dms/${chatId}`);
    await set(partnerDmRef, {
        chatId: chatId,
        partnerUid: myUid,
        partnerName: currentUser.displayName || '名無し',
        partnerPhoto: currentUser.photoURL || 'https://via.placeholder.com/40',
        lastUpdated: serverTimestamp()
    });
    
    // UIを切り替えてチャットを開く
    switchRoom(chatId, `@ ${partnerUser.displayName}`);
    renderRoomList('dm');
}

// 自身のDMリストの同期を開始する
function startDmsListSync() {
    if (!currentUser) return;
    const dmsRef = ref(database, `users/${currentUser.uid}/dms`);
    
    dmsListListener = onValue(dmsRef, (snapshot) => {
        activeDms = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                activeDms.push(child.val());
            });
            // 更新順に並び替え
            activeDms.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
        }
        // DMモードの時はサイドバー一覧をリアルタイム更新
        if (currentMode === 'dm') {
            renderRoomList('dm');
        }
    });
}

function stopDmsListSync() {
    if (dmsListListener) {
        dmsListListener();
        dmsListListener = null;
    }
}

/*=============================================================================
  9. チャットメッセージのリアルタイム同期
=============================================================================*/
function switchRoom(roomId, roomName) {
    currentRoomId = roomId;
    currentRoomName = roomName;
    currentRoomNameEl.textContent = roomName;
    
    chatMessages.innerHTML = '';
    clearDatabaseListeners();
    
    if (!roomId) return;
    
    const messagesRef = ref(database, `rooms/${currentMode}/${currentRoomId}/messages`);
    
    const unsubscribeAdd = onChildAdded(messagesRef, (snapshot) => {
        const msgId = snapshot.key;
        const msgData = snapshot.val();
        renderMessage(msgId, msgData);
        scrollToBottom();
    });
    activeListeners.push(unsubscribeAdd);
    
    const unsubscribeRemove = onChildRemoved(messagesRef, (snapshot) => {
        const msgId = snapshot.key;
        const msgElement = document.getElementById(`msg-${msgId}`);
        if (msgElement) {
            msgElement.remove();
        }
    });
    activeListeners.push(unsubscribeRemove);
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !currentUser || !currentRoomId) return;
    
    const messagesRef = ref(database, `rooms/${currentMode}/${currentRoomId}/messages`);
    
    const newMessage = {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email?.split('@')[0] || '名無し',
        photoURL: currentUser.photoURL || 'https://via.placeholder.com/40',
        text: text,
        role: currentRole, 
        timestamp: serverTimestamp()
    };
    
    try {
        await push(messagesRef, newMessage);
        chatInput.value = '';
        chatInput.focus();
        
        // DMの場合は、サイドバーの位置を上げるためにlastUpdatedを更新
        if (currentMode === 'dm') {
            const partnerUid = currentRoomId.replace(currentUser.uid, '').replace('_', '');
            
            // 自分のDMリストの更新
            set(ref(database, `users/${currentUser.uid}/dms/${currentRoomId}/lastUpdated`), serverTimestamp());
            // 相手側のDMリストの更新
            set(ref(database, `users/${partnerUid}/dms/${currentRoomId}/lastUpdated`), serverTimestamp());
        }
    } catch (error) {
        console.error('メッセージ送信エラー:', error);
    }
});

function renderMessage(msgId, data) {
    const isSelf = data.uid === currentUser.uid;
    
    const wrapper = document.createElement('div');
    wrapper.id = `msg-${msgId}`;
    wrapper.className = `message-wrapper ${isSelf ? 'self' : 'other'}`;
    
    const avatar = document.createElement('img');
    avatar.src = data.photoURL;
    avatar.className = 'msg-avatar';
    
    const body = document.createElement('div');
    body.className = 'msg-body';
    
    const info = document.createElement('div');
    info.className = 'msg-info';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'msg-name';
    nameSpan.textContent = data.name;
    
    const badgeSpan = document.createElement('span');
    if (data.role === 'admin') {
        badgeSpan.className = 'badge-admin';
        badgeSpan.innerHTML = '🛡️✔️';
        nameSpan.classList.add('role-admin');
    } else if (data.role === 'official') {
        badgeSpan.className = 'badge-official';
    }
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    if (data.timestamp) {
        const date = new Date(data.timestamp);
        timeSpan.textContent = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
        timeSpan.textContent = '送信中...';
    }
    
    info.appendChild(nameSpan);
    if (data.role !== 'user') info.appendChild(badgeSpan);
    info.appendChild(timeSpan);
    
    const contentBox = document.createElement('div');
    contentBox.className = 'msg-content-box';
    contentBox.textContent = data.text;
    
    if (currentRole === 'admin' || isSelf) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-msg';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'メッセージを削除';
        
        deleteBtn.addEventListener('click', async () => {
            if (confirm('本当にこのメッセージを削除しますか？')) {
                const msgRef = ref(database, `rooms/${currentMode}/${currentRoomId}/messages/${msgId}`);
                try {
                    await remove(msgRef);
                } catch (error) {
                    console.error('削除エラー:', error);
                    alert('削除権限がありません');
                }
            }
        });
        
        contentBox.appendChild(deleteBtn);
    }
    
    body.appendChild(info);
    body.appendChild(contentBox);
    
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    
    chatMessages.appendChild(wrapper);
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/*=============================================================================
  10. 通話機能の実装（フロントモック）
=============================================================================*/
function openCallModal(isVideo) {
    callModal.classList.remove('hidden');
    callStatusText.textContent = `${currentRoomName} と通話中...`;
    
    if (isVideo) {
        videoPlaceholder.classList.remove('hidden');
        btnCameraOff.classList.remove('hidden');
    } else {
        videoPlaceholder.classList.add('hidden');
        btnCameraOff.classList.add('hidden');
    }
}

btnAudioCall.addEventListener('click', () => {
    if (!currentRoomId) return;
    openCallModal(false);
});

btnVideoCall.addEventListener('click', () => {
    if (!currentRoomId) return;
    openCallModal(true);
});

let isMuted = false;
btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
        btnMute.innerHTML = '🔇';
        btnMute.style.backgroundColor = 'var(--danger-color)';
    } else {
        btnMute.innerHTML = '🎤';
        btnMute.style.backgroundColor = '#333';
    }
});

let isCameraOff = false;
btnCameraOff.addEventListener('click', () => {
    isCameraOff = !isCameraOff;
    if (isCameraOff) {
        btnCameraOff.innerHTML = '🚫';
        btnCameraOff.style.backgroundColor = 'var(--danger-color)';
        videoPlaceholder.style.backgroundColor = '#111';
        videoPlaceholder.querySelector('.scanning-line').style.display = 'none';
    } else {
        btnCameraOff.innerHTML = '📷';
        btnCameraOff.style.backgroundColor = '#333';
        videoPlaceholder.style.backgroundColor = '#000';
        videoPlaceholder.querySelector('.scanning-line').style.display = 'block';
    }
});

btnHangup.addEventListener('click', () => {
    callModal.classList.add('hidden');
    isMuted = false;
    isCameraOff = false;
    btnMute.innerHTML = '🎤';
    btnMute.style.backgroundColor = '#333';
    btnCameraOff.innerHTML = '📷';
    btnCameraOff.style.backgroundColor = '#333';
    videoPlaceholder.style.backgroundColor = '#000';
});

/*=============================================================================
  11. 管理者ダッシュボード
=============================================================================*/
let dashboardListener = null;

btnAdminDashboard.addEventListener('click', () => {
    adminDashboardModal.classList.remove('hidden');
    loadUsersToDashboard();
});

btnCloseDashboard.addEventListener('click', () => {
    adminDashboardModal.classList.add('hidden');
    if (dashboardListener) {
        dashboardListener();
        dashboardListener = null;
    }
});

function loadUsersToDashboard() {
    const usersRef = ref(database, 'users');
    
    dashboardListener = onValue(usersRef, (snapshot) => {
        userTableBody.innerHTML = '';
        
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const uid = childSnapshot.key;
                const user = childSnapshot.val();
                
                const tr = document.createElement('tr');
                
                const tdIcon = document.createElement('td');
                const img = document.createElement('img');
                img.src = user.photoURL || 'https://via.placeholder.com/30';
                img.className = 'td-avatar';
                tdIcon.appendChild(img);
                
                const tdName = document.createElement('td');
                tdName.textContent = user.displayName || '不明';
                
                const tdEmail = document.createElement('td');
                tdEmail.textContent = user.email || '未設定';
                
                const tdRole = document.createElement('td');
                const roleSelect = document.createElement('select');
                
                const roles = [
                    { val: 'user', text: '一般 (User)' },
                    { val: 'official', text: '公式 (Official)' },
                    { val: 'admin', text: '管理者 (Admin)' }
                ];
                
                roles.forEach(r => {
                    const option = document.createElement('option');
                    option.value = r.val;
                    option.textContent = r.text;
                    if (user.role === r.val) option.selected = true;
                    roleSelect.appendChild(option);
                });
                
                roleSelect.addEventListener('change', async (e) => {
                    const newRole = e.target.value;
                    if (confirm(`${user.displayName}の権限を「${newRole}」に変更しますか？`)) {
                        try {
                            const userRoleRef = ref(database, `users/${uid}/role`);
                            await set(userRoleRef, newRole);
                            alert('権限を更新しました。');
                        } catch (error) {
                            console.error(error);
                            alert('権限の変更に失敗しました。');
                            e.target.value = user.role;
                        }
                    } else {
                        e.target.value = user.role;
                    }
                });
                tdRole.appendChild(roleSelect);
                
                const tdActions = document.createElement('td');
                const actionDiv = document.createElement('div');
                actionDiv.className = 'action-buttons';
                
                const btnDeleteUser = document.createElement('button');
                btnDeleteUser.className = 'btn-danger btn-small';
                btnDeleteUser.textContent = '削除';
                btnDeleteUser.addEventListener('click', async () => {
                    if (uid === currentUser.uid) {
                        alert('自分自身は削除できません。');
                        return;
                    }
                    if (confirm(`${user.displayName} をデータベースから完全に削除しますか？`)) {
                        try {
                            await remove(ref(database, `users/${uid}`));
                            alert('ユーザーデータを削除しました。');
                        } catch (err) {
                            alert('削除に失敗しました。');
                        }
                    }
                });
                
                const btnResetPwd = document.createElement('button');
                btnResetPwd.className = 'btn-secondary btn-small';
                btnResetPwd.textContent = 'パスワード変更メール';
                btnResetPwd.addEventListener('click', async () => {
                    if (!user.email) {
                        alert('メールアドレスが設定されていないため送信できません。');
                        return;
                    }
                    if (confirm(`${user.email} 宛にパスワードリセットメールを送信しますか？`)) {
                        try {
                            await sendPasswordResetEmail(auth, user.email);
                            alert('パスワードリセットメールを送信しました。');
                        } catch (err) {
                            alert('送信に失敗しました: ' + err.message);
                        }
                    }
                });
                
                actionDiv.appendChild(btnResetPwd);
                actionDiv.appendChild(btnDeleteUser);
                tdActions.appendChild(actionDiv);
                
                tr.appendChild(tdIcon);
                tr.appendChild(tdName);
                tr.appendChild(tdEmail);
                tr.appendChild(tdRole);
                tr.appendChild(tdActions);
                
                userTableBody.appendChild(tr);
            });
        } else {
            userTableBody.innerHTML = '<tr><td colspan="5">ユーザーが見つかりません</td></tr>';
        }
    }, (error) => {
        console.error(error);
    });
}
