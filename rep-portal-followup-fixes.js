import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const now = () => Date.now();

let uid = "";
let recurringJobs = {};
let subscribed = false;

bootRecurringOnly();

function bootRecurringOnly(){
  injectStyles();
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    uid = user?.uid || uid;
    subscribeData();
    ensureRecurringUi();
    renderRecurringTable();
  });
  document.addEventListener("click", handleClicks, true);
  setInterval(() => { ensureRecurringUi(); renderRecurringTable(); keepRecurringVisible(); }, 1800);
}

function subscribeData(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "recurringJobs"), snap => { recurringJobs = snapObj(snap); renderRecurringTable(); keepRecurringVisible(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id });
  return out;
}

function handleClicks(event){
  const target = event.target;
  const nav = target.closest?.('.navBtn[data-page="recurring"]');
  if(nav){ event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); showPage("recurring"); return; }
  if(target?.id === "addRecurringBtn"){ event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); openRecurringModal(); return; }
  const claim = target.closest?.(".claimRecurringFixBtn");
  if(claim){ event.preventDefault(); claimRecurringFix(claim.dataset.id); return; }
  const complete = target.closest?.(".completeRecurringFixBtn");
  if(complete){ event.preventDefault(); completeRecurringFix(complete.dataset.id); return; }
  const edit = target.closest?.(".editRecurringFixBtn");
  if(edit){ event.preventDefault(); openRecurringModal(edit.dataset.id); return; }
  const del = target.closest?.(".deleteRecurringFixBtn");
  if(del){ event.preventDefault(); deleteRecurringFix(del.dataset.id); return; }
}

function ensureRecurringUi(){
  const nav = $("nav");
  const main = document.querySelector(".main");
  if(nav && !document.querySelector('.navBtn[data-page="recurring"]')){
    const btn = document.createElement("button");
    btn.className = "navBtn";
    btn.dataset.page = "recurring";
    btn.type = "button";
    btn.textContent = "Recurring";
    const jobsBtn = document.querySelector('.navBtn[data-page="jobs"]');
    jobsBtn?.after(btn) || nav.appendChild(btn);
  }
  if(main && !$("page-recurring")){
    main.insertAdjacentHTML("beforeend", `<section id="page-recurring" class="page tablePage"><div class="pageHeader"><div><h1>Recurring</h1><p>Upcoming recurring jobs, countdowns, and cleaner claims.</p></div><button id="addRecurringBtn" class="actionBtn" type="button">+ Add</button></div><div id="recurringTable" class="tableCard"></div></section>`);
  }
  keepRecurringVisible();
}

function keepRecurringVisible(){
  document.querySelectorAll('.navBtn[data-page="recurring"]').forEach(btn => {
    btn.classList.remove("hidden", "navBtn--locked");
    btn.dataset.locked = "";
    btn.textContent = "Recurring";
    const open = Object.values(recurringJobs).filter(job => !job.cleanerId && !job.cleanerName && !job.cleaner).length;
    btn.classList.toggle("hasOpenJobs", open > 0);
    btn.dataset.openCount = open > 0 ? String(open) : "";
  });
}

