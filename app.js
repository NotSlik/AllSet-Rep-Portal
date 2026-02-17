import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtT7UgH4SnpSG96-oXf3_n23bowrhF5cM",
  authDomain: "allsetrepportal.firebaseapp.com",
  projectId: "allsetrepportal",
  storageBucket: "allsetrepportal.appspot.com",
  messagingSenderId: "59070052736",
  appId: "1:59070052736:web:193a9edb6fd378fbd27365"
};

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Allow authenticated (anonymous counts) to read/write everything (DEV ONLY)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// UI refs (attach listeners FIRST so app still responds even if auth fails)
const errBox = document.getElementById("err");
document.getElementById("loginBtn")?.addEventListener("click", login);
document.getElementById("signupBtn")?.addEventListener("click", signup);
document.getElementById("logoutBtn")?.addEventListener("click", logout);

// Auth (won’t crash the whole app if Firebase isn’t configured)
(async () => {
  try {
    const auth = getAuth(app);
    await signInAnonymously(auth);
    console.log("✅ Anonymous auth ok");
  } catch (e) {
    console.error("❌ Anonymous auth failed:", e);
    if (errBox) errBox.innerText = "Firebase Auth error: enable Anonymous sign-in + add domain in Firebase console.";
  }
})();

let map; // Leaflet instance

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
  const stored = data.pinHash;

  if (!stored) {
    err.innerText = "Account missing pinHash field";
    return;
  }

  if (computed !== stored) {
    err.innerText = "Wrong PIN";
    return;
  }

  document.getElementById("loginCard").classList.add("hidden");
  document.getElementById("topbar").classList.remove("hidden");
  document.getElementById("map").classList.remove("hidden");

  const repName = document.getElementById("repName");
  if (repName) repName.textContent = data.nickname || data.displayName || username;

  initMap();
}

function initMap() {
  if (map) return;

  map = L.map("map").setView([41.6611, -91.5302], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  setTimeout(() => map.invalidateSize(), 200);
}

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
    nickname: username,
    createdAt: Date.now()
  }, { merge: true });

  err.innerText = "Account created. Now press Login.";
}

function logout() {
  document.getElementById("loginCard").classList.remove("hidden");
  document.getElementById("topbar").classList.add("hidden");
  document.getElementById("map").classList.add("hidden");
  document.getElementById("pin").value = "";
}
