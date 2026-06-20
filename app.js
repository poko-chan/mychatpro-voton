/**
 * app.js
 * アプリケーションのすべてのロジックを管理します。
 * ログイン方法はGoogle認証、およびメール/パスワード認証に統一。
 * voton.admin@gmail.comでのログイン時は自動的に管理者ロールが適用されます。
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

// サイドバー
const tabMenuLis = document.querySelectorAll('#tab-menu li');
const roomList = document.getElementById('room-list');

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

// モードごとの固定部屋データ
const roomsData = {
    open: [
        { id: 'general', name: '# 総合 (General)' },
        { id: 'random', name: '# 雑談 (Random)' },
        { id: 'announcement', name: '# お知らせ (Announcement)' }
    ],
    dm: [
        { id: 'user1', name: '@ ユーザーA' },
        { id: 'user2', name: '@ ユーザーB' }
    ],
    private: [
        { id: 'dev-team', name: '🔒 開発チーム' },
        { id: 'design-team', name: '🔒 デザインチーム' }
    ]
};

/*=============================================================================
  3. ログイン画面の切り替え制御
=============================================================================*/
function showLoginError(message) {
    loginErrorMessage.textContent = message;
    loginErrorMessage.classList.remove('hidden');
}

function clearLoginError() {
    loginErrorMessage.textContent = '';
    loginErrorMessage.classList.add('hidden');
}

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

/*=============================================================================
  4. 認証処理の実装 (Google & メール)
=============================================================================*/
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

// Google ログイン
btnLoginGoogle.addEventListener('click', async () => {
    clearLoginError();
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        showLoginError(getErrorMessage(error.code));
    }
});

// メールアドレス・パスワードでのログイン
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
        console.error('ログアウトエラー:', error);
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
        
        // 管理者メールアドレス(voton.admin@gmail.com)は強制的に「admin」に設定
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
            // DBのロールを優先しつつ、voton.admin@gmail.comの場合は常にadminにする
            if (user.email === 'voton.admin@gmail.com') {
                currentRole = 'admin';
                if (userData.role !== 'admin') {
                    await set(ref(database, `users/${user.uid}/role`), 'admin');
                }
            } else {
                currentRole = userData.role || 'user';
            }
        }
        
        // UIの更新（アプリ画面の表示）
        loginOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        // プロフィール表示の更新
        myAvatar.src = user.photoURL || 'https://via.placeholder.com/40';
        myName.textContent = user.displayName || user.email?.split('@')[0] || '名無し';
        testRoleSelect.value = currentRole;
        
        updateRoleUI(currentRole);
        
        // 初期部屋の読み込み
        renderRoomList(currentMode);
        switchRoom(roomsData[currentMode][0].id, roomsData[currentMode][0].name);

    } else {
        currentUser = null;
        loginOverlay.classList.remove('hidden');
        appContainer.classList.add('hidden');
        adminDashboardModal.classList.add('hidden');
        callModal.classList.add('hidden');
        
        clearDatabaseListeners();
    }
});

// ロール変更によるUIの更新
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

// テスト用ロール切替セレクタ
testRoleSelect.addEventListener('change', (e) => {
    updateRoleUI(e.target.value);
});

/*=============================================================================
  6. ナビゲーションと部屋切り替え
=============================================================================*/
tabMenuLis.forEach(li => {
    li.addEventListener('click', (e) => {
        tabMenuLis.forEach(tab => tab.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        currentMode = e.currentTarget.getAttribute('data-mode');
        renderRoomList(currentMode);
        
        if (roomsData[currentMode].length > 0) {
            const firstRoom = roomsData[currentMode][0];
            switchRoom(firstRoom.id, firstRoom.name);
        }
    });
});

function renderRoomList(mode) {
    roomList.innerHTML = '';
    const rooms = roomsData[mode];
    
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

/*=============================================================================
  7. チャット送受信 & 同期 & 削除
=============================================================================*/
function clearDatabaseListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
}

function switchRoom(roomId, roomName) {
    currentRoomId = roomId;
    currentRoomName = roomName;
    currentRoomNameEl.textContent = roomName;
    
    chatMessages.innerHTML = '';
    clearDatabaseListeners();
    
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
    if (!text || !currentUser) return;
    
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
    
    // 管理者ロール、または自分が送信したメッセージの場合に削除ボタンを表示
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
  8. 通話機能の実装（フロントモック）
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
    openCallModal(false);
});

btnVideoCall.addEventListener('click', () => {
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
  9. 管理者ダッシュボード
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
                            console.error('権限変更エラー:', error);
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
