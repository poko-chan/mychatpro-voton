/**
 * app.js
 * アプリケーションのすべてのロジック（UI制御、Firebase通信、通話シミュレーション等）を管理します。
 * 全ての処理を省略せずに記述しています。
 */

import { 
    auth, database, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, sendPasswordResetEmail,
    ref, push, onChildAdded, onChildRemoved, onValue, remove, set, get, serverTimestamp 
} from './firebase.js';

/*=============================================================================
  1. DOM要素の取得
=============================================================================*/
// ログイン関連
const loginOverlay = document.getElementById('login-overlay');
const btnLoginGoogle = document.getElementById('btn-login-google');
const appContainer = document.getElementById('app-container');

// ユーザープロフィール表示関連
const myAvatar = document.getElementById('my-avatar');
const myName = document.getElementById('my-name');
const myRoleBadge = document.getElementById('my-role-badge');
const myRoleText = document.getElementById('my-role-text');
const btnLogout = document.getElementById('btn-logout');

// サイドバー（モード切替と部屋リスト）
const tabMenuLis = document.querySelectorAll('#tab-menu li');
const roomList = document.getElementById('room-list');

// メインチャット画面
const currentRoomNameEl = document.getElementById('current-room-name');
const btnAudioCall = document.getElementById('btn-audio-call');
const btnVideoCall = document.getElementById('btn-video-call');
const btnAdminDashboard = document.getElementById('btn-admin-dashboard');
const chatMessages = document.getElementById('chat-messages');

// メッセージ送信フォーム関連
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const testRoleSelect = document.getElementById('test-role-select');

// 通話モーダル関連（フロントモック）
const callModal = document.getElementById('call-modal');
const videoPlaceholder = document.getElementById('video-placeholder');
const callStatusText = document.getElementById('call-status-text');
const btnMute = document.getElementById('btn-mute');
const btnCameraOff = document.getElementById('btn-camera-off');
const btnHangup = document.getElementById('btn-hangup');

// 管理者ダッシュボード関連
const adminDashboardModal = document.getElementById('admin-dashboard-modal');
const btnCloseDashboard = document.getElementById('btn-close-dashboard');
const userTableBody = document.getElementById('user-table-body');

/*=============================================================================
  2. 状態管理（State）
=============================================================================*/
let currentUser = null; // 現在ログインしているユーザー情報
let currentRole = 'user'; // 現在の権限 ('user', 'official', 'admin')
let currentMode = 'open'; // 'open', 'dm', 'private'
let currentRoomId = 'general'; // 選択中の部屋ID
let currentRoomName = 'General'; // 選択中の部屋名
let activeListeners = []; // DBリスナー解除用関数の配列

// モードごとの固定部屋データ（本番ではDB管理などをしますが、今回はUI切り替え確認のため静的に用意）
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
  3. ログイン・ログアウトとユーザー管理
=============================================================================*/
// Googleログイン処理
btnLoginGoogle.addEventListener('click', async () => {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        // signInWithPopup成功後、onAuthStateChangedが発火します
    } catch (error) {
        console.error('ログインエラー:', error);
        alert('ログインに失敗しました: ' + error.message);
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

// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // データベースにユーザー情報を保存（存在しなければ）
        const userRef = ref(database, `users/${user.uid}`);
        const snapshot = await get(userRef);
        
        // 初期ロールの設定
        // 特定のメールアドレスを管理者とする例（あるいはテストで切り替え）
        let initialRole = 'user';
        if (user.email === 'admin@voton.com' || user.email === 'voton@example.com') {
            initialRole = 'admin';
        }
        
        if (!snapshot.exists()) {
            // 新規ユーザー登録
            await set(userRef, {
                uid: user.uid,
                displayName: user.displayName || '名無し',
                email: user.email || '',
                photoURL: user.photoURL || '',
                role: initialRole,
                createdAt: serverTimestamp()
            });
            currentRole = initialRole;
        } else {
            // 既存ユーザーの場合はDBからロールを取得
            const userData = snapshot.val();
            currentRole = userData.role || 'user';
        }
        
        // UIの更新（ログイン完了）
        loginOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        // ユーザー情報をサイドバーに反映
        myAvatar.src = user.photoURL || 'https://via.placeholder.com/40';
        myName.textContent = user.displayName || '名無し';
        testRoleSelect.value = currentRole; // テスト用セレクタの初期値
        
        updateRoleUI(currentRole);
        
        // 初期部屋の読み込み
        renderRoomList(currentMode);
        switchRoom(roomsData[currentMode][0].id, roomsData[currentMode][0].name);

    } else {
        // 未ログイン状態
        currentUser = null;
        loginOverlay.classList.remove('hidden');
        appContainer.classList.add('hidden');
        adminDashboardModal.classList.add('hidden');
        callModal.classList.add('hidden');
        
        // リスナーの解除
        clearDatabaseListeners();
    }
});

