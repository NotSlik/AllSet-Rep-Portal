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
const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

let uid = "";
const stores = { reps: {}, jobs: {}, customers: {}, leads: {}, payments: {}, equipment: {}, schedules: {} };
let subscribed = false;

bootBoardFinder();

function bootBoardFinder(){
  injectCss();
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    uid = user?.uid || uid;
    subscribe();
    installObserver();
    enhanceTables();
  });
  document.addEventListener("click", event => {
    const btn = event.target.closest?.(".sourceFindBtn");
    if(btn) openSourceFinder(btn.dataset.name || "");
    const jump = event.target.closest?.(".sourceJumpBtn");
    if(jump) jumpToSource(jump.dataset.page || "", jump.dataset.find || "");
  });
  setInterval(enhanceTables, 1500);
}

function subscribe(){
  if(subscribed) return;
  subscribed = true;
  Object.keys(stores).forEach(name => {
    onSnapshot(collection(db, name), snap => {
      const next = {};
      snap.forEach(docSnap => next[docSnap.id] = { ...docSnap.data(), id: docSnap.data().id || docSnap.id });
      stores[name] = next;
      enhanceTables();
    }, error => console.warn(`Board source finder could not read ${name}:`, error.message));
  });
}

function installObserver(){
  if(installObserver.done) return;
  installObserver.done = true;
  const main = document.querySelector(".main");
  if(main) new MutationObserver(enhanceTables).observe(main, { childList: true, subtree: true });
}

function enhanceTables(){
  ["boardTable", "leaderboardTable", "teamTable"].forEach(tableId => {
    const table = $(tableId);
    if(!table) return;
    table.querySelectorAll("tbody tr").forEach(row => {
      if(row.querySelector(".sourceFindBtn")) return;
      const name = row.querySelector("td strong")?.textContent?.trim();
      if(!name) return;
      const cell = row.lastElementChild || row.querySelector("td");
      if(!cell) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghostBtn smallBtn sourceFindBtn";
      btn.dataset.name = name;
      btn.textContent = "Find";
      cell.appendChild(btn);
    });
  });
}

function openSourceFinder(name){
  const modalBackdrop = $("modalBackdrop");
  const modalCard = $("modalCard");
  if(!modalBackdrop || !modalCard) return;
  const matches = findSources(name);
  modalBackdrop.classList.remove("hidden");
  modalCard.innerHTML = `<div class="modalTop"><div><h2>Find ${esc(name)}</h2><p class="muted">Every live CRM record where this name still appears.</p></div><button class="ghostBtn" onclick="window.crmCloseModal?.()">Close</button></div>${renderMatches(name, matches)}`;
}

function renderMatches(name, matches){
  if(!matches.length) return `<div class="card noMargin">No source records found for ${esc(name)}. This row may be coming from cached browser data; hard refresh after deploy.</div>`;
  return `<div class="sourceFinderList">${matches.map(match => `<div class="sourceFinderItem"><div><strong>${esc(match.title)}</strong><span>${esc(match.detail)}</span><small>${esc(match.collection)} / ${esc(match.id)} / ${esc(match.field)}</small></div><button class="actionBtn smallBtn sourceJumpBtn" data-page="${esc(match.page)}" data-find="${esc(match.findText)}" type="button">Open</button></div>`).join("")}</div>`;
}

function findSources(name){
  const query = normalizeName(name);
  const isUnassigned = !query || query.includes("unassigned");
  const matches = [];
  Object.entries(stores).forEach(([collectionName, records]) => {
    Object.values(records).forEach(record => {
      const hits = recordHits(record, query, isUnassigned);
      hits.forEach(field => matches.push({
        collection: collectionName,
        id: record.id || "",
        field,
        page: pageForCollection(collectionName),
        title: titleForRecord(collectionName, record),
        detail: detailForRecord(record, field),
        findText: findTextForRecord(record, name)
      }));
    });
  });
  return matches.sort((a,b) => `${a.collection}${a.title}`.localeCompare(`${b.collection}${b.title}`)).slice(0, 80);
}

function recordHits(record, query, isUnassigned){
  const fields = ["name", "displayName", "repName", "rep", "createdBy", "updatedBy", "cleanerName", "cleaner", "customer", "phone", "address", "title", "notes", "role"];
  const hits = [];
  fields.forEach(field => {
    const value = record[field];
    const normalized = normalizeName(value);
    if(isUnassigned && ["cleanerName", "cleaner", "repName", "rep", "name"].includes(field) && (!normalized || normalized.includes("unassigned"))) hits.push(field);
    else if(query && normalized.includes(query)) hits.push(field);
  });
  return [...new Set(hits)];
}

function pageForCollection(collectionName){
  return ({ reps: "team", jobs: "jobs", customers: "customers", leads: "leads", payments: "payments", equipment: "equipment", schedules: "schedule" })[collectionName] || "dashboard";
}

function titleForRecord(collectionName, record){
  if(collectionName === "reps") return record.name || record.displayName || "Team Member";
  return record.customer || record.name || record.title || record.address || record.id || "Record";
}

function detailForRecord(record, field){
  const value = record[field];
  const price = record.price || record.amount || record.quote || record.payCleanerAmount || record.cleanerPay;
  return `${field}: ${value == null || value === "" ? "(blank)" : String(value)}${price ? ` | Amount: $${Number(price || 0).toLocaleString()}` : ""}`;
}

function findTextForRecord(record, fallback){
  return record.customer || record.name || record.title || record.address || record.phone || fallback || "";
}

function jumpToSource(page, findText){
  document.querySelector(`.navBtn[data-page="${page}"]`)?.click();
  setTimeout(() => {
    const table = document.querySelector(`#${page}Table`) || document.querySelector(".page.active .tableCard");
    const needle = normalizeName(findText);
    const rows = [...document.querySelectorAll(".page.active tbody tr")];
    const row = rows.find(item => normalizeName(item.textContent).includes(needle));
    if(row){
      row.classList.add("sourceFinderHighlight");
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => row.classList.remove("sourceFinderHighlight"), 4500);
    } else if(table) {
      table.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, 450);
}

function normalizeName(value){
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function injectCss(){
  if($("sourceFinderCss")) return;
  const style = document.createElement("style");
  style.id = "sourceFinderCss";
  style.textContent = `
    .sourceFindBtn{margin-left:7px}
    .sourceFinderList{display:grid;gap:9px;max-height:62vh;overflow:auto}
    .sourceFinderItem{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid var(--border);background:rgba(255,255,255,.06);border-radius:12px;padding:10px}
    .sourceFinderItem strong,.sourceFinderItem span,.sourceFinderItem small{display:block}
    .sourceFinderItem span{color:var(--muted);font-size:12px;margin-top:2px}
    .sourceFinderItem small{color:var(--muted);font-size:11px;margin-top:5px}
    .sourceFinderHighlight td{background:rgba(56,189,248,.18)!important;box-shadow:inset 0 0 0 1px rgba(56,189,248,.3)}
  `;
  document.head.appendChild(style);
}
