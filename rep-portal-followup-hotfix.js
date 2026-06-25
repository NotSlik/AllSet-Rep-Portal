import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const esc = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = n => "$" + Number(n || 0).toLocaleString();

let jobs = {};
let reps = {};
let customers = {};
let subscribed = false;
let rendering = false;

bootHotfix();

function bootHotfix(){
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, () => subscribe());
  document.addEventListener("click", event => {
    if(event.target?.id === "addRecurringBtn"){
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
  setInterval(renderBoardWithCustomerHistory, 1700);
}

function subscribe(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "jobs"), snap => { jobs = snapObj(snap); renderBoardWithCustomerHistory(); });
  onSnapshot(collection(db, "reps"), snap => { reps = snapObj(snap); renderBoardWithCustomerHistory(); });
  onSnapshot(collection(db, "customers"), snap => { customers = snapObj(snap); renderBoardWithCustomerHistory(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id });
  return out;
}

function renderBoardWithCustomerHistory(){
  const table = $("boardTable");
  if(!table || rendering) return;
  rendering = true;
  const cleaners = new Map();
  Object.entries(reps).filter(([, rep]) => rep.role === "cleaner").forEach(([id, rep]) => cleaners.set(id, { id, name: rep.name || "Cleaner", claimed: 0, completed: 0, earned: 0 }));
  Object.values(jobs).forEach(job => addJob(cleaners, job));
  Object.values(customers).forEach(customer => addCustomer(cleaners, customer));
  const admin = isAdminish();
  const rows = [...cleaners.values()].sort((a,b) => b.earned - a.earned || b.completed - a.completed).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.claimed}</td><td>${row.completed}</td><td>${money(row.earned)}</td>${admin ? `<td>${reps[row.id] ? `<button class="dangerBtn smallBtn deleteCleanerBtn" data-id="${esc(row.id)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Cleaner</th><th>Jobs Claimed</th><th>Jobs Completed</th><th>Amount Earned</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No cleaner board data yet.</div>`;
  setTimeout(() => rendering = false, 0);
}

function addJob(cleaners, job){
  const id = job.cleanerId || job.cleanerName || job.cleaner || "unassigned";
  if(!cleaners.has(id)) cleaners.set(id, { id, name: job.cleanerName || job.cleaner || "Unassigned", claimed: 0, completed: 0, earned: 0 });
  const row = cleaners.get(id);
  const status = jobStatus(job.status);
  if(job.claimedAt || job.cleanerId || job.cleanerName || job.cleaner || ["claimed", "in_progress", "completed"].includes(status)) row.claimed++;
  if(status === "completed" || job.completedAt || job.cleanedAt){
    row.completed++;
    row.earned += cleanerPay(job);
  }
}

function addCustomer(cleaners, customer){
  const pay = cleanerPay(customer);
  if(!pay) return;
  const id = customer.cleanerId || customer.cleanerName || customer.cleaner || "unassigned";
  if(!cleaners.has(id)) cleaners.set(id, { id, name: customer.cleanerName || customer.cleaner || "Unassigned", claimed: 0, completed: 0, earned: 0 });
  const row = cleaners.get(id);
  row.claimed++;
  row.completed++;
  row.earned += pay;
}

function cleanerPay(record){ return Number(record.payCleanerAmount ?? record.cleanerPay ?? record.cleanerAmount ?? record.payCleaner ?? record.cleanerPayout ?? 0) || 0; }
function jobStatus(status){ const s = String(status || "open").toLowerCase().replace(/\s+/g, "_").replace("-", "_"); return s === "scheduled" ? "open" : s; }
function isAdminish(){ return (localStorage.getItem("allset_rep_role") || "rep") === "admin" || sessionStorage.getItem("allset_admin_unlocked") === "1"; }
