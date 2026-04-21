// Замени значения в объекте ниже на свои из консоли Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD6S_YXM7MAlVlN4OZwMIyoaDs94_59Ies",
    authDomain: "mymath-60fa8.firebaseapp.com",
    projectId: "mymath-60fa8",
    storageBucket: "mymath-60fa8.firebasestorage.app",
    messagingSenderId: "804168465445",
    appId: "1:804168465445:web:4fd1f9c654c9b6c42a13cc"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
