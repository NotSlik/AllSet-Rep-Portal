import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
let jobs = {};
let customers = {};
let reps = {};
let rendering = false;
let subscribed = false;
let backfillBusy = false;

bootUiHotfix2();

function bootUiHotfix2(){
  injectCss();
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    uid = user?.uid || uid;
    subscribe();
    renderAll();
  });
  document.addEventListener("click", captureClicks, true);
  setInterval(() => { enhanceBookkeepingJobModal(); renderAll(); }, 1300);
}

function subscribe(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "jobs"), snap => { jobs = snapObj(snap); ensureBookkeepingIds(); renderAll(); });
  onSnapshot(collection(db, "customers"), snap => { customers = snapObj(snap); ensureBookkeepingIds(); renderAll(); });
  onSnapshot(collection(db, "reps"), snap => { reps = snapObj(snap); renderAll(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id });
  return out;
}

function captureClicks(event){
  const target = event.target;
  if(target.closest?.('[data-open="jobModal"]') || String(target.getAttribute?.("onclick") || "").includes("crmEdit('job'")){
    setTimeout(enhanceBookkeepingJobModal, 0);
    setTimeout(enhanceBookkeepingJobModal, 160);
  }
  if(target.closest?.('[data-open="customerModal"]')){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    openCustomerModal(); return;
  }
  const exportCustomers = target.closest?.(".exportCustomersIrsFullBtn");
  if(exportCustomers){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    exportCustomersIrsCsv(); return;
  }
  const editCustomer = target.closest?.(".customerEditFullBtn");
  if(editCustomer){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    openCustomerModal(editCustomer.dataset.id); return;
  }
  const mbt = target.closest?.(".mbtJobStrictBtn");
  if(mbt){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    moveCustomerBackToOpenJob(mbt.dataset.id); return;
  }
  const claim = target.closest?.(".claimOpenJobBtn");
  if(claim){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    claimOpenJob(claim.dataset.id); return;
  }
  const start = target.closest?.(".startOpenJobBtn");
  if(start){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    startOpenJob(start.dataset.id); return;
  }
  const complete = target.closest?.(".completeOpenJobBtn");
  if(complete){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    completeOpenJob(complete.dataset.id); return;
  }
  const toCustomer = target.closest?.(".moveJobCustomerStrictBtn");
  if(toCustomer){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    moveJobToCustomer(toCustomer.dataset.id); return;
  }
  const deleteCleaner = target.closest?.(".deleteBoardCleanerBtn");
  if(deleteCleaner){
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    deleteCleanerRecord(deleteCleaner.dataset.id, deleteCleaner.dataset.name || "cleaner");
  }
}

function renderAll(){
  if(rendering) return;
  rendering = true;
  try{
    renderJobs();
    renderBoard();
  } finally {
    setTimeout(() => rendering = false, 0);
  }
}

function renderCustomers(){
  const table = $("customersTable");
  if(!table) return;
  const rows = Object.values(customers).sort((a,b) => dateVal(b.jobDate || b.completedAt || b.lastCleanedAt || b.createdAt) - dateVal(a.jobDate || a.completedAt || a.lastCleanedAt || a.createdAt)).map(customer => `<tr><td>${esc(customer.jobId || customer.businessJobId || "-")}</td><td>${esc(customer.invoiceNumber || "-")}</td><td>${esc(readableDate(customer.jobDate || customer.completedAt || customer.lastCleanedAt || customer.createdAt) || "-")}</td><td><strong>${esc(customer.name || customer.customer || "Customer")}</strong><br><span class="muted">${esc(customer.phone || "")}</span></td><td>${esc(customer.address || "-")}</td><td>${esc(customer.service || customer.title || "Window Cleaning")}</td><td>${money(customer.price || customer.amount || customer.lifetimeRevenue || 0)}</td><td>${esc(customer.paid || customer.paymentStatus || customer.status || "-")}</td><td>${esc(customer.paymentMethod || customer.method || "-")}</td><td>${esc(customer.repName || customer.rep || "-")}</td><td>${money(repPay(customer))}</td><td>${esc(customer.cleanerName || customer.cleaner || "-")}</td><td>${money(cleanerPay(customer))}</td><td>${money(totalLaborCost(customer))}</td><td><div class="tableActions"><button class="ghostBtn smallBtn customerEditFullBtn" data-id="${esc(customer.id)}">Edit</button><button class="actionBtn smallBtn mbtJobStrictBtn" data-id="${esc(customer.id)}">MBT Job</button></div></td></tr>`);
  const toolbar = `<div class="tableToolbar"><button class="ghostBtn smallBtn exportCustomersIrsFullBtn" type="button">Export IRS CSV</button></div>`;
  table.innerHTML = toolbar + (rows.length ? `<table class="dataTable"><thead><tr><th>Job ID</th><th>Invoice Number</th><th>Job Date</th><th>Customer</th><th>Address</th><th>Service</th><th>Price</th><th>Paid</th><th>Payment Method</th><th>Rep</th><th>Rep Pay</th><th>Cleaner</th><th>Cleaner Pay</th><th>Total Labor Cost</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No customers yet.</div>`);
}

