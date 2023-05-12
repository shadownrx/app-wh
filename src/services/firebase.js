import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";




const firebaseConfig = {
    apiKey: "AIzaSyBTAvtkZpal-KSzfQ-QNK5gtDFOVgd6QLU",
    authDomain: "chat-app3-b748c.firebaseapp.com",
    projectId: "chat-app3-b748c",
    storageBucket: "chat-app3-b748c.appspot.com",
    messagingSenderId: "839160697206",
    appId: "1:839160697206:web:9eca8e6142a04b25912a57",
    measurementId: "G-182MDNH9RD"
  };

  const app = firebase.initializeApp(firebaseConfig);

  const db = app.firestore();
  const auth = app.auth();
  const provider = new firebase.auth.GoogleAuthProvider();

  export {db, auth, provider};