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
let jobs = {};
let reps = {};
let customers = {};
let recurringJobs = {};
let rendering = false;
let subscribed = false;

bootFollowupFixes();

function bootFollowupFixes(){
  injectStyles();
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    uid = user?.uid || uid;
    subscribeData();
    renderEverything();
  });
  document.addEventListener("click", handleClicks, true);
  setInterval(() => {
    ensureRecurringUi();
    keepRecurringVisible();
    renderEverything();
  }, 1400);
}

function subscribeData(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "jobs"), snap => { jobs = snapObj(snap); renderEverything(); });
  onSnapshot(collection(db, "reps"), snap => { reps = snapObj(snap); renderEverything(); });
  onSnapshot(collection(db, "customers"), snap => { customers = snapObj(snap); renderEverything(); });
  onSnapshot(collection(db, "recurringJobs"), snap => { recurringJobs = snapObj(snap); renderEverything(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id });
  return out;
}

function renderEverything(){
  if(rendering) return;
  rendering = true;
  try{
    ensureRecurringUi();
    keepRecurringVisible();
    renderJobsTable();
    renderCustomersTable();
    renderBoardTable();
    renderRecurringTable();
  } finally {
    setTimeout(() => rendering = false, 0);
  }
}

function handleClicks(event){
  const target = event.target;
  const nav = target.closest?.('.navBtn[data-page="recurring"]');
  if(nav){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showPage("recurring");
    return;
  }
  if(target?.id === "addRecurringBtn"){
    event.preventDefault();
    openRecurringModal();
    return;
  }
  const claimJob = target.closest?.(".claimJobFixBtn");
  if(claimJob){ event.preventDefault(); claimJobFix(claimJob.dataset.id); return; }
  const completeJob = target.closest?.(".completeJobFixBtn");
  if(completeJob){ event.preventDefault(); completeJobFix(completeJob.dataset.id); return; }
  const jobCustomer = target.closest?.(".jobToCustomerFixBtn");
  if(jobCustomer){ event.preventDefault(); jobToCustomerFix(jobCustomer.dataset.id); return; }
  const mbtJob = target.closest?.(".mbtJobBtn");
  if(mbtJob){ event.preventDefault(); customerToJobFix(mbtJob.dataset.id); return; }
  const exportBtn = target.closest?.(".exportCustomersIrsBtn");
  if(exportBtn){ event.preventDefault(); exportCustomersCsv(); return; }
  const claimRecurringBtn = target.closest?.(".claimRecurringFixBtn");
  if(claimRecurringBtn){ event.preventDefault(); claimRecurringFix(claimRecurringBtn.dataset.id); return; }
  const completeRecurringBtn = target.closest?.(".completeRecurringFixBtn");
  if(completeRecurringBtn){ event.preventDefault(); completeRecurringFix(completeRecurringBtn.dataset.id); return; }
  const editRecurringBtn = target.closest?.(".editRecurringFixBtn");
  if(editRecurringBtn){ event.preventDefault(); openRecurringModal(editRecurringBtn.dataset.id); return; }
  const deleteRecurringBtn = target.closest?.(".deleteRecurringFixBtn");
  if(deleteRecurringBtn){ event.preventDefault(); deleteRecurringFix(deleteRecurringBtn.dataset.id); return; }
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
  renderEverything();
}