function showPage(page){
  document.querySelectorAll(".navBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
  document.querySelectorAll(".page").forEach(section => section.classList.remove("active"));
  $(`page-${page}`)?.classList.add("active");
  $("nav")?.classList.remove("open");
  renderRecurringTable();
}

function renderRecurringTable(){
  const table = $("recurringTable");
  if(!table) return;
  const name = currentName();
  const rows = Object.values(recurringJobs).sort((a,b) => nextRecurringTime(a) - nextRecurringTime(b)).map(job => {
    const due = nextRecurringDate(job);
    const mine = job.cleanerId === uid || sameName(job.cleanerName || job.cleaner, name);
    const claimed = !!(job.cleanerId || job.cleanerName || job.cleaner);
    const actions = claimed
      ? `${mine ? `<button class="actionBtn smallBtn completeRecurringFixBtn" data-id="${esc(job.id)}">Completed</button>` : ""}<button class="ghostBtn smallBtn editRecurringFixBtn" data-id="${esc(job.id)}">Edit</button>`
      : `<button class="actionBtn smallBtn claimRecurringFixBtn" data-id="${esc(job.id)}">Claim</button><button class="ghostBtn smallBtn editRecurringFixBtn" data-id="${esc(job.id)}">Edit</button>`;
    return `<tr><td><strong>${esc(job.customer || job.title || "Recurring Job")}</strong><br><span class="muted">${esc(job.address || "")}</span></td><td>${esc(formatDateTime(due))}</td><td><strong>${esc(countdownText(due))}</strong></td><td>${esc(job.frequency || "Weekly")}</td><td>${money(job.payCleanerAmount || job.cleanerPay || 0)}</td><td><span class="status ${claimed ? "claimed" : "open"}">${claimed ? `Claimed by ${esc(job.cleanerName || job.cleaner || "Cleaner")}` : "Open"}</span></td><td><div class="tableActions">${actions}${isAdminish() ? `<button class="dangerBtn smallBtn deleteRecurringFixBtn" data-id="${esc(job.id)}">Delete</button>` : ""}</div></td></tr>`;
  });
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Job</th><th>Coming Day</th><th>Countdown</th><th>Frequency</th><th>Cleaner Pay</th><th>Status</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No recurring jobs yet.</div>`;
}

function openRecurringModal(id = ""){
  const record = id ? recurringJobs[id] || {} : {};
  const backdrop = $("modalBackdrop");
  const card = $("modalCard");
  if(!backdrop || !card) return;
  backdrop.classList.remove("hidden");
  card.innerHTML = `<div class="modalTop"><div><h2>${id ? "Edit" : "Add"} Recurring Job</h2><p class="muted">Cleaners can claim it and complete it from Recurring.</p></div><button class="ghostBtn" onclick="window.crmCloseModal?.()">Close</button></div><div class="formGrid"><label>Customer<input data-rec-field="customer" value="${esc(record.customer || "")}" /></label><label>Phone<input data-rec-field="phone" value="${esc(record.phone || "")}" /></label><label>Address<input data-rec-field="address" value="${esc(record.address || "")}" /></label><label>Service<input data-rec-field="title" value="${esc(record.title || "Window Cleaning")}" /></label><label>Coming Day<input data-rec-field="nextDate" type="date" value="${esc(dateInputValue(record.nextDate || record.scheduledAt))}" /></label><label>Time<input data-rec-field="time" type="time" value="${esc(record.time || "09:00")}" /></label><label>Frequency<select data-rec-field="frequency"><option ${sel(record.frequency, "Weekly")}>Weekly</option><option ${sel(record.frequency, "Biweekly")}>Biweekly</option><option ${sel(record.frequency, "Monthly")}>Monthly</option><option ${sel(record.frequency, "Quarterly")}>Quarterly</option></select></label><label>Customer Price<input data-rec-field="price" type="number" min="0" step="1" value="${esc(record.price || record.amount || "")}" /></label><label>Cleaner Pay<input data-rec-field="payCleanerAmount" type="number" min="0" step="1" value="${esc(record.payCleanerAmount || record.cleanerPay || "")}" placeholder="ex: 40" /></label><label>Notes<textarea data-rec-field="notes">${esc(record.notes || "")}</textarea></label></div><div class="modalActions"><button class="dangerBtn" id="deleteRecurringModalBtn" ${id ? "" : "style='display:none'"}>Delete</button><button class="actionBtn" id="saveRecurringBtn">Save</button></div>`;
  $("saveRecurringBtn").onclick = () => saveRecurringFix(id);
  $("deleteRecurringModalBtn").onclick = () => deleteRecurringFix(id);
}

async function saveRecurringFix(id = ""){
  const card = $("modalCard");
  const read = field => card?.querySelector(`[data-rec-field="${field}"]`)?.value?.trim() || "";
  const recordId = id || `recurring-${now()}`;
  const existing = recurringJobs[recordId] || {};
  await setDoc(doc(db, "recurringJobs", recordId), {
    id: recordId,
    customer: read("customer"), phone: read("phone"), address: read("address"),
    title: read("title") || "Window Cleaning", nextDate: read("nextDate"), time: read("time"),
    frequency: read("frequency") || "Weekly", price: Number(read("price") || 0),
    payCleanerAmount: Number(read("payCleanerAmount") || 0), notes: read("notes"),
    status: existing.status || "open", createdAt: existing.createdAt || now(), createdBy: existing.createdBy || currentName(),
    updatedAt: now(), updatedBy: currentName()
  }, { merge: true });
  closeModal();
  toast("Recurring job saved");
}

async function claimRecurringFix(id){
  const job = recurringJobs[id];
  if(!job) return toast("Recurring job not found");
  if((job.cleanerId || job.cleanerName) && job.cleanerId !== uid && !sameName(job.cleanerName, currentName())) return toast("Already claimed");
  await setDoc(doc(db, "recurringJobs", id), { cleanerId: uid, cleanerName: currentName(), cleaner: currentName(), status: "claimed", claimedAt: now(), updatedAt: now(), updatedBy: currentName() }, { merge: true });
  toast("Recurring job claimed. Completed button is ready.");
}

async function completeRecurringFix(id){
  const recurring = recurringJobs[id];
  if(!recurring) return toast("Recurring job not found");
  const t = now();
  const historyJobId = `jobs-${t}`;
  await setDoc(doc(db, "jobs", historyJobId), {
    id: historyJobId, recurringId: id, title: recurring.title || "Window Cleaning", customer: recurring.customer || "",
    phone: recurring.phone || "", address: recurring.address || "", scheduledAt: recurring.nextDate || "",
    cleaner: recurring.cleaner || recurring.cleanerName || currentName(), cleanerName: recurring.cleanerName || recurring.cleaner || currentName(),
    cleanerId: recurring.cleanerId || uid, price: Number(recurring.price || recurring.amount || 0),
    payCleanerAmount: Number(recurring.payCleanerAmount || recurring.cleanerPay || 0), status: "completed",
    notes: recurring.notes || "", completedAt: t, cleanedAt: t, lastCleanedAt: t, createdAt: t, createdBy: currentName(), source: "recurring"
  }, { merge: true });
  await setDoc(doc(db, "recurringJobs", id), { status: "open", cleanerId: "", cleanerName: "", cleaner: "", claimedAt: "", lastCompletedAt: t, lastCleanedAt: t, nextDate: advanceDate(recurring.nextDate, recurring.frequency), updatedAt: t, updatedBy: currentName() }, { merge: true });
  toast("Recurring job completed. Commission added to Board.");
}

async function deleteRecurringFix(id){
  if(!id || !recurringJobs[id]) return;
  if(!confirm("Remove this recurring job?")) return;
  await deleteDoc(doc(db, "recurringJobs", id));
  closeModal();
  toast("Recurring job deleted");
}

function currentName(){ return localStorage.getItem("allset_rep_name") || $("nicknameInput")?.value || "Team"; }
function currentRole(){ return localStorage.getItem("allset_rep_role") || $("roleSelect")?.value || "rep"; }
function isAdminish(){ return currentRole() === "admin" || normalizeName(currentName()).startsWith("laith") || sessionStorage.getItem("allset_admin_unlocked") === "1"; }
function normalizeName(name){ return String(name || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function sameName(a,b){ return normalizeName(a) && normalizeName(a) === normalizeName(b); }
function dateVal(value){ if(!value) return 0; if(typeof value === "number") return value; if(value.seconds) return value.seconds * 1000; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; }
function dateInputValue(value){ if(!value) return ""; if(typeof value === "number") return new Date(value).toISOString().slice(0,10); if(value.seconds) return new Date(value.seconds * 1000).toISOString().slice(0,10); const match = String(value).match(/\d{4}-\d{2}-\d{2}/); return match ? match[0] : ""; }
function nextRecurringDate(job){ const base = dateInputValue(job.nextDate || job.scheduledAt) || todayInput(); const d = new Date(`${base}T${job.time || "09:00"}`); return Number.isFinite(d.getTime()) ? d : new Date(); }
function nextRecurringTime(job){ return nextRecurringDate(job).getTime(); }
function countdownText(date){ const diff = date.getTime() - now(); if(diff <= 0) return "Due now"; const days = Math.floor(diff / 86400000); const hours = Math.floor((diff % 86400000) / 3600000); const mins = Math.floor((diff % 3600000) / 60000); if(days > 0) return `${days}d ${hours}h`; if(hours > 0) return `${hours}h ${mins}m`; return `${Math.max(1, mins)}m`; }
function formatDateTime(date){ return date.toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function todayInput(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function advanceDate(value, frequency){ const d = nextRecurringDate({ nextDate: value, time: "09:00" }); const f = String(frequency || "Weekly").toLowerCase(); if(f === "biweekly") d.setDate(d.getDate()+14); else if(f === "monthly") d.setMonth(d.getMonth()+1); else if(f === "quarterly") d.setMonth(d.getMonth()+3); else d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); }
function sel(current, value){ return String(current || "Weekly") === value ? 'selected=""' : ""; }
function closeModal(){ $("modalBackdrop")?.classList.add("hidden"); if($("modalCard")) $("modalCard").innerHTML = ""; }
function toast(message){ const el = $("toast"); if(!el) return; el.textContent = message; el.classList.remove("hidden"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 1800); }
function injectStyles(){
  if($("repPortalFollowupCss")) return;
  const style = document.createElement("style");
  style.id = "repPortalFollowupCss";
  style.textContent = `.tableActions,.tableToolbar{display:flex;gap:7px;flex-wrap:wrap}.navBtn[data-page="recurring"]{display:block!important}.navBtn[data-page="recurring"].hidden{display:block!important}`;
  document.head.appendChild(style);
}
