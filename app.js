// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "allsetrepportal.firebaseapp.com",
  projectId: "allsetrepportal",
  storageBucket: "allsetrepportal.appspot.com",
  messagingSenderId: "590700052736",
  appId: "1:590700052736:web:193a9edb6fd378fbd27365"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Login button
document.getElementById("loginBtn").addEventListener("click", login);

async function login() {
  const username = document.getElementById("username").value;
  const pin = document.getElementById("pin").value;
  const err = document.getElementById("err");

  err.innerText = "";

  const ref = doc(db, "reps", username);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    err.innerText = "User not found";
    return;
  }

  const data = snap.data();

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pin)
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b =>
    b.toString(16).padStart(2, "0")
  ).join("");

  if (hashHex === data.HashPin) {
    document.getElementById("loginCard").classList.add("hidden");
    document.getElementById("topbar").classList.remove("hidden");
    document.getElementById("map").classList.remove("hidden");
  } else {
    err.innerText = "Wrong PIN";
  }
}
