import { getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LS_NAME = "allset_rep_name";
const LS_ROLE = "allset_rep_role";

let auth = null;
let db = null;
let lastRepAuthSignature = "";

bootAuthGate();

function bootAuthGate(){
  injectCss();
  injectGate();
  wireGate();
  waitForCrmFirebaseApp();
}

function waitForCrmFirebaseApp(){
  const app = getApps()[0];
  if(!app) return setTimeout(waitForCrmFirebaseApp, 60);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, user => {
    if(user && !user.isAnonymous){
      hideAuthGate();
      syncRepAuthMarker();
    } else {
      showAuthGate();
    }
  });
  setInterval(syncRepAuthMarker, 1500);
}

function injectGate(){
  if(document.getElementById("firebaseAuthGate")) return;
  document.body.insertAdjacentHTML("afterbegin", `
    <div id="firebaseAuthGate" class="firebaseAuthGate">
      <div class="firebaseAuthCard">
        <div class="firebaseAuthBrand">
          <div class="firebaseAuthLogo"></div>
          <div>
            <div class="firebaseAuthTitle">AllSet CRM Login</div>
            <div class="firebaseAuthSub">Sign in before choosing nickname and role.</div>
          </div>
        </div>
        <label for="firebaseLoginEmail">Username or Email</label>
        <input id="firebaseLoginEmail" autocomplete="username" placeholder="laith or name@example.com" />
        <label for="firebaseLoginPassword">Password</label>
        <input id="firebaseLoginPassword" type="password" autocomplete="current-password" placeholder="Password" />
        <label class="firebaseRemember"><input id="firebaseRememberDevice" type="checkbox" checked /> <span>Remember this device</span></label>
        <div class="firebaseAuthButtons">
          <button id="firebaseLoginBtn" type="button">Log In</button>
          <button id="firebaseCreateBtn" type="button">Create Account</button>
        </div>
        <div id="firebaseAuthStatus" class="firebaseAuthStatus"></div>
      </div>
    </div>
  `);
}

function wireGate(){
  const email = document.getElementById("firebaseLoginEmail");
  const password = document.getElementById("firebaseLoginPassword");
  document.getElementById("firebaseLoginBtn")?.addEventListener("click", () => handleAuth("login"));
  document.getElementById("firebaseCreateBtn")?.addEventListener("click", () => handleAuth("create"));
  [email, password].forEach(input => input?.addEventListener("keydown", event => {
    if(event.key === "Enter") handleAuth("login");
  }));
}

async function handleAuth(mode){
  const emailInput = document.getElementById("firebaseLoginEmail");
  const passwordInput = document.getElementById("firebaseLoginPassword");
  const status = document.getElementById("firebaseAuthStatus");
  const remember = document.getElementById("firebaseRememberDevice")?.checked !== false;
  const email = normalizeLoginEmail(emailInput?.value || "");
  const password = passwordInput?.value || "";
  if(!auth){ setStatus("CRM is still loading. Try again in a second."); return; }
  if(!email){ setStatus("Enter a username or email."); emailInput?.focus(); return; }
  if(password.length < 6){ setStatus("Password must be at least 6 characters."); passwordInput?.focus(); return; }
  setStatus(mode === "create" ? "Creating account..." : "Logging in...");
  try{
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    if(mode === "create") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
    setStatus("Signed in.");
    hideAuthGate();
    syncRepAuthMarker();
  }catch(error){
    setStatus(readableAuthError(error));
    status?.classList.add("error");
  }
}

async function syncRepAuthMarker(){
  const user = auth?.currentUser;
  if(!user || user.isAnonymous || !db) return;
  const name = String(localStorage.getItem(LS_NAME) || "").trim();
  const role = String(localStorage.getItem(LS_ROLE) || "rep").trim() || "rep";
  if(!name) return;
  const provider = user.providerData?.[0]?.providerId || "password";
  const email = user.email || "";
  const signature = [user.uid, email, provider, name, role].join("|");
  if(signature === lastRepAuthSignature) return;
  lastRepAuthSignature = signature;
  await setDoc(doc(db, "reps", user.uid), {
    uid: user.uid,
    name,
    role: name.toLowerCase() === "laith" ? "admin" : role,
    email,
    authProvider: provider,
    isAnonymous: false,
    updatedAt: serverTimestamp()
  }, { merge: true }).catch(() => {});
}

