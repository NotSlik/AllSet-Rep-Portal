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
const esc = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = n => "$" + Number(n || 0).toLocaleString();

let reps = {}, leads = {}, jobs = {}, customers = {};
let subscribed = false;
let customersOpen = false;
let lastCustomerSignature = "";
let lastBoardSignature = "";
let lastLeaderboardSignature = "";
let lastTeamSignature = "";
let cleanupBusy = false;

bootPolish();

function bootPolish(){
  injectCss();
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, () => subscribe());
  document.addEventListener("click", event => {
    const toggle = event.target.closest?.(".bookkeepingDrawerToggle");
    if(!toggle) return;
    event.preventDefault();
    event.stopPropagation();
    customersOpen = !customersOpen;
    renderCustomers(true);
  }, true);
  setInterval(renderAll, 1100);
}

function subscribe(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db, "reps"), snap => { reps = snapObj(snap); removeBlockedRepDocs(); renderAll(); });
  onSnapshot(collection(db, "leads"), snap => { leads = snapObj(snap); renderAll(); });
  onSnapshot(collection(db, "jobs"), snap => { jobs = snapObj(snap); renderAll(); });
  onSnapshot(collection(db, "customers"), snap => { customers = snapObj(snap); renderAll(); });
}

function snapObj(snap){
  const out = {};
  snap.forEach(item => out[item.id] = { ...item.data(), id: item.data().id || item.id });
  return out;
}

async function removeBlockedRepDocs(){
  if(cleanupBusy) return;
  cleanupBusy = true;
  try{
    for(const [id, rep] of Object.entries(reps)){
      if(isBlockedName(rep.name || rep.displayName || id)) await deleteDoc(doc(db, "reps", id)).catch(() => {});
    }
  } finally {
    cleanupBusy = false;
  }
}

function renderAll(){
  renderCustomers(false);
  renderBoard();
  renderLeaderboard();
  renderTeam();
  renderDashboardTotals();
}

function renderCustomers(force){
  const table = $("customersTable");
  if(!table) return;
  const data = Object.values(customers).sort((a,b) => dateVal(b.jobDate || b.completedAt || b.lastCleanedAt || b.createdAt) - dateVal(a.jobDate || a.completedAt || a.lastCleanedAt || a.createdAt));
  const signature = JSON.stringify(data.map(c => [c.id, c.jobId, c.invoiceNumber, c.name, c.phone, c.address, c.service, c.price, c.lifetimeRevenue, c.paid, c.paymentMethod, c.repName, c.repPay, c.cleanerName, cleanerPay(c), c.updatedAt, customersOpen]));
  if(!force && signature === lastCustomerSignature && table.querySelector(".customerTableShell")) return;
  lastCustomerSignature = signature;
  const scroll = table.querySelector(".customerDataScroll")?.scrollLeft || 0;
  const drawerRows = data.map(c => `<div class="bookkeepingItem"><strong>${esc(c.name || c.customer || "Customer")}</strong><span>Job ID: ${esc(c.jobId || c.businessJobId || "-")}</span><span>Invoice: ${esc(c.invoiceNumber || "-")}</span></div>`).join("");
  const rows = data.map(c => `<tr><td>${esc(readableDate(c.jobDate || c.completedAt || c.lastCleanedAt || c.createdAt) || "-")}</td><td><strong>${esc(c.name || c.customer || "Customer")}</strong><br><span class="muted">${esc(c.phone || "")}</span></td><td>${esc(c.address || "-")}</td><td>${esc(c.service || c.title || "Window Cleaning")}</td><td>${money(c.price || c.amount || c.lifetimeRevenue || 0)}</td><td>${esc(c.paid || c.paymentStatus || c.status || "-")}</td><td>${esc(c.paymentMethod || c.method || "-")}</td><td>${esc(c.repName || c.rep || "-")}</td><td>${money(repPay(c))}</td><td>${esc(c.cleanerName || c.cleaner || "-")}</td><td>${money(cleanerPay(c))}</td><td>${money(totalLaborCost(c))}</td><td><div class="tableActions"><button class="ghostBtn smallBtn customerEditFullBtn" data-id="${esc(c.id)}">Edit</button><button class="actionBtn smallBtn mbtJobStrictBtn" data-id="${esc(c.id)}">MBT Job</button></div></td></tr>`).join("");
  table.classList.toggle("bookkeepingOpen", customersOpen);
  table.innerHTML = `<div class="customerTableShell"><button class="bookkeepingDrawerToggle" type="button" aria-label="Show job IDs and invoice numbers">${customersOpen ? "<" : ">"}</button><aside class="bookkeepingDrawer"><div class="bookkeepingTitle">Job IDs</div>${drawerRows || `<div class="muted">No customers yet.</div>`}</aside><div class="tableToolbar"><button class="ghostBtn smallBtn exportCustomersIrsFullBtn" type="button">Export IRS CSV</button></div><div class="customerDataScroll">${rows ? `<table class="dataTable"><thead><tr><th>Job Date</th><th>Customer</th><th>Address</th><th>Service</th><th>Price</th><th>Paid</th><th>Payment Method</th><th>Rep</th><th>Rep Pay</th><th>Cleaner</th><th>Cleaner Pay</th><th>Total Labor Cost</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="card">No customers yet.</div>`}</div></div>`;
  const scroller = table.querySelector(".customerDataScroll");
  if(scroller) scroller.scrollLeft = scroll;
}

