// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCtT7UgH4SnpSG96-oXf3_n23bowrhF5cM",
  authDomain: "allsetrepportal.firebaseapp.com",
  projectId: "allsetrepportal",
  storageBucket: "allsetrepportal.appspot.com",
  messagingSenderId: "59070052736",
  appId: "1:59070052736:web:193a9edb6fd378fbd27365"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Anonymous auth (no email/password)
const auth = getAuth(app);
await signInAnonymously(auth);

// UI refs
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

loginBtn?.addEventListener("click", login);
signupBtn?.addEventListener("click", signup);
logoutBtn?.addEventListener("click", logout);

let map; // <-- ONLY declare map ONCE

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function login() {
  const username = document.getElementById("username").value.trim();
  const pin = document.getElementById("pin").value.trim();
  const err = document.getElementById("err");
  err.innerText = "";

  if (!username || !pin) {
    err.innerText = "Enter username + PIN";
    return;
  }

  const ref = doc(db, "reps", username);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    err.innerText = "User not found";
    return;
  }

  const data = snap.data();
  const computed = await sha256Hex(pin);
  const stored = data.pinHash; // MUST be pinHash

  if (!stored) {
    err.innerText = "Account missing pinHash field";
    return;
  }

  if (computed !== stored) {
    err.innerText = "Wrong PIN";
    return;
  }

  // Success UI
  document.getElementById("loginCard").classList.add("hidden");
  document.getElementById("topbar").classList.remove("hidden");
  document.getElementById("map").classList.remove("hidden");

  // Optional name display
  const repName = document.getElementById("repName");
  repName.textContent = data.nickname || data.displayName || username;

  initMap();
}

function initMap() {
  if (map) return;

  map = L.map("map").setView([41.6611, -91.5302], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  // Fix blank map if div was hidden before:
  setTimeout(() => map.invalidateSize(), 200);
}

// OPTIONAL: quick rep self-signup (no email)
// Creates reps/{username} with pinHash
async function signup() {
  const username = document.getElementById("username").value.trim();
  const pin = document.getElementById("pin").value.trim();
  const err = document.getElementById("err");
  err.innerText = "";

  if (!username || !pin) {
    err.innerText = "Enter username + PIN";
    return;
  }

  const pinHash = await sha256Hex(pin);

  await setDoc(doc(db, "reps", username), {
    pinHash,
    nickname: username,     // you can replace later with a real-name input
    createdAt: Date.now()
  }, { merge: true });

  err.innerText = "Account created. Now press Login.";
}

function logout() {
  // Simple UI logout (anonymous auth stays signed-in, which is fine)
  document.getElementById("loginCard").classList.remove("hidden");
  document.getElementById("topbar").classList.add("hidden");
  document.getElementById("map").classList.add("hidden");

  // optional: clear inputs
  document.getElementById("pin").value = "";
}