// ロールに応じたUIのアップデート
function updateRoleUI(role) {
    currentRole = role;
    
    // バッジのリセット
    myRoleBadge.innerHTML = '';
    myRoleBadge.className = '';
    myName.className = 'user-name';
    btnAdminDashboard.classList.add('hidden');
    
    if (role === 'admin') {
        // 管理者バッジとスタイル
        myRoleBadge.innerHTML = '🛡️✔️'; // 盾とチェック
        myRoleBadge.className = 'badge-admin';
        myName.classList.add('role-admin');
        myRoleText.textContent = 'システム管理者 (Admin)';
        btnAdminDashboard.classList.remove('hidden'); // 管理者ダッシュボードボタン表示
    } else if (role === 'official') {
        // 公式バッジ
        myRoleBadge.className = 'badge-official'; // CSSの ::after でチェックを描画
        myRoleText.textContent = '公式アカウント (Official)';
    } else {
        // 一般ユーザー
        myRoleText.textContent = '一般ユーザー (User)';
    }
}

// テスト用：セレクトボックスでロールを疑似的に切り替える
testRoleSelect.addEventListener('change', (e) => {
    updateRoleUI(e.target.value);
    
    // 現在のメッセージ一覧の削除ボタン表示状態も更新（再描画）
    // 自分が送信したメッセージのうち、adminなら他のメッセージにも削除ボタンをつけるなどをシミュレート
    // 簡単のため再読み込みはせず、新しく送るメッセージと既存の自身の管理権限が即時変わるようにする
    // 本来はDBの権限を変更するが、今回はUI上の実験機能
});

/*=============================================================================
  4. ナビゲーションと部屋の切り替え
=============================================================================*/
// タブのクリックイベント
tabMenuLis.forEach(li => {
    li.addEventListener('click', (e) => {
        // アクティブ状態の切り替え
        tabMenuLis.forEach(tab => tab.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        // モード変更
        currentMode = e.currentTarget.getAttribute('data-mode');
        renderRoomList(currentMode);
        
        // そのモードの一番上の部屋に切り替え
        if (roomsData[currentMode].length > 0) {
            const firstRoom = roomsData[currentMode][0];
            switchRoom(firstRoom.id, firstRoom.name);
        }
    });
});

// 部屋リストを描画する関数
function renderRoomList(mode) {
    roomList.innerHTML = ''; // クリア
    const rooms = roomsData[mode];
    
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = room.name;
        if (room.id === currentRoomId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            switchRoom(room.id, room.name);
            // 選択状態の更新
            document.querySelectorAll('#room-list li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
        });
        roomList.appendChild(li);
    });
}

/*=============================================================================
  5. チャット機能（送信・受信・同期・削除）
=============================================================================*/
// DBリスナーをすべて解除する関数
function clearDatabaseListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
}

// 部屋を切り替えてメッセージを読み込む
function switchRoom(roomId, roomName) {
    currentRoomId = roomId;
    currentRoomName = roomName;
    currentRoomNameEl.textContent = roomName;
    
    // メッセージエリアをクリア
    chatMessages.innerHTML = '';
    
    // 既存のリスナーを解除
    clearDatabaseListeners();
    
    // Realtime Database パスを決定
    const messagesRef = ref(database, `rooms/${currentMode}/${currentRoomId}/messages`);
    
    // メッセージ追加（受信）の監視
    const unsubscribeAdd = onChildAdded(messagesRef, (snapshot) => {
        const msgId = snapshot.key;
        const msgData = snapshot.val();
        renderMessage(msgId, msgData);
        scrollToBottom();
    });
    activeListeners.push(unsubscribeAdd);
    
    // メッセージ削除の監視
    const unsubscribeRemove = onChildRemoved(messagesRef, (snapshot) => {
        const msgId = snapshot.key;
        const msgElement = document.getElementById(`msg-${msgId}`);
        if (msgElement) {
            msgElement.remove(); // UIから即座に削除
        }
    });
    activeListeners.push(unsubscribeRemove);
}

