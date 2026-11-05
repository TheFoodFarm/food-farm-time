import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCB0dGtg5lSkc6__3QcSNI0mSbkNvn1HCE",
  authDomain: "thefoodfarm-time.firebaseapp.com",
  projectId: "thefoodfarm-time",
  storageBucket: "thefoodfarm-time.firebasestorage.app",
  messagingSenderId: "937218991459",
  appId: "1:937218991459:web:aba46fbcb7c40ff0b11f56"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// A second, separate Firebase app instance. It is only used by the admin to
// create new staff logins without signing the admin out of their own session.
const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);