function normalizeLoginEmail(value){
  const raw = String(value || "").trim().toLowerCase();
  if(!raw) return "";
  if(raw.includes("@")) return raw;
  const username = raw.replace(/[^a-z0-9._-]+/g, "").replace(/^\.+|\.+$/g, "");
  return username ? `${username}@allset.local` : "";
}

function readableAuthError(error){
  const code = String(error?.code || "");
  if(code.includes("auth/operation-not-allowed")) return "Email/password login is not enabled in Firebase Authentication.";
  if(code.includes("auth/user-not-found") || code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) return "Wrong username/email or password.";
  if(code.includes("auth/email-already-in-use")) return "That account already exists. Use Log In.";
  if(code.includes("auth/weak-password")) return "Password must be at least 6 characters.";
  if(code.includes("auth/invalid-email")) return "Use a valid email or simple username.";
  return error?.message || "Login failed.";
}

function setStatus(message){
  const status = document.getElementById("firebaseAuthStatus");
  if(!status) return;
  status.textContent = message;
  status.classList.remove("error");
}

function showAuthGate(){
  const gate = document.getElementById("firebaseAuthGate");
  if(gate) gate.classList.remove("hidden");
}

function hideAuthGate(){
  const gate = document.getElementById("firebaseAuthGate");
  if(gate) gate.classList.add("hidden");
}

function injectCss(){
  if(document.getElementById("firebaseAuthGateCss")) return;
  const style = document.createElement("style");
  style.id = "firebaseAuthGateCss";
  style.textContent = `
    .firebaseAuthGate{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at top left,rgba(90,67,255,.34),transparent 34%),linear-gradient(135deg,#111827,#07111f 55%,#052e2b)}
    .firebaseAuthGate.hidden{display:none}
    .firebaseAuthCard{width:min(420px,100%);border:1px solid rgba(255,255,255,.14);background:rgba(11,18,32,.94);box-shadow:0 24px 80px rgba(0,0,0,.45);border-radius:22px;padding:22px;color:#fff}
    .firebaseAuthBrand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
    .firebaseAuthLogo{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#22d3ee)}
    .firebaseAuthTitle{font-weight:900;font-size:22px;line-height:1.1}
    .firebaseAuthSub{color:rgba(255,255,255,.68);font-size:13px;margin-top:3px}
    .firebaseAuthCard label{display:block;font-size:13px;font-weight:800;margin:13px 0 6px;color:rgba(255,255,255,.82)}
    .firebaseAuthCard input:not([type="checkbox"]){width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.16);border-radius:13px;background:rgba(255,255,255,.08);color:#fff;padding:12px 13px;font:inherit;outline:none}
    .firebaseAuthCard input:focus{border-color:rgba(34,211,238,.75);box-shadow:0 0 0 3px rgba(34,211,238,.15)}
    .firebaseRemember{display:flex!important;align-items:center;gap:9px;margin-top:12px!important;font-weight:800!important;color:rgba(255,255,255,.78)!important}
    .firebaseRemember input{width:18px;height:18px;accent-color:#22d3ee}
    .firebaseAuthButtons{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
    .firebaseAuthButtons button{border:0;border-radius:13px;padding:12px 10px;font-weight:900;color:#fff;background:linear-gradient(135deg,#7c3aed,#06b6d4);cursor:pointer}
    .firebaseAuthButtons button+button{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14)}
    .firebaseAuthStatus{min-height:18px;margin-top:12px;font-size:13px;color:rgba(255,255,255,.72)}
    .firebaseAuthStatus.error{color:#fecaca}
  `;
  document.head.appendChild(style);
}
