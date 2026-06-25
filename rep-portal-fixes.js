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
let dots = {};
let leads = {};
let jobs = {};
let reps = {};
let recurringJobs = {};
let boardRendering = false;
let recurringTimer = null;
let subscribed = false;

bootFixes();

function bootFixes(){
  injectFixStyles();
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    uid = user?.uid || uid;
    subscribeFixData();
    ensureRecurringUi();
    renderBoardPayFix();
    renderRecurring();
  });
  document.addEventListener("click", handleCaptureClicks, true);
  document.addEventListener("click", handleRecurringClicks);
  watchDynamicUi();
  setInterval(renderBoardPayFix, 1800);
  recurringTimer = setInterval(renderRecurring, 30000);
}

function subscribeFixData(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "dots"), snap => { dots = snapObj(snap); });
  onSnapshot(collection(db, "leads"), snap => { leads = snapObj(snap); });
  onSnapshot(collection(db, "jobs"), snap => { jobs = snapObj(snap); renderBoardPayFix(); });
  onSnapshot(collection(db, "reps"), snap => { reps = snapObj(snap); renderBoardPayFix(); });
  onSnapshot(collection(db, "recurringJobs"), snap => { recurringJobs = snapObj(snap); renderRecurring(); badgeRecurring(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id });
  return out;
}