// メッセージ送信処理
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !currentUser) return;
    
    const messagesRef = ref(database, `rooms/${currentMode}/${currentRoomId}/messages`);
    
    // DBに保存するデータオブジェクト
    const newMessage = {
        uid: currentUser.uid,
        name: currentUser.displayName || '名無し',
        photoURL: currentUser.photoURL || 'https://via.placeholder.com/40',
        text: text,
        role: currentRole, // 送信時点のロール（テスト用切り替え対応）
        timestamp: serverTimestamp() // サーバーのタイムスタンプ
    };
    
    try {
        await push(messagesRef, newMessage);
        chatInput.value = ''; // フォームクリア
        chatInput.focus();
    } catch (error) {
        console.error('メッセージ送信エラー:', error);
        alert('メッセージの送信に失敗しました');
    }
});

// メッセージを画面に描画する関数
function renderMessage(msgId, data) {
    const isSelf = data.uid === currentUser.uid;
    
    // 全体を包むラッパー要素
    const wrapper = document.createElement('div');
    wrapper.id = `msg-${msgId}`;
    wrapper.className = `message-wrapper ${isSelf ? 'self' : 'other'}`;
    
    // アイコン画像
    const avatar = document.createElement('img');
    avatar.src = data.photoURL;
    avatar.className = 'msg-avatar';
    
    // メッセージ本体のコンテナ
    const body = document.createElement('div');
    body.className = 'msg-body';
    
    // 送信者情報（名前、バッジ、時間）
    const info = document.createElement('div');
    info.className = 'msg-info';
    
    // 名前
    const nameSpan = document.createElement('span');
    nameSpan.className = 'msg-name';
    nameSpan.textContent = data.name;
    
    // 権限バッジの生成と名前の演出
    const badgeSpan = document.createElement('span');
    if (data.role === 'admin') {
        badgeSpan.className = 'badge-admin';
        badgeSpan.innerHTML = '🛡️✔️';
        nameSpan.classList.add('role-admin');
    } else if (data.role === 'official') {
        badgeSpan.className = 'badge-official';
    }
    
    // 時間
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
    
    // メッセージのテキスト内容とアクションボタン
    const contentBox = document.createElement('div');
    contentBox.className = 'msg-content-box';
    contentBox.textContent = data.text;
    
    // 【管理者機能】メッセージ削除ボタン（自分のメッセージ、または自分が管理者の場合に表示）
    if (currentRole === 'admin' || isSelf) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete-msg';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'メッセージを削除';
        
        // 削除ロジック
        deleteBtn.addEventListener('click', async () => {
            if (confirm('本当にこのメッセージを削除しますか？')) {
                const msgRef = ref(database, `rooms/${currentMode}/${currentRoomId}/messages/${msgId}`);
                try {
                    await remove(msgRef); // Realtime DBから削除
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
    
    // 要素を組み立てる
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    
    chatMessages.appendChild(wrapper);
}

// 常に最下部へスクロールする関数
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/*=============================================================================
  6. 通話機能の実装（フロントモック）
=============================================================================*/
// 通話モーダルを開く関数
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

// 音声通話ボタン
btnAudioCall.addEventListener('click', () => {
    openCallModal(false);
});

// ビデオ通話ボタン
btnVideoCall.addEventListener('click', () => {
    openCallModal(true);
});

// マイクミュートトグル
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

// カメラオフトグル
let isCameraOff = false;
btnCameraOff.addEventListener('click', () => {
    isCameraOff = !isCameraOff;
    if (isCameraOff) {
        btnCameraOff.innerHTML = '🚫';
        btnCameraOff.style.backgroundColor = 'var(--danger-color)';
        // カメラ映像を疑似的に黒画面にする
        videoPlaceholder.style.backgroundColor = '#111';
        videoPlaceholder.querySelector('.scanning-line').style.display = 'none';
    } else {
        btnCameraOff.innerHTML = '📷';
        btnCameraOff.style.backgroundColor = '#333';
        videoPlaceholder.style.backgroundColor = '#000';
        videoPlaceholder.querySelector('.scanning-line').style.display = 'block';
    }
});

// 通話切断
btnHangup.addEventListener('click', () => {
    callModal.classList.add('hidden');
    // 状態リセット
    isMuted = false;
    isCameraOff = false;
    btnMute.innerHTML = '🎤';
    btnMute.style.backgroundColor = '#333';
    btnCameraOff.innerHTML = '📷';
    btnCameraOff.style.backgroundColor = '#333';
    videoPlaceholder.style.backgroundColor = '#000';
});

/*=============================================================================
  7. 管理者ダッシュボード（ユーザー管理機能）
=============================================================================*/
let dashboardListener = null;

// ダッシュボードを開く
btnAdminDashboard.addEventListener('click', () => {
    adminDashboardModal.classList.remove('hidden');
    loadUsersToDashboard();
});

// ダッシュボードを閉じる
btnCloseDashboard.addEventListener('click', () => {
    adminDashboardModal.classList.add('hidden');
    if (dashboardListener) {
        dashboardListener(); // リスナー解除
        dashboardListener = null;
    }
});

// データベースから全ユーザー情報を取得してテーブルに描画
function loadUsersToDashboard() {
    const usersRef = ref(database, 'users');
    
    // onValueでリアルタイムにユーザー一覧を同期
    dashboardListener = onValue(usersRef, (snapshot) => {
        userTableBody.innerHTML = ''; // クリア
        
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const uid = childSnapshot.key;
                const user = childSnapshot.val();
                
                const tr = document.createElement('tr');
                
                // アイコン
                const tdIcon = document.createElement('td');
                const img = document.createElement('img');
                img.src = user.photoURL || 'https://via.placeholder.com/30';
                img.className = 'td-avatar';
                tdIcon.appendChild(img);
                
                // 名前
                const tdName = document.createElement('td');
                tdName.textContent = user.displayName || '不明';
                
                // メールアドレス
                const tdEmail = document.createElement('td');
                tdEmail.textContent = user.email || '未設定';
                
                // 権限変更セレクトボックス
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
                
                // ロール変更イベント
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
                            e.target.value = user.role; // 元に戻す
                        }
                    } else {
                        e.target.value = user.role; // キャンセル時は元に戻す
                    }
                });
                tdRole.appendChild(roleSelect);
                
                // アクションボタン類（削除、パスワード変更）
                const tdActions = document.createElement('td');
                const actionDiv = document.createElement('div');
                actionDiv.className = 'action-buttons';
                
                // ユーザー削除ボタン
                const btnDeleteUser = document.createElement('button');
                btnDeleteUser.className = 'btn-danger btn-small';
                btnDeleteUser.textContent = '削除';
                btnDeleteUser.addEventListener('click', async () => {
                    if (uid === currentUser.uid) {
                        alert('自分自身は削除できません。');
                        return;
                    }
                    if (confirm(`${user.displayName} をデータベースから完全に削除しますか？\n（Auth側の完全削除にはAdmin SDKが必要ですが、ここではDB上のデータを削除します）`)) {
                        try {
                            await remove(ref(database, `users/${uid}`));
                            alert('ユーザーデータを削除しました。');
                        } catch (err) {
                            console.error('ユーザー削除エラー', err);
                            alert('削除に失敗しました。');
                        }
                    }
                });
                
                // パスワード変更（リセットメール送信）ボタン
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
                            console.error('パスワードリセットエラー', err);
                            alert('送信に失敗しました: ' + err.message);
                        }
                    }
                });
                
                actionDiv.appendChild(btnResetPwd);
                actionDiv.appendChild(btnDeleteUser);
                tdActions.appendChild(actionDiv);
                
                // 行にセルを追加
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
        console.error('ダッシュボードのデータ取得エラー:', error);
        userTableBody.innerHTML = '<tr><td colspan="5" style="color:red">データの読み込みに失敗しました。権限を確認してください。</td></tr>';
    });
}
