import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_CbiovvY9yvdsQ6wzzwoG2QaqBT0r7Bg",
  authDomain: "allsetrepportal.firebaseapp.com",
  projectId: "allsetrepportal",
  storageBucket: "allsetrepportal.appspot.com",
  messagingSenderId: "59070052736",
  appId: "1:59070052736:web:193a9edb6fd378fbd27365"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---- helpers
function handleToEmail(handle) {
  // handle must be 3-20 chars: letters/numbers/._-
  return `${handle.toLowerCase()}@allsetrepportal.local`;
}

function showApp() {
  document.getElementById("loginCard").classList.add("hidden");
  document.getElementById("topbar").classList.remove("hidden");
  document.getElementById("map").classList.remove("hidden");
}

function showLogin() {
  document.getElementById("loginCard").classList.remove("hidden");
  document.getElementById("topbar").classList.add("hidden");
  document.getElementById("map").classList.add("hidden");
}

function setErr(msg) {
  const err = document.getElementById("err");
  err.textContent = msg || "";
}

// ---- UI wiring
document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("signupBtn").addEventListener("click", signup);
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

// Enter key submits login
["username", "pin", "nickname"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
});

// ---- Auth state
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  // optional: load rep profile
  const repRef = doc(db, "reps", user.uid);
  const snap = await getDoc(repRef);
  if (snap.exists()) {
    const rep = snap.data();
    document.getElementById("repName").textContent = rep.nickname || "Rep";
  } else {
    document.getElementById("repName").textContent = "Rep";
  }

  showApp();
});

// ---- actions
async function signup() {
  try {
    setErr("");

    const handle = document.getElementById("username").value.trim();
    const pin = document.getElementById("pin").value.trim();
    const nickname = document.getElementById("nickname").value.trim();

    if (!/^[a-zA-Z0-9._-]{3,20}$/.test(handle)) {
      setErr("Handle must be 3-20 chars (letters/numbers/._-).");
      return;
    }
    if (!/^[0-9]{5,12}$/.test(pin)) {
      setErr("PIN must be 5-12 digits.");
      return;
    }
    if (nickname.length < 2) {
      setErr("Nickname is required (ex: 'Laith').");
      return;
    }

    const email = handleToEmail(handle);

    const cred = await createUserWithEmailAndPassword(auth, email, pin);

    // create profile doc tied to UID (secure)
    await setDoc(doc(db, "reps", cred.user.uid), {
      handle: handle.toLowerCase(),
      nickname,
      createdAt: Date.now()
    });

    // onAuthStateChanged will show the app
  } catch (e) {
    // friendly messages
    if (e.code === "auth/email-already-in-use") {
      setErr("That handle is already taken. Try another.");
    } else if (e.code === "auth/weak-password") {
      setErr("PIN too weak. Use 6-12 digits.");
    } else {
      console.error(e);
      setErr(e.message);
    }
  }
}

async function login() {
  try {
    setErr("");

    const handle = document.getElementById("username").value.trim();
    const pin = document.getElementById("pin").value.trim();

    if (!handle || !pin) {
      setErr("Enter handle + PIN.");
      return;
    }

    const email = handleToEmail(handle);
    await signInWithEmailAndPassword(auth, email, pin);
    // onAuthStateChanged will show the app
  } catch (e) {
    if (e.code === "auth/invalid-credential") {
      setErr("Wrong handle or PIN.");
    } else {
      console.error(e);
      setErr(e.message);
    }
  }
}
