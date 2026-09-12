// ==============================================
// এখানে আপনার নিজের Firebase প্রজেক্টের কনফিগ বসান
// Firebase Console → Project Settings → General → Your apps → SDK setup and configuration
// ==============================================
const firebaseConfig = {
  apiKey: "AIzaSyCQfcRWQMfRPfGa8rsNulRlc2wz941NhbE",
  authDomain: "rtincom-c56d3.firebaseapp.com",
  projectId: "rtincom-c56d3",
  storageBucket: "rtincom-c56d3.firebasestorage.app",
  messagingSenderId: "101792003744",
  appId: "1:101792003744:web:70bc6a37ea4145d5bafbc5",
  measurementId: "G-Q54Z33E378",
};

// আপনার অ্যাডমিন ইমেইল (এটা Firebase Authentication এ ম্যানুয়ালি যোগ করা আছে)
// এই একই ইমেইল firestore.rules ফাইলেও বসাতে হবে
const ADMIN_EMAIL = "successrifat11@gmail.com";

// bKash/নগদ নম্বর যেখানে ইউজাররা অ্যাক্টিভেশন ফি পাঠাবে (Send Money)
// এটা এখন অ্যাডমিন প্যানেলের 'সেটিংস' ট্যাব থেকে বদলানো গেলে সেটাই প্রাধান্য পাবে, এটা শুধু ফলব্যাক
const PAYMENT_RECEIVE_NUMBER = "01939769371";
const ACTIVATION_FEE = 50;
const MIN_WITHDRAW = 50;

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
