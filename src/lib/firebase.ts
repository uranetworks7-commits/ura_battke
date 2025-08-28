import { initializeApp, getApp, type FirebaseApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyDXNGzvFUtkGlB0pPDW1FOsrkamPNl2HSI",
    authDomain: "gunfightgame-166d9.firebaseapp.com",
    databaseURL: "https://gunfightgame-166d9-default-rtdb.firebaseio.com",
    projectId: "gunfightgame-166d9",
    storageBucket: "gunfightgame-166d9.appspot.com",
    messagingSenderId: "1060940709340",
    appId: "1:1060940709340:web:ad1d94f60524d90b252319"
};

let app: FirebaseApp;
try {
  app = getApp('1v1-arena-duel');
} catch (e) {
  app = initializeApp(firebaseConfig, '1v1-arena-duel');
}

const db = getDatabase(app);

export { db };
