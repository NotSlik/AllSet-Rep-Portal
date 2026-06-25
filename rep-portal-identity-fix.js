import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_CbiovvY9yvdsQ6wzzwoG2QaqBT0r7Bg",
  authDomain: "allsetrepportal.firebaseapp.com",
  projectId: "allsetrepportal",
  storageBucket: "allsetrepportal.firebasestorage.app",
  messagingSenderId: "590070052736",
  appId: "1:590070052736:web:193a9edb6fd378fbd27365",
  measurementId: "G-SY45913J3Z",
  databaseURL: "https://allsetrepportal-default-rtdb.firebaseio.com"
};

const app = getApps()[0] || initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

let uid = "";
let lastStableKey = "";

bootIdentityFix();

function bootIdentityFix(){
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    uid = user?.uid || uid;
    ensureStableIdentity();
  });
  document.addEventListener("click", event => {
    if(event.target?.id === "enterBtn") setTimeout(ensureStableIdentity, 80);
  }, true);
  setInterval(ensureStableIdentity, 2400);
}

async function ensureStableIdentity(){
  const rawName = cleanDisplayName(localStorage.getItem("allset_rep_name") || $("nicknameInput")?.value || "");
  if(!rawName) return;
  const key = stableKey(rawName);
  if(!key) return;
  const isLaith = isLaithName(rawName);
  const displayName = isLaith ? "Laith" : rawName;
  const role = isLaith ? "admin" : (localStorage.getItem("allset_rep_role") || $("roleSelect")?.value || "rep");
  localStorage.setItem("allset_rep_stable_id", key);
  localStorage.setItem("allset_rep_normalized_name", normalizeName(displayName));
  if(key === lastStableKey) return;
  lastStableKey = key;
  const existing = await getDoc(doc(db, "reps", key)).catch(() => null);
  const existingData = existing?.exists?.() ? existing.data() : {};
  await setDoc(doc(db, "reps", key), {
    id: key,
    uid: key,
    stableId: key,
    normalizedName: normalizeName(displayName),
    name: existingData.name || displayName,
    displayName: existingData.displayName || displayName,
    role: isLaith ? "admin" : (existingData.role || role),
    aliases: unique([...(existingData.aliases || []), rawName, displayName]),
    linkedAnonymousUids: unique([...(existingData.linkedAnonymousUids || []), uid].filter(Boolean)),
    updatedAt: Date.now(),
    updatedBy: displayName,
    identityMode: "nickname"
  }, { merge: true });
  if(uid){
    await setDoc(doc(db, "reps", uid), {
      stableId: key,
      normalizedName: normalizeName(displayName),
      displayName,
      duplicateOf: key,
      role,
      updatedAt: Date.now(),
      updatedBy: displayName,
      identityMode: "nickname-alias"
    }, { merge: true }).catch(() => {});
  }
}

function cleanDisplayName(name){ return String(name || "").trim().replace(/\s+/g, " "); }
function normalizeName(name){ return cleanDisplayName(name).toLowerCase(); }
function isLaithName(name){ return normalizeName(name).startsWith("laith"); }
function stableKey(name){
  if(isLaithName(name)) return "user-laith";
  const slug = normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `user-${slug}` : "";
}
function unique(values){ return [...new Set(values.filter(Boolean))]; }