function renderJobsTable(){
  const table = $("jobsTable");
  if(!table) return;
  const role = currentRole();
  const name = currentName();
  let data = Object.values(jobs).sort((a,b) => dateVal(a.scheduledAt || a.createdAt) - dateVal(b.scheduledAt || b.createdAt));
  if(role === "cleaner"){
    data = data.filter(job => jobStatus(job.status) === "open" || job.cleanerId === uid || job.cleanerName === name || job.cleaner === name);
  }
  const rows = data.map(job => {
    const status = jobStatus(job.status);
    const mine = job.cleanerId === uid || job.cleanerName === name || job.cleaner === name;
    const cleaner = job.cleanerName || job.cleaner || "";
    const completeButton = (mine || role !== "cleaner") && status !== "completed" ? `<button class="actionBtn smallBtn completeJobFixBtn" data-id="${esc(job.id)}">Completed</button>` : "";
    const claimButton = role === "cleaner" && status === "open" ? `<button class="actionBtn smallBtn claimJobFixBtn" data-id="${esc(job.id)}">Claim</button>` : "";
    const actions = role === "cleaner"
      ? `${claimButton}${completeButton}`
      : `<button class="ghostBtn smallBtn" onclick="window.crmEdit?.('job','${esc(job.id)}')">Edit</button>${completeButton}<button class="ghostBtn smallBtn jobToCustomerFixBtn" data-id="${esc(job.id)}">Customer</button>`;
    return `<tr><td><strong>${esc(job.customer || job.title || "Job")}</strong><br><span class="muted">${esc(job.address || "")}</span></td><td>${esc(job.phone || "-")}</td><td>${esc(readableDate(job.scheduledAt) || "-")}</td><td>${esc(cleaner || "-")}</td><td>${money(job.price || job.amount || job.quote || 0)}</td><td>${money(cleanerPay(job))}</td><td>${esc(readableDate(job.cleanedAt || job.completedAt || job.lastCleanedAt) || "-")}</td><td><span class="status ${esc(status)}">${esc(labelStatus(status))}</span></td><td><div class="tableActions">${actions}</div></td></tr>`;
  });
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Job</th><th>Phone</th><th>Scheduled</th><th>Cleaner</th><th>Price</th><th>Commission Amount</th><th>Cleaned Date</th><th>Status</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No jobs scheduled yet.</div>`;
}

function renderCustomersTable(){
  const table = $("customersTable");
  if(!table) return;
  const data = Object.values(customers).sort((a,b) => dateVal(b.jobDate || b.completedAt || b.lastCleanedAt || b.createdAt) - dateVal(a.jobDate || a.completedAt || a.lastCleanedAt || a.createdAt));
  const rows = data.map(customer => `<tr><td>${esc(readableDate(customer.jobDate || customer.completedAt || customer.lastCleanedAt || customer.createdAt) || "-")}</td><td><strong>${esc(customer.name || customer.customer || "Customer")}</strong></td><td>${esc(customer.address || "-")}</td><td>${esc(customer.service || customer.title || "Window Cleaning")}</td><td>${money(customer.price || customer.amount || customer.lifetimeRevenue || 0)}</td><td>${esc(customer.paid || customer.paymentStatus || customer.status || "-")}</td><td>${esc(customer.paymentMethod || customer.method || "-")}</td><td>${esc(customer.repName || customer.rep || "-")}</td><td>${esc(customer.cleanerName || customer.cleaner || "-")}</td><td><div class="tableActions"><button class="ghostBtn smallBtn" onclick="window.crmEdit?.('customer','${esc(customer.id)}')">Edit</button><button class="actionBtn smallBtn mbtJobBtn" data-id="${esc(customer.id)}">MBT Job</button></div></td></tr>`);
  table.innerHTML = `<div class="tableToolbar"><button class="ghostBtn smallBtn exportCustomersIrsBtn" type="button">Export IRS CSV</button></div>` + (rows.length ? `<table class="dataTable"><thead><tr><th>Job Date</th><th>Customer</th><th>Address</th><th>Service</th><th>Price</th><th>Paid</th><th>Payment Method</th><th>Rep</th><th>Cleaner</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No customers yet.</div>`);
}

function renderBoardTable(){
  const table = $("boardTable");
  if(!table) return;
  const cleaners = new Map();
  Object.entries(reps).filter(([, rep]) => rep.role === "cleaner").forEach(([id, rep]) => cleaners.set(id, { id, name: rep.name || "Cleaner", claimed: 0, completed: 0, earned: 0 }));
  Object.values(jobs).forEach(job => addJobToCleanerBoard(cleaners, job));
  const admin = isAdminish();
  const rows = [...cleaners.values()].sort((a,b) => b.earned - a.earned || b.completed - a.completed).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.claimed}</td><td>${row.completed}</td><td>${money(row.earned)}</td>${admin ? `<td>${reps[row.id] ? `<button class="dangerBtn smallBtn deleteCleanerBtn" data-id="${esc(row.id)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Cleaner</th><th>Jobs Claimed</th><th>Jobs Completed</th><th>Amount Earned</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No cleaner board data yet.</div>`;
}

function addJobToCleanerBoard(cleaners, job){
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

function renderRecurringTable(){
  const table = $("recurringTable");
  if(!table) return;
  const name = currentName();
  const rows = Object.values(recurringJobs).sort((a,b) => nextRecurringTime(a) - nextRecurringTime(b)).map(job => {
    const due = nextRecurringDate(job);
    const mine = job.cleanerId === uid || job.cleanerName === name || job.cleaner === name;
    const claimed = !!(job.cleanerId || job.cleanerName || job.cleaner);
    const status = claimed ? `Claimed by ${esc(job.cleanerName || job.cleaner || "Cleaner")}` : "Open";
    const actions = claimed
      ? `${mine ? `<button class="actionBtn smallBtn completeRecurringFixBtn" data-id="${esc(job.id)}">Completed</button>` : ""}<button class="ghostBtn smallBtn editRecurringFixBtn" data-id="${esc(job.id)}">Edit</button>`
      : `<button class="actionBtn smallBtn claimRecurringFixBtn" data-id="${esc(job.id)}">Claim</button><button class="ghostBtn smallBtn editRecurringFixBtn" data-id="${esc(job.id)}">Edit</button>`;
    return `<tr><td><strong>${esc(job.customer || job.title || "Recurring Job")}</strong><br><span class="muted">${esc(job.address || "")}</span></td><td>${esc(formatDateTime(due))}</td><td><strong>${esc(countdownText(due))}</strong></td><td>${esc(job.frequency || "Weekly")}</td><td>${money(job.payCleanerAmount || job.cleanerPay || 0)}</td><td><span class="status ${claimed ? "claimed" : "open"}">${status}</span></td><td><div class="tableActions">${actions}${isAdminish() ? `<button class="dangerBtn smallBtn deleteRecurringFixBtn" data-id="${esc(job.id)}">Delete</button>` : ""}</div></td></tr>`;
  });
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Job</th><th>Coming Day</th><th>Countdown</th><th>Frequency</th><th>Cleaner Pay</th><th>Status</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No recurring jobs yet.</div>`;
}

async function claimJobFix(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  if(jobStatus(job.status) !== "open" && jobStatus(job.status) !== "scheduled") return toast("That job is already claimed");
  await setDoc(doc(db, "jobs", id), { status: "claimed", cleanerId: uid, cleanerName: currentName(), cleaner: currentName(), claimedAt: now(), updatedAt: now(), updatedBy: currentName() }, { merge: true });
  await addLog(`Job claimed: ${job.customer || job.title || id} by ${currentName()}`);
  toast("Job claimed. Completed button is ready.");
}

async function completeJobFix(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  const t = now();
  await setDoc(doc(db, "jobs", id), { status: "completed", cleanerId: job.cleanerId || uid, cleanerName: job.cleanerName || job.cleaner || currentName(), cleaner: job.cleaner || job.cleanerName || currentName(), completedAt: t, cleanedAt: t, lastCleanedAt: t, updatedAt: t, updatedBy: currentName() }, { merge: true });
  await addLog(`Job completed: ${job.customer || job.title || id} by ${currentName()}`);
  toast("Job completed. Commission added to Board.");
}

async function jobToCustomerFix(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  const t = job.cleanedAt || job.completedAt || now();
  const customerId = `cust-${now()}`;
  await setDoc(doc(db, "customers", customerId), {
    id: customerId,
    name: job.customer || job.name || job.title || "Customer",
    customer: job.customer || job.name || "",
    phone: job.phone || "",
    address: job.address || "",
    service: job.title || job.service || "Window Cleaning",
    price: Number(job.price || job.amount || job.quote || 0),
    lifetimeRevenue: Number(job.price || job.amount || job.quote || 0),
    paid: job.paid || job.paymentStatus || "",
    paymentMethod: job.paymentMethod || job.method || "",
    repName: job.repName || job.rep || "",
    cleanerName: job.cleanerName || job.cleaner || "",
    cleanerPay: cleanerPay(job),
    jobDate: t,
    completedAt: t,
    lastCleanedAt: t,
    notes: job.notes || "",
    sourceJobId: id,
    createdAt: now(),
    createdBy: currentName()
  }, { merge: true });
  await deleteDoc(doc(db, "jobs", id));
  await addLog(`Job moved to customer: ${job.customer || job.address || id}`);
  toast("Moved to Customers");
  showPage("customers");
}

async function customerToJobFix(id){
  const customer = customers[id];
  if(!customer) return toast("Customer not found");
  const jobId = `jobs-${now()}`;
  await setDoc(doc(db, "jobs", jobId), {
    id: jobId,
    sourceCustomerId: id,
    title: customer.service || customer.title || "Window Cleaning",
    customer: customer.name || customer.customer || "",
    phone: customer.phone || "",
    address: customer.address || "",
    scheduledAt: "",
    cleaner: "",
    cleanerName: "",
    price: Number(customer.price || customer.amount || customer.lifetimeRevenue || 0),
    payCleanerAmount: 0,
    status: "open",
    notes: customer.notes || "",
    repName: currentName(),
    repId: uid,
    createdAt: now(),
    createdBy: currentName(),
    movedBackFromCustomerAt: now()
  }, { merge: true });
  await addLog(`Customer moved back to job: ${customer.name || customer.address || id}`);
  toast("Customer moved back to Jobs");
  showPage("jobs");
}

async function claimRecurringFix(id){
  const job = recurringJobs[id];
  if(!job) return toast("Recurring job not found");
  if((job.cleanerId || job.cleanerName) && job.cleanerId !== uid && job.cleanerName !== currentName()) return toast("Already claimed");
  await setDoc(doc(db, "recurringJobs", id), { cleanerId: uid, cleanerName: currentName(), cleaner: currentName(), status: "claimed", claimedAt: now(), updatedAt: now(), updatedBy: currentName() }, { merge: true });
  await addLog(`Recurring job claimed: ${job.customer || job.address || id} by ${currentName()}`);
  toast("Recurring job claimed. Completed button is ready.");
}

async function completeRecurringFix(id){
  const recurring = recurringJobs[id];
  if(!recurring) return toast("Recurring job not found");
  const t = now();
  const historyJobId = `jobs-${t}`;
  await setDoc(doc(db, "jobs", historyJobId), {
    id: historyJobId,
    recurringId: id,
    title: recurring.title || "Window Cleaning",
    customer: recurring.customer || "",
    phone: recurring.phone || "",
    address: recurring.address || "",
    scheduledAt: recurring.nextDate || "",
    cleaner: recurring.cleaner || recurring.cleanerName || currentName(),
    cleanerName: recurring.cleanerName || recurring.cleaner || currentName(),
    cleanerId: recurring.cleanerId || uid,
    price: Number(recurring.price || recurring.amount || 0),
    payCleanerAmount: Number(recurring.payCleanerAmount || recurring.cleanerPay || 0),
    status: "completed",
    notes: recurring.notes || "",
    completedAt: t,
    cleanedAt: t,
    lastCleanedAt: t,
    createdAt: t,
    createdBy: currentName(),
    source: "recurring"
  }, { merge: true });
  await setDoc(doc(db, "recurringJobs", id), { status: "open", cleanerId: "", cleanerName: "", cleaner: "", claimedAt: "", lastCompletedAt: t, lastCleanedAt: t, nextDate: advanceDate(recurring.nextDate, recurring.frequency), updatedAt: t, updatedBy: currentName() }, { merge: true });
  await addLog(`Recurring job completed: ${recurring.customer || recurring.address || id} by ${currentName()}`);
  toast("Recurring job completed. Commission added to Board.");
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
    customer: read("customer"),
    phone: read("phone"),
    address: read("address"),
    title: read("title") || "Window Cleaning",
    nextDate: read("nextDate"),
    time: read("time"),
    frequency: read("frequency") || "Weekly",
    price: Number(read("price") || 0),
    payCleanerAmount: Number(read("payCleanerAmount") || 0),
    notes: read("notes"),
    status: existing.status || "open",
    createdAt: existing.createdAt || now(),
    createdBy: existing.createdBy || currentName(),
    updatedAt: now(),
    updatedBy: currentName()
  }, { merge: true });
  closeModal();
  toast("Recurring job saved");
}

async function deleteRecurringFix(id){
  if(!id || !recurringJobs[id]) return;
  if(!confirm("Remove this recurring job?")) return;
  await deleteDoc(doc(db, "recurringJobs", id));
  closeModal();
  toast("Recurring job deleted");
}

function exportCustomersCsv(){
  const headers = ["Job Date", "Customer", "Address", "Service", "Price", "Paid", "Payment Method", "Rep", "Cleaner"];
  const rows = Object.values(customers).map(customer => [
    readableDate(customer.jobDate || customer.completedAt || customer.lastCleanedAt || customer.createdAt) || "",
    customer.name || customer.customer || "",
    customer.address || "",
    customer.service || customer.title || "Window Cleaning",
    customer.price || customer.amount || customer.lifetimeRevenue || "",
    customer.paid || customer.paymentStatus || customer.status || "",
    customer.paymentMethod || customer.method || "",
    customer.repName || customer.rep || "",
    customer.cleanerName || customer.cleaner || ""
  ]);
  exportCsv("customers-irs-ready.csv", headers, rows);
}

function exportCsv(filename, headers, rows){
  const q = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(q).join(","), ...rows.map(row => row.map(q).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function cleanerPay(job){ return Number(job.payCleanerAmount ?? job.cleanerPay ?? job.cleanerAmount ?? job.payCleaner ?? job.cleanerPayout ?? 0) || 0; }
function currentName(){ return localStorage.getItem("allset_rep_name") || $("nicknameInput")?.value || "Team"; }
function currentRole(){ return localStorage.getItem("allset_rep_role") || $("roleSelect")?.value || "rep"; }
function isAdminish(){ return currentRole() === "admin" || sessionStorage.getItem("allset_admin_unlocked") === "1"; }
function jobStatus(status){ const s = String(status || "open").toLowerCase().replace(/\s+/g, "_").replace("-", "_"); return s === "scheduled" ? "open" : s; }
function labelStatus(status){ return jobStatus(status).replaceAll("_", " ").replace(/^./, ch => ch.toUpperCase()); }
function dateVal(value){ if(!value) return 0; if(typeof value === "number") return value; if(value.seconds) return value.seconds * 1000; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; }
function readableDate(value){ const t = dateVal(value); return t ? new Date(t).toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
function dateInputValue(value){ if(!value) return ""; if(typeof value === "number") return new Date(value).toISOString().slice(0,10); if(value.seconds) return new Date(value.seconds * 1000).toISOString().slice(0,10); const match = String(value).match(/\d{4}-\d{2}-\d{2}/); return match ? match[0] : ""; }
function nextRecurringDate(job){ const base = dateInputValue(job.nextDate || job.scheduledAt) || todayInput(); const d = new Date(`${base}T${job.time || "09:00"}`); return Number.isFinite(d.getTime()) ? d : new Date(); }
function nextRecurringTime(job){ return nextRecurringDate(job).getTime(); }
function countdownText(date){ const diff = date.getTime() - now(); if(diff <= 0) return "Due now"; const days = Math.floor(diff / 86400000); const hours = Math.floor((diff % 86400000) / 3600000); const mins = Math.floor((diff % 3600000) / 60000); if(days > 0) return `${days}d ${hours}h`; if(hours > 0) return `${hours}h ${mins}m`; return `${Math.max(1, mins)}m`; }
function formatDateTime(date){ return date.toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function todayInput(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function advanceDate(value, frequency){
  const d = nextRecurringDate({ nextDate: value, time: "09:00" });
  const f = String(frequency || "Weekly").toLowerCase();
  if(f === "biweekly") d.setDate(d.getDate() + 14);
  else if(f === "monthly") d.setMonth(d.getMonth() + 1);
  else if(f === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0,10);
}
function sel(current, value){ return String(current || "Weekly") === value ? 'selected=""' : ""; }
function closeModal(){ $("modalBackdrop")?.classList.add("hidden"); if($("modalCard")) $("modalCard").innerHTML = ""; }
function toast(message){ const el = $("toast"); if(!el) return; el.textContent = message; el.classList.remove("hidden"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 1800); }
async function addLog(text){ try{ const ref = doc(db, "shared", "activityLog"); const snap = await getDoc(ref); const entries = snap.exists() ? (snap.data().entries || []) : []; await setDoc(ref, { entries: [{ t: now(), text }, ...entries].slice(0,150) }, { merge: true }); }catch(err){ console.warn("activity log failed", err); } }
function injectStyles(){
  if($("repPortalFollowupCss")) return;
  const style = document.createElement("style");
  style.id = "repPortalFollowupCss";
  style.textContent = `.tableActions,.tableToolbar{display:flex;gap:7px;flex-wrap:wrap}.tableToolbar{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)}.navBtn[data-page="recurring"]{display:block!important}.navBtn[data-page="recurring"].hidden{display:block!important}`;
  document.head.appendChild(style);
}
