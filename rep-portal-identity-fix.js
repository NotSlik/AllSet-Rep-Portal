import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let uid = "";
let reps = {};
let leads = {};
let jobs = {};
let customers = {};
let subscribed = false;
let lastStableKey = "";
let rendering = false;

bootIdentityFix();

function bootIdentityFix(){
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    uid = user?.uid || uid;
    subscribeIdentityData();
    ensureStableIdentity();
    renderIdentityTables();
  });
  document.addEventListener("click", event => {
    if(event.target?.id === "enterBtn") setTimeout(ensureStableIdentity, 80);
  }, true);
  setInterval(() => {
    ensureStableIdentity();
    renderIdentityTables();
  }, 2200);
}

function subscribeIdentityData(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "reps"), snap => { reps = snapObj(snap); renderIdentityTables(); });
  onSnapshot(collection(db, "leads"), snap => { leads = snapObj(snap); renderIdentityTables(); });
  onSnapshot(collection(db, "jobs"), snap => { jobs = snapObj(snap); renderIdentityTables(); });
  onSnapshot(collection(db, "customers"), snap => { customers = snapObj(snap); renderIdentityTables(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id });
  return out;
}

async function ensureStableIdentity(){
  const displayName = cleanDisplayName(localStorage.getItem("allset_rep_name") || $("nicknameInput")?.value || "");
  if(!displayName) return;
  const key = stableKey(displayName);
  if(!key) return;
  const role = displayName.toLowerCase() === "laith" ? "admin" : (localStorage.getItem("allset_rep_role") || $("roleSelect")?.value || "rep");
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
    role: existingData.role || role,
    aliases: unique([...(existingData.aliases || []), displayName]),
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

function renderIdentityTables(){
  if(rendering) return;
  rendering = true;
  try{
    renderTeamTable();
    renderLeaderboardTable();
    renderBoardTable();
  } finally {
    setTimeout(() => rendering = false, 0);
  }
}

function renderTeamTable(){
  const table = $("teamTable");
  if(!table) return;
  const people = mergedPeople();
  const rows = people.map(person => `<tr><td><strong>${esc(person.name)}</strong><br><span class="muted">${esc(person.role || "rep")}${person.duplicateCount > 1 ? ` - ${person.duplicateCount} linked records` : ""}</span></td><td>${money(person.revenue)}</td><td>${person.sold}</td><td>${person.completed}</td><td>${money(person.earned)}</td><td>${person.closeRate}%</td></tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Team Member</th><th>Revenue</th><th>Sold Jobs</th><th>Completed</th><th>Cleaner Earned</th><th>Close Rate</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No team data yet.</div>`;
}

function renderLeaderboardTable(){
  const table = $("leaderboardTable");
  if(!table) return;
  const rows = mergedPeople().filter(person => (person.role || "rep") !== "cleaner").sort((a,b) => b.revenue - a.revenue).map(person => `<tr><td><strong>${esc(person.name)}</strong></td><td>${money(person.revenue)}</td><td>${person.sold}</td><td>${person.converted}</td><td>${person.closeRate}%</td></tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Rep</th><th>Revenue</th><th>Sold Jobs</th><th>Leads Converted</th><th>Close Rate</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No leaderboard data yet.</div>`;
}

function renderBoardTable(){
  const table = $("boardTable");
  if(!table) return;
  const cleaners = new Map();
  mergedPeople().filter(person => person.role === "cleaner").forEach(person => cleaners.set(person.key, { name: person.name, claimed: 0, completed: 0, earned: 0 }));
  Object.values(jobs).forEach(job => addCleanerJob(cleaners, job));
  Object.values(customers).forEach(customer => addCleanerCustomer(cleaners, customer));
  const rows = [...cleaners.values()].sort((a,b) => b.earned - a.earned || b.completed - a.completed).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.claimed}</td><td>${row.completed}</td><td>${money(row.earned)}</td></tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Cleaner</th><th>Jobs Claimed</th><th>Jobs Completed</th><th>Amount Earned</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No cleaner board data yet.</div>`;
}

function mergedPeople(){
  const groups = new Map();
  Object.entries(reps).forEach(([id, rep]) => {
    const norm = rep.normalizedName || normalizeName(rep.name || rep.displayName || id);
    if(!norm) return;
    const key = rep.stableId || rep.duplicateOf || stableKey(norm);
    if(!groups.has(norm)) groups.set(norm, { key, ids: new Set(), names: [], role: rep.role || "rep", revenue: 0, sold: 0, converted: 0, total: 0, completed: 0, earned: 0 });
    const group = groups.get(norm);
    group.ids.add(id);
    group.ids.add(key);
    if(rep.stableId) group.ids.add(rep.stableId);
    if(rep.duplicateOf) group.ids.add(rep.duplicateOf);
    if(rep.uid) group.ids.add(rep.uid);
    if(rep.name || rep.displayName) group.names.push(rep.name || rep.displayName);
    if(group.role === "rep" && rep.role) group.role = rep.role;
  });
  Object.values(leads).forEach(lead => {
    const group = groupFor(groups, lead.repId, lead.repName || lead.createdBy);
    if(!group) return;
    group.total++;
    if(["sold", "converted"].includes(String(lead.status || "").toLowerCase())){
      group.converted++;
      group.revenue += Number(lead.quote || lead.amount || 0);
    }
  });
  Object.values(jobs).forEach(job => {
    const group = groupFor(groups, job.repId, job.repName || job.createdBy);
    if(group){
      const status = jobStatus(job.status);
      if(["open", "claimed", "in_progress", "completed", "scheduled"].includes(status)) group.sold++;
      group.revenue += Number(job.price || job.amount || job.quote || 0);
    }
    const cleaner = groupFor(groups, job.cleanerId, job.cleanerName || job.cleaner);
    if(cleaner && (jobStatus(job.status) === "completed" || job.completedAt || job.cleanedAt)){
      cleaner.completed++;
      cleaner.earned += cleanerPay(job);
    }
  });
  Object.values(customers).forEach(customer => {
    const group = groupFor(groups, customer.repId, customer.repName || customer.rep);
    if(group) group.revenue += Number(customer.price || customer.amount || customer.lifetimeRevenue || 0);
    const cleaner = groupFor(groups, customer.cleanerId, customer.cleanerName || customer.cleaner);
    if(cleaner && cleanerPay(customer)){
      cleaner.completed++;
      cleaner.earned += cleanerPay(customer);
    }
  });
  return [...groups.values()].map(group => {
    const name = bestName(group.names) || titleName(group.key.replace(/^user-/, ""));
    return {
      ...group,
      name,
      duplicateCount: group.ids.size,
      closeRate: group.total ? Math.round(group.converted / group.total * 100) : 0
    };
  });
}

function groupFor(groups, id, name){
  const norm = normalizeName(name || "");
  if(norm && groups.has(norm)) return groups.get(norm);
  if(id){
    for(const group of groups.values()) if(group.ids.has(id)) return group;
  }
  if(norm){
    const key = stableKey(norm);
    groups.set(norm, { key, ids: new Set([key, id].filter(Boolean)), names: [name].filter(Boolean), role: "rep", revenue: 0, sold: 0, converted: 0, total: 0, completed: 0, earned: 0 });
    return groups.get(norm);
  }
  return null;
}

function addCleanerJob(cleaners, job){
  const key = cleanerKey(job.cleanerId, job.cleanerName || job.cleaner);
  if(!key) return;
  if(!cleaners.has(key)) cleaners.set(key, { name: job.cleanerName || job.cleaner || titleName(key.replace(/^user-/, "")), claimed: 0, completed: 0, earned: 0 });
  const row = cleaners.get(key);
  const status = jobStatus(job.status);
  if(job.claimedAt || job.cleanerId || job.cleanerName || job.cleaner || ["claimed", "in_progress", "completed"].includes(status)) row.claimed++;
  if(status === "completed" || job.completedAt || job.cleanedAt){
    row.completed++;
    row.earned += cleanerPay(job);
  }
}

function addCleanerCustomer(cleaners, customer){
  const pay = cleanerPay(customer);
  if(!pay) return;
  const key = cleanerKey(customer.cleanerId, customer.cleanerName || customer.cleaner);
  if(!key) return;
  if(!cleaners.has(key)) cleaners.set(key, { name: customer.cleanerName || customer.cleaner || titleName(key.replace(/^user-/, "")), claimed: 0, completed: 0, earned: 0 });
  const row = cleaners.get(key);
  row.claimed++;
  row.completed++;
  row.earned += pay;
}

function cleanerKey(id, name){
  if(name) return stableKey(name);
  const rep = reps[id];
  if(rep) return rep.stableId || rep.duplicateOf || stableKey(rep.normalizedName || rep.name || rep.displayName || id);
  return id || "";
}

function cleanDisplayName(name){ return String(name || "").trim().replace(/\s+/g, " "); }
function normalizeName(name){ return cleanDisplayName(name).toLowerCase(); }
function stableKey(name){ const slug = normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); return slug ? `user-${slug}` : ""; }
function titleName(slug){ return String(slug || "").replace(/-/g, " ").replace(/\b\w/g, ch => ch.toUpperCase()); }
function bestName(names){ const clean = names.map(cleanDisplayName).filter(Boolean); return clean.sort((a,b) => b.length - a.length)[0] || ""; }
function unique(values){ return [...new Set(values.filter(Boolean))]; }
function cleanerPay(record){ return Number(record.payCleanerAmount ?? record.cleanerPay ?? record.cleanerAmount ?? record.payCleaner ?? record.cleanerPayout ?? 0) || 0; }
function jobStatus(status){ const s = String(status || "open").toLowerCase().replace(/\s+/g, "_").replace("-", "_"); return s === "scheduled" ? "open" : s; }
