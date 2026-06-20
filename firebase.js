/**
 * firebase.js
 * Firebaseの初期化と各種サービス（認証、データベース）の機能提供を行います。
 * Google, Apple, Microsoft, メール, 電話番号といった各種認証プロバイダに対応するためのオブジェクトをエクスポートします。
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { 
  getAuth, 
  GoogleAuthProvider, 
  OAuthProvider,            // Apple, Microsoftなどの外部認証プロバイダ用
  RecaptchaVerifier,        // 電話認証用のreCAPTCHA認証ツール
  signInWithPhoneNumber,    // 電話認証（SMS送信・ログイン）用
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// 提供された Firebase 接続情報
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

// アプリの初期化
const app = initializeApp(firebaseConfig);

// インスタンスの生成
const auth = getAuth(app);
const database = getDatabase(app);

// 必要に応じて言語を日本語に設定
auth.languageCode = 'ja';

export { 
  auth, 
  database, 
  GoogleAuthProvider, 
  OAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
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
