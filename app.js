// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "YOUR_KEY_HERE",
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

// UI
document.getElementById("loginBtn").addEventListener("click", login);

// Optional: let reps create their own account (fast/easy)
// If you add a button with id="signupBtn" in HTML, this will work:
const signupBtn = document.getElementById("signupBtn");
if (signupBtn) signupBtn.addEventListener("click", signup);

let map; // Leaflet map instance

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

  // IMPORTANT: your Firestore is reps/{username}
  const ref = doc(db, "reps", username);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    err.innerText = "User not found";
    return;
  }

  const data = snap.data();
  const computed = await sha256Hex(pin);

  // IMPORTANT: field is pinHash (lowercase p)
  const stored = data.pinHash;

  if (!stored) {
    err.innerText = "Account missing pinHash field";
    return;
  }

  if (computed === stored) {
    document.getElementById("loginCard").classList.add("hidden");
    document.getElementById("topbar").classList.remove("hidden");
    document.getElementById("map").classList.remove("hidden");

    initMap(); // <-- THIS is why you weren’t seeing the map before
  } else {
    err.innerText = "Wrong PIN";
  }
}

function initMap() {
  if (map) return; // don’t re-create

  // Leaflet requires the div to be visible + have height in CSS
  map = L.map("map").setView([41.6611, -91.5302], 13); // Iowa City default

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  L.marker([41.6611, -91.5302]).addTo(map).bindPopup("AllSet Rep Portal").openPopup();
}

// OPTIONAL: quick rep self-signup (no email)
// Needs a signup button and (ideally) a displayName input too.
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

  // Create reps/{username}
  await setDoc(doc(db, "reps", username), {
    pinHash,
    displayName: username, // later swap this for a real-name field
    createdAt: Date.now()
  });

  err.innerText = "Account created. Now press Login.";
}
