import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
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

// Keep a copy of the data on the phone. Clock-ins, clock-outs and breaks made with no
// signal are stored there and sent automatically when the signal returns, even if the
// app was closed in the meantime. (Without this, a change made with no signal is lost
// if the page is closed before it reaches the server.)
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  // Already started (e.g. during a hot reload) or not supported: use the normal setup.
  firestore = getFirestore(app);
}
export const db = firestore;
export const auth = getAuth(app);

// A second, separate Firebase app instance. It is only used by the admin to
// create new staff logins without signing the admin out of their own session.
const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);