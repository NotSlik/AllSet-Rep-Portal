import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let reps = {};
let leads = {};
let jobs = {};
let subscribed = false;
let cleanupBusy = false;

bootLaithComputerBlock();

function bootLaithComputerBlock(){
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, () => subscribe());
  installDomScrubber();
  setInterval(scrubAll, 450);
}

function subscribe(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "reps"), snap => { reps = snapObj(snap); removeLaithComputerRepDocs(); scrubAll(); });
  onSnapshot(collection(db, "leads"), snap => { leads = snapObj(snap); scrubDashboardTotals(); });
  onSnapshot(collection(db, "jobs"), snap => { jobs = snapObj(snap); scrubDashboardTotals(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id, _docId: item.id });
  return out;
}

async function removeLaithComputerRepDocs(){
  if(cleanupBusy) return;
  cleanupBusy = true;
  try{
    for(const [id, rep] of Object.entries(reps)){
      if(isLaithComputer(id) || isLaithComputer(rep.id) || isLaithComputer(rep.name) || isLaithComputer(rep.displayName)){
        await deleteDoc(doc(db, "reps", id)).catch(() => {});
      }
    }
  } finally {
    cleanupBusy = false;
  }
}

function installDomScrubber(){
  const start = () => {
    if(!document.body) return setTimeout(start, 50);
    new MutationObserver(scrubVisibleRows).observe(document.body, { childList: true, subtree: true });
    scrubAll();
  };
  start();
}

function scrubAll(){
  scrubVisibleRows();
  scrubDashboardTotals();
}

function scrubVisibleRows(){
  ["boardTable", "leaderboardTable", "teamTable"].forEach(id => {
    const root = $(id);
    if(!root) return;
    root.querySelectorAll("tbody tr, .card").forEach(row => {
      if(isLaithComputer(row.textContent)) row.remove();
    });
  });
}

function scrubDashboardTotals(){
  const week = weekStart();
  const today = todayStart();
  const sales = [...Object.values(leads), ...Object.values(jobs)].filter(record => !isLaithComputerRecord(record));
  const weekRevenue = sales.filter(x => dateVal(x.createdAt || x.scheduledAt) >= week).reduce((sum, x) => sum + Number(x.amount || x.quote || x.price || 0), 0);
  const todayRevenue = sales.filter(x => dateVal(x.createdAt || x.completedAt) >= today).reduce((sum, x) => sum + Number(x.amount || x.quote || x.price || 0), 0);
  if($("statTodayRevenue")) $("statTodayRevenue").textContent = money(todayRevenue);
  if($("statWeekRevenue")) $("statWeekRevenue").textContent = money(weekRevenue);
}

function isLaithComputerRecord(record){
  const fields = [record.id, record._docId, record.repId, record.cleanerId, record.repName, record.rep, record.cleanerName, record.cleaner, record.createdBy, record.updatedBy];
  const rep = reps[record.repId] || {};
  const cleaner = reps[record.cleanerId] || {};
  fields.push(rep.id, rep._docId, rep.name, rep.displayName, cleaner.id, cleaner._docId, cleaner.name, cleaner.displayName);
  return fields.some(isLaithComputer);
}

function isLaithComputer(value){
  const compact = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact === "laithcomputer" || compact === "userlaithcomputer";
}

function money(n){ return "$" + Number(n || 0).toLocaleString(); }
function dateVal(value){ if(!value) return 0; if(typeof value === "number") return value; if(value.seconds) return value.seconds * 1000; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; }
function todayStart(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function weekStart(){ const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0,0,0,0); return d.getTime(); }
