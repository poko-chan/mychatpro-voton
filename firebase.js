/**
 * firebase.js
 * Firebaseの初期化と各サービス（Auth, Database）のモジュール化を行います。
 * Vercelにそのままデプロイして動作するよう、ビルド不要のCDN経由（v10）でインポートします。
 */

// Firebase コア機能のインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

// Firebase Authentication（認証）のインポート
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Realtime Database（リアルタイム通信）のインポート
import { 
  getDatabase, 
  ref, 
  push, 
  onChildAdded, 
  onChildRemoved,
  onValue, 
  remove, 
  set, 
  get, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 提供された Firebase 接続情報（Config）
const firebaseConfig = {
  apiKey: "AIzaSyC4K9uFm5kOFPFoimNnEGbIh9WcMa6lHGA",
  authDomain: "mychatpro-voton.firebaseapp.com",
  databaseURL: "https://mychatpro-voton-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mychatpro-voton",
  storageBucket: "mychatpro-voton.firebasestorage.app",
  messagingSenderId: "1088114662476",
  appId: "1:1088114662476:web:21d998386de435a57be8e9",
  measurementId: "G-SQXWSR704H"
};

// Firebase アプリの初期化
const app = initializeApp(firebaseConfig);

// Auth と Database のインスタンスを取得
const auth = getAuth(app);
const database = getDatabase(app);

// アプリの他の部分で使用できるようにエクスポート
export { 
  auth, 
  database, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  ref, 
  push, 
  onChildAdded, 
  onChildRemoved,
  onValue, 
  remove, 
  set, 
  get, 
  serverTimestamp 
};