function renderBoard(){
  const table = $("boardTable");
  if(!table) return;
  const cleaners = new Map();
  Object.entries(reps).forEach(([id, rep]) => {
    const name = rep.name || rep.displayName || id;
    if(rep.role !== "cleaner" || shouldHideCleanerName(name)) return;
    const key = stableKey(name) || id;
    cleaners.set(key, { id, name, claimed: 0, completed: 0, earned: 0, repDocId: id });
  });
  Object.values(jobs).filter(validRecord).forEach(job => addBoardJob(cleaners, job));
  Object.values(customers).filter(validRecord).forEach(customer => addBoardCustomer(cleaners, customer));
  const admin = isAdminish();
  const rows = [...cleaners.values()].sort((a,b) => b.earned - a.earned || b.completed - a.completed).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.claimed}</td><td>${row.completed}</td><td>${money(row.earned)}</td>${admin ? `<td>${row.repDocId ? `<button class="dangerBtn smallBtn deleteBoardCleanerBtn" data-id="${esc(row.repDocId)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`);
  const html = rows.length ? `<table class="dataTable"><thead><tr><th>Cleaner</th><th>Jobs Claimed</th><th>Jobs Completed</th><th>Amount Earned</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No cleaner board data yet.</div>`;
  if(table.innerHTML !== html){ table.innerHTML = html; lastBoardSignature = html; }
}

