import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBSbLdFZdQfrU-tR8YyQi9QTJxxOYJj244",
  authDomain: "virtual-lab-3c559.firebaseapp.com",
  projectId: "virtual-lab-3c559",
  storageBucket: "virtual-lab-3c559.firebasestorage.app",
  messagingSenderId: "603172275770",
  appId: "1:603172275770:web:479cef05e58bca6f035703",
  measurementId: "G-9F2TR36WHK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;