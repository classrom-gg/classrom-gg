// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC99FxRQWIm1cxQfldKcCWILwk5-l5GEAI",
  authDomain: "slopeaz-4e427.firebaseapp.com",
  projectId: "slopeaz-4e427",
  storageBucket: "slopeaz-4e427.appspot.com",
  messagingSenderId: "578628797632",
  appId: "1:578628797632:web:905b552753296289835925",
  measurementId: "G-N3GPYPKVQ3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);