function handleCaptureClicks(event){
  const btn = event.target.closest("[data-dot-action]");
  if(!btn) return;
  const action = btn.dataset.dotAction;
  if(!["lead", "save-lead", "back-dot"].includes(action)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const id = btn.dataset.id;
  if(action === "lead") openLeadPopup(id);
  if(action === "save-lead") saveLeadFromPopup(btn, id);
  if(action === "back-dot") closeMapPopup();
}

function openLeadPopup(id){
  const dot = dots[id] || {};
  const root = document.querySelector(".mapPopup");
  const markerLabel = root?.querySelector('[data-dot-field="label"]')?.value?.trim() || dot.label || dot.address || "";
  const markerNotes = root?.querySelector('[data-dot-field="notes"]')?.value?.trim() || dot.notes || "";
  const existing = Object.values(leads).find(lead => lead.dotId === id) || {};
  const html = `<div class="mapPopup mapPopupFix"><h3>${existing.id ? "Edit Lead" : "New Lead"}</h3><div class="mutedText">Saved from this house dot. The dot stays on the live map.</div><div class="leadFixGrid"><input data-lead-field="name" value="${esc(existing.name || "")}" placeholder="Name" /><input data-lead-field="phone" value="${esc(existing.phone || "")}" placeholder="Number" /><input data-lead-field="address" value="${esc(existing.address || markerLabel)}" placeholder="House number / address" /><input data-lead-field="quote" type="number" value="${esc(existing.quote || existing.amount || "")}" placeholder="Quote" /><input data-lead-field="service" value="${esc(existing.service || "Window Cleaning")}" placeholder="Service" /><select data-lead-field="status"><option value="lead"${selected(existing.status, "lead", true)}>Lead</option><option value="quote"${selected(existing.status, "quote")}>Quote</option><option value="sold"${selected(existing.status, "sold")}>Sold</option><option value="callback"${selected(existing.status, "callback")}>Callback</option><option value="no"${selected(existing.status, "no")}>No</option></select><textarea data-lead-field="notes" placeholder="Notes">${esc(existing.notes || markerNotes)}</textarea></div><div class="mapPopupActions"><button class="mapSaveBtn full" data-dot-action="save-lead" data-id="${esc(id)}" data-lead-id="${esc(existing.id || "")}">Save Lead</button><button class="mapPlainBtn" data-dot-action="back-dot" data-id="${esc(id)}">Back</button><button class="mapDangerBtn" data-dot-action="delete" data-id="${esc(id)}">Delete Dot</button></div></div>`;
  setCurrentPopup(html);
}

async function saveLeadFromPopup(btn, dotId){
  const dot = dots[dotId] || {};
  const root = btn.closest(".mapPopup");
  const read = field => root?.querySelector(`[data-lead-field="${field}"]`)?.value?.trim() || "";
  const leadId = btn.dataset.leadId || `leads-${now()}`;
  const address = read("address") || dot.label || dot.address || "";
  const data = {
    id: leadId,
    dotId,
    name: read("name"),
    phone: read("phone"),
    address,
    service: read("service") || "Window Cleaning",
    quote: Number(read("quote") || 0),
    status: read("status") || "lead",
    notes: read("notes"),
    repName: currentName(),
    repId: uid,
    source: "map_dot",
    updatedAt: now(),
    updatedBy: currentName()
  };
  if(!btn.dataset.leadId){
    data.createdAt = now();
    data.createdBy = currentName();
  }
  await setDoc(doc(db, "leads", leadId), data, { merge: true });
  await setDoc(doc(db, "dots", dotId), {
    label: address,
    notes: data.notes,
    leadId,
    status: data.status === "sold" ? "yes" : (dot.status || "none"),
    updatedAt: now(),
    updatedBy: currentName()
  }, { merge: true });
  await addLog(`Lead saved from map dot: ${data.name || address || dotId}`);
  closeMapPopup();
  toast("Lead saved. Dot kept on map.");
}

function setCurrentPopup(html){
  const popup = document.querySelector(".leaflet-popup-content");
  if(popup){ popup.innerHTML = html; return; }
  const map = window.allsetMap;
  if(map?.openPopup) map.openPopup(html, map.getCenter(), { className: "allset-map-popup", maxWidth: 356 });
}

function closeMapPopup(){
  window.allsetMap?.closePopup?.();
}

function renderBoardPayFix(){
  const table = $("boardTable");
  if(!table || boardRendering) return;
  boardRendering = true;
  const cleaners = new Map();
  Object.entries(reps).filter(([, rep]) => rep.role === "cleaner").forEach(([id, rep]) => cleaners.set(id, { id, name: rep.name || "Cleaner", claimed: 0, completed: 0, earned: 0 }));
  Object.values(jobs).forEach(job => {
    const id = job.cleanerId || job.cleanerName || job.cleaner || "unassigned";
    if(!cleaners.has(id)) cleaners.set(id, { id, name: job.cleanerName || job.cleaner || "Unassigned", claimed: 0, completed: 0, earned: 0 });
    const row = cleaners.get(id);
    const status = jobStatus(job.status);
    if(job.claimedAt || job.cleanerId || job.cleanerName || job.cleaner || ["claimed", "in_progress", "completed"].includes(status)) row.claimed++;
    if(status === "completed" || job.completedAt || job.cleanedAt){
      row.completed++;
      row.earned += cleanerPay(job);
    }
  });
  const admin = isAdminish();
  const rows = [...cleaners.values()].sort((a,b) => b.earned - a.earned || b.completed - a.completed).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.claimed}</td><td>${row.completed}</td><td>${money(row.earned)}</td>${admin ? `<td>${reps[row.id] ? `<button class="dangerBtn smallBtn deleteCleanerBtn" data-id="${esc(row.id)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Cleaner</th><th>Jobs Claimed</th><th>Jobs Completed</th><th>Amount Earned</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No cleaner board data yet.</div>`;
  setTimeout(() => boardRendering = false, 0);
}

function ensureRecurringUi(){
  const nav = $("nav");
  const main = document.querySelector(".main");
  if(nav && !document.querySelector('.navBtn[data-page="recurring"]')){
    const jobsBtn = document.querySelector('.navBtn[data-page="jobs"]');
    const btn = document.createElement("button");
    btn.className = "navBtn";
    btn.dataset.page = "recurring";
    btn.type = "button";
    btn.textContent = "Recurring";
    btn.addEventListener("click", () => showInjectedPage("recurring"));
    jobsBtn?.after(btn) || nav.appendChild(btn);
  }
  if(main && !$("page-recurring")){
    main.insertAdjacentHTML("beforeend", `<section id="page-recurring" class="page tablePage"><div class="pageHeader"><div><h1>Recurring</h1><p>Upcoming recurring jobs, countdowns, and cleaner claims.</p></div><button id="addRecurringBtn" class="actionBtn" type="button">+ Add</button></div><div id="recurringTable" class="tableCard"></div></section>`);
  }
  badgeRecurring();
}

function showInjectedPage(page){
  document.querySelectorAll(".navBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
  document.querySelectorAll(".page").forEach(section => section.classList.remove("active"));
  $(`page-${page}`)?.classList.add("active");
  $("nav")?.classList.remove("open");
  renderRecurring();
}

function handleRecurringClicks(event){
  if(event.target?.id === "addRecurringBtn") openRecurringModal();
  const claim = event.target.closest(".claimRecurringBtn");
  if(claim) claimRecurring(claim.dataset.id);
  const edit = event.target.closest(".editRecurringBtn");
  if(edit) openRecurringModal(edit.dataset.id);
  const del = event.target.closest(".deleteRecurringBtn");
  if(del) deleteRecurring(del.dataset.id);
}

function renderRecurring(){
  ensureRecurringUi();
  const table = $("recurringTable");
  if(!table) return;
  const rows = Object.values(recurringJobs).sort((a,b) => nextRecurringTime(a) - nextRecurringTime(b)).map(job => {
    const due = nextRecurringDate(job);
    const mine = job.cleanerId === uid || job.cleanerName === currentName() || job.cleaner === currentName();
    const claimed = !!(job.cleanerId || job.cleanerName || job.cleaner);
    return `<tr><td><strong>${esc(job.customer || job.title || "Recurring Job")}</strong><br><span class="muted">${esc(job.address || "")}</span></td><td>${esc(formatDateTime(due))}</td><td><strong>${esc(countdownText(due))}</strong></td><td>${esc(job.frequency || "Weekly")}</td><td>${money(job.payCleanerAmount || job.cleanerPay || 0)}</td><td><span class="status ${claimed ? "claimed" : "open"}">${claimed ? `Claimed by ${esc(job.cleanerName || job.cleaner || "Cleaner")}` : "Open"}</span></td><td><div class="tableActions">${!claimed || mine ? `<button class="actionBtn smallBtn claimRecurringBtn" data-id="${esc(job.id)}">${mine ? "Claimed" : "Claim"}</button>` : ""}<button class="ghostBtn smallBtn editRecurringBtn" data-id="${esc(job.id)}">Edit</button>${isAdminish() ? `<button class="dangerBtn smallBtn deleteRecurringBtn" data-id="${esc(job.id)}">Delete</button>` : ""}</div></td></tr>`;
  });
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Job</th><th>Coming Day</th><th>Countdown</th><th>Frequency</th><th>Cleaner Pay</th><th>Status</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No recurring jobs yet.</div>`;
}

function openRecurringModal(id = ""){
  const record = id ? recurringJobs[id] || {} : {};
  const backdrop = $("modalBackdrop");
  const card = $("modalCard");
  if(!backdrop || !card) return;
  backdrop.classList.remove("hidden");
  card.innerHTML = `<div class="modalTop"><div><h2>${id ? "Edit" : "Add"} Recurring Job</h2><p class="muted">Cleaners can claim this from the Recurring page.</p></div><button class="ghostBtn" onclick="window.crmCloseModal?.()">Close</button></div><div class="formGrid"><label>Customer<input data-rec-field="customer" value="${esc(record.customer || "")}" /></label><label>Phone<input data-rec-field="phone" value="${esc(record.phone || "")}" /></label><label>Address<input data-rec-field="address" value="${esc(record.address || "")}" /></label><label>Service<input data-rec-field="title" value="${esc(record.title || "Window Cleaning")}" /></label><label>Coming Day<input data-rec-field="nextDate" type="date" value="${esc(dateInputValue(record.nextDate || record.scheduledAt))}" /></label><label>Time<input data-rec-field="time" type="time" value="${esc(record.time || "09:00")}" /></label><label>Frequency<select data-rec-field="frequency"><option ${sel(record.frequency, "Weekly")}>Weekly</option><option ${sel(record.frequency, "Biweekly")}>Biweekly</option><option ${sel(record.frequency, "Monthly")}>Monthly</option><option ${sel(record.frequency, "Quarterly")}>Quarterly</option></select></label><label>Cleaner Pay<input data-rec-field="payCleanerAmount" type="number" min="0" step="1" value="${esc(record.payCleanerAmount || record.cleanerPay || "")}" placeholder="ex: 40" /></label><label>Notes<textarea data-rec-field="notes">${esc(record.notes || "")}</textarea></label></div><div class="modalActions"><button class="dangerBtn" id="deleteRecurringModalBtn" ${id ? "" : "style='display:none'"}>Delete</button><button class="actionBtn" id="saveRecurringBtn">Save</button></div>`;
  $("saveRecurringBtn").onclick = () => saveRecurring(id);
  $("deleteRecurringModalBtn").onclick = () => deleteRecurring(id);
}

async function saveRecurring(id = ""){
  const card = $("modalCard");
  const read = field => card?.querySelector(`[data-rec-field="${field}"]`)?.value?.trim() || "";
  const recordId = id || `recurring-${now()}`;
  const data = {
    id: recordId,
    customer: read("customer"),
    phone: read("phone"),
    address: read("address"),
    title: read("title") || "Window Cleaning",
    nextDate: read("nextDate"),
    time: read("time"),
    frequency: read("frequency") || "Weekly",
    payCleanerAmount: Number(read("payCleanerAmount") || 0),
    notes: read("notes"),
    status: recurringJobs[recordId]?.status || "open",
    updatedAt: now(),
    updatedBy: currentName()
  };
  if(!id){ data.createdAt = now(); data.createdBy = currentName(); }
  await setDoc(doc(db, "recurringJobs", recordId), data, { merge: true });
  closeModal();
  await addLog(`Recurring job saved: ${data.customer || data.address || recordId}`);
  toast("Recurring job saved");
}

async function claimRecurring(id){
  const job = recurringJobs[id];
  if(!job) return toast("Recurring job not found");
  if((job.cleanerId || job.cleanerName) && job.cleanerId !== uid && job.cleanerName !== currentName()) return toast("Already claimed");
  await setDoc(doc(db, "recurringJobs", id), { cleanerId: uid, cleanerName: currentName(), cleaner: currentName(), status: "claimed", claimedAt: now(), updatedAt: now(), updatedBy: currentName() }, { merge: true });
  await addLog(`Recurring job claimed: ${job.customer || job.address || id} by ${currentName()}`);
  toast("Recurring job claimed");
}

async function deleteRecurring(id){
  if(!id || !recurringJobs[id]) return;
  if(!confirm("Remove this recurring job?")) return;
  await deleteDoc(doc(db, "recurringJobs", id));
  closeModal();
  await addLog(`Recurring job deleted: ${id}`);
  toast("Recurring job deleted");
}

function watchDynamicUi(){
  const main = document.querySelector(".main");
  if(main) new MutationObserver(() => { ensureRecurringUi(); renderBoardPayFix(); }).observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
}

function injectFixStyles(){
  if($("repPortalFixCss")) return;
  const style = document.createElement("style");
  style.id = "repPortalFixCss";
  style.textContent = `
    .allset-map-popup .leaflet-popup-content-wrapper{background:linear-gradient(180deg,#111a2b,#07111d)!important;border:1px solid rgba(56,189,248,.36)!important;box-shadow:0 22px 70px rgba(0,0,0,.42)!important}
    .allset-map-popup .leaflet-popup-tip{background:#07111d!important}
    .allset-map-popup .leaflet-popup-close-button{color:#d9f4ff!important}
    .mapPopupFix,.mapPopup--allset{color:#f8fbff!important;background:linear-gradient(180deg,rgba(17,26,43,.98),rgba(7,17,29,.98))!important}
    .mapPopupFix h3,.mapPopup--allset h3{color:#f8fbff!important;font-size:16px!important}
    .mapPopupFix .mutedText,.mapPopup--allset .mutedText{color:rgba(226,242,255,.72)!important}
    .mapPopupFix input,.mapPopupFix select,.mapPopupFix textarea,.mapPopup--allset input,.mapPopup--allset select,.mapPopup--allset textarea{background:rgba(255,255,255,.94)!important;color:#07111d!important;border:1px solid rgba(56,189,248,.28)!important}
    .leadFixGrid{display:grid;gap:7px}.leadFixGrid textarea{min-height:62px}.tableActions{display:flex;gap:7px;flex-wrap:wrap}
    .statusBtn.yes{background:rgba(34,197,94,.16)!important;color:#bbf7d0!important;border:1px solid rgba(34,197,94,.48)!important}.statusBtn.no{background:rgba(239,68,68,.14)!important;color:#fecaca!important;border:1px solid rgba(239,68,68,.48)!important}.statusBtn.nothome{background:rgba(56,189,248,.15)!important;color:#bae6fd!important;border:1px solid rgba(56,189,248,.48)!important}.statusBtn.callback{background:rgba(168,85,247,.14)!important;color:#ddd6fe!important;border:1px solid rgba(168,85,247,.48)!important}.statusBtn.none{background:rgba(226,232,240,.12)!important;color:#e2e8f0!important;border:1px solid rgba(226,232,240,.36)!important}
    .mapSaveBtn{background:linear-gradient(90deg,var(--accent1,#7c3aed),var(--accent2,#38bdf8))!important;color:#06101a!important;border:0!important}.mapPlainBtn{background:rgba(238,244,251,.96)!important;color:#07111d!important}.mapDangerBtn{background:rgba(254,226,226,.94)!important;color:#7f1d1d!important}
  `;
  document.head.appendChild(style);
}

function cleanerPay(job){
  return Number(job.payCleanerAmount ?? job.cleanerPay ?? job.cleanerAmount ?? job.payCleaner ?? job.cleanerPayout ?? 0) || 0;
}
function jobStatus(status){ return String(status || "open").toLowerCase().replace(/\s+/g, "_").replace("-", "_") === "scheduled" ? "open" : String(status || "open").toLowerCase().replace(/\s+/g, "_").replace("-", "_"); }
function isAdminish(){ return (localStorage.getItem("allset_rep_role") || "rep") === "admin" || sessionStorage.getItem("allset_admin_unlocked") === "1"; }
function currentName(){ return localStorage.getItem("allset_rep_name") || $("nicknameInput")?.value || "Team"; }
function selected(current, value, def = false){ return (current ? current === value : def) ? " selected" : ""; }
function sel(current, value){ return String(current || "Weekly") === value ? 'selected=""' : ""; }
function nextRecurringDate(job){ const base = dateInputValue(job.nextDate || job.scheduledAt) || todayInput(); const date = new Date(`${base}T${job.time || "09:00"}`); return Number.isFinite(date.getTime()) ? date : new Date(); }
function nextRecurringTime(job){ return nextRecurringDate(job).getTime(); }
function countdownText(date){ const diff = date.getTime() - now(); if(diff <= 0) return "Due now"; const days = Math.floor(diff / 86400000); const hours = Math.floor((diff % 86400000) / 3600000); const mins = Math.floor((diff % 3600000) / 60000); if(days > 0) return `${days}d ${hours}h`; if(hours > 0) return `${hours}h ${mins}m`; return `${Math.max(1, mins)}m`; }
function dateInputValue(value){ if(!value) return ""; if(typeof value === "number") return new Date(value).toISOString().slice(0,10); if(value.seconds) return new Date(value.seconds * 1000).toISOString().slice(0,10); const match = String(value).match(/\d{4}-\d{2}-\d{2}/); return match ? match[0] : ""; }
function todayInput(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatDateTime(date){ return date.toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function badgeRecurring(){ const count = Object.values(recurringJobs).filter(job => !(job.cleanerId || job.cleanerName) && nextRecurringTime(job) - now() < 7 * 86400000).length; document.querySelectorAll('.navBtn[data-page="recurring"]').forEach(btn => { btn.classList.toggle("hasOpenJobs", count > 0); btn.dataset.openCount = count > 0 ? String(count) : ""; btn.title = count > 0 ? `${count} upcoming recurring job${count === 1 ? "" : "s"}` : ""; }); }
function closeModal(){ $("modalBackdrop")?.classList.add("hidden"); if($("modalCard")) $("modalCard").innerHTML = ""; }
function toast(message){ const el = $("toast"); if(!el) return; el.textContent = message; el.classList.remove("hidden"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 1800); }
async function addLog(text){ try{ const ref = doc(db, "shared", "activityLog"); const snap = await getDoc(ref); const entries = snap.exists() ? (snap.data().entries || []) : []; await setDoc(ref, { entries: [{ t: now(), text }, ...entries].slice(0,150) }, { merge: true }); }catch(err){ console.warn("activity log failed", err); } }