function renderJobs(){
  const table = $("jobsTable");
  if(!table) return;
  const role = currentRole();
  const name = currentName();
  let data = Object.values(jobs).sort((a,b) => dateVal(a.scheduledAt || a.createdAt) - dateVal(b.scheduledAt || b.createdAt));
  if(role === "cleaner") data = data.filter(job => ["open", "claimed", "in_progress"].includes(jobStatus(job.status)) || job.cleanerId === uid || sameName(job.cleanerName || job.cleaner, name));
  const rows = data.map(job => {
    const status = jobStatus(job.status);
    const mine = job.cleanerId === uid || sameName(job.cleanerName || job.cleaner, name);
    const claimButton = role === "cleaner" && status === "open" ? `<button class="actionBtn smallBtn claimOpenJobBtn" data-id="${esc(job.id)}">Claim</button>` : "";
    const startButton = status === "claimed" && (role !== "cleaner" || mine) ? `<button class="actionBtn smallBtn startOpenJobBtn" data-id="${esc(job.id)}">Start</button>` : "";
    const completeButton = status === "in_progress" && (role !== "cleaner" || mine) ? `<button class="actionBtn smallBtn completeOpenJobBtn" data-id="${esc(job.id)}">Complete</button>` : "";
    const editButton = role !== "cleaner" ? `<button class="ghostBtn smallBtn" onclick="window.crmEdit?.('job','${esc(job.id)}')">Edit</button>` : "";
    const customerButton = role !== "cleaner" ? `<button class="ghostBtn smallBtn moveJobCustomerStrictBtn" data-id="${esc(job.id)}">Customer</button>` : "";
    return `<tr><td><strong>${esc(job.customer || job.title || "Job")}</strong><br><span class="muted">${esc(job.jobId || job.businessJobId || "")}${job.invoiceNumber ? ` / ${esc(job.invoiceNumber)}` : ""}</span></td><td>${esc(job.phone || "-")}</td><td>${esc(readableDate(job.scheduledAt) || "-")}</td><td>${esc(job.cleanerName || job.cleaner || "-")}</td><td>${money(job.price || job.amount || job.quote || 0)}</td><td>${money(repPay(job))}</td><td>${money(cleanerPay(job, true))}</td><td>${money(totalLaborCost(job, true))}</td><td>${esc(readableDate(job.cleanedAt || job.completedAt || job.lastCleanedAt) || "-")}</td><td><span class="status ${esc(status)}">${esc(labelStatus(status))}</span></td><td><div class="tableActions">${claimButton}${startButton}${completeButton}${editButton}${customerButton}</div></td></tr>`;
  });
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Job</th><th>Phone</th><th>Scheduled</th><th>Cleaner</th><th>Price</th><th>Rep Pay</th><th>Cleaner Pay</th><th>Total Labor Cost</th><th>Cleaned Date</th><th>Status</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No jobs scheduled yet.</div>`;
}

function renderBoard(){
  const table = $("boardTable");
  if(!table) return;
  const cleaners = new Map();
  Object.entries(reps).forEach(([id, rep]) => {
    if(rep.role !== "cleaner") return;
    const displayName = rep.name || rep.displayName || id;
    if(shouldHideCleanerName(displayName)) return;
    const key = stableKey(displayName) || id;
    cleaners.set(key, { id, key, name: displayName, claimed: 0, completed: 0, earned: 0, repDocId: id });
  });
  Object.values(jobs).forEach(job => addBoardJob(cleaners, job));
  Object.values(customers).forEach(customer => addBoardCustomer(cleaners, customer));
  const admin = isAdminish();
  const rows = [...cleaners.values()].sort((a,b) => b.earned - a.earned || b.completed - a.completed).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.claimed}</td><td>${row.completed}</td><td>${money(row.earned)}</td>${admin ? `<td>${row.repDocId ? `<button class="dangerBtn smallBtn deleteBoardCleanerBtn" data-id="${esc(row.repDocId)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Cleaner</th><th>Jobs Claimed</th><th>Jobs Completed</th><th>Amount Earned</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No cleaner board data yet.</div>`;
}

function addBoardJob(cleaners, job){
  const cleanerName = String(job.cleanerName || job.cleaner || "").trim();
  if(!cleanerName || shouldHideCleanerName(cleanerName)) return;
  const key = stableKey(cleanerName) || job.cleanerId || cleanerName;
  if(!cleaners.has(key)) cleaners.set(key, { id: job.cleanerId || "", key, name: cleanerName, claimed: 0, completed: 0, earned: 0, repDocId: findRepDocId(cleanerName, job.cleanerId) });
  const row = cleaners.get(key);
  const status = jobStatus(job.status);
  if(job.claimedAt || job.cleanerId || cleanerName || ["claimed", "in_progress", "completed"].includes(status)) row.claimed++;
  if(status === "completed" || job.completedAt || job.cleanedAt){ row.completed++; row.earned += cleanerPay(job); }
}

function addBoardCustomer(cleaners, customer){
  const pay = cleanerPay(customer);
  const cleanerName = String(customer.cleanerName || customer.cleaner || "").trim();
  if(!pay || !cleanerName || shouldHideCleanerName(cleanerName)) return;
  const key = stableKey(cleanerName) || customer.cleanerId || cleanerName;
  if(!cleaners.has(key)) cleaners.set(key, { id: customer.cleanerId || "", key, name: cleanerName, claimed: 0, completed: 0, earned: 0, repDocId: findRepDocId(cleanerName, customer.cleanerId) });
  const row = cleaners.get(key);
  row.claimed++;
  row.completed++;
  row.earned += pay;
}

function openCustomerModal(id = ""){
  const customer = id ? customers[id] || {} : {};
  const backdrop = $("modalBackdrop");
  const card = $("modalCard");
  if(!backdrop || !card) return;
  backdrop.classList.remove("hidden");
  card.innerHTML = `<div class="modalTop"><div><h2>${id ? "Edit" : "Add"} Customer</h2><p class="muted">IRS-ready customer and completed job details.</p></div><button class="ghostBtn" id="closeCustomerFullModalBtn" type="button">Close</button></div><div class="formGrid"><label>Job ID<input data-customer-field="jobId" value="${esc(customer.jobId || customer.businessJobId || nextBusinessId("AS", customer))}" readonly /></label><label>Invoice Number<input data-customer-field="invoiceNumber" value="${esc(customer.invoiceNumber || nextBusinessId("INV", customer))}" /></label><label>Job Date<input data-customer-field="jobDate" type="date" value="${esc(dateInputValue(customer.jobDate || customer.completedAt || customer.lastCleanedAt || customer.createdAt))}" /></label><label>Customer<input data-customer-field="name" value="${esc(customer.name || customer.customer || "")}" /></label><label>Phone<input data-customer-field="phone" value="${esc(customer.phone || "")}" /></label><label>Address<input data-customer-field="address" value="${esc(customer.address || "")}" /></label><label>Service<input data-customer-field="service" value="${esc(customer.service || customer.title || "Window Cleaning")}" /></label><label>Price<input data-customer-field="price" type="number" min="0" step="1" value="${esc(customer.price || customer.amount || customer.lifetimeRevenue || "")}" /></label><label>Paid<select data-customer-field="paid"><option value=""${sel(customer.paid || customer.paymentStatus || customer.status, "")}>Select</option><option value="paid"${sel(customer.paid || customer.paymentStatus || customer.status, "paid")}>Paid</option><option value="unpaid"${sel(customer.paid || customer.paymentStatus || customer.status, "unpaid")}>Unpaid</option><option value="partial"${sel(customer.paid || customer.paymentStatus || customer.status, "partial")}>Partial</option></select></label><label>Payment Method<input data-customer-field="paymentMethod" value="${esc(customer.paymentMethod || customer.method || "")}" placeholder="Cash App, Venmo, Zelle, Cash" /></label><label>Rep<input data-customer-field="repName" value="${esc(customer.repName || customer.rep || "")}" /></label><label>Rep Pay<input data-customer-field="repPay" type="number" min="0" step="1" value="${esc(repPay(customer) || "")}" /></label><label>Cleaner<input data-customer-field="cleanerName" value="${esc(customer.cleanerName || customer.cleaner || "")}" /></label><label>Cleaner Pay<input data-customer-field="cleanerPay" type="number" min="0" step="1" value="${esc(cleanerPay(customer) || "")}" /></label><label>Notes<textarea data-customer-field="notes">${esc(customer.notes || "")}</textarea></label></div><div class="modalActions"><button class="actionBtn" id="saveCustomerFullBtn" type="button">Save</button></div>`;
  $("closeCustomerFullModalBtn").onclick = closeModal;
  $("saveCustomerFullBtn").onclick = () => saveCustomerModal(id);
}

async function saveCustomerModal(id = ""){
  const card = $("modalCard");
  const read = field => card?.querySelector(`[data-customer-field="${field}"]`)?.value?.trim() || "";
  const customerId = id || `cust-${Date.now()}`;
  const existing = id ? customers[id] || {} : {};
  const jobDate = read("jobDate") ? new Date(`${read("jobDate")}T12:00`).getTime() : Date.now();
  const jobId = existing.jobId || existing.businessJobId || read("jobId") || nextBusinessId("AS", { id: customerId, createdAt: jobDate });
  const invoiceNumber = existing.invoiceNumber || read("invoiceNumber") || nextBusinessId("INV", { id: customerId, createdAt: jobDate });
  await setDoc(doc(db, "customers", customerId), {
    id: customerId, jobId, businessJobId: jobId, invoiceNumber,
    name: read("name"), customer: read("name"), phone: read("phone"), address: read("address"),
    service: read("service") || "Window Cleaning", price: Number(read("price") || 0), lifetimeRevenue: Number(read("price") || 0),
    paid: read("paid"), paymentStatus: read("paid"), paymentMethod: read("paymentMethod"), repName: read("repName"),
    repPay: Number(read("repPay") || 0), cleanerName: read("cleanerName"), cleaner: read("cleanerName"), cleanerPay: Number(read("cleanerPay") || 0), payCleanerAmount: Number(read("cleanerPay") || 0),
    totalLaborCost: Number(read("repPay") || 0) + Number(read("cleanerPay") || 0),
    jobDate, completedAt: jobDate, lastCleanedAt: jobDate, notes: read("notes"), updatedAt: Date.now(), updatedBy: currentName(),
    ...(!id ? { createdAt: Date.now(), createdBy: currentName() } : {})
  }, { merge: true });
  closeModal();
  toast("Customer saved");
}

async function moveCustomerBackToOpenJob(id){
  const customer = customers[id];
  if(!customer) return toast("Customer not found");
  const jobId = `jobs-${Date.now()}`;
  const businessJobId = customer.jobId || customer.businessJobId || nextBusinessId("AS", customer);
  const invoiceNumber = customer.invoiceNumber || nextBusinessId("INV", customer);
  await setDoc(doc(db, "jobs", jobId), {
    id: jobId, jobId: businessJobId, businessJobId, invoiceNumber, sourceCustomerId: id, title: customer.service || customer.title || "Window Cleaning",
    customer: customer.name || customer.customer || "", phone: customer.phone || "", address: customer.address || "", scheduledAt: "",
    cleaner: "", cleanerName: "", cleanerId: "", price: Number(customer.price || customer.amount || customer.lifetimeRevenue || 0),
    repPay: Number(customer.repPay || customer.repCommission || 0), payCleanerAmount: Number(customer.cleanerPay || customer.payCleanerAmount || 0), cleanerPay: Number(customer.cleanerPay || customer.payCleanerAmount || 0),
    status: "open", completedAt: "", cleanedAt: "", lastCleanedAt: "", notes: customer.notes || "", repName: currentName(), repId: uid,
    createdAt: Date.now(), createdBy: currentName(), movedBackFromCustomerAt: Date.now()
  }, { merge: true });
  toast("Moved back to Jobs as open");
  showPage("jobs");
}

async function claimOpenJob(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  if(jobStatus(job.status) !== "open") return toast("That job is not open");
  await setDoc(doc(db, "jobs", id), { status: "claimed", cleanerId: uid, cleanerName: currentName(), cleaner: currentName(), claimedAt: Date.now(), updatedAt: Date.now(), updatedBy: currentName() }, { merge: true });
  toast("Job claimed");
}

async function startOpenJob(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  const status = jobStatus(job.status);
  const mine = job.cleanerId === uid || sameName(job.cleanerName || job.cleaner, currentName());
  if(status !== "claimed") return toast("Claim the job before starting");
  if(currentRole() === "cleaner" && !mine) return toast("This job is claimed by another cleaner");
  await setDoc(doc(db, "jobs", id), { status: "in_progress", startedAt: Date.now(), updatedAt: Date.now(), updatedBy: currentName() }, { merge: true });
  toast("Job started");
}

async function completeOpenJob(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  const status = jobStatus(job.status);
  const mine = job.cleanerId === uid || sameName(job.cleanerName || job.cleaner, currentName());
  if(status === "completed") return toast("Job already completed");
  if(status !== "in_progress") return toast("Start the job before completing");
  if(currentRole() === "cleaner" && !mine) return toast("This job is claimed by another cleaner");
  const t = Date.now();
  const jobId = job.jobId || job.businessJobId || nextBusinessId("AS", job);
  const invoiceNumber = job.invoiceNumber || nextBusinessId("INV", job);
  const cleanerId = job.cleanerId || uid;
  const cleanerName = job.cleanerName || job.cleaner || currentName();
  const payout = cleanerPay(job, true);
  await setDoc(doc(db, "jobs", id), { jobId, businessJobId: jobId, invoiceNumber, status: "completed", cleanerId, cleanerName, cleaner: cleanerName, payCleanerAmount: payout, cleanerPay: payout, completedAt: t, cleanedAt: t, lastCleanedAt: t, totalLaborCost: totalLaborCost({ ...job, payCleanerAmount: payout }, true), updatedAt: t, updatedBy: currentName() }, { merge: true });
  await addCleanerCommission(cleanerId, cleanerName, payout);
  toast("Job completed");
}

async function moveJobToCustomer(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  const t = job.cleanedAt || job.completedAt || Date.now();
  const customerId = `cust-${Date.now()}`;
  const jobId = job.jobId || job.businessJobId || nextBusinessId("AS", job);
  const invoiceNumber = job.invoiceNumber || nextBusinessId("INV", job);
  await setDoc(doc(db, "customers", customerId), {
    id: customerId, jobId, businessJobId: jobId, invoiceNumber, name: job.customer || job.name || job.title || "Customer", customer: job.customer || job.name || "", phone: job.phone || "", address: job.address || "",
    service: job.title || job.service || "Window Cleaning", price: Number(job.price || job.amount || job.quote || 0), lifetimeRevenue: Number(job.price || job.amount || job.quote || 0),
    paid: job.paid || job.paymentStatus || "", paymentMethod: job.paymentMethod || job.method || "", repName: job.repName || job.rep || "", repPay: repPay(job), cleanerName: job.cleanerName || job.cleaner || "",
    cleaner: job.cleaner || job.cleanerName || "", cleanerPay: cleanerPay(job), payCleanerAmount: cleanerPay(job), totalLaborCost: totalLaborCost(job), jobDate: t, completedAt: t, lastCleanedAt: t, notes: job.notes || "", sourceJobId: id,
    createdAt: Date.now(), createdBy: currentName()
  }, { merge: true });
  await deleteDoc(doc(db, "jobs", id));
  toast("Moved to Customers");
  showPage("customers");
}

async function deleteCleanerRecord(id, name){
  if(!isAdminish()) return toast("Admin required");
  if(!id) return toast("No cleaner record to delete");
  if(!confirm(`Delete ${name} from Team records? Job history stays.`)) return;
  await deleteDoc(doc(db, "reps", id));
  toast("Cleaner record deleted");
}

async function ensureBookkeepingIds(){
  if(backfillBusy) return;
  backfillBusy = true;
  try{
    for(const job of Object.values(jobs)){
      const update = missingBookkeepingUpdate(job);
      if(Object.keys(update).length) await setDoc(doc(db, "jobs", job.id), update, { merge: true });
    }
    for(const customer of Object.values(customers)){
      const update = missingBookkeepingUpdate(customer);
      if(Object.keys(update).length) await setDoc(doc(db, "customers", customer.id), update, { merge: true });
    }
  } finally {
    backfillBusy = false;
  }
}

function missingBookkeepingUpdate(record){
  const update = {};
  const jobId = record.jobId || record.businessJobId;
  if(!jobId){
    update.jobId = nextBusinessId("AS", record);
    update.businessJobId = update.jobId;
  } else if(!record.businessJobId){
    update.businessJobId = jobId;
  }
  if(!record.invoiceNumber) update.invoiceNumber = nextBusinessId("INV", record);
  const labor = totalLaborCost(record);
  if(record.totalLaborCost == null && labor) update.totalLaborCost = labor;
  return update;
}

function enhanceBookkeepingJobModal(){
  const card = $("modalCard");
  if(!card || card.querySelector('[data-field="repPay"]')) return;
  const title = card.querySelector("h2")?.textContent || "";
  const hasJob = card.querySelector('[data-field="price"]') && card.querySelector('[data-field="cleaner"]');
  if(!/job/i.test(title) && !hasJob) return;
  const grid = card.querySelector(".formGrid");
  if(!grid) return;
  const id = modalJobIdFromTitle() || "";
  const current = id ? jobs[id] || {} : {};
  const price = grid.querySelector('[data-field="price"]')?.closest("label");
  const rep = document.createElement("label");
  rep.innerHTML = `Rep Pay<input data-field="repPay" type="number" min="0" step="1" value="${esc(repPay(current) || "")}" placeholder="ex: 40" />`;
  const invoice = document.createElement("label");
  invoice.innerHTML = `Invoice Number<input data-field="invoiceNumber" value="${esc(current.invoiceNumber || nextBusinessId("INV", current))}" />`;
  const business = document.createElement("label");
  business.innerHTML = `Job ID<input data-field="jobId" value="${esc(current.jobId || current.businessJobId || nextBusinessId("AS", current))}" readonly />`;
  price?.after ? price.after(business, invoice, rep) : grid.append(business, invoice, rep);
}

function modalJobIdFromTitle(){
  const onclick = [...document.querySelectorAll('.ghostBtn[onclick*="crmEdit"]')].find(btn => btn.matches(":focus"))?.getAttribute("onclick") || "";
  const match = onclick.match(/crmEdit\?\.\('job','([^']+)'\)/);
  return match?.[1] || "";
}

function exportCustomersIrsCsv(){
  const headers = ["Job ID", "Invoice Number", "Job Date", "Customer", "Phone", "Address", "Service", "Price", "Paid", "Payment Method", "Rep", "Rep Pay", "Cleaner", "Cleaner Pay", "Total Labor Cost", "Notes"];
  const rows = Object.values(customers).sort((a,b) => dateVal(a.jobDate || a.completedAt || a.lastCleanedAt || a.createdAt) - dateVal(b.jobDate || b.completedAt || b.lastCleanedAt || b.createdAt)).map(customer => [
    customer.jobId || customer.businessJobId || nextBusinessId("AS", customer),
    customer.invoiceNumber || nextBusinessId("INV", customer),
    readableDate(customer.jobDate || customer.completedAt || customer.lastCleanedAt || customer.createdAt),
    customer.name || customer.customer || "",
    customer.phone || "",
    customer.address || "",
    customer.service || customer.title || "Window Cleaning",
    Number(customer.price || customer.amount || customer.lifetimeRevenue || 0),
    customer.paid || customer.paymentStatus || customer.status || "",
    customer.paymentMethod || customer.method || "",
    customer.repName || customer.rep || "",
    repPay(customer),
    customer.cleanerName || customer.cleaner || "",
    cleanerPay(customer),
    totalLaborCost(customer),
    customer.notes || ""
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `allset-customers-irs-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast("IRS CSV downloaded");
}

function showPage(page){
  document.querySelectorAll(".navBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
  document.querySelectorAll(".page").forEach(section => section.classList.remove("active"));
  $(`page-${page}`)?.classList.add("active");
  $("nav")?.classList.remove("open");
  renderAll();
}

function findRepDocId(name, id){
  if(id && reps[id]) return id;
  const key = stableKey(name);
  const match = Object.entries(reps).find(([rid, rep]) => rid === key || sameName(rep.name || rep.displayName, name));
  return match?.[0] || "";
}
function currentName(){ return String(localStorage.getItem("allset_rep_name") || $("nicknameInput")?.value || "Team").trim(); }
function currentRole(){ return localStorage.getItem("allset_rep_role") || $("roleSelect")?.value || "rep"; }
function isAdminish(){ return currentRole() === "admin" || normalizeName(currentName()) === "laith" || sessionStorage.getItem("allset_admin_unlocked") === "1"; }
function shouldHideCleanerName(name){
  const n = normalizeName(name);
  return !n || n.includes("unassigned") || n.includes("rebira") || n === "laith" || (isAdminish() && n === normalizeName(currentName()));
}
function normalizeName(name){ return String(name || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function sameName(a,b){ return normalizeName(a) && normalizeName(a) === normalizeName(b); }
function stableKey(name){ const slug = normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); return slug ? `user-${slug}` : ""; }
function num(...values){ for(const value of values){ const n = Number(value); if(Number.isFinite(n) && value !== "") return n; } return 0; }
function repPay(job){ return num(job.repPay, job.repCommission, job.commissionAmount, job.repCommissionAmount); }
async function addCleanerCommission(cleanerId, cleanerName, payout){
  if(!payout) return;
  const repId = findRepDocId(cleanerName, cleanerId) || cleanerId;
  if(!repId || !reps[repId]) return;
  await setDoc(doc(db, "reps", repId), { commissionOwed: Number(reps[repId].commissionOwed || 0) + payout, updatedAt: Date.now(), updatedBy: currentName() }, { merge: true });
}
function cleanerPay(job, fallback = false){ const amount = num(job.payCleanerAmount, job.cleanerPay, job.cleanerAmount, job.payCleaner, job.cleanerPayout); return amount || (fallback ? num(job.price, job.amount, job.quote) : 0); }
function totalLaborCost(job, fallback = false){ return repPay(job) + cleanerPay(job, fallback); }
function businessYear(record){ const t = dateVal(record.completedAt || record.cleanedAt || record.jobDate || record.createdAt) || Date.now(); return new Date(t).getFullYear(); }
function nextBusinessId(prefix, record = {}){ const year = businessYear(record); const source = String(record.id || record.sourceJobId || record.createdAt || Date.now()); return `${prefix}-${year}-${stableNumber(source)}`; }
function stableNumber(source){ let hash = 0; for(let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0; return String(hash % 1000000).padStart(6, "0"); }
function jobStatus(status){ const s = String(status || "open").toLowerCase().replace(/\s+/g, "_").replace("-", "_"); return s === "scheduled" ? "open" : s; }
function labelStatus(status){ return jobStatus(status).replaceAll("_", " ").replace(/^./, ch => ch.toUpperCase()); }
function dateVal(value){ if(!value) return 0; if(typeof value === "number") return value; if(value.seconds) return value.seconds * 1000; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; }
function readableDate(value){ const t = dateVal(value); return t ? new Date(t).toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
function dateInputValue(value){ if(!value) return ""; if(typeof value === "number") return new Date(value).toISOString().slice(0,10); if(value.seconds) return new Date(value.seconds * 1000).toISOString().slice(0,10); const match = String(value).match(/\d{4}-\d{2}-\d{2}/); return match ? match[0] : ""; }
function sel(current, value){ return String(current || "") === value ? ' selected' : ""; }
function csvCell(value){ return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function closeModal(){ $("modalBackdrop")?.classList.add("hidden"); if($("modalCard")) $("modalCard").innerHTML = ""; }
function toast(message){ const el = $("toast"); if(!el) return; el.textContent = message; el.classList.remove("hidden"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 1800); }
function injectCss(){
  if($("repPortalUiHotfix2Css")) return;
  const style = document.createElement("style");
  style.id = "repPortalUiHotfix2Css";
  style.textContent = `.tableActions{display:flex;gap:7px;flex-wrap:wrap}.tableToolbar{display:flex;justify-content:flex-end;margin:0 0 10px}.formGrid textarea[data-customer-field="notes"]{min-height:82px}`;
  document.head.appendChild(style);
}