function renderLeaderboard(){
  const table = $("leaderboardTable");
  if(!table) return;
  const rowsByKey = new Map();
  Object.entries(reps).forEach(([id, rep]) => {
    const name = rep.name || rep.displayName || id;
    if(rep.role === "cleaner" || isBlockedName(name)) return;
    const key = stableKey(name) || id;
    if(!rowsByKey.has(key)) rowsByKey.set(key, { id, name, revenue: 0, sold: 0, converted: 0, total: 0 });
  });
  Object.values(leads).filter(validRecord).forEach(lead => {
    const name = lead.repName || reps[lead.repId]?.name || "Rep";
    if(isBlockedName(name)) return;
    const key = stableKey(name) || lead.repId || name;
    if(!rowsByKey.has(key)) rowsByKey.set(key, { id: lead.repId || key, name, revenue: 0, sold: 0, converted: 0, total: 0 });
    const row = rowsByKey.get(key);
    row.total++;
    if(["sold", "converted", "yes"].includes(String(lead.status || "").toLowerCase())){ row.converted++; row.revenue += Number(lead.quote || lead.amount || lead.price || 0); }
  });
  Object.values(jobs).filter(validRecord).forEach(job => {
    const name = job.repName || reps[job.repId]?.name || "Rep";
    if(isBlockedName(name)) return;
    const key = stableKey(name) || job.repId || name;
    if(!rowsByKey.has(key)) rowsByKey.set(key, { id: job.repId || key, name, revenue: 0, sold: 0, converted: 0, total: 0 });
    const row = rowsByKey.get(key);
    if(["open", "claimed", "in_progress", "completed", "scheduled"].includes(jobStatus(job.status))) row.sold++;
    row.revenue += Number(job.price || job.amount || job.quote || 0);
  });
  const admin = isAdminish();
  const rows = [...rowsByKey.values()].sort((a,b) => b.revenue - a.revenue).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${money(row.revenue)}</td><td>${row.sold}</td><td>${row.converted}</td><td>${row.total ? Math.round(row.converted / row.total * 100) : 0}%</td>${admin ? `<td>${reps[row.id] ? `<button class="dangerBtn smallBtn deleteRepBtn" data-id="${esc(row.id)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`);
  const html = rows.length ? `<table class="dataTable"><thead><tr><th>Rep</th><th>Revenue</th><th>Sold Jobs</th><th>Leads Converted</th><th>Close Rate</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No leaderboard data yet.</div>`;
  if(table.innerHTML !== html){ table.innerHTML = html; lastLeaderboardSignature = html; }
}

function renderTeam(){
  const table = $("teamTable");
  if(!table) return;
  const rows = Object.entries(reps).filter(([, rep]) => !isBlockedName(rep.name || rep.displayName)).map(([id, rep]) => {
    const revenue = Object.values(leads).filter(lead => validRecord(lead) && (lead.repId === id || sameName(lead.repName, rep.name))).reduce((sum, lead) => sum + Number(lead.quote || lead.amount || lead.price || 0), 0);
    const sold = Object.values(leads).filter(lead => validRecord(lead) && (lead.repId === id || sameName(lead.repName, rep.name)) && lead.status === "sold").length;
    return `<tr><td><strong>${esc(rep.name || "Rep")}</strong><br><span class="muted">${esc(rep.role || "rep")}</span></td><td>${sold}</td><td>${money(revenue)}</td><td>${money(rep.commissionOwed || 0)}</td><td>${esc(rep.assignedNeighborhoodId || "-")}</td><td><button class="dangerBtn smallBtn" onclick="window.removeTeamMember?.('${esc(id)}','${esc(rep.name || "")}')">Remove</button></td></tr>`;
  });
  const html = rows.length ? `<table class="dataTable"><thead><tr><th>Member</th><th>Sales</th><th>Revenue</th><th>Commission</th><th>Assigned</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No team members online yet.</div>`;
  if(table.innerHTML !== html){ table.innerHTML = html; lastTeamSignature = html; }
}

function renderDashboardTotals(){
  const week = weekStart();
  const today = todayStart();
  const sales = [...Object.values(leads), ...Object.values(jobs)].filter(validRecord);
  const weekRevenue = sales.filter(x => dateVal(x.createdAt || x.scheduledAt) >= week).reduce((sum, x) => sum + Number(x.amount || x.quote || x.price || 0), 0);
  const todayRevenue = sales.filter(x => dateVal(x.createdAt || x.completedAt) >= today).reduce((sum, x) => sum + Number(x.amount || x.quote || x.price || 0), 0);
  if($("statTodayRevenue")) $("statTodayRevenue").textContent = money(todayRevenue);
  if($("statWeekRevenue")) $("statWeekRevenue").textContent = money(weekRevenue);
}

function addBoardJob(cleaners, job){
  const cleanerName = String(job.cleanerName || job.cleaner || "").trim();
  if(!cleanerName || shouldHideCleanerName(cleanerName)) return;
  const key = stableKey(cleanerName) || job.cleanerId || cleanerName;
  if(!cleaners.has(key)) cleaners.set(key, { id: job.cleanerId || "", name: cleanerName, claimed: 0, completed: 0, earned: 0, repDocId: findRepDocId(cleanerName, job.cleanerId) });
  const row = cleaners.get(key);
  const status = jobStatus(job.status);
  if(job.claimedAt || job.cleanerId || cleanerName || ["claimed", "in_progress", "completed"].includes(status)) row.claimed++;
  if(status === "completed" || job.completedAt || job.cleanedAt){ row.completed++; row.earned += cleanerPay(job); }
}

function addBoardCustomer(cleaners, customer){
  const cleanerName = String(customer.cleanerName || customer.cleaner || "").trim();
  const pay = cleanerPay(customer);
  if(!pay || !cleanerName || shouldHideCleanerName(cleanerName)) return;
  const key = stableKey(cleanerName) || customer.cleanerId || cleanerName;
  if(!cleaners.has(key)) cleaners.set(key, { id: customer.cleanerId || "", name: cleanerName, claimed: 0, completed: 0, earned: 0, repDocId: findRepDocId(cleanerName, customer.cleanerId) });
  const row = cleaners.get(key);
  row.claimed++;
  row.completed++;
  row.earned += pay;
}

function validRecord(record){ return ![record.repName, record.rep, record.cleanerName, record.cleaner, record.createdBy, record.updatedBy, reps[record.repId]?.name, reps[record.cleanerId]?.name].some(isBlockedName); }
function isBlockedName(name){ const n = normalizeName(name); return n === "laith computer" || n.includes("unassigned") || n.includes("rebira"); }
function shouldHideCleanerName(name){ const n = normalizeName(name); return !n || isBlockedName(name) || n === "laith" || (isAdminish() && n === normalizeName(currentName())); }
function currentName(){ return String(localStorage.getItem("allset_rep_name") || $("nicknameInput")?.value || "Team").trim(); }
function currentRole(){ return localStorage.getItem("allset_rep_role") || $("roleSelect")?.value || "rep"; }
function isAdminish(){ return currentRole() === "admin" || normalizeName(currentName()) === "laith" || sessionStorage.getItem("allset_admin_unlocked") === "1"; }
function normalizeName(name){ return String(name || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function sameName(a,b){ return normalizeName(a) && normalizeName(a) === normalizeName(b); }
function stableKey(name){ const slug = normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); return slug ? `user-${slug}` : ""; }
function findRepDocId(name, id){ if(id && reps[id]) return id; return Object.entries(reps).find(([, rep]) => sameName(rep.name || rep.displayName, name))?.[0] || ""; }
function num(...values){ for(const value of values){ const n = Number(value); if(Number.isFinite(n) && value !== "") return n; } return 0; }
function repPay(job){ return num(job.repPay, job.repCommission, job.commissionAmount, job.repCommissionAmount); }
function cleanerPay(job){ return num(job.payCleanerAmount, job.cleanerPay, job.cleanerAmount, job.payCleaner, job.cleanerPayout); }
function totalLaborCost(job){ return repPay(job) + cleanerPay(job); }
function jobStatus(status){ const s = String(status || "open").toLowerCase().replace(/\s+/g, "_").replace("-", "_"); return s === "scheduled" ? "open" : s; }
function dateVal(value){ if(!value) return 0; if(typeof value === "number") return value; if(value.seconds) return value.seconds * 1000; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; }
function readableDate(value){ const t = dateVal(value); return t ? new Date(t).toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
function todayStart(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function weekStart(){ const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0,0,0,0); return d.getTime(); }
function injectCss(){
  if($("customerMobileLaithFilterCss")) return;
  const style = document.createElement("style");
  style.id = "customerMobileLaithFilterCss";
  style.textContent = `.customerTableShell{position:relative;overflow:hidden}.customerDataScroll{overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;touch-action:pan-x pan-y;padding-left:0}.bookkeepingDrawerToggle{position:absolute;left:0;top:52px;z-index:4;width:40px;height:30px;border-radius:0 8px 8px 0;border:1px solid rgba(255,255,255,.16);border-left:0;background:rgba(255,255,255,.09);color:var(--text);font-size:18px;line-height:1}.bookkeepingDrawer{position:absolute;left:0;top:0;bottom:0;z-index:3;width:min(260px,76vw);transform:translateX(-100%);transition:transform .18s ease;background:rgba(10,16,26,.98);border-right:1px solid rgba(255,255,255,.14);box-shadow:14px 0 34px rgba(0,0,0,.28);padding:12px 12px 12px 54px;overflow:auto}.bookkeepingOpen .bookkeepingDrawer{transform:translateX(0)}.bookkeepingOpen .customerDataScroll{padding-left:min(260px,76vw)}.bookkeepingTitle{font-weight:900;margin-bottom:10px}.bookkeepingItem{display:grid;gap:3px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.1)}.bookkeepingItem span{font-size:12px;color:var(--muted)}@media (max-width:720px){#customersTable.tableCard{overflow:hidden}.customerDataScroll table{min-width:980px}.bookkeepingDrawerToggle{top:48px;width:38px;height:32px}.bookkeepingOpen .customerDataScroll{padding-left:0}.bookkeepingOpen .bookkeepingDrawer{width:min(285px,82vw)}}`;
  document.head.appendChild(style);
}
