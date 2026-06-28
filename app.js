console.log("✅ ALLSET LIVE CRM LOADED");

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, set, onValue, onDisconnect, serverTimestamp as rtServerTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";



// Consolidated from map-bridge.js.
(function(){
  if(!window.L || !L.Map || L.Map.__allsetBridge) return;
  const originalAddLayer = L.Map.prototype.addLayer;
  L.Map.prototype.addLayer = function(layer){
    window.allsetMap = this;
    if(layer && typeof layer.eachLayer === "function" && !layer.getTileUrl){
      window.allsetFeatureGroups = window.allsetFeatureGroups || [];
      if(!window.allsetFeatureGroups.includes(layer)) window.allsetFeatureGroups.push(layer);
    }
    return originalAddLayer.call(this, layer);
  };
  L.Map.__allsetBridge = true;
})();

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

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const rtdb = getDatabase(fbApp);

const LS_NAME = "allset_rep_name";
const LS_ROLE = "allset_rep_role";
const LS_THEME = "allset_crm_theme";
const TERRITORY_COLORS = { red:"#ef4444", green:"#22c55e", blue:"#38bdf8", orange:"#f59e0b" };
const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const $ = (id) => document.getElementById(id);
const gate = $("gate"), appRoot = $("app"), nicknameInput = $("nicknameInput"), roleSelect = $("roleSelect"), enterBtn = $("enterBtn");
const repNameEl = $("repName"), roleNameEl = $("roleName"), assignedTextEl = $("assignedText"), onlineListEl = $("onlineList");
const nav = $("nav"), mobileNavBtn = $("mobileNavBtn"), globalSearch = $("globalSearch"), globalSearchBtn = $("globalSearchBtn");
const toastEl = $("toast"), modalBackdrop = $("modalBackdrop"), modalCard = $("modalCard");

let map, drawControl, neighborhoodLayer, dotLayer;
let addDotMode = false, drawEnabled = false, gpsOn = false, gpsWatchId = null, gpsMarker = null, gpsCircle = null;
let currentUid = null, currentName = null, currentRole = "rep", assignedNbId = null, lastFoundMarker = null, subscribed = false;
const markerById = new Map(), nbLayerById = new Map();
let dotsCache = {}, neighborhoodsCache = {}, repsCache = {}, logCache = [];
let leadsCache = {}, jobsCache = {}, customersCache = {}, paymentsCache = {}, equipmentCache = {}, schedulesCache = {}, settingsCache = {}, reviewCache = {};

boot();

async function boot(){
  initStaticEvents();
  initScheduleEditor();
  initMap();
  applyTheme(localStorage.getItem(LS_THEME) || "dark");
  const savedName = localStorage.getItem(LS_NAME);
  let savedRole = localStorage.getItem(LS_ROLE) || "rep";
  
  if(savedName) {
    nicknameInput.value = savedName;
    if(savedName.toLowerCase() === "laith") {
      savedRole = "admin";
    }
  }
  roleSelect.value = savedRole;
  lockApp(true);
  signInAnonymously(auth).catch(err => console.warn("Firebase auth:", err.message));
  onAuthStateChanged(auth, async user => {
    if(user){
      currentUid = user.uid;
      if(savedName){
        currentName = savedName;
        currentRole = savedName.toLowerCase() === "laith" ? "admin" : savedRole;
        completeLogin();
        try{
          await setDoc(doc(db,"reps",currentUid),{uid:currentUid,name:currentName,role:currentRole,updatedAt:serverTimestamp()},{merge:true});
          setupPresence();
          subscribeAll();
        }catch(e){ console.warn("Firebase sync failed (non-blocking):", e.message); }
      } else {
        showGate();
      }
    }
  });
}

function initStaticEvents(){
  if (enterBtn) enterBtn.addEventListener("click", handleEnter);
  if (nicknameInput) nicknameInput.addEventListener("keydown", e => { if(e.key === "Enter") enterBtn.click(); });
  if ($("changeNameBtn")) $("changeNameBtn").addEventListener("click", showGate);
  if (mobileNavBtn) mobileNavBtn.addEventListener("click", () => nav.classList.toggle("open"));
  placeTopMenuButton();
  simplifyMapControls();
  
  document.querySelectorAll(".navBtn").forEach(btn => btn.addEventListener("click", () => {
    if(btn.dataset.locked && currentRole !== "admin"){
      const code = prompt("Enter access code:");
      if(code !== "2122"){ toast("Wrong code"); return; }
      btn.dataset.locked = "";
      btn.classList.remove("navBtn--locked");
      btn.textContent = btn.textContent.replace("🔒 ","");
    }
    showPage(btn.dataset.page);
  }));
  document.querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", () => openEntityModal(btn.dataset.open)));
  
  if ($("quickLeadBtn")) $("quickLeadBtn").addEventListener("click", () => openEntityModal("leadModal"));
  if ($("undoDeleteBtn")) $("undoDeleteBtn").addEventListener("click", undoLastDelete);
  if ($("saveScheduleBtn")) $("saveScheduleBtn").addEventListener("click", saveMySchedule);
  if ($("deleteScheduleBtn")) $("deleteScheduleBtn").addEventListener("click", deleteMySchedule);
  if ($("themeToggle")) $("themeToggle").addEventListener("change", toggleTheme);
  if ($("assignAreaBtn")) $("assignAreaBtn").addEventListener("click", assignAreaToRep);
  if ($("saveSettingsBtn")) $("saveSettingsBtn").addEventListener("click", saveSettings);
  if ($("resetMyProfileBtn")) $("resetMyProfileBtn").addEventListener("click", async () => { localStorage.removeItem(LS_NAME); localStorage.removeItem(LS_ROLE); if(currentUid) await deleteDoc(doc(db,"reps",currentUid)); location.reload(); });
  
  if (globalSearchBtn) globalSearchBtn.addEventListener("click", runGlobalSearch);
  if (globalSearch) globalSearch.addEventListener("keydown", e => { if(e.key === "Enter") runGlobalSearch(); });
  if (modalBackdrop) modalBackdrop.addEventListener("click", e => { if(e.target === modalBackdrop) closeModal(); });
  
  initReviewEvents();

  if ($("gpsBtn")) $("gpsBtn").addEventListener("click", () => clickMapTool("gps", () => gpsOn ? stopGps() : startGps()));
  if ($("addDotBtn")) $("addDotBtn").addEventListener("click", () => clickMapTool("add", toggleAddDot));
  if ($("deleteDotBtn")) $("deleteDotBtn").addEventListener("click", () => clickMapTool("delete", () => toast("Trash mode: tap an unwanted house dot")));
  if ($("drawBtn")) $("drawBtn").addEventListener("click", toggleDraw);
  if ($("searchBtn")) $("searchBtn").addEventListener("click", doSearch);
  if ($("clearSearchBtn")) $("clearSearchBtn").addEventListener("click", clearSearch);
  if ($("searchInput")) $("searchInput").addEventListener("keydown", e => { if(e.key === "Enter") doSearch(); });
  if ($("clearLogBtn")) $("clearLogBtn").addEventListener("click", () => { if(currentRole !== "admin"){ toast("Only admins can clear the log"); return; } clearRemoteLog(); });
}

function placeTopMenuButton(){
  if(!mobileNavBtn || !globalSearchBtn) return;
  mobileNavBtn.setAttribute("aria-expanded","false");
  globalSearchBtn.insertAdjacentElement("afterend", mobileNavBtn);
}

function simplifyMapControls(){
  const add = $("addDotBtn"), gps = $("gpsBtn");
  if(add) add.textContent = "House";
  if(gps) gps.textContent = "Pin Current Location";
  ["drawBtn","assignAreaBtn","undoDrawBtn","clearTerritoriesBtn"].forEach(id => $(id)?.classList.add("hidden"));
}

function clickMapTool(tool, fallback){
  const button = document.querySelector(`[data-map-tool="${tool}"]`);
  if(button){ button.click(); return; }
  fallback?.();
}

async function handleEnter(){
  const name = nicknameInput.value.trim();
  if(!name){ toast("Enter your nickname first"); nicknameInput.focus(); return; }
  let chosenRole = roleSelect.value || "rep";
  
  if(name.toLowerCase() === "laith") {
    chosenRole = "admin";
  }
  
  currentName = name;
  currentRole = chosenRole;
  localStorage.setItem(LS_NAME, name);
  localStorage.setItem(LS_ROLE, currentRole);
  
  completeLogin();
  
  try{
    if(!currentUid){
      const cred = await signInAnonymously(auth);
      currentUid = cred.user.uid;
    }
    await setDoc(doc(db,"reps",currentUid),{uid:currentUid,name,role:currentRole,updatedAt:serverTimestamp()},{merge:true});
    setupPresence();
    subscribeAll();
  }catch(e){ console.warn("Firebase sync failed (non-blocking):", e.message); }
}

function completeLogin(){
  if (gate) gate.style.display = "none"; 
  if (appRoot) appRoot.classList.remove("app--locked");
  if (repNameEl) repNameEl.textContent = currentName; 
  if (roleNameEl) roleNameEl.textContent = currentRole;
  if (nicknameInput) nicknameInput.value = currentName; 
  if (roleSelect) roleSelect.value = currentRole; 
  setTimeout(()=>map?.invalidateSize?.(),250); 
  toast(`Welcome, ${currentName} 👋`);
}

function showGate(){ if(gate) gate.style.display="grid"; if(appRoot) appRoot.classList.add("app--locked"); setTimeout(()=>nicknameInput.focus(),60); }
function lockApp(focus=false){ if(gate) gate.style.display="grid"; if(appRoot) appRoot.classList.add("app--locked"); if(focus) setTimeout(()=>nicknameInput.focus(),60); }

function showPage(page){
  document.querySelectorAll(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const targetPage = $(`page-${page}`);
  if (targetPage) targetPage.classList.add("active"); 
  if (nav) nav.classList.remove("open");
  if(page === "map") setTimeout(()=>map.invalidateSize(),250);
}

function setupPresence(){
  const presenceRef = ref(rtdb,`presence/${currentUid}`), connRef = ref(rtdb,".info/connected");
  onValue(connRef, snap => { if(!snap.val()) return; onDisconnect(presenceRef).remove(); set(presenceRef,{name:currentName,role:currentRole,uid:currentUid,online:true,lastSeen:rtServerTimestamp()}); });
  onValue(ref(rtdb,"presence"), snap => renderOnline(snap.val() || {}));
}

function renderOnline(data){
  if (!onlineListEl) return;
  onlineListEl.innerHTML = ""; const users = Object.values(data);
  if(!users.length) onlineListEl.innerHTML = `<div class="listItem">No one online yet</div>`;
  users.forEach(u => { const div=document.createElement("div"); div.className="listItem"; div.textContent=`🟢 ${u.name}${u.uid===currentUid?" (you)":""}`; onlineListEl.appendChild(div); });
}

function subscribeAll(){ if(subscribed) return; subscribed=true;
  onSnapshot(collection(db,"dots"), snap => { dotsCache={}; snap.forEach(d=>dotsCache[d.id]=d.data()); syncDotMarkers(); renderCounts(); renderAll(); });
  onSnapshot(collection(db,"neighborhoods"), snap => { neighborhoodsCache={}; snap.forEach(d=>neighborhoodsCache[d.id]=d.data()); syncNeighborhoodLayers(); refreshAssignedText(); });
  onSnapshot(collection(db,"reps"), snap => { repsCache={}; snap.forEach(d=>repsCache[d.id]=d.data()); const mine=repsCache[currentUid]; assignedNbId=mine?.assignedNeighborhoodId||null; refreshAssignedText(); renderAll(); });
  onSnapshot(doc(db,"shared","activityLog"), snap => { logCache=snap.exists()?(snap.data().entries||[]):[]; renderLog(); });
  onSnapshot(collection(db,"leads"), snap => { leadsCache={}; snap.forEach(d=>leadsCache[d.id]=d.data()); renderAll(); });
  onSnapshot(collection(db,"jobs"), snap => { jobsCache={}; snap.forEach(d=>jobsCache[d.id]=d.data()); renderAll(); });
  onSnapshot(collection(db,"customers"), snap => { customersCache={}; snap.forEach(d=>customersCache[d.id]=d.data()); renderAll(); });
  onSnapshot(collection(db,"payments"), snap => { paymentsCache={}; snap.forEach(d=>paymentsCache[d.id]=d.data()); renderAll(); });
  onSnapshot(collection(db,"equipment"), snap => { equipmentCache={}; snap.forEach(d=>equipmentCache[d.id]=d.data()); renderAll(); });
  onSnapshot(collection(db,"schedules"), snap => { schedulesCache={}; snap.forEach(d=>schedulesCache[d.id]=d.data()); renderSchedules(); });
  onSnapshot(doc(db,"shared","settings"), snap => { settingsCache=snap.exists()?snap.data():{}; applySettings(); renderDashboard(); });
  onSnapshot(doc(db,"shared","monthlyIncomeReview"), snap => { reviewCache=snap.exists()?snap.data():defaultReview(); fillReviewInputs(); });
}

function renderAll(){ renderDashboard(); renderLeads(); renderJobs(); renderCustomers(); renderTeam(); renderPayments(); renderEquipment(); }
function money(n){ return "$" + Number(n||0).toLocaleString(); }
function todayStart(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function weekStart(){ const d=new Date(); const day=d.getDay()||7; d.setDate(d.getDate()-day+1); d.setHours(0,0,0,0); return d.getTime(); }
function dateVal(v){ if(!v) return 0; if(typeof v === "number") return v; if(v.seconds) return v.seconds*1000; const t = new Date(v).getTime(); return Number.isFinite(t)?t:0; }
function leadRepName(x){ return x.repName || repsCache[x.repId]?.name || x.createdBy || "—"; }
function formatScheduledDisplay(v){
  if(!v) return "";
  const s=String(v);
  const m=s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if(!m) return s;
  const [_,date,hh,mm]=m;
  const h=Number(hh);
  const ap=h<12?"AM":"PM";
  const h12=h===0?12:h>12?h-12:h;
  return `${date} ${h12}:${mm} ${ap}`;
}

function renderDashboard(){
  const jobs = Object.values(jobsCache);
  const ws = weekStart();
  const completedJobs = jobs.filter(isCompletedJob);
  const weeklyJobs = completedJobs.filter(job => completedDate(job) >= ws);
  const weekRevenue = weeklyJobs.reduce((s,job)=>s+jobRevenue(job),0);
  const totalRevenue = completedJobs.reduce((s,job)=>s+jobRevenue(job),0);
  const latestWeek = latestRevenueJob(weeklyJobs);
  const latestTotal = latestRevenueJob(completedJobs);

  if ($("statWeekRevenue")) $("statWeekRevenue").textContent = money(weekRevenue);
  if ($("statTotalRevenue")) $("statTotalRevenue").textContent = money(totalRevenue);
  if ($("statWeekRevenueDetail")) $("statWeekRevenueDetail").textContent = latestWeek ? `${money(jobRevenue(latestWeek))} from ${latestJobName(latestWeek)}` : "Completed jobs since Monday";
  if ($("statTotalRevenueDetail")) $("statTotalRevenueDetail").textContent = latestTotal ? `${money(jobRevenue(latestTotal))} from ${latestJobName(latestTotal)}` : "Completed jobs only";
  renderGoalGauge(weekRevenue);
  
  const repRevenue = {};
  weeklyJobs.forEach(j=>{ const n=j.repName||repsCache[j.repId]?.name||"House"; repRevenue[n]=(repRevenue[n]||0)+jobRevenue(j); });
  const leaders = Object.entries(repRevenue).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const podium = $("podium");
  if(!podium) return;
  if(!leaders.length){ podium.innerHTML = `<div class="podiumCard second"><div class="rank">🥈</div><div class="podiumName">No data</div><div class="podiumMoney">$0</div></div><div class="podiumCard first"><div class="rank">🥇</div><div class="podiumName">Start selling</div><div class="podiumMoney">$0</div><div class="podiumSub">this week</div></div><div class="podiumCard third"><div class="rank">🥉</div><div class="podiumName">No data</div><div class="podiumMoney">$0</div></div>`; return; }
  const cards = [leaders[1],leaders[0],leaders[2]];
  const cls = ["second","first","third"], emoji=["🥈","🥇","🥉"];
  podium.innerHTML = cards.map((x,i)=> x ? `<div class="podiumCard ${cls[i]}"><div class="rank">${emoji[i]}</div><div class="podiumName">${esc(x[0])}</div><div class="podiumMoney">${money(x[1])}</div><div class="podiumSub">completed job revenue</div></div>` : `<div class="podiumCard ${cls[i]}"><div class="rank">${emoji[i]}</div><div class="podiumName">Open spot</div><div class="podiumMoney">$0</div></div>`).join("");
}

function isCompletedJob(job){ return String(job.status || "").toLowerCase().replace(/\s+/g,"_") === "completed" || !!(job.completedAt || job.cleanedAt || job.lastCleanedAt); }
function completedDate(job){ return dateVal(job.completedAt || job.cleanedAt || job.lastCleanedAt || job.jobDate || job.updatedAt || job.createdAt); }
function jobRevenue(job){ return Number(job.price || job.amount || job.quote || job.lifetimeRevenue || 0); }
function latestRevenueJob(list){ return [...list].sort((a,b)=>completedDate(b)-completedDate(a))[0] || null; }
function latestJobName(job){ return job.customer || job.name || job.title || job.address || job.jobId || job.id || "job"; }

function exportCSV(filename, headers, rows){
  const escape = v => `"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map(r=>r.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], {type:"text/csv"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function addExportBtn(tableId, fn){
  const el=$(tableId); if(!el) return;
  const existing = el.querySelector(".exportCsvBtn"); if(existing) existing.remove();
  const btn = document.createElement("button"); btn.className="ghostBtn smallBtn exportCsvBtn"; btn.textContent="⬇ Export CSV"; btn.style.cssText="margin:10px 12px;display:block"; btn.onclick=fn; el.appendChild(btn);
}

window.jobToCustomer = async (jobId) => {
  const j = jobsCache[jobId]; if(!j) return;
  const name = j.customer || j.title || "";
  const existing = Object.values(customersCache).find(c=>c.name&&name&&c.name.toLowerCase()===name.toLowerCase());
  if(existing){
    const newRev = Number(existing.lifetimeRevenue||0) + Number(j.price||0);
    await setDoc(doc(db,"customers",existing.id),{lifetimeRevenue:newRev,phone:existing.phone||j.phone||"",address:existing.address||j.address||"",updatedAt:Date.now(),updatedBy:currentName},{merge:true});
    await setDoc(doc(db,"jobs",jobId),{status:"completed",convertedCustomerId:existing.id,updatedAt:Date.now(),updatedBy:currentName},{merge:true});
    await addRemoteLog(`🔄 ${currentName} updated customer ${name} (+${money(j.price)})`);
    toast(`Updated ${name} lifetime revenue`);
  } else {
    const id=`cust-${Date.now()}`;
    await setDoc(doc(db,"customers",id),{id,name,phone:j.phone||"",address:j.address||"",service:j.title||"Window Cleaning",lifetimeRevenue:Number(j.price||0),notes:j.notes||"",sourceJobId:jobId,createdAt:Date.now(),createdBy:currentName});
    await setDoc(doc(db,"jobs",jobId),{status:"completed",convertedCustomerId:id,updatedAt:Date.now(),updatedBy:currentName},{merge:true});
    await addRemoteLog(`➕ ${currentName} created customer ${name} from job`);
    toast(`Customer ${name} created`);
  }
};

function renderTable(elId, headers, rows, empty) {
  const el=$(elId); if(!el) return;
  if(!rows.length){ el.innerHTML=`<div class="card">${empty}</div>`; return; }
  el.innerHTML = `<table class="dataTable"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderLeads(){
  const data = Object.values(leadsCache).sort((a,b)=>dateVal(b.createdAt)-dateVal(a.createdAt));
  const rows = data.map(l=>`<tr><td><strong>${esc(l.name||"Unknown")}</strong><br><span class="muted">${esc(l.address||"")}</span></td><td>${esc(l.phone||"—")}</td><td>${esc(l.service||"Windows")}</td><td>${money(l.quote||l.amount)}</td><td><span class="status ${esc(l.status||"")}">${esc(l.status||"lead")}</span></td><td>${esc(leadRepName(l))}</td><td><button class="ghostBtn smallBtn" onclick="window.crmEdit('lead','${l.id}')">Edit</button><button class="actionBtn smallBtn" style="margin-left:6px" onclick="window.leadToJob('${l.id}')">→ Job</button></td></tr>`);
  renderTable("leadsTable",["Lead","Phone","Service","Quote","Status","Rep",""],rows,"No leads yet. Add one or convert map dots into leads.");
  if(data.length) addExportBtn("leadsTable", ()=>exportCSV("leads.csv",["Name","Phone","Address","Service","Quote","Status","Rep"],data.map(l=>[l.name||"",l.phone||"",l.address||"",l.service||"",l.quote||l.amount||"",l.status||"",leadRepName(l)])));
}

window.leadToJob = async (leadId) => {
  const l = leadsCache[leadId];
  if(!l) return toast("Lead not found");
  const id = `jobs-${Date.now()}`;
  const job = {
    id,
    leadId,
    title: l.service || "Window Cleaning",
    customer: l.name || "",
    address: l.address || "",
    phone: l.phone || "",
    scheduledAt: "",
    cleaner: "",
    price: Number(l.quote || l.amount || 0),
    status: "scheduled",
    notes: l.notes || "",
    repName: l.repName || currentName,
    repId: l.repId || currentUid,
    createdAt: Date.now(),
    createdBy: currentName
  };
  await setDoc(doc(db,"jobs",id),job,{merge:true});
  await setDoc(doc(db,"leads",leadId),{status:"converted",convertedJobId:id,updatedAt:Date.now(),updatedBy:currentName},{merge:true});
  await addRemoteLog(`➡️ ${currentName} converted lead to job: ${l.name || l.address || leadId}`);
  toast("Lead converted to job");
  showPage("jobs");
};

function renderJobs(){
  const data = Object.values(jobsCache).sort((a,b)=>dateVal(a.scheduledAt)-dateVal(b.scheduledAt));
  const rows = data.map(j=>`<tr><td><strong>${esc(j.title||j.customer||"Job")}</strong><br><span class="muted">${esc(j.address||"")}</span></td><td>${esc(j.phone||"—")}</td><td>${esc(formatScheduledDisplay(j.scheduledAt)||"—")}</td><td>${esc(j.cleaner||"—")}</td><td>${money(j.price)}</td><td><span class="status ${esc(j.status||"")}">${esc(j.status||"scheduled")}</span></td><td><button class="ghostBtn smallBtn" onclick="window.crmEdit('job','${j.id}')">Edit</button><button class="ghostBtn smallBtn" style="margin-left:6px" onclick="window.jobToCustomer('${j.id}')">→ Customer</button></td></tr>`);
  renderTable("jobsTable",["Job","Phone","Scheduled","Cleaner","Price","Status",""] ,rows,"No jobs scheduled yet.");
  if(data.length) addExportBtn("jobsTable", ()=>exportCSV("jobs.csv",["Title","Customer","Phone","Address","Scheduled","Cleaner","Price","Status"],data.map(j=>[j.title||j.customer||"",j.customer||"",j.phone||"",j.address||"",j.scheduledAt||"",j.cleaner||"",j.price||"",j.status||""])));
}

function renderCustomers(){
  const data = Object.values(customersCache);
  const rows = data.map(c=>`<tr><td><strong>${esc(c.name||"Customer")}</strong><br><span class="muted">${esc(c.address||"")}</span></td><td>${esc(c.phone||"—")}</td><td>${esc(c.service||"—")}</td><td>${money(c.lifetimeRevenue)}</td><td><button class="ghostBtn smallBtn" onclick="window.crmEdit('customer','${c.id}')">Edit</button></td></tr>`);
  renderTable("customersTable",["Customer","Phone","Service","Lifetime",""] ,rows,"No customers yet.");
  if(data.length) addExportBtn("customersTable", ()=>exportCSV("customers.csv",["Name","Phone","Address","Service","Lifetime Revenue"],data.map(c=>[c.name||"",c.phone||"",c.address||"",c.service||"",c.lifetimeRevenue||""])));
}

function renderTeam(){
  const rows = Object.entries(repsCache).map(([id,r])=>{ const completedJobs=Object.values(jobsCache).filter(j=>isCompletedJob(j)&&(j.repId===id||j.repName===r.name||j.cleanerId===id||j.cleanerName===r.name||j.cleaner===r.name)); const revenue=completedJobs.reduce((s,j)=>s+jobRevenue(j),0); const earned=r.amountEarned ?? r.earnedOverride ?? ""; return `<tr><td><strong>${esc(r.name||"Rep")}</strong><br><span class="muted">${esc(r.role||"rep")}</span></td><td>${completedJobs.length}</td><td>${money(revenue)}</td><td>${money(r.commissionOwed||0)}</td><td>${earned === "" ? "—" : money(earned)}</td><td><button class="ghostBtn smallBtn" onclick="window.crmEdit('team','${id}')">Edit</button><button class="dangerBtn smallBtn" style="margin-left:6px" onclick="window.removeTeamMember('${id}','${esc(r.name||"")}')">Remove</button></td></tr>`; });
  renderTable("teamTable",["Member","Completed Jobs","Job Revenue","Commission","Amount Earned",""],rows,"No team members online yet.");
}
window.removeTeamMember = async (id, name) => {
  if(!confirm(`Remove ${name} from the team?`)) return;
  await deleteDoc(doc(db,"reps",id));
  await addRemoteLog(`🗑 ${currentName} removed team member ${name}`);
  toast(`${name} removed`);
};

function renderPayments(){
  const rows = Object.values(paymentsCache).sort((a,b)=>dateVal(b.createdAt)-dateVal(a.createdAt)).map(p=>`<tr><td><strong>${esc(p.customer||"Payment")}</strong><br><span class="muted">${esc(p.note||"")}</span></td><td>${money(p.amount)}</td><td>${esc(p.method||"—")}</td><td><span class="status ${esc(p.status||"unpaid")}">${esc(p.status||"unpaid")}</span></td><td><button class="ghostBtn smallBtn" onclick="window.crmEdit('payment','${p.id}')">Edit</button></td></tr>`);
  renderTable("paymentsTable",["Customer","Amount","Method","Status",""] ,rows,"No payments tracked yet.");
}

function renderEquipment(){
  const rows = Object.values(equipmentCache).map(e=>`<tr><td><strong>${esc(e.name||"Equipment")}</strong><br><span class="muted">${esc(e.tracker||"")}</span></td><td>${esc(e.status||"available")}</td><td>${esc(e.holder||"—")}</td><td>${esc(e.location||settingsCache.locker||"—")}</td><td><button class="ghostBtn smallBtn" onclick="window.crmEdit('equipment','${e.id}')">Edit</button></td></tr>`);
  renderTable("equipmentTable",["Item","Status","Holder","Location",""] ,rows,"No equipment added yet.");
}

function timeOpts(sel){
  const opts=[];
  for(let h=6;h<=22;h++){
    const ap=h<12?"AM":h===12?"PM":"PM";
    const h12=h===0?12:h>12?h-12:h;
    const v0=String(h).padStart(2,"0")+":00";
    const v30=String(h).padStart(2,"0")+":30";
    opts.push(`<option value="${v0}"${sel===v0?" selected":""}>${h12}:00 ${ap}</option>`);
    if(h<22) opts.push(`<option value="${v30}"${sel===v30?" selected":""}>${h12}:30 ${ap}</option>`);
  }
  return opts.join("");
}
function initScheduleEditor(){
  const wrap = $("mySchedule"); if(!wrap) return;
  wrap.innerHTML = days.map(d=>`<div class="dayRow" data-day="${d}"><label class="checkWrap"><input type="checkbox" class="schedAvail" checked /> ${d}</label><label>Start<select class="schedStart">${timeOpts("09:00")}</select></label><label>End<select class="schedEnd">${timeOpts("17:00")}</select></label><label>Busy?<select class="schedBusy"><option value="free">Free</option><option value="busy">Busy</option></select></label></div>`).join("");
}

async function saveMySchedule(){
  const availability = {};
  document.querySelectorAll(".dayRow").forEach(row => availability[row.dataset.day] = {available:row.querySelector(".schedAvail").checked,start:row.querySelector(".schedStart").value,end:row.querySelector(".schedEnd").value,status:row.querySelector(".schedBusy").value});
  if(currentUid) await setDoc(doc(db,"schedules",currentUid),{uid:currentUid,name:currentName,role:currentRole,availability,updatedAt:serverTimestamp()},{merge:true});
  await addRemoteLog(`📅 ${currentName} updated schedule`); toast("Schedule saved live");
}

async function deleteMySchedule(){
  if(!currentUid) return;
  if(!confirm("Delete your submitted schedule?")) return;
  await deleteDoc(doc(db,"schedules",currentUid));
  await addRemoteLog(`🗑 ${currentName} deleted their schedule`);
  toast("Schedule deleted");
}

function renderSchedules(){
  const mine = schedulesCache[currentUid]?.availability;
  if(mine) document.querySelectorAll(".dayRow").forEach(row=>{ const x=mine[row.dataset.day]; if(!x) return; row.querySelector(".schedAvail").checked=!!x.available; row.querySelector(".schedStart").value=x.start||"09:00"; row.querySelector(".schedEnd").value=x.end||"18:00"; row.querySelector(".schedBusy").value=x.status||"free"; });
  const board=$("teamSchedule"); if(!board) return;
  const schedules = Object.values(schedulesCache);
  board.innerHTML = schedules.length ? schedules.map(s=>`<div class="scheduleUser"><strong>${esc(s.name||"Rep")}</strong><div class="muted">${esc(s.role||"rep")}</div>${days.map(d=>{const x=s.availability?.[d]; const fmt=t=>{if(!t)return"";const[hh,mm]=t.split(":").map(Number);const ap=hh<12?"AM":"PM";const h12=hh===0?12:hh>12?hh-12:hh;return `${h12}:${String(mm).padStart(2,"0")} ${ap}`;};return `<div class="row"><span class="label">${d}</span><span class="value">${x?.available?`${fmt(x.start)}-${fmt(x.end)}`:"Busy"}</span></div>`}).join("")}</div>`).join("") : `<div class="card noMargin">No schedules saved yet.</div>`;
}

function applySettings(){
  if($("cashAppTag")) $("cashAppTag").textContent = settingsCache.cashApp || "$AllSet"; 
  if($("venmoTag")) $("venmoTag").textContent = settingsCache.venmo || "@AllSet"; 
  if($("zelleTag")) $("zelleTag").textContent = settingsCache.zelle || "allset@example.com";
  if($("cashAppLink")) $("cashAppLink").href = `https://cash.app/${String(settingsCache.cashApp||"$AllSet").replace("$","")}`; 
  if($("venmoLink")) $("venmoLink").href = `https://venmo.com/${String(settingsCache.venmo||"@AllSet").replace("@","")}`;
  if($("setCashApp")) $("setCashApp").value = settingsCache.cashApp || ""; 
  if($("setVenmo")) $("setVenmo").value = settingsCache.venmo || ""; 
  if($("setZelle")) $("setZelle").value = settingsCache.zelle || ""; 
  if($("setLocker")) $("setLocker").value = settingsCache.locker || ""; 
  if($("setDoorCode")) $("setDoorCode").value = settingsCache.doorCode || ""; 
  if($("setTrackerNote")) $("setTrackerNote").value = settingsCache.trackerNote || "";
  if($("setWeeklyGoal")) $("setWeeklyGoal").value = settingsCache.weeklyGoal || "";
}

async function saveSettings(){
  await setDoc(doc(db,"shared","settings"),{cashApp:$("setCashApp").value,venmo:$("setVenmo").value,zelle:$("setZelle").value,locker:$("setLocker").value,doorCode:$("setDoorCode").value,trackerNote:$("setTrackerNote").value,weeklyGoal:$("setWeeklyGoal")?.value || "",updatedAt:serverTimestamp(),updatedBy:currentName},{merge:true});
  await addRemoteLog(`⚙️ ${currentName} updated admin settings`); toast("Settings saved live");
}

function initMap(){
  const mapContainer = $("map"); if(!mapContainer) return;
  map = L.map("map",{zoomControl:true}).setView([41.6611,-91.5302],12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap &copy; CARTO"}).addTo(map);
  neighborhoodLayer = new L.FeatureGroup(); dotLayer = new L.FeatureGroup(); map.addLayer(neighborhoodLayer); map.addLayer(dotLayer);
  map.on("click", async e => { if(!addDotMode) return; const id=`dot-${Date.now()}`; const dot={id,lat:e.latlng.lat,lng:e.latlng.lng,label:"",status:"none",createdBy:currentName,createdByUid:currentUid,createdAt:Date.now()}; await setDoc(doc(db,"dots",id),dot); await addRemoteLog(`➕ ${currentName} placed a dot`); toast("Dot placed — tap it to edit"); });
  drawControl = new L.Control.Draw({draw:{polygon:true,rectangle:true,circle:false,circlemarker:false,marker:false,polyline:false},edit:{featureGroup:neighborhoodLayer}});
  map.on(L.Draw.Event.CREATED, async event => {
    const layer=event.layer;
    const name=prompt("Territory name?","Neighborhood")?.trim()||"Neighborhood";
    const chosen=$("territoryColorSelect")?.value || "blue";
    const color=TERRITORY_COLORS[chosen] || TERRITORY_COLORS.blue;
    const id=`nb-${Date.now()}`;
    layer._nbId=id;
    layer.setStyle?.({color,weight:3,fillColor:color,fillOpacity:.12,interactive:false});
    neighborhoodLayer.addLayer(layer);
    await setDoc(doc(db,"neighborhoods",id),{id,name,color,colorName:chosen,assignedRepId:"",assignedRepName:"",geojson:layer.toGeoJSON(),createdBy:currentName,createdAt:Date.now()});
    await addRemoteLog(`🗺️ ${currentName} created territory: ${name}`);
    toast(`Territory saved: ${name}`);
  });
  map.on(L.Draw.Event.EDITED, async event => { const batch=writeBatch(db); event.layers.eachLayer(layer=>{const id=layer._nbId;if(id) batch.set(doc(db,"neighborhoods",id),{geojson:layer.toGeoJSON()},{merge:true});}); await batch.commit(); await addRemoteLog(`✏️ ${currentName} edited territories`); });
  map.on(L.Draw.Event.DELETED, async event => { const batch=writeBatch(db); event.layers.eachLayer(layer=>{const id=layer._nbId;if(id) batch.delete(doc(db,"neighborhoods",id));}); await batch.commit(); await addRemoteLog(`🗑 ${currentName} deleted a territory`); });
}

function syncDotMarkers(){
  if(!dotLayer) return;
  const ids=new Set(Object.keys(dotsCache)); for(const [id,marker] of markerById.entries()){ if(!ids.has(id)){dotLayer.removeLayer(marker);markerById.delete(id);} }
  Object.values(dotsCache).forEach(dot=>{ if(markerById.has(dot.id)){const m=markerById.get(dot.id);m.setStyle(dotStyle(dot.status));m.unbindTooltip();if(dot.label)m.bindTooltip(dot.label,{direction:"top",offset:[0,-6]});} else addDotMarker(dot); });
}

function addDotMarker(dot){ const marker=L.circleMarker([dot.lat,dot.lng],dotStyle(dot.status)).addTo(dotLayer); markerById.set(dot.id,marker); if(dot.label) marker.bindTooltip(dot.label,{direction:"top",offset:[0,-6]}); marker.on("click",()=>openDotPopup(dot.id,marker)); return marker; }

function openDotPopup(dotId, marker){
  const dot=dotsCache[dotId]; if(!dot) return;
  const linkedLead = Object.values(leadsCache).find(l => l.dotId === dotId);
  const openLeadBtn = linkedLead
    ? `<button class="popBtn" data-s="openlead" type="button">📋 Open Linked Lead</button>`
    : `<button class="popBtn popBtn--disabled" disabled type="button">📋 No Lead Yet</button>`;
  const html=`<div style="min-width:250px"><div style="font-weight:950;margin-bottom:6px">House Dot</div><input id="lbl_${dotId}" value="${esc(dot.label||"")}" placeholder="214 Oak / Smith" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,.15);margin-bottom:10px"/><textarea id="note_${dotId}" placeholder="Dot notes / lead address" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,.15);margin-bottom:10px;min-height:70px;">${esc(dot.notes||"")}</textarea><div style="font-size:12px;opacity:.75;margin-bottom:10px">Status: <b>${statusLabel(dot.status)}</b></div><div style="display:grid;gap:7px">${popupBtn("yes","✅ Yes / Closed")}${popupBtn("no","❌ No")}${popupBtn("nothome","🏃 Not Home")}${popupBtn("callback","📞 Callback")}${popupBtn("convert","💼 Convert to Lead")}${openLeadBtn}${popupBtn("none","↩ Reset","ghost")}${popupBtn("delete","🗑 Remove Dot","danger")}</div></div>`;
  marker.bindPopup(L.popup({closeButton:true,autoPan:true}).setContent(html)).openPopup();
  setTimeout(()=>{ 
    const root=document.querySelector(".leaflet-popup-content"); if(!root) return; 
    const input=root.querySelector(`#lbl_${CSS.escape(dotId)}`); 
    const noteInput=root.querySelector(`#note_${CSS.escape(dotId)}`);
    root.querySelectorAll("button[data-s]").forEach(btn=>btn.addEventListener("click",async ev=>{
      ev.preventDefault();ev.stopPropagation();
      const s=btn.dataset.s;
      const label=(input?.value||"").trim();
      const notes=(noteInput?.value||"").trim();
      if(s==="delete"){await deleteDoc(doc(db,"dots",dotId));map.closePopup();await addRemoteLog(`🗑 ${currentName} removed a dot`);return;}
      if(s==="openlead"){
        if(linkedLead){ map.closePopup(); openRecordModal({title:"Lead",coll:"leads",fields:["name","phone","address","service","quote","status","notes"],selects:{status:["lead","quote","sold","converted","no","callback"]}}, linkedLead, linkedLead.id); }
        return;
      }
      if(s==="convert"){
        await setDoc(doc(db,"dots",dotId),{...dot,label,notes,updatedAt:Date.now(),updatedBy:currentName},{merge:true});
        map.closePopup();
        openEntityModal("leadModal",{address:label,notes:notes || label,status:"lead",dotId,repName:currentName,repId:currentUid});
        return;
      }
      await setDoc(doc(db,"dots",dotId),{...dot,label,notes,status:s,updatedAt:Date.now(),updatedBy:currentName},{merge:true}); 
      map.closePopup(); 
      await addRemoteLog(`🏠 ${currentName} set ${label||dotId}: ${statusLabel(s)}`);
    })); 
    input?.addEventListener("blur",async()=>{const label=(input.value||"").trim(); if(label!==dot.label) await setDoc(doc(db,"dots",dotId),{label},{merge:true});});
    noteInput?.addEventListener("blur",async()=>{const notes=(noteInput.value||"").trim(); if(notes!==dot.notes) await setDoc(doc(db,"dots",dotId),{notes},{merge:true});});
  },0);
}

function popupBtn(status,text,kind){ const cls=kind==="danger"?"popBtn popBtn--danger":kind==="ghost"?"popBtn popBtn--ghost":"popBtn"; return `<button class="${cls}" data-s="${status}" type="button">${text}</button>`; }

function syncNeighborhoodLayers(){
  if(!neighborhoodLayer) return;
  const ids=new Set(Object.keys(neighborhoodsCache)); for(const [id,layer] of nbLayerById.entries()){ if(!ids.has(id)){neighborhoodLayer.removeLayer(layer);nbLayerById.delete(id);} }
  Object.values(neighborhoodsCache).forEach(nb=>{ if(nbLayerById.has(nb.id)) return; const group=L.geoJSON(nb.geojson,{interactive:false,style:{color:nb.color,weight:3,fillColor:nb.color,fillOpacity:.12}}); const layers=[]; group.eachLayer(layer=>{layer._nbId=nb.id; neighborhoodLayer.addLayer(layer); layers.push(layer);}); nbLayerById.set(nb.id,layers[0]||group); });
  renderTerritoryList();
}

function bindNeighborhoodInteractions(nbId, layer){ layer._nbId=nbId; layer.on("click",()=>{ const nb=neighborhoodsCache[nbId]; const isAssigned=assignedNbId===nbId; const html=`<div style="min-width:230px"><div style="font-weight:950;margin-bottom:6px">${esc(nb.name)}</div><div style="display:grid;gap:7px"><button class="popBtn" data-a="${isAssigned?"unassign":"assign"}" type="button">${isAssigned?"🚫 Unassign Me":"✅ Assign Me Here"}</button><button class="popBtn popBtn--danger" data-a="delete" type="button">🗑 Delete Territory</button></div></div>`; layer.bindPopup(L.popup({closeButton:true,autoPan:true}).setContent(html)).openPopup(); setTimeout(()=>{ const root=document.querySelector(".leaflet-popup-content"); root?.querySelectorAll("button[data-a]").forEach(btn=>btn.addEventListener("click",async()=>{ const a=btn.dataset.a; if(a==="assign"){assignedNbId=nbId; await setDoc(doc(db,"reps",currentUid),{assignedNeighborhoodId:nbId},{merge:true}); await addRemoteLog(`🧭 ${currentName} assigned to ${nb.name}`);} if(a==="unassign"){assignedNbId=null; await setDoc(doc(db,"reps",currentUid),{assignedNeighborhoodId:null},{merge:true}); await addRemoteLog(`🧭 ${currentName} unassigned`);} if(a==="delete" && confirm(`Delete ${nb.name}?`)){await deleteDoc(doc(db,"neighborhoods",nbId)); await addRemoteLog(`🗑 ${currentName} deleted territory ${nb.name}`);} map.closePopup(); refreshAssignedText(); })); },0); }); }
function toggleAddDot(){ addDotMode=!addDotMode; if($("addDotBtn")) $("addDotBtn").textContent=addDotMode?"House: Tap Map":"House"; toast(addDotMode?"House mode: tap the map":"House mode off"); }
function toggleDraw(){ drawEnabled=!drawEnabled; if(drawEnabled){ if(map) map.addControl(drawControl); if($("drawBtn")) $("drawBtn").textContent="✏️ Draw ON";}else{ if(map) map.removeControl(drawControl); if($("drawBtn")) $("drawBtn").textContent="✏️ Draw Territory";} }
function doSearch(){ const q=$("searchInput").value.trim().toLowerCase(); if(!q) return; const match=Object.values(dotsCache).find(d=>(d.label||"").toLowerCase().includes(q)); if(!match) return toast("No map match"); const marker=markerById.get(match.id); if(map) map.setView([match.lat,match.lng],Math.max(map.getZoom(),17)); if(marker) marker.setStyle({...dotStyle(match.status),radius:10,weight:3}); lastFoundMarker=marker; toast(`Found: ${match.label||match.id}`); }
function clearSearch(){ if($("searchInput")) $("searchInput").value=""; if(lastFoundMarker) syncDotMarkers(); }
function startGps(){ if(!navigator.geolocation) return toast("GPS not supported"); gpsOn=true; if($("gpsBtn")) $("gpsBtn").textContent="Pin: On"; gpsWatchId=navigator.geolocation.watchPosition(pos=>{ const {latitude,longitude,accuracy}=pos.coords; const latlng=[latitude,longitude]; if(!gpsMarker){gpsMarker=L.circleMarker(latlng,{radius:7,weight:3,color:"rgba(56,189,248,.95)",fillColor:"rgba(56,189,248,.55)",fillOpacity:1}).addTo(map).bindTooltip(`${currentName} (you)`); gpsCircle=L.circle(latlng,{radius:Math.max(accuracy,15),weight:1,color:"rgba(56,189,248,.35)",fillColor:"rgba(56,189,248,.12)",fillOpacity:1}).addTo(map);}else{gpsMarker.setLatLng(latlng);gpsCircle.setLatLng(latlng);gpsCircle.setRadius(Math.max(accuracy,15));}},err=>{toast(`GPS error: ${err.message}`);stopGps();},{enableHighAccuracy:true,maximumAge:5000,timeout:15000}); }
function stopGps(){ gpsOn=false; if($("gpsBtn")) $("gpsBtn").textContent="Pin Current Location"; if(gpsWatchId!=null) navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId=null; if(gpsMarker && map) map.removeLayer(gpsMarker); if(gpsCircle && map) map.removeLayer(gpsCircle); gpsMarker=null; gpsCircle=null; }

function renderCounts(){ const c={yes:0,no:0,nothome:0,callback:0,knocked:0,skip:0}; Object.values(dotsCache).forEach(d=>{if(d.status in c)c[d.status]++;}); if($("countYes"))$("countYes").textContent=c.yes; if($("countNo"))$("countNo").textContent=c.no; if($("countNotHome"))$("countNotHome").textContent=c.nothome; if($("countCallback"))$("countCallback").textContent=c.callback; if($("countKnocked"))$("countKnocked").textContent=c.knocked; if($("countSkip"))$("countSkip").textContent=c.skip; }
function refreshAssignedText(){ if(!assignedTextEl) return; if(!assignedNbId) assignedTextEl.textContent="None"; else assignedTextEl.textContent=neighborhoodsCache[assignedNbId]?.name||"None"; }
function statusLabel(s){ return {yes:"Yes / Closed",no:"No",nothome:"Not Home",callback:"Callback",knocked:"Knocked",skip:"Skip",none:"Unmarked"}[s]||"Unmarked"; }
function dotStyle(status){ const base={radius:7,weight:2,opacity:1,fillOpacity:.92}; const map={yes:["rgba(34,197,94,.95)","rgba(34,197,94,.85)"],no:["rgba(239,68,68,.95)","rgba(239,68,68,.85)"],nothome:["rgba(56,189,248,.95)","rgba(56,189,248,.80)"],callback:["rgba(167,139,250,.95)","rgba(167,139,250,.80)"],knocked:["rgba(245,158,11,.95)","rgba(245,158,11,.85)"],skip:["rgba(255,255,255,.35)","rgba(255,255,255,.18)"]}; const x=map[status]||["rgba(255,255,255,.40)","rgba(160,160,160,.65)"]; return {...base,color:x[0],fillColor:x[1],fillOpacity:status?base.fillOpacity:.75}; }

function openEntityModal(type, seed={}){
  const configs = {
    leadModal:{title:"Lead",coll:"leads",fields:["name","phone","address","service","quote","status","notes"],defaults:{service:"Window Cleaning",status:"lead",repName:currentName,repId:currentUid},selects:{status:["lead","quote","sold","converted","no","callback"]}},
    jobModal:{title:"Job",coll:"jobs",fields:["title","customer","phone","address","scheduledAt","cleaner","price","repPay","payCleanerAmount","status","notes"],defaults:{status:"scheduled",repName:currentName,repId:currentUid},selects:{status:["scheduled","open","claimed","in progress","completed","cancelled"]}},
    customerModal:{title:"Customer",coll:"customers",fields:["name","phone","address","service","lifetimeRevenue","notes"],defaults:{service:"Window Cleaning"}},
    teamModal:{title:"Team Member",coll:"reps",fields:["name","role","phone","commissionOwed","amountEarned"],defaults:{role:"rep"},selects:{role:["rep","cleaner","admin"]}},
    paymentModal:{title:"Payment",coll:"payments",fields:["customer","amount","method","status","note"],defaults:{status:"unpaid",method:"Cash App"},selects:{method:["Cash App","Venmo","Zelle","Cash","Check","Card"],status:["unpaid","paid","partial","refunded"]}},
    equipmentModal:{title:"Equipment",coll:"equipment",fields:["name","status","holder","location","tracker","notes"],defaults:{status:"available",location:settingsCache.locker||""},selects:{status:["available","checked out","missing","maintenance"]}}
  };
  const cfg=configs[type]; 
  openRecordModal(cfg,{...cfg.defaults,...seed});
}

window.crmEdit = (kind,id) => { 
  const configs={
    lead:{title:"Lead",coll:"leads",fields:["name","phone","address","service","quote","status","notes"],selects:{status:["lead","quote","sold","converted","no","callback"]}},
    job:{title:"Job",coll:"jobs",fields:["title","customer","phone","address","scheduledAt","cleaner","price","repPay","payCleanerAmount","status","notes"],selects:{status:["scheduled","open","claimed","in progress","completed","cancelled"]}},
    team:{title:"Team Member",coll:"reps",fields:["name","role","phone","commissionOwed","amountEarned"],selects:{role:["rep","cleaner","admin"]}},
    customer:{title:"Customer",coll:"customers",fields:["name","phone","address","service","lifetimeRevenue","notes"]},
    payment:{title:"Payment",coll:"payments",fields:["customer","amount","method","status","note"],selects:{method:["Cash App","Venmo","Zelle","Cash","Check","Card"],status:["unpaid","paid","partial","refunded"]}},
    equipment:{title:"Equipment",coll:"equipment",fields:["name","status","holder","location","tracker","notes"],selects:{status:["available","checked out","missing","maintenance"]}}
  };
  const data={lead:leadsCache[id],job:jobsCache[id],team:repsCache[id],customer:customersCache[id],payment:paymentsCache[id],equipment:equipmentCache[id]}[kind];
  const cfg=configs[kind];
  if(!cfg || !data) return;
  openRecordModal(cfg,data,id); 
};

function renderField(f, data, cfg){
  const val = data[f] || "";
  if(f==="notes"||f==="note"){
    return `<label>${labelize(f)}<textarea data-field="${f}">${esc(val)}</textarea></label>`;
  }
  if(f==="scheduledAt"){
    const parts = splitScheduleValue(val);
    return `<label>Scheduled Date
      <div class="dateInline">
        <input data-field="scheduledDate" type="date" value="${esc(parts.date)}" />
        <button class="ghostBtn smallBtn" type="button" id="todayScheduleBtn">Today</button>
      </div>
    </label>
    <label>Scheduled Time
      <select data-field="scheduledTime">${timeOpts(parts.time || "09:00")}</select>
    </label>`;
  }
  if(cfg.selects && cfg.selects[f]){
    return `<label>${labelize(f)}<select data-field="${f}">${cfg.selects[f].map(o=>`<option value="${esc(o)}"${String(val||"").toLowerCase()===String(o).toLowerCase()?" selected":""}>${esc(labelize(o))}</option>`).join("")}</select></label>`;
  }
  const type = ["quote","amount","price","lifetimeRevenue","commissionOwed","amountEarned","repPay","payCleanerAmount"].includes(f) ? "number" : "text";
  return `<label>${labelize(f)}<input data-field="${f}" type="${type}" value="${esc(val)}" /></label>`;
}

function splitScheduleValue(v){
  if(!v) return {date:"",time:"09:00"};
  const s=String(v);
  const iso=s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if(iso) return {date:iso[1],time:iso[2]};
  return {date:"",time:"09:00"};
}

function formatSchedule(date,time){
  if(!date && !time) return "";
  if(!date) return time || "";
  if(!time) return date;
  return `${date} ${time}`;
}

function todayDateString(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function openRecordModal(cfg, data={}, id=null){
  if(!modalBackdrop || !modalCard) return;
  modalBackdrop.classList.remove("hidden");
  modalCard.innerHTML = `<div class="modalTop"><div><h2>${id?"Edit":"Add"} ${cfg.title}</h2><p class="muted">Saved live to Firebase.</p></div><button class="ghostBtn" onclick="window.crmCloseModal()">Close</button></div><div class="formGrid">${cfg.fields.map(f=>renderField(f,data,cfg)).join("")}</div><div class="modalActions"><button class="dangerBtn" id="deleteRecordBtn" ${id?"":"style='display:none'"}>Delete</button><button class="actionBtn" id="saveRecordBtn">Save</button></div>`;
  const todayBtn = $("todayScheduleBtn");
  if(todayBtn) todayBtn.onclick = () => { const d = modalCard.querySelector('[data-field="scheduledDate"]'); if(d) d.value = todayDateString(); };
  $("saveRecordBtn").onclick = async () => { 
    const rec={...data}; 
    modalCard.querySelectorAll("[data-field]").forEach(inp=>{
      if(inp.dataset.field==="scheduledDate" || inp.dataset.field==="scheduledTime") return;
      rec[inp.dataset.field]=inp.value;
    }); 
    if(cfg.fields.includes("scheduledAt")){
      const d = modalCard.querySelector('[data-field="scheduledDate"]')?.value || "";
      const t = modalCard.querySelector('[data-field="scheduledTime"]')?.value || "";
      rec.scheduledAt = formatSchedule(d,t);
    }
    rec.id=id||`${cfg.coll}-${Date.now()}`; 
    rec.updatedAt=Date.now(); 
    rec.updatedBy=currentName; 
    if(!id) rec.createdAt=Date.now(); 
    if(cfg.coll==="jobs" && isCompletedJob(rec) && !rec.completedAt) rec.completedAt = Date.now();
    await setDoc(doc(db,cfg.coll,rec.id),rec,{merge:true}); 
    if(cfg.coll==="leads" && rec.dotId && rec.address){
      await setDoc(doc(db,"dots",rec.dotId),{label:rec.address,notes:rec.address,leadId:rec.id,updatedAt:Date.now(),updatedBy:currentName},{merge:true});
    }
    await addRemoteLog(`💾 ${currentName} saved ${cfg.title}: ${rec.name||rec.title||rec.customer||rec.address||rec.id}`); 
    closeModal(); 
    toast(`${cfg.title} saved live`); 
  };
  $("deleteRecordBtn").onclick = async () => { if(confirm("Delete this record?")){ await archiveDeletedRecord(cfg.coll, id, data, cfg.title); await deleteDoc(doc(db,cfg.coll,id)); await addRemoteLog(`🗑 ${currentName} deleted ${cfg.title}`); closeModal(); toast(`${cfg.title} deleted. Undo is available.`); } };
}
window.crmCloseModal = closeModal;
function closeModal(){ if(modalBackdrop) modalBackdrop.classList.add("hidden"); if(modalCard) modalCard.innerHTML=""; }
function labelize(s){ return String(s).replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase()); }

function renderGoalGauge(current){
  const wrap=$("goalGauge");
  if(!wrap) return;
  const goal=Number(settingsCache.weeklyGoal || 0);
  if(!goal){
    wrap.innerHTML=`<div class="gaugeNoGoal">No goal</div><div class="muted" style="text-align:center;margin-top:8px">Set a weekly revenue goal in Admin.</div>`;
    return;
  }
  const pct=Math.max(0, Math.min(100, Math.round((Number(current||0)/goal)*100)));
  wrap.innerHTML=`<div class="gaugeShell" style="--pct:${pct}"><div class="gaugeCenter"><strong>${pct}%</strong><span>${money(current)} / ${money(goal)}</span></div></div>`;
}

function applyTheme(theme){
  const mode = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-mode", mode === "light");
  localStorage.setItem(LS_THEME, mode);
  if($("themeToggle")) $("themeToggle").checked = mode === "light";
}
function toggleTheme(){ applyTheme($("themeToggle")?.checked ? "light" : "dark"); }

async function deleteTerritory(id){
  const nb=neighborhoodsCache[id];
  if(!nb) return toast("Area not found");
  if(!confirm(`Delete area ${nb.name || id}?`)) return;
  await deleteDoc(doc(db,"neighborhoods",id));
  await addRemoteLog(`🗑 ${currentName} deleted area ${nb.name || id}`);
  toast("Area deleted");
}
window.deleteTerritory = deleteTerritory;

function renderTerritoryList(){
  const box=$("territoryList");
  if(!box) return;
  const nbs=Object.values(neighborhoodsCache);
  if(!nbs.length){ box.innerHTML=`<div class="muted">No areas drawn yet.</div>`; return; }
  box.innerHTML=nbs.map(nb=>`<div class="territoryItem"><span><b style="color:${esc(nb.color||'#38bdf8')}">●</b> ${esc(nb.name||'Area')}<br><small>${nb.assignedRepName?`Assigned: ${esc(nb.assignedRepName)}`:'Unassigned'}</small></span><button class="dangerBtn smallBtn" onclick="window.deleteTerritory('${esc(nb.id)}')">Delete</button></div>`).join("");
}

async function assignAreaToRep(){
  const nbs=Object.values(neighborhoodsCache);
  const reps=Object.entries(repsCache).filter(([id,r]) => (r.role||'rep') !== 'cleaner');
  if(!nbs.length) return toast("Draw an area first");
  if(!reps.length) return toast("No reps available");
  const areaText=nbs.map((n,i)=>`${i+1}. ${n.name} (${n.colorName||n.color||'blue'})`).join("\n");
  const areaNum=Number(prompt(`Assign which area?\n${areaText}`));
  const area=nbs[areaNum-1];
  if(!area) return;
  const repText=reps.map(([id,r],i)=>`${i+1}. ${r.name || id} (${r.role||'rep'})`).join("\n");
  const repNum=Number(prompt(`Assign ${area.name} to which rep?\n${repText}`));
  const repEntry=reps[repNum-1];
  if(!repEntry) return;
  const [repId,rep]=repEntry;
  await setDoc(doc(db,"neighborhoods",area.id),{assignedRepId:repId,assignedRepName:rep.name||'',updatedAt:Date.now(),updatedBy:currentName},{merge:true});
  await setDoc(doc(db,"reps",repId),{assignedNeighborhoodId:area.id},{merge:true});
  await addRemoteLog(`🧭 ${currentName} assigned ${area.name} to ${rep.name}`);
  toast(`Assigned ${area.name} to ${rep.name}`);
}

async function addRemoteLog(text){ const entry={t:Date.now(),text}; if(db) await setDoc(doc(db,"shared","activityLog"),{entries:[entry,...logCache].slice(0,150)}); }
async function archiveDeletedRecord(coll, id, record, title){
  if(!["jobs","leads"].includes(coll) || !id || !record) return;
  const ref = doc(db,"shared","undoDeletes");
  const snap = await getDoc(ref).catch(()=>null);
  const history = snap?.exists?.() ? (snap.data().history || []) : [];
  const item = { id:`undo-${Date.now()}`, coll, recordId:id, title, record:{...record,id}, deletedAt:Date.now(), deletedBy:currentName };
  await setDoc(ref,{history:[item,...history].slice(0,50),updatedAt:Date.now(),updatedBy:currentName},{merge:true});
}
async function undoLastDelete(){
  const ref = doc(db,"shared","undoDeletes");
  const snap = await getDoc(ref).catch(()=>null);
  const history = snap?.exists?.() ? [...(snap.data().history || [])] : [];
  const item = history.shift();
  if(!item) return toast("No deleted jobs or leads to undo");
  await setDoc(doc(db,item.coll,item.recordId),item.record,{merge:true});
  await setDoc(ref,{history,updatedAt:Date.now(),updatedBy:currentName},{merge:true});
  await addRemoteLog(`↩ ${currentName} restored ${item.title || item.coll}: ${item.record?.customer || item.record?.name || item.record?.title || item.recordId}`);
  toast(`${item.title || "Record"} restored`);
}
async function clearRemoteLog(){ if(!confirm("Clear activity log for everyone?")) return; if(db) await setDoc(doc(db,"shared","activityLog"),{entries:[]}); }
function renderLog(){ const logEl=$("log"); if(!logEl) return; logEl.innerHTML=""; logCache.forEach(item=>{ const div=document.createElement("div"); div.className="logItem"; const time=new Date(item.t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); div.textContent=`[${time}] ${item.text}`; logEl.appendChild(div); }); }
function runGlobalSearch(){ const q=globalSearch.value.trim().toLowerCase(); if(!q) return; const lead=Object.values(leadsCache).find(x=>[x.name,x.phone,x.address,x.service].some(v=>String(v||"").toLowerCase().includes(q))); if(lead){showPage("leads"); toast(`Found lead: ${lead.name||lead.address}`); return;} const dot=Object.values(dotsCache).find(x=>String(x.label||"").toLowerCase().includes(q)); if(dot && map){showPage("map"); setTimeout(()=>{map.setView([dot.lat,dot.lng],17);},260); return;} toast("No CRM match"); }

function initReviewEvents(){
  if($("reviewHandle")) $("reviewHandle").onclick=()=>{$("reviewOverlay").classList.remove("hidden");$("reviewLogin").classList.remove("hidden");$("reviewEdit").classList.add("hidden");$("reviewDisplay").classList.add("hidden");$("reviewPassword").value="";};
  if($("reviewEnterBtn")) $("reviewEnterBtn").onclick=()=>{ if($("reviewPassword").value!=="2122") return toast("Wrong password"); $("reviewLogin").classList.add("hidden"); $("reviewEdit").classList.remove("hidden"); fillReviewInputs(); };
  if($("reviewCloseBtn")) $("reviewCloseBtn").onclick=()=>$("reviewOverlay").classList.add("hidden");
  if($("reviewBackBtn")) $("reviewBackBtn").onclick=()=>{$("reviewDisplay").classList.add("hidden");$("reviewEdit").classList.remove("hidden");};
  if($("reviewUpdateBtn")) $("reviewUpdateBtn").onclick=async()=>{ const data={monthlyRevenue:+$("reviewRevenue").value||0,netProfit:+$("reviewProfit").value||0,recurringRevenue:+$("reviewRecurring").value||0,jobsCompleted:+$("reviewJobs").value||0,doorsKnocked:+$("reviewDoors").value||0,closeRate:+$("reviewCloseRate").value||0,updatedAt:Date.now(),updatedBy:currentName}; if(db) await setDoc(doc(db,"shared","monthlyIncomeReview"),data,{merge:true}); reviewCache=data; renderReviewDisplay(); $("reviewEdit").classList.add("hidden"); $("reviewDisplay").classList.remove("hidden"); };
  if($("reviewOverlay")) $("reviewOverlay").addEventListener("click",e=>{if(e.target===$("reviewOverlay"))$("reviewOverlay").classList.add("hidden");});
}
function defaultReview(){ return {monthlyRevenue:0,netProfit:0,recurringRevenue:0,jobsCompleted:0,doorsKnocked:0,closeRate:0}; }
function fillReviewInputs(){ const r={...defaultReview(),...reviewCache}; if($("reviewRevenue")) $("reviewRevenue").value=r.monthlyRevenue; if($("reviewProfit")) $("reviewProfit").value=r.netProfit; if($("reviewRecurring")) $("reviewRecurring").value=r.recurringRevenue; if($("reviewJobs")) $("reviewJobs").value=r.jobsCompleted; if($("reviewDoors")) $("reviewDoors").value=r.doorsKnocked; if($("reviewCloseRate")) $("reviewCloseRate").value=r.closeRate; }
function renderReviewDisplay(){ const r={...defaultReview(),...reviewCache}; if($("reviewNumbers")) $("reviewNumbers").innerHTML = [["Monthly Revenue",money(r.monthlyRevenue)],["Net Profit",money(r.netProfit)],["Recurring Revenue",money(r.recurringRevenue)],["Jobs Completed",r.jobsCompleted],["Doors Knocked",r.doorsKnocked],["Close Rate",`${r.closeRate}%`]].map(x=>`<div class="reviewMetric"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join(""); }
function toast(msg){ if(!toastEl) return; toastEl.textContent=msg; toastEl.classList.remove("hidden"); clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>toastEl.classList.add("hidden"),1800); }
function esc(str){ return String(str??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }


// Consolidated from ops.js. Keep all app JavaScript in app.js.
{

const firebaseConfig={apiKey:"AIzaSyA_CbiovvY9yvdsQ6wzzwoG2QaqBT0r7Bg",authDomain:"allsetrepportal.firebaseapp.com",projectId:"allsetrepportal",storageBucket:"allsetrepportal.firebasestorage.app",messagingSenderId:"590070052736",appId:"1:590070052736:web:193a9edb6fd378fbd27365",measurementId:"G-SY45913J3Z",databaseURL:"https://allsetrepportal-default-rtdb.firebaseio.com"};
const app=getApps()[0]||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id),esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"),money=n=>"$"+Number(n||0).toLocaleString();
const ADMIN_CODE="2122",lockedPages=new Set(["admin","equipment"]);
let uid="",role=localStorage.getItem("allset_rep_role")||"rep",name=localStorage.getItem("allset_rep_name")||"Team",activeChannel="General",adminUnlocked=sessionStorage.getItem("allset_admin_unlocked")==="1";
let reps={},leads={},jobs={},customers={},chat={},settings={},neighborhoods={},territoryLayer=null,pendingJobId="",renderingJobs=false,subscribed=false;

bootOps();
function bootOps(){ensureOpsUi();injectCss();wire();signInAnonymously(auth).catch(()=>{});onAuthStateChanged(auth,u=>{uid=u?.uid||uid;subscribe();refreshUser();applyNav();renderAll();});}
function ensureOpsUi(){
  $("page-chat")?.remove();document.querySelectorAll('.navBtn[data-page="chat"]').forEach(b=>b.remove());
  const main=document.querySelector(".main");if(main){if(!$("page-leaderboard"))main.insertAdjacentHTML("beforeend",`<section id="page-leaderboard" class="page tablePage"><div class="pageHeader"><div><h1>Leaderboard</h1><p>Rep revenue, sold jobs, converted leads, and close rate.</p></div></div><div id="leaderboardTable" class="tableCard"></div></section>`);if(!$("page-board"))main.insertAdjacentHTML("beforeend",`<section id="page-board" class="page tablePage"><div class="pageHeader"><div><h1>Board</h1><p>Cleaner claimed jobs, completed jobs, and amount earned.</p></div></div><div id="boardTable" class="tableCard"></div></section>`);}
  if(!$("dashboardChatBtn"))document.body.insertAdjacentHTML("beforeend",`<button id="dashboardChatBtn" class="dashboardChatBtn" type="button">Chat</button>`);
  if(!$("chatDrawer"))document.body.insertAdjacentHTML("beforeend",`<div id="chatScrim" class="chatScrim"></div><aside id="chatDrawer" class="chatDrawer"><div class="chatDrawerHeader"><div><strong>Team Chat</strong><span>Live field updates</span></div><button id="closeChatBtn" class="ghostBtn smallBtn" type="button">Close</button></div><div class="chatChannels"><button class="chatChannel active" data-channel="General" type="button">General</button><button class="chatChannel" data-channel="Sales" type="button">Sales</button><button class="chatChannel" data-channel="Cleaning" type="button">Cleaning</button><button class="chatChannel" data-channel="Announcements" type="button">Announcements</button></div><div id="chatMessages" class="chatMessages"></div><div class="chatComposer"><input id="chatInput" placeholder="Message the team" /><button id="chatSendBtn" class="actionBtn" type="button">Send</button></div></aside>`);
  syncDashboard();
}
function injectCss(){
  if($("opsCss"))return;const s=document.createElement("style");s.id="opsCss";s.textContent=`
  .statCard,.panel{position:relative}.statCard{overflow:hidden}.panelHeader{position:relative;overflow:hidden}.statCard::before,.panelHeader::before{content:""!important;position:absolute!important;top:0!important;left:14px!important;right:14px!important;height:3px!important;border-radius:0 0 999px 999px!important;background:linear-gradient(90deg,transparent,rgba(56,189,248,.72),rgba(124,58,237,.62),transparent)!important;box-shadow:0 0 18px rgba(56,189,248,.18)!important}.panelHeader::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.045),transparent 48%)}.panelHeader>*{position:relative;z-index:1}
  .navBtn{position:relative}.navBtn--locked{opacity:.82;border-style:dashed}.navBtn.hasOpenJobs::after{content:attr(data-open-count);position:absolute;right:10px;top:50%;transform:translateY(-50%);min-width:20px;height:20px;display:grid;place-items:center;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:11px;font-weight:950;box-shadow:0 0 0 3px rgba(239,68,68,.16),0 8px 22px rgba(239,68,68,.28)}
  .dashboardChatBtn{position:fixed;right:16px;top:calc(46% - 82px);z-index:1001;min-width:74px;padding:13px 16px;border-radius:16px 16px 0 16px;color:#06101a;background:linear-gradient(90deg,var(--accent1),var(--accent2));box-shadow:0 16px 42px rgba(0,0,0,.38)}body:not(.allset-dashboard-active) .dashboardChatBtn{display:none}
  .chatScrim{position:fixed;inset:0;background:rgba(0,0,0,.18);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:1190}.chatScrim.open{opacity:1;pointer-events:auto}.chatDrawer{position:fixed;top:78px;right:12px;bottom:18px;width:min(390px,calc(100vw - 22px));display:grid;grid-template-rows:auto auto 1fr auto;background:linear-gradient(180deg,rgba(13,20,34,.96),rgba(8,13,23,.96));border:1px solid rgba(255,255,255,.16);border-radius:18px;box-shadow:0 26px 90px rgba(0,0,0,.58);transform:translateX(calc(100% + 26px));transition:transform .22s ease;z-index:1200;overflow:hidden}.chatDrawer.open{transform:translateX(0)}
  .chatDrawerHeader{display:flex;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045)}.chatDrawerHeader strong,.chatDrawerHeader span{display:block}.chatDrawerHeader span{color:var(--muted);font-size:12px}.chatChannels{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important;padding:12px!important;border-bottom:1px solid rgba(255,255,255,.10)!important;background:rgba(0,0,0,.14)}.chatChannel{min-height:42px;border-radius:12px!important;border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.07)!important;color:var(--text)!important;padding:9px 10px!important;text-align:center}.chatChannel.active{background:linear-gradient(90deg,rgba(56,189,248,.28),rgba(124,58,237,.24))!important;border-color:rgba(56,189,248,.48)!important}
  .chatMessages{display:flex!important;flex-direction:column;gap:9px!important;padding:12px!important;overflow:auto!important;max-height:none!important}.chatMessage{position:relative;border:1px solid rgba(255,255,255,.10)!important;background:rgba(255,255,255,.06)!important;border-radius:13px!important;padding:10px 38px 10px 11px!important}.chatMeta{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;margin-bottom:4px}.chatMeta time{font-size:12px;color:var(--muted)}.chatMessage p{margin:0;line-height:1.35;font-size:13px}.deleteChatBtn{position:absolute;top:8px;right:8px;width:26px;height:26px;padding:0;border-radius:999px}.chatComposer{display:grid!important;grid-template-columns:1fr auto;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.16)}
  .tableActions,.territoryActions{display:flex;gap:7px;flex-wrap:wrap}.territoryItem{align-items:flex-start!important}.territoryActions{justify-content:flex-end}.territoryName{display:block;font-weight:900}.territoryMeta{display:block;color:var(--muted);font-size:12px;margin-top:2px}.territorySwatch{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:7px;box-shadow:0 0 0 3px rgba(255,255,255,.08)}
  .scheduleEditor,.scheduleBoard{gap:12px!important}.dayRow{grid-template-columns:minmax(132px,1.1fr) minmax(112px,1fr) minmax(112px,1fr) minmax(100px,.8fr)!important;align-items:center!important;border-radius:12px!important;background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.04))!important}.dayRow label{font-size:12px!important}.dayRow select{min-height:42px}.scheduleUser{border-radius:12px!important;background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.04))!important}.payBtn{position:relative;overflow:hidden}.payBtn::before{content:"";position:absolute;left:16px;right:16px;top:0;height:3px;border-radius:0 0 999px 999px;background:linear-gradient(90deg,transparent,rgba(56,189,248,.65),transparent)}.payQr{display:block;width:72px;height:72px;object-fit:cover;border-radius:10px;margin:10px auto 0;border:1px solid rgba(255,255,255,.14)}
  @media (max-width:720px){#mobileNavBtn{padding:15px 19px!important;font-size:16px!important}.dashboardChatBtn{right:14px;bottom:86px;top:auto;border-radius:16px}.chatDrawer{top:70px;right:8px;bottom:8px;width:calc(100vw - 16px);border-radius:16px}.dayRow{grid-template-columns:1fr!important}}`;
  document.head.appendChild(s);
}
function wire(){
  document.addEventListener("click",navGate,true);
  document.addEventListener("click",e=>{const nav=e.target.closest(".navBtn");if(nav)setTimeout(()=>{refreshUser();applyNav();syncDashboard();renderAll();},0);if(e.target.closest('[data-open="jobModal"]'))pendingJobId="";if(e.target.closest('[data-open="jobModal"]')||String(e.target.getAttribute?.("onclick")||"").includes("crmEdit('job'")){setTimeout(enhanceJobModal,0);setTimeout(enhanceJobModal,120)}const ch=e.target.closest(".chatChannel");if(ch){activeChannel=ch.dataset.channel||"General";document.querySelectorAll(".chatChannel").forEach(b=>b.classList.toggle("active",b.dataset.channel===activeChannel));renderChat()}if(e.target.closest("#dashboardChatBtn"))openChat();if(e.target.closest("#closeChatBtn")||e.target.closest("#chatScrim"))closeChat();const cd=e.target.closest(".deleteChatBtn");if(cd)deleteChat(cd.dataset.id);const td=e.target.closest(".deleteRepBtn,.deleteCleanerBtn");if(td)deleteTeam(td.dataset.id,td.dataset.name||"team member");const ta=e.target.closest(".territoryAssignBtn");if(ta)assignTerritory(ta.dataset.id);const tdel=e.target.closest(".territoryDeleteBtn");if(tdel)deleteTerritory(tdel.dataset.id);if(e.target?.id==="chatSendBtn")sendChat();});
  document.addEventListener("keydown",e=>{if(e.target?.id==="chatInput"&&e.key==="Enter")sendChat();if(e.key==="Escape")closeChat();});
  $("enterBtn")?.addEventListener("click",()=>setTimeout(()=>{refreshUser();applyNav();renderAll();syncDashboard();},250));
  $("saveSettingsBtn")?.addEventListener("click",savePaymentSettings);
  const main=document.querySelector(".main");if(main)new MutationObserver(syncDashboard).observe(main,{subtree:true,attributes:true,attributeFilter:["class"]});
  const jt=$("jobsTable");if(jt)new MutationObserver(()=>{if(!renderingJobs&&role==="cleaner"&&jt.textContent.includes("Price"))renderCleanerJobs();}).observe(jt,{childList:true,subtree:true});
  setTimeout(wrapCrmEdit,0);
}
function navGate(e){const b=e.target.closest(".navBtn");if(!b?.dataset.page)return;refreshUser();if(b.dataset.page==="chat"){e.preventDefault();e.stopImmediatePropagation();openChat();return}if(lockedPages.has(b.dataset.page)&&!isAdminish()){const code=prompt("Enter admin password:");if(code!==ADMIN_CODE){e.preventDefault();e.stopImmediatePropagation();toast("Wrong password");return}adminUnlocked=true;sessionStorage.setItem("allset_admin_unlocked","1");applyNav();}}
function subscribe(){if(subscribed)return;subscribed=true;onSnapshot(collection(db,"reps"),s=>{reps=snapObj(s);renderAll()});onSnapshot(collection(db,"leads"),s=>{leads=snapObj(s);renderAll()});onSnapshot(collection(db,"jobs"),s=>{jobs=snapObj(s);renderAll()});onSnapshot(collection(db,"customers"),s=>{customers=snapObj(s);renderAll()});onSnapshot(collection(db,"chatMessages"),s=>{chat=snapObj(s);renderChat()});onSnapshot(collection(db,"neighborhoods"),s=>{neighborhoods=snapObj(s);renderTerritories();renderTerritoryMap()});onSnapshot(doc(db,"shared","settings"),s=>{settings=s.exists()?s.data():{};applyPayments()});}
function snapObj(s){const o={};s.forEach(d=>o[d.id]={...d.data(),id:d.data().id||d.id});return o}
function refreshUser(){role=localStorage.getItem("allset_rep_role")||$("roleSelect")?.value||role||"rep";name=localStorage.getItem("allset_rep_name")||$("nicknameInput")?.value||name||"Team"}
function isAdminish(){return role==="admin"||adminUnlocked}
function pages(){return{rep:["dashboard","map","leads","jobs","leaderboard","payments","admin","equipment"],cleaner:["dashboard","jobs","board","schedule","payments","admin","equipment"],admin:["dashboard","map","leads","jobs","leaderboard","board","schedule","customers","team","payments","admin","equipment"]}}
function applyNav(){const allowed=pages()[role]||pages().rep;document.querySelectorAll(".navBtn").forEach(b=>{const p=b.dataset.page;if(p==="chat"){b.classList.add("hidden");return}const show=allowed.includes(p)||(lockedPages.has(p)&&role!=="admin"),locked=lockedPages.has(p)&&!isAdminish();b.classList.toggle("hidden",!show);b.classList.toggle("navBtn--locked",show&&locked);b.dataset.locked=show&&locked?"1":"";const label=p==="map"?"Live Map":p==="schedule"&&role==="cleaner"?"Schedule":p==="schedule"?"Scheduling":p.charAt(0).toUpperCase()+p.slice(1);b.textContent=locked?`${label} (Locked)`:label});document.querySelectorAll(".adminOnly").forEach(el=>el.classList.toggle("hidden",!isAdminish()));applyPayments();badgeJobs()}
function syncDashboard(){const on=$("page-dashboard")?.classList.contains("active");document.body.classList.toggle("allset-dashboard-active",!!on);if(!on)closeChat()}
function renderAll(){renderLeaderboard();renderBoard();renderCleanerJobs();renderChat();renderTerritories();renderTerritoryMap();applyPayments();badgeJobs()}
function renderLeaderboard(){const m=new Map();Object.entries(reps).filter(([,r])=>(r.role||"rep")==="rep").forEach(([id,r])=>m.set(id,{id,name:r.name||"Rep",revenue:0,sold:0,converted:0,total:0}));Object.values(leads).forEach(l=>{const id=l.repId||l.repName||"unknown";if(!m.has(id))m.set(id,{id,name:l.repName||reps[l.repId]?.name||"Rep",revenue:0,sold:0,converted:0,total:0});const s=m.get(id);s.total++;if(["sold","converted"].includes(String(l.status||"").toLowerCase())){s.converted++;s.revenue+=Number(l.quote||l.amount||0)}});Object.values(jobs).forEach(j=>{const id=j.repId||j.repName||"unknown";if(!m.has(id))m.set(id,{id,name:j.repName||reps[j.repId]?.name||"Rep",revenue:0,sold:0,converted:0,total:0});const s=m.get(id);if(["open","claimed","in_progress","completed","scheduled"].includes(jobStatus(j.status)))s.sold++;s.revenue+=Number(j.price||j.amount||0)});const manage=isAdminish(),rows=[...m.values()].sort((a,b)=>b.revenue-a.revenue).map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td>${money(s.revenue)}</td><td>${s.sold}</td><td>${s.converted}</td><td>${s.total?Math.round(s.converted/s.total*100):0}%</td>${manage?`<td>${reps[s.id]?`<button class="dangerBtn smallBtn deleteRepBtn" data-id="${esc(s.id)}" data-name="${esc(s.name)}">Delete</button>`:""}</td>`:""}</tr>`);table("leaderboardTable",manage?["Rep","Revenue","Sold Jobs","Leads Converted","Close Rate",""]:["Rep","Revenue","Sold Jobs","Leads Converted","Close Rate"],rows,"No leaderboard data yet.")}
function renderBoard(){const m=new Map();Object.entries(reps).filter(([,r])=>r.role==="cleaner").forEach(([id,r])=>m.set(id,{id,name:r.name||"Cleaner",claimed:0,completed:0,earned:0}));Object.values(jobs).forEach(j=>{const id=j.cleanerId||j.cleanerName||j.cleaner||"unassigned";if(!m.has(id))m.set(id,{id,name:j.cleanerName||j.cleaner||"Unassigned",claimed:0,completed:0,earned:0});const s=m.get(id),st=jobStatus(j.status);if(j.claimedAt||["claimed","in_progress","completed"].includes(st)||j.cleanerId||j.cleanerName||j.cleaner)s.claimed++;if(st==="completed"||j.completedAt||j.cleanedAt){s.completed++;s.earned+=cleanerPay(j,true)}});const manage=isAdminish(),rows=[...m.values()].sort((a,b)=>b.earned-a.earned||b.completed-a.completed).map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td>${s.claimed}</td><td>${s.completed}</td><td>${money(s.earned)}</td>${manage?`<td>${reps[s.id]?`<button class="dangerBtn smallBtn deleteCleanerBtn" data-id="${esc(s.id)}" data-name="${esc(s.name)}">Delete</button>`:""}</td>`:""}</tr>`);table("boardTable",manage?["Cleaner","Jobs Claimed","Jobs Completed","Amount Earned",""]:["Cleaner","Jobs Claimed","Jobs Completed","Amount Earned"],rows,"No cleaner board data yet.")}
function renderCleanerJobs(){const el=$("jobsTable");if(!el||role!=="cleaner")return;renderingJobs=true;const rows=Object.values(jobs).filter(j=>jobStatus(j.status)==="open"||j.cleanerId===uid||j.cleanerName===name||j.cleaner===name).map(j=>`<tr><td><strong>${esc(j.customer||j.title||"Job")}</strong><br><span class="muted">${esc(j.address||"")}</span></td><td>${esc(j.phone||"-")}</td><td>${esc(readableDate(j.scheduledAt)||"-")}</td><td><span class="status ${jobStatus(j.status)}">${esc(labelStatus(j.status))}</span></td><td>${esc(j.repName||"-")}</td><td>${esc(j.cleanerName||j.cleaner||"-")}</td><td>${payLabel(j)}</td><td><div class="tableActions">${jobButtons(j)}</div></td></tr>`);el.innerHTML=rows.length?`<table class="dataTable"><thead><tr><th>Job</th><th>Phone</th><th>Scheduled</th><th>Status</th><th>Rep</th><th>Cleaner</th><th>Cleaner Pay</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>`:`<div class="card">No open jobs yet.</div>`;setTimeout(()=>renderingJobs=false,0)}
function jobButtons(j){const s=jobStatus(j.status),mine=j.cleanerId===uid||j.cleanerName===name||j.cleaner===name;if(s==="open")return`<button class="actionBtn smallBtn" onclick="window.opsClaimJob('${esc(j.id)}')">Claim Job</button>`;if(s==="claimed"&&mine)return`<button class="actionBtn smallBtn" onclick="window.opsStartJob('${esc(j.id)}')">Start Job</button>`;if(s==="in_progress"&&mine)return`<button class="actionBtn smallBtn" onclick="window.opsCompleteJob('${esc(j.id)}')">Complete Job</button>`;return""}
window.opsClaimJob=async id=>{const j=jobs[id];if(!j||jobStatus(j.status)!=="open")return toast("That job is already claimed");const now=Date.now();await setDoc(doc(db,"jobs",id),{status:"claimed",cleanerId:uid,cleanerName:name,cleaner:name,claimedAt:now,updatedAt:now,updatedBy:name},{merge:true});log(`Job claimed: ${j.customer||j.title||id} by ${name}`)};
window.opsStartJob=async id=>{const now=Date.now(),j=jobs[id];if(!j)return;await setDoc(doc(db,"jobs",id),{status:"in_progress",startedAt:now,updatedAt:now,updatedBy:name},{merge:true});log(`Job started: ${j.customer||j.title||id} by ${name}`)};
window.opsCompleteJob=async id=>{const now=Date.now(),j=jobs[id];if(!j)return;await setDoc(doc(db,"jobs",id),{status:"completed",completedAt:now,cleanedAt:now,lastCleanedAt:now,updatedAt:now,updatedBy:name},{merge:true});log(`Job completed: ${j.customer||j.title||id} by ${name}`)};
window.leadToJob=async leadId=>{const l=leads[leadId];if(!l)return toast("Lead not found");const id=`jobs-${Date.now()}`,now=Date.now();await setDoc(doc(db,"jobs",id),{...l,id,sourceLeadId:leadId,leadId,title:l.service||l.title||"Window Cleaning",customer:l.name||l.customer||"",address:l.address||"",phone:l.phone||"",scheduledAt:l.scheduledAt||"",cleaner:l.cleaner||"",price:Number(l.quote||l.amount||l.price||0),payCleanerAmount:Number(l.payCleanerAmount||l.cleanerPay||l.cleanerAmount||0),status:"open",notes:l.notes||"",repName:l.repName||name,repId:l.repId||uid,createdAt:now,createdBy:name,movedAt:now,movedBy:name},{merge:true});await deleteDoc(doc(db,"leads",leadId));log(`Lead moved to job: ${l.name||l.address||leadId}`);toast("Lead moved to Jobs");clickNav("jobs")};
window.jobToCustomer=async jobId=>{const j=jobs[jobId];if(!j)return toast("Job not found");const now=Date.now(),existing=Object.values(customers).find(c=>sameCustomer(c,j)),customerName=j.customer||j.name||j.title||"";if(existing)await setDoc(doc(db,"customers",existing.id),{phone:existing.phone||j.phone||"",address:existing.address||j.address||"",service:existing.service||j.title||"Window Cleaning",lifetimeRevenue:Number(existing.lifetimeRevenue||0)+Number(j.price||j.amount||0),lastCleanedAt:j.cleanedAt||j.completedAt||now,updatedAt:now,updatedBy:name},{merge:true});else{const id=`cust-${Date.now()}`;await setDoc(doc(db,"customers",id),{id,name:customerName,phone:j.phone||"",address:j.address||"",service:j.title||"Window Cleaning",status:"completed_this_year",season:new Date().getFullYear(),recurring:!!j.recurring,recurringFrequency:j.recurringFrequency||"",followUpAt:j.followUpAt||"",lastKnockedAt:j.lastKnockedAt||j.knockedAt||"",lastCleanedAt:j.cleanedAt||j.completedAt||now,lifetimeRevenue:Number(j.price||j.amount||0),notes:j.notes||"",sourceJobId:jobId,createdAt:now,createdBy:name,movedAt:now,movedBy:name},{merge:true})}await deleteDoc(doc(db,"jobs",jobId));log(`Job moved to customer: ${customerName||jobId}`);toast("Job moved to Customers");clickNav("customers")};
function openChat(){if(!$("page-dashboard")?.classList.contains("active"))return;$("chatDrawer")?.classList.add("open");$("chatScrim")?.classList.add("open");renderChat();setTimeout(()=>$("chatInput")?.focus(),100)}
function closeChat(){$("chatDrawer")?.classList.remove("open");$("chatScrim")?.classList.remove("open")}
async function sendChat(){const input=$("chatInput"),text=input?.value.trim();if(!text)return;if(activeChannel==="Announcements"&&!isAdminish())return toast("Only admins can post announcements");const id=`chat-${Date.now()}`;await setDoc(doc(db,"chatMessages",id),{id,channel:activeChannel,text,senderId:uid,senderName:name,senderRole:role,createdAt:Date.now()},{merge:true});input.value=""}
function renderChat(){const box=$("chatMessages");if(!box)return;const msgs=Object.values(chat).filter(m=>(m.channel||"General")===activeChannel).sort((a,b)=>dateVal(a.createdAt)-dateVal(b.createdAt)).slice(-80);box.innerHTML=msgs.length?msgs.map(m=>`<div class="chatMessage"><div class="chatMeta"><strong>${esc(m.senderName||"Team")}</strong><time>${esc(chatStamp(m.createdAt))}</time></div><p>${esc(m.text||"")}</p>${isAdminish()||m.senderId===uid||m.senderName===name?`<button class="dangerBtn deleteChatBtn" data-id="${esc(m.id)}" title="Delete message">x</button>`:""}</div>`).join(""):`<div class="card noMargin">No messages in ${esc(activeChannel)} yet.</div>`;box.scrollTop=box.scrollHeight}
async function deleteChat(id){if(id&&confirm("Delete this chat message?"))await deleteDoc(doc(db,"chatMessages",id))}
async function deleteTeam(id,label){if(!isAdminish())return toast("Admin password required");if(!id||!reps[id])return toast("This row is from job history, not a team member record");if(confirm(`Delete ${label}? This removes the team member record, not job history.`)){await deleteDoc(doc(db,"reps",id));log(`Team member deleted: ${label}`)}}
function renderTerritories(){const box=$("territoryList");if(!box)return;const nbs=Object.values(neighborhoods).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));box.innerHTML=nbs.length?nbs.map(nb=>`<div class="territoryItem"><span><span class="territoryName"><span class="territorySwatch" style="background:${esc(nb.color||"#38bdf8")}"></span>${esc(nb.name||"Area")}</span><span class="territoryMeta">${nb.assignedRepName?`Assigned: ${esc(nb.assignedRepName)}`:"Unassigned"}${nb.notes?` - ${esc(nb.notes)}`:""}</span></span><span class="territoryActions"><button class="ghostBtn smallBtn territoryAssignBtn" data-id="${esc(nb.id)}">Assign</button><button class="dangerBtn smallBtn territoryDeleteBtn" data-id="${esc(nb.id)}">Delete</button></span></div>`).join(""):`<div class="muted">No areas drawn yet.</div>`}
function renderTerritoryMap(){if(!window.L||!window.allsetMap)return setTimeout(renderTerritoryMap,450);if(!territoryLayer)territoryLayer=L.layerGroup().addTo(window.allsetMap);territoryLayer.clearLayers();Object.values(neighborhoods).forEach(nb=>{if(!nb.geojson)return;const color=nb.color||"#38bdf8",g=L.geoJSON(nb.geojson,{interactive:true,style:{color,weight:5,opacity:.78,fillColor:color,fillOpacity:.1}});g.eachLayer(layer=>{layer.on("click",e=>window.allsetMap.openPopup(L.popup({closeButton:true,autoPan:true,maxWidth:260}).setLatLng(e.latlng).setContent(`<strong>${esc(nb.name||"Area")}</strong><div class="muted">${nb.assignedRepName?`Assigned: ${esc(nb.assignedRepName)}`:"Unassigned"}</div><div class="muted">${esc(nb.colorName||nb.color||"blue")}${nb.notes?` - ${esc(nb.notes)}`:""}</div><div style="display:grid;gap:7px;margin-top:9px"><button class="popBtn" onclick="window.opsAssignTerritory('${esc(nb.id)}')">Assign</button><button class="popBtn popBtn--danger" onclick="window.opsDeleteTerritory('${esc(nb.id)}')">Delete</button></div>`)));territoryLayer.addLayer(layer)})})}
async function assignTerritory(id){const nb=neighborhoods[id];if(!nb)return toast("Area not found");const list=Object.entries(reps).filter(([,r])=>(r.role||"rep")!=="cleaner"),choices=list.map(([rid,r],i)=>`${i+1}. ${r.name||rid} (${r.role||"rep"})`).join("\n"),ans=prompt(`Assign ${nb.name||"this area"} to which rep?\n${choices||"Type a rep name."}`);if(!ans)return;const picked=list[Number(ans)-1],assignedRepId=picked?.[0]||"",assignedRepName=picked?.[1]?.name||ans.trim();await setDoc(doc(db,"neighborhoods",id),{assignedRepId,assignedRepName,updatedAt:Date.now(),updatedBy:name},{merge:true});if(assignedRepId)await setDoc(doc(db,"reps",assignedRepId),{assignedNeighborhoodId:id},{merge:true});log(`Territory assigned: ${nb.name||id} to ${assignedRepName}`);toast(`Assigned ${nb.name||"area"} to ${assignedRepName}`)}
async function deleteTerritory(id){const nb=neighborhoods[id];if(!nb)return toast("Area not found");if(confirm(`Delete territory ${nb.name||id}?`)){await deleteDoc(doc(db,"neighborhoods",id));log(`Territory deleted: ${nb.name||id}`);toast("Territory deleted")}}
window.opsAssignTerritory=assignTerritory;window.opsDeleteTerritory=deleteTerritory;
function applyPayments(){const v={cashApp:settings.cashApp||"$AllSet",venmo:settings.venmo||"@AllSet",paypal:settings.paypal||"paypal.me/AllSet",zelle:settings.zelle||"allset@example.com"};setText("cashAppTag",v.cashApp);setText("venmoTag",v.venmo);setText("paypalTag",v.paypal);setText("zelleTag",v.zelle);setHref("cashAppLink",href("cashapp",v.cashApp));setHref("venmoLink",href("venmo",v.venmo));setHref("paypalLink",href("paypal",v.paypal));[["cashAppLink","cashAppQr"],["venmoLink","venmoQr"],["paypalLink","paypalQr"]].forEach(([id,key])=>{const el=$(id);if(!el)return;el.querySelector?.(".payQr")?.remove();if(settings[key])el.insertAdjacentHTML("beforeend",`<img class="payQr" src="${esc(settings[key])}" alt="" />`)});["CashApp","Venmo","Paypal","Zelle"].forEach(label=>{const id=`set${label}`,key=label==="Paypal"?"paypal":label.charAt(0).toLowerCase()+label.slice(1);if($(id))$(id).value=settings[key]||""});["CashAppQr","VenmoQr","PaypalQr","ZelleQr"].forEach(label=>{const id=`set${label}`,key=label.charAt(0).toLowerCase()+label.slice(1);if($(id))$(id).value=settings[key]||""})}
async function savePaymentSettings(){if(!isAdminish())return;await setDoc(doc(db,"shared","settings"),{cashApp:$("setCashApp")?.value||"",venmo:$("setVenmo")?.value||"",paypal:$("setPaypal")?.value||"",zelle:$("setZelle")?.value||"",cashAppQr:$("setCashAppQr")?.value||"",venmoQr:$("setVenmoQr")?.value||"",paypalQr:$("setPaypalQr")?.value||"",zelleQr:$("setZelleQr")?.value||"",updatedAt:Date.now(),updatedBy:name},{merge:true});toast("Payment settings saved")}
function href(kind,value){const raw=String(value||"").trim();if(/^https?:\/\//i.test(raw))return raw;if(kind==="cashapp")return`https://cash.app/${raw.replace(/^\$/,"")||"AllSet"}`;if(kind==="venmo")return`https://venmo.com/${raw.replace(/^@/,"")||"AllSet"}`;if(kind==="paypal"){const clean=raw.replace(/^https?:\/\//i,"").replace(/^www\./i,"").replace(/^paypal\.me\//i,"").replace(/^paypal\.com\/paypalme\//i,"").replace(/^@/,"");return`https://paypal.me/${encodeURIComponent(clean||"AllSet")}`}return raw}
function cleanerPay(j,fall=false){const amount=Number(j.payCleanerAmount??j.cleanerPay??j.cleanerAmount??j.payCleaner??j.cleanerPayout??0);return amount||fall&&isAdminish()?Number(j.price||j.amount||j.quote||0):0}
function payLabel(j){const n=cleanerPay(j,false);return n?money(n):`<span class="muted">Not set</span>`}
function badgeJobs(){const count=Object.values(jobs).filter(j=>jobStatus(j.status)==="open").length;document.querySelectorAll('.navBtn[data-page="jobs"]').forEach(b=>{const show=role==="cleaner"&&count>0;b.classList.toggle("hasOpenJobs",show);b.dataset.openCount=show?String(count):"";b.title=show?`${count} unclaimed job${count===1?"":"s"}`:""})}
function enhanceJobModal(){const card=$("modalCard");if(!card||card.querySelector('[data-field="payCleanerAmount"]'))return;const title=card.querySelector("h2")?.textContent||"",hasJob=card.querySelector('[data-field="price"]')&&card.querySelector('[data-field="cleaner"]');if(!/job/i.test(title)&&!hasJob)return;const grid=card.querySelector(".formGrid");if(!grid)return;const current=pendingJobId?jobs[pendingJobId]:null,value=current?(current.payCleanerAmount??current.cleanerPay??current.cleanerAmount??current.payCleaner??""):"",field=document.createElement("label");field.innerHTML=`Pay Cleaner Amount<input data-field="payCleanerAmount" type="number" min="0" step="1" value="${esc(value)}" placeholder="ex: 75" />`;const price=grid.querySelector('[data-field="price"]')?.closest("label");price?.after?price.after(field):grid.appendChild(field);const st=grid.querySelector('[data-field="status"]');if(st){["open","claimed","in_progress","completed","cancelled"].forEach(x=>{if(![...st.options].some(o=>o.value===x)){const opt=document.createElement("option");opt.value=x;opt.textContent=labelStatus(x);st.appendChild(opt)}});if(!st.value||st.value==="scheduled")st.value=current?.status||"open"}}
function wrapCrmEdit(){if(typeof window.crmEdit!=="function"||window.crmEdit.__payWrapped)return;const old=window.crmEdit;window.crmEdit=function(kind,id){if(kind==="job")pendingJobId=id||"";const r=old.apply(this,arguments);if(kind==="job"){setTimeout(enhanceJobModal,0);setTimeout(enhanceJobModal,120)}return r};window.crmEdit.__payWrapped=true}
function table(id,headers,rows,empty){const el=$(id);if(el)el.innerHTML=rows.length?`<table class="dataTable"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`:`<div class="card">${empty}</div>`}
async function log(text){const ref=doc(db,"shared","activityLog"),snap=await getDoc(ref).catch(()=>null),entries=snap?.exists?.()?(snap.data().entries||[]):[];await setDoc(ref,{entries:[{t:Date.now(),text},...entries].slice(0,150)},{merge:true})}
function clickNav(page){document.querySelector(`.navBtn[data-page="${page}"]`)?.click()}
function sameCustomer(c,j){const ca=norm(c.address),ja=norm(j.address);if(ca&&ja&&ca===ja)return true;const cn=norm(c.name),jn=norm(j.customer||j.name||j.title);return!!(cn&&jn&&cn===jn)}
function norm(v){return String(v||"").trim().toLowerCase().replace(/\s+/g," ")}
function jobStatus(s){s=String(s||"open").toLowerCase().replace(/\s+/g,"_").replace("-","_");return s==="scheduled"?"open":s}
function labelStatus(s){return jobStatus(s).replaceAll("_"," ").replace(/^./,c=>c.toUpperCase())}
function dateVal(v){if(!v)return 0;if(typeof v==="number")return v;if(v.seconds)return v.seconds*1000;const t=new Date(v).getTime();return Number.isFinite(t)?t:0}
function readableDate(v){const t=dateVal(v);return t?new Date(t).toLocaleString([],{month:"2-digit",day:"2-digit",year:"numeric",hour:"numeric",minute:"2-digit"}):""}
function chatStamp(v){const t=dateVal(v);if(!t)return"";const d=new Date(t),n=new Date(),day=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),today=new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime(),time=d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),diff=Math.round((today-day)/86400000);if(diff<=0)return time;if(diff===1)return`Yesterday ${time}`;if(diff<7)return`${d.toLocaleDateString([],{weekday:"long"})} ${time}`;return`${d.toLocaleDateString([],{month:"2-digit",day:"2-digit",year:"numeric"})} ${time}`}
function setText(id,v){const el=$(id);if(el)el.textContent=v}
function setHref(id,v){const el=$(id);if(el)el.href=v}
function toast(msg){const el=$("toast");if(!el)return;el.textContent=msg;el.classList.remove("hidden");clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add("hidden"),1800)}

}


// Consolidated from map-rebuild.js. Keep all app JavaScript in app.js.
{

const firebaseConfig={apiKey:"AIzaSyA_CbiovvY9yvdsQ6wzzwoG2QaqBT0r7Bg",authDomain:"allsetrepportal.firebaseapp.com",projectId:"allsetrepportal",storageBucket:"allsetrepportal.firebasestorage.app",messagingSenderId:"590070052736",appId:"1:590070052736:web:193a9edb6fd378fbd27365",measurementId:"G-SY45913J3Z",databaseURL:"https://allsetrepportal-default-rtdb.firebaseio.com"};
const app=getApps()[0]||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const norm=v=>String(v||"").trim().toLowerCase();
const now=()=>Date.now();
const COLORS={yes:"#22c55e",no:"#ef4444",nothome:"#38bdf8",callback:"#a855f7",none:"#9ca3af"};
const TERRITORY_COLORS={green:"#22c55e",red:"#ef4444",blue:"#38bdf8",purple:"#a855f7",orange:"#f59e0b",gray:"#94a3b8"};
let uid="",map=null,dotLayer=null,territoryLayer=null,tempLayer=null,mode="",drawHandler=null,gpsMarker=null,gpsCircle=null,gpsWatch=null,ready=false;
let dots={},neighborhoods={},reps={},customers={},leads={};
const markerById=new Map(),territoryById=new Map();

bootMapRebuild();
function bootMapRebuild(){
  ensureHud();
  wireHud();
  watchPageMode();
  signInAnonymously(auth).catch(()=>{});
  onAuthStateChanged(auth,u=>{uid=u?.uid||uid;subscribe();});
  waitForMap();
}

function waitForMap(){
  if(window.allsetMap&&window.L){
    map=window.allsetMap;
    setupLayers();
    disableLegacyDrawPrompt();
    wireMap();
    renderAll();
    ready=true;
    setTimeout(()=>map.invalidateSize(),150);
    return;
  }
  setTimeout(waitForMap,180);
}

function setupLayers(){
  if(dotLayer)return;
  dotLayer=L.layerGroup();dotLayer._allsetFullscreenLayer=true;dotLayer.addTo(map);
  territoryLayer=L.layerGroup();territoryLayer._allsetFullscreenLayer=true;territoryLayer.addTo(map);
  tempLayer=L.layerGroup();tempLayer._allsetFullscreenLayer=true;tempLayer.addTo(map);
  clearLegacyLayers();
  setInterval(clearLegacyLayers,1200);
}

function subscribe(){
  if(subscribe.done)return;subscribe.done=true;
  onSnapshot(collection(db,"dots"),s=>{dots=snapObj(s);renderDots();updateCounters();});
  onSnapshot(collection(db,"neighborhoods"),s=>{neighborhoods=snapObj(s);renderTerritories();renderSideList();});
  onSnapshot(collection(db,"reps"),s=>{reps=snapObj(s);renderTerritories();renderSideList();});
  onSnapshot(collection(db,"customers"),s=>{customers=snapObj(s);});
  onSnapshot(collection(db,"leads"),s=>{leads=snapObj(s);});
}
function snapObj(s){const o={};s.forEach(d=>o[d.id]={...d.data(),id:d.data().id||d.id});return o}

function ensureHud(){
  const page=$("page-map");if(!page)return;
  if(!$("mapHudTop"))page.insertAdjacentHTML("afterbegin",`<div id="mapHudTop" class="mapHudTop"><div class="mapSearchShell"><input id="mapHudSearch" placeholder="Search address, customer, rep, or dot" autocomplete="off" /><button id="mapHudSearchBtn" type="button" title="Search">⌕</button></div><div class="mapLegend" aria-label="Map legend"><span><i class="dot-yes"></i>Yes</span><span><i class="dot-no"></i>No</span><span><i class="dot-nothome"></i>Not Home</span><span><i class="dot-callback"></i>Callback</span><span><i class="dot-none"></i>Unmarked</span></div><div class="mapMiniCounters"><span><i class="dot-yes"></i><b id="hudCountYes">0</b></span><span><i class="dot-no"></i><b id="hudCountNo">0</b></span><span><i class="dot-nothome"></i><b id="hudCountNotHome">0</b></span><span><i class="dot-callback"></i><b id="hudCountCallback">0</b></span></div></div>`);
  if(!$("mapIsland"))page.insertAdjacentHTML("beforeend",`<div id="mapIsland" class="mapIsland" aria-label="Live Map toolbar"><button data-map-tool="add" type="button" title="House">&#127968;</button><button data-map-tool="gps" type="button" title="Pin current location">&#128205;</button><button data-map-tool="delete" type="button" title="Trash unwanted house dots">&#128465;</button><button data-map-tool="menu" type="button" title="Menu">&#9776;</button></div>`);
  if(!$("mapModeToast"))page.insertAdjacentHTML("beforeend",`<div id="mapModeToast" class="mapModeToast hidden"></div>`);
}

function wireHud(){
  document.addEventListener("click",async e=>{
    const tool=e.target.closest("[data-map-tool]");
    if(tool){handleTool(tool.dataset.mapTool);return;}
    const dotBtn=e.target.closest("[data-dot-action]");
    if(dotBtn){await handleDotAction(dotBtn);return;}
    const areaBtn=e.target.closest("[data-area-action]");
    if(areaBtn){await handleAreaAction(areaBtn);return;}
  });
  $("mapHudSearchBtn")?.addEventListener("click",runMapSearch);
  $("mapHudSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter")runMapSearch();});
}

function wireMap(){
  map.on("click",async e=>{
    if(mode!=="add")return;
    const id=`dot-${now()}`;
    await setDoc(doc(db,"dots",id),{id,lat:e.latlng.lat,lng:e.latlng.lng,label:"",notes:"",status:"none",createdAt:now(),createdBy:currentName(),createdByUid:uid},{merge:true});
    toastMap("House dot added. Tap it to edit.");
  });
  map.on(L.Draw.Event.CREATED,e=>{
    if(mode!=="draw")return;
    e.layer._pendingArea=true;
    openAreaEditor(null,e.layer,latLngForLayer(e.layer));
    setMode("");
  });
}

function disableLegacyDrawPrompt(){
  if(!map?._events)return;
  const key=L.Draw?.Event?.CREATED||"draw:created";
  const handlers=map._events[key];
  if(Array.isArray(handlers))map._events[key]=handlers.filter(h=>!String(h.fn||h).includes("Territory name?"));
}

function clearLegacyLayers(){
  (window.allsetFeatureGroups||[]).forEach(group=>{if(group&&!group._allsetFullscreenLayer&&typeof group.clearLayers==="function")group.clearLayers();});
}

function renderAll(){renderDots();renderTerritories();renderSideList();updateCounters();}
function renderDots(){
  if(!dotLayer)return;
  clearLegacyLayers();
  const ids=new Set(Object.keys(dots));
  for(const [id,m] of markerById.entries()){if(!ids.has(id)){dotLayer.removeLayer(m);markerById.delete(id);}}
  Object.values(dots).forEach(dot=>{
    if(!Number.isFinite(Number(dot.lat))||!Number.isFinite(Number(dot.lng)))return;
    const style=dotStyle(dot.status);
    let marker=markerById.get(dot.id);
    if(marker){marker.setLatLng([dot.lat,dot.lng]);marker.setStyle(style);marker.off("click");}
    else{marker=L.circleMarker([dot.lat,dot.lng],style).addTo(dotLayer);markerById.set(dot.id,marker);}
    marker.options.bubblingMouseEvents=false;
    marker.on("click",ev=>{L.DomEvent.stopPropagation(ev);if(mode==="delete")deleteDot(dot.id);else openDotPopup(dot.id,marker);});
    marker.bindTooltip(dot.label||"House",{direction:"top",offset:[0,-10],opacity:.9});
  });
}

function renderTerritories(){
  if(!territoryLayer)return;
  clearLegacyLayers();
  territoryLayer.clearLayers();territoryById.clear();
  Object.values(neighborhoods).forEach(nb=>{
    if(!nb.geojson)return;
    const color=nb.color||TERRITORY_COLORS[nb.colorName]||TERRITORY_COLORS.blue;
    const group=L.geoJSON(nb.geojson,{interactive:true,style:{color,weight:4,opacity:.86,fillColor:color,fillOpacity:.14}});
    group.eachLayer(layer=>{
      layer._nbId=nb.id;
      layer.on("click",ev=>{L.DomEvent.stopPropagation(ev);if(mode==="delete")deleteTerritory(nb.id);else if(mode==="assign")openAreaEditor(nb.id,layer,ev.latlng,true);else openAreaPopup(nb.id,layer,ev.latlng);});
      territoryLayer.addLayer(layer);
      territoryById.set(nb.id,layer);
    });
  });
}

function renderSideList(){
  const box=$("territoryList");if(!box)return;
  const all=Object.values(neighborhoods).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
  box.innerHTML=all.length?all.map(nb=>`<div class="territoryItem"><span><span class="territoryName"><span class="territorySwatch" style="background:${esc(nb.color||TERRITORY_COLORS[nb.colorName]||TERRITORY_COLORS.blue)}"></span>${esc(nb.name||"Area")}</span><span class="territoryMeta">${nb.assignedRepName?`Assigned: ${esc(nb.assignedRepName)}`:"Unassigned"}</span></span><span class="territoryActions"><button class="ghostBtn smallBtn" data-area-action="edit" data-id="${esc(nb.id)}">Edit</button><button class="dangerBtn smallBtn" data-area-action="delete" data-id="${esc(nb.id)}">Delete</button></span></div>`).join(""):`<div class="muted">No areas drawn yet.</div>`;
}

function dotStyle(status){
  const s=mapDotStatus(status),color=COLORS[s]||COLORS.none;
  return {radius:11,weight:4,color,fillColor:color,opacity:1,fillOpacity:s==="none"?.72:.9};
}
function mapDotStatus(s){s=String(s||"none").toLowerCase().replace(/[_ -]/g,"");if(["yes","closed","sold"].includes(s))return"yes";if(["no"].includes(s))return"no";if(["nothome","noanswer","notthere","notanswer"].includes(s))return"nothome";if(["callback","followup","followupcallback"].includes(s))return"callback";return"none";}
function statusLabel(s){return {yes:"Yes",no:"No",nothome:"Not Home",callback:"Callback",none:"Unmarked"}[mapDotStatus(s)]||"Unmarked";}

function openDotPopup(id,marker){
  const dot=dots[id];if(!dot)return;
  const html=`<div class="mapPopup"><h3>${esc(dot.label||dot.address||"House Dot")}</h3><div class="mutedText">${esc(statusLabel(dot.status))}</div><input data-dot-field="label" data-id="${esc(id)}" value="${esc(dot.label||dot.address||"")}" placeholder="Label or address" /><textarea data-dot-field="notes" data-id="${esc(id)}" placeholder="Notes">${esc(dot.notes||"")}</textarea><div class="mapStatusGrid"><button class="statusBtn yes" data-dot-action="status" data-status="yes" data-id="${esc(id)}">🟢 Yes</button><button class="statusBtn no" data-dot-action="status" data-status="no" data-id="${esc(id)}">🔴 No</button><button class="statusBtn nothome" data-dot-action="status" data-status="nothome" data-id="${esc(id)}">🔵 Not Home</button><button class="statusBtn callback" data-dot-action="status" data-status="callback" data-id="${esc(id)}">🟣 Callback</button><button class="statusBtn none" data-dot-action="status" data-status="none" data-id="${esc(id)}">⚪ Unmarked</button><button class="mapPlainBtn" data-dot-action="save" data-id="${esc(id)}">Save</button></div><div class="mapPopupActions"><button class="mapPlainBtn" data-dot-action="lead" data-id="${esc(id)}">Lead</button><button class="mapPlainBtn" data-dot-action="job" data-id="${esc(id)}">Job</button><button class="mapDangerBtn full" data-dot-action="delete" data-id="${esc(id)}">Delete Dot</button></div></div>`;
  marker.bindPopup(L.popup({className:"allset-map-popup",closeButton:true,autoPan:true,maxWidth:310,offset:[0,-8]}).setContent(html)).openPopup();
}

async function handleDotAction(btn){
  const id=btn.dataset.id,dot=dots[id];if(!dot)return;
  const root=btn.closest(".mapPopup");
  const label=root?.querySelector('[data-dot-field="label"]')?.value?.trim()||dot.label||"";
  const notes=root?.querySelector('[data-dot-field="notes"]')?.value?.trim()||"";
  const action=btn.dataset.dotAction;
  if(action==="delete"){await deleteDot(id);return;}
  if(action==="lead"){await moveDotToLead(id,label,notes);return;}
  if(action==="job"){await moveDotToJob(id,label,notes);return;}
  const patch={label,notes,updatedAt:now(),updatedBy:currentName()};
  if(action==="status")patch.status=btn.dataset.status||"none";
  await setDoc(doc(db,"dots",id),patch,{merge:true});
  map.closePopup();
  toastMap(action==="status"?`Saved ${statusLabel(patch.status)}`:"Dot saved");
  await log(`House dot updated: ${label||id}`);
}

async function deleteDot(id){
  const dot=dots[id];if(!dot)return;
  if(!confirm(`Delete ${dot.label||"this house dot"}?`))return;
  await deleteDoc(doc(db,"dots",id));
  map.closePopup();
  await log(`House dot deleted: ${dot.label||id}`);
  toastMap("House dot deleted");
}

async function moveDotToLead(id,label,notes){
  const dot=dots[id];if(!dot)return;
  const leadId=`leads-${now()}`;
  await setDoc(doc(db,"leads",leadId),{id:leadId,dotId:id,name:label||"Map Lead",address:label||dot.label||"",phone:"",service:"Window Cleaning",quote:0,status:"lead",notes,repName:currentName(),repId:uid,createdAt:now(),createdBy:currentName(),source:"map_dot"},{merge:true});
  await deleteDoc(doc(db,"dots",id));
  map.closePopup();
  await log(`Dot moved to lead: ${label||id}`);
  toastMap("Moved to Leads");
}

async function moveDotToJob(id,label,notes){
  const dot=dots[id];if(!dot)return;
  const jobId=`jobs-${now()}`;
  await setDoc(doc(db,"jobs",jobId),{id:jobId,dotId:id,title:"Window Cleaning",customer:label||"Map Job",address:label||dot.label||"",phone:"",scheduledAt:"",cleaner:"",price:0,payCleanerAmount:0,status:"open",notes,repName:currentName(),repId:uid,createdAt:now(),createdBy:currentName(),source:"map_dot"},{merge:true});
  await deleteDoc(doc(db,"dots",id));
  map.closePopup();
  await log(`Dot moved to open job: ${label||id}`);
  toastMap("Moved to Jobs as open");
}

function openAreaPopup(id,layer,latlng){
  const nb=neighborhoods[id];if(!nb)return;
  const color=nb.color||TERRITORY_COLORS[nb.colorName]||TERRITORY_COLORS.blue;
  const html=`<div class="mapPopup"><h3>${esc(nb.name||"Neighborhood")}</h3><div class="mutedText"><span style="display:inline-block;width:10px;height:10px;border-radius:99px;background:${esc(color)}"></span> ${esc(nb.colorName||"Area")}<br>${nb.assignedRepName?`Assigned: ${esc(nb.assignedRepName)}`:"Unassigned"}</div>${nb.notes?`<div class="mutedText">${esc(nb.notes)}</div>`:""}<div class="mapPopupActions"><button class="mapPlainBtn" data-area-action="edit" data-id="${esc(id)}">Edit</button><button class="mapPlainBtn" data-area-action="assign" data-id="${esc(id)}">Assign</button><button class="mapDangerBtn full" data-area-action="delete" data-id="${esc(id)}">Delete Area</button></div></div>`;
  layer.bindPopup(L.popup({className:"allset-map-popup",closeButton:true,autoPan:true,maxWidth:310}).setLatLng(latlng).setContent(html)).openPopup();
}

function openAreaEditor(id,layer,latlng,assignFocus=false){
  const nb=id?neighborhoods[id]:{};
  const repOptions=[`<option value="">Unassigned</option>`].concat(Object.entries(reps).filter(([,r])=>(r.role||"rep")!=="cleaner").map(([rid,r])=>`<option value="${esc(rid)}"${(nb.assignedRepId===rid||nb.assignedRepName===r.name)?" selected":""}>${esc(r.name||rid)}</option>`)).join("");
  const colorOptions=Object.entries(TERRITORY_COLORS).map(([name,color])=>`<option value="${esc(name)}"${(nb.colorName===name||nb.color===color)?" selected":""}>${esc(name[0].toUpperCase()+name.slice(1))}</option>`).join("");
  const title=id?"Edit Area":"Save New Area";
  const html=`<div class="mapPopup"><h3>${title}</h3><input data-area-field="name" value="${esc(nb.name||"")}" placeholder="Neighborhood name" /><select data-area-field="assignedRepId">${repOptions}</select><select data-area-field="colorName">${colorOptions}</select><textarea data-area-field="notes" placeholder="Notes">${esc(nb.notes||"")}</textarea><div class="mapPopupActions"><button class="mapSaveBtn full" data-area-action="save" data-id="${esc(id||"")}">Save Area</button>${id?`<button class="mapPlainBtn" data-area-action="unassign" data-id="${esc(id)}">Unassign</button><button class="mapDangerBtn" data-area-action="delete" data-id="${esc(id)}">Delete</button>`:`<button class="mapDangerBtn full" data-area-action="cancel-new">Cancel</button>`}</div></div>`;
  if(!id){tempLayer.clearLayers();layer.setStyle?.({color:TERRITORY_COLORS.blue,weight:4,fillColor:TERRITORY_COLORS.blue,fillOpacity:.13});tempLayer.addLayer(layer);}
  L.popup({className:"allset-map-popup",closeButton:true,autoPan:true,maxWidth:310}).setLatLng(latlng).setContent(html).openOn(map);
  if(assignFocus)setTimeout(()=>document.querySelector('[data-area-field="assignedRepId"]')?.focus(),50);
}

async function handleAreaAction(btn){
  const action=btn.dataset.areaAction,id=btn.dataset.id;
  if(action==="cancel-new"){tempLayer.clearLayers();map.closePopup();return;}
  if(action==="delete"){await deleteTerritory(id);return;}
  if(action==="unassign"){await setDoc(doc(db,"neighborhoods",id),{assignedRepId:"",assignedRepName:"",updatedAt:now(),updatedBy:currentName()},{merge:true});map.closePopup();toastMap("Area unassigned");return;}
  if(action==="assign"||action==="edit"){const layer=territoryById.get(id);if(layer)openAreaEditor(id,layer,latLngForLayer(layer),action==="assign");return;}
  if(action!=="save")return;
  const popup=btn.closest(".mapPopup"),layer=tempLayer.getLayers()[0]||territoryById.get(id);
  if(!layer)return toastMap("Draw the area first");
  const colorName=popup.querySelector('[data-area-field="colorName"]')?.value||"blue";
  const assignedRepId=popup.querySelector('[data-area-field="assignedRepId"]')?.value||"";
  const assignedRepName=assignedRepId?(reps[assignedRepId]?.name||""):"";
  const areaId=id||`nb-${now()}`;
  const name=popup.querySelector('[data-area-field="name"]')?.value?.trim()||"Neighborhood";
  const notes=popup.querySelector('[data-area-field="notes"]')?.value?.trim()||"";
  const color=TERRITORY_COLORS[colorName]||TERRITORY_COLORS.blue;
  await setDoc(doc(db,"neighborhoods",areaId),{id:areaId,name,color,colorName,assignedRepId,assignedRepName,notes,geojson:layer.toGeoJSON(),updatedAt:now(),updatedBy:currentName(),...(id?{}:{createdAt:now(),createdBy:currentName()})},{merge:true});
  if(assignedRepId)await setDoc(doc(db,"reps",assignedRepId),{assignedNeighborhoodId:areaId},{merge:true});
  tempLayer.clearLayers();map.closePopup();
  await log(`${id?"Territory updated":"Territory created"}: ${name}${assignedRepName?` assigned to ${assignedRepName}`:""}`);
  toastMap("Area saved");
}

async function deleteTerritory(id){
  const nb=neighborhoods[id];if(!nb)return toastMap("Area not found");
  if(!confirm(`Delete ${nb.name||"this territory"}?`))return;
  await deleteDoc(doc(db,"neighborhoods",id));
  map.closePopup();
  await log(`Territory deleted: ${nb.name||id}`);
  toastMap("Territory deleted");
}

function handleTool(tool){
  if(tool==="menu"){togglePortalMenu();return;}
  if(tool==="gps"){toggleGps();return;}
  if(!["add","delete"].includes(tool)) return;
  setMode(mode===tool?"":tool);
  const msg={add:"House mode: tap the map.",delete:"Trash mode: tap an unwanted house dot."}[mode]||"Map mode off";
  toastMap(msg);
}
function togglePortalMenu(){
  document.querySelector('.navBtn[data-page="dashboard"]')?.click();
  document.querySelectorAll(".page").forEach(page=>page.classList.remove("active"));
  $("page-dashboard")?.classList.add("active");
  document.querySelectorAll(".navBtn").forEach(btn=>btn.classList.toggle("active",btn.dataset.page==="dashboard"));
  $("nav")?.classList.remove("open");
  $("mobileNavBtn")?.setAttribute("aria-expanded","false");
  document.body.classList.remove("map-mode");
}
function setMode(next){mode=next;document.querySelectorAll("[data-map-tool]").forEach(b=>b.classList.toggle("active",b.dataset.mapTool===mode));}
function startDraw(){
  if(!ready)return;
  disableLegacyDrawPrompt();
  if(drawHandler?.disable)drawHandler.disable();
  drawHandler=new L.Draw.Polygon(map,{allowIntersection:false,showArea:true,shapeOptions:{color:TERRITORY_COLORS.blue,weight:4,fillColor:TERRITORY_COLORS.blue,fillOpacity:.13}});
  drawHandler.enable();
  toastMap("Draw the area, then enter name, color, and assignment.");
}

function toggleGps(){
  if(gpsWatch!=null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;if(gpsMarker)map.removeLayer(gpsMarker);if(gpsCircle)map.removeLayer(gpsCircle);gpsMarker=gpsCircle=null;document.querySelector('[data-map-tool="gps"]')?.classList.remove("active");toastMap("GPS off");return;}
  if(!navigator.geolocation)return toastMap("GPS not supported");
  document.querySelector('[data-map-tool="gps"]')?.classList.add("active");
  gpsWatch=navigator.geolocation.watchPosition(pos=>{
    const ll=[pos.coords.latitude,pos.coords.longitude],acc=Math.max(pos.coords.accuracy||20,14);
    if(!gpsMarker){gpsMarker=L.circleMarker(ll,{radius:8,weight:3,color:"#38bdf8",fillColor:"#38bdf8",fillOpacity:.9}).addTo(map);gpsCircle=L.circle(ll,{radius:acc,weight:1,color:"rgba(56,189,248,.42)",fillColor:"rgba(56,189,248,.13)",fillOpacity:1}).addTo(map);map.setView(ll,Math.max(map.getZoom(),16));}
    else{gpsMarker.setLatLng(ll);gpsCircle.setLatLng(ll);gpsCircle.setRadius(acc);}
  },err=>{toastMap(err.message);},{enableHighAccuracy:true,timeout:14000,maximumAge:5000});
}

function runMapSearch(){
  const q=norm($("mapHudSearch")?.value);if(!q)return;
  const dot=Object.values(dots).find(d=>[d.label,d.address,d.notes,d.id].some(v=>norm(v).includes(q)));
  if(dot)return focusDot(dot);
  const cust=Object.values(customers).find(c=>[c.name,c.address,c.phone].some(v=>norm(v).includes(q)));
  if(cust){const near=Object.values(dots).find(d=>norm(d.label||d.address).includes(norm(cust.address||cust.name)));if(near)return focusDot(near);toastMap(`Found customer: ${cust.name||cust.address}. No map dot linked.`);return;}
  const lead=Object.values(leads).find(l=>[l.name,l.address,l.phone].some(v=>norm(v).includes(q)));
  if(lead){const near=Object.values(dots).find(d=>norm(d.label||d.address).includes(norm(lead.address||lead.name)));if(near)return focusDot(near);toastMap(`Found lead: ${lead.name||lead.address}. No map dot linked.`);return;}
  const rep=Object.values(reps).find(r=>norm(r.name).includes(q));
  if(rep){const area=Object.values(neighborhoods).find(n=>n.assignedRepId===rep.uid||n.assignedRepName===rep.name);const layer=area&&territoryById.get(area.id);if(layer){map.fitBounds(layer.getBounds(),{padding:[50,80]});openAreaPopup(area.id,layer,latLngForLayer(layer));return;}toastMap(`Found rep: ${rep.name}. No assigned area.`);return;}
  toastMap("No map match");
}
function focusDot(dot){const marker=markerById.get(dot.id);map.setView([dot.lat,dot.lng],Math.max(map.getZoom(),18),{animate:true});if(marker)setTimeout(()=>openDotPopup(dot.id,marker),180);}

function updateCounters(){
  const c={yes:0,no:0,nothome:0,callback:0};Object.values(dots).forEach(d=>{const s=mapDotStatus(d.status);if(c[s]!=null)c[s]++;});
  setText("hudCountYes",c.yes);setText("hudCountNo",c.no);setText("hudCountNotHome",c.nothome);setText("hudCountCallback",c.callback);
  setText("countYes",c.yes);setText("countNo",c.no);setText("countNotHome",c.nothome);setText("countCallback",c.callback);
}
function setText(id,v){const el=$(id);if(el)el.textContent=String(v)}
function latLngForLayer(layer){try{return layer.getBounds().getCenter();}catch{return map.getCenter();}}
function currentName(){return localStorage.getItem("allset_rep_name")||$("nicknameInput")?.value||"Team"}
async function log(text){try{const ref=doc(db,"shared","activityLog"),snap=await getDoc(ref),entries=snap.exists()?(snap.data().entries||[]):[];await setDoc(ref,{entries:[{t:now(),text},...entries].slice(0,150)},{merge:true});}catch(e){console.warn("log failed",e)}}
function toastMap(msg){const el=$("mapModeToast");if(!el)return;el.textContent=msg;el.classList.remove("hidden");clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add("hidden"),2100);}
function watchPageMode(){
  const sync=()=>{const on=$("page-map")?.classList.contains("active");document.body.classList.toggle("map-mode",!!on);if(on)setTimeout(()=>map?.invalidateSize?.(),120);};
  sync();
  const main=document.querySelector(".main");if(main)new MutationObserver(sync).observe(main,{subtree:true,attributes:true,attributeFilter:["class"]});
  document.addEventListener("click",e=>{if(e.target.closest('.navBtn[data-page="map"]'))setTimeout(sync,0);});
}

}


// Consolidated from rep-portal-fixes.js. Keep all app JavaScript in app.js.
{

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

}


// Consolidated from rep-portal-followup-fixes.js. Keep all app JavaScript in app.js.
{

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
      ? `${mine ? `<button class="ghostBtn smallBtn claimedRecurringFixBtn" data-id="${esc(job.id)}" disabled>Claimed</button>` : ""}<button class="ghostBtn smallBtn editRecurringFixBtn" data-id="${esc(job.id)}">Edit</button>`
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

}


// Consolidated from rep-portal-followup-hotfix.js. Keep all app JavaScript in app.js.
{
// Retired compatibility layer.
// Board rendering now lives in rep-portal-ui-hotfix-2.js so rows do not flicker between competing renderers.
console.log("AllSet board compatibility layer retired");

}


// Consolidated from rep-portal-identity-fix.js. Keep all app JavaScript in app.js.
{
// Identity experiment retired.
// The CRM now keeps the normal nickname/role behavior without creating stable nickname records.
console.log("AllSet identity compatibility layer retired");

}


// Consolidated from rep-portal-ui-hotfix-2.js. Keep all app JavaScript in app.js.
{

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
    const completedButton = status === "claimed" && role === "cleaner" && mine
      ? `<button class="ghostBtn smallBtn claimedJobBtn" data-id="${esc(job.id)}" disabled>Claimed</button>`
      : status !== "completed" && (role !== "cleaner" || mine) ? `<button class="actionBtn smallBtn completeOpenJobBtn" data-id="${esc(job.id)}">Completed</button>` : "";
    const editButton = role !== "cleaner" ? `<button class="ghostBtn smallBtn" onclick="window.crmEdit?.('job','${esc(job.id)}')">Edit</button>` : "";
    const customerButton = role !== "cleaner" ? `<button class="ghostBtn smallBtn moveJobCustomerStrictBtn" data-id="${esc(job.id)}">Customer</button>` : "";
    return `<tr><td><strong>${esc(job.customer || job.title || "Job")}</strong><br><span class="muted">${esc(job.jobId || job.businessJobId || "")}${job.invoiceNumber ? ` / ${esc(job.invoiceNumber)}` : ""}</span></td><td>${esc(job.phone || "-")}</td><td>${esc(readableDate(job.scheduledAt) || "-")}</td><td>${esc(job.cleanerName || job.cleaner || "-")}</td><td>${money(job.price || job.amount || job.quote || 0)}</td><td>${money(repPay(job))}</td><td>${money(cleanerPay(job))}</td><td>${money(totalLaborCost(job))}</td><td>${esc(readableDate(job.cleanedAt || job.completedAt || job.lastCleanedAt) || "-")}</td><td><span class="status ${esc(status)}">${esc(labelStatus(status))}</span></td><td><div class="tableActions">${claimButton}${completedButton}${editButton}${customerButton}</div></td></tr>`;
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
  const rows = [...cleaners.values()].sort((a,b) => b.earned - a.earned || b.completed - a.completed).map(row => {
    const repDoc = row.repDocId ? reps[row.repDocId] : null;
    const earned = repDoc && repDoc.amountEarned !== undefined && repDoc.amountEarned !== "" ? Number(repDoc.amountEarned || 0) : row.earned;
    return `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.claimed}</td><td>${row.completed}</td><td>${money(earned)}</td>${admin ? `<td>${row.repDocId ? `<button class="ghostBtn smallBtn" onclick="window.crmEdit?.('team','${esc(row.repDocId)}')">Edit</button><button class="dangerBtn smallBtn deleteBoardCleanerBtn" data-id="${esc(row.repDocId)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`;
  });
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

async function completeOpenJob(id){
  const job = jobs[id];
  if(!job) return toast("Job not found");
  const t = Date.now();
  const jobId = job.jobId || job.businessJobId || nextBusinessId("AS", job);
  const invoiceNumber = job.invoiceNumber || nextBusinessId("INV", job);
  await setDoc(doc(db, "jobs", id), { jobId, businessJobId: jobId, invoiceNumber, status: "completed", cleanerId: job.cleanerId || uid, cleanerName: job.cleanerName || job.cleaner || currentName(), cleaner: job.cleaner || job.cleanerName || currentName(), completedAt: t, cleanedAt: t, lastCleanedAt: t, totalLaborCost: totalLaborCost(job), updatedAt: t, updatedBy: currentName() }, { merge: true });
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
function shouldHideCleanerName(name){ return normalizeName(name) === "laith" || (isAdminish() && normalizeName(name) === normalizeName(currentName())); }
function normalizeName(name){ return String(name || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function sameName(a,b){ return normalizeName(a) && normalizeName(a) === normalizeName(b); }
function stableKey(name){ const slug = normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); return slug ? `user-${slug}` : ""; }
function num(...values){ for(const value of values){ const n = Number(value); if(Number.isFinite(n) && value !== "") return n; } return 0; }
function repPay(job){ return num(job.repPay, job.repCommission, job.commissionAmount, job.repCommissionAmount); }
function cleanerPay(job){ return num(job.payCleanerAmount, job.cleanerPay, job.cleanerAmount, job.payCleaner, job.cleanerPayout); }
function totalLaborCost(job){ return repPay(job) + cleanerPay(job); }
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

}


// Consolidated from rep-portal-bookkeeping-guard.js. Keep all app JavaScript in app.js.
{

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
let jobs = {};
let pendingJobId = "";
let wrapped = false;

bootBookkeepingGuard();

function bootBookkeepingGuard(){
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, () => {
    onSnapshot(collection(db, "jobs"), snap => {
      jobs = {};
      snap.forEach(item => jobs[item.id] = { ...item.data(), id: item.data().id || item.id });
    });
  });
  document.addEventListener("click", event => {
    const edit = event.target.closest?.('[onclick*="crmEdit"]');
    const add = event.target.closest?.('[data-open="jobModal"]');
    if(add) pendingJobId = "";
    if(edit){
      const id = String(edit.getAttribute("onclick") || "").match(/crmEdit\?\.\('job','([^']+)'\)/)?.[1] || "";
      if(id) pendingJobId = id;
    }
    setTimeout(syncJobBookkeepingFields, 180);
    setTimeout(syncJobBookkeepingFields, 420);
  }, true);
  setInterval(() => { wrapCrmEdit(); syncJobBookkeepingFields(); }, 700);
}

function wrapCrmEdit(){
  if(wrapped || typeof window.crmEdit !== "function") return;
  const original = window.crmEdit;
  window.crmEdit = function(kind, id){
    if(kind === "job") pendingJobId = id || "";
    const result = original.apply(this, arguments);
    setTimeout(syncJobBookkeepingFields, 80);
    setTimeout(syncJobBookkeepingFields, 260);
    return result;
  };
  window.crmEdit.__bookkeepingGuard = true;
  wrapped = true;
}

function syncJobBookkeepingFields(){
  if(!pendingJobId) return;
  const job = jobs[pendingJobId];
  const card = document.getElementById("modalCard");
  if(!job || !card || !/edit job/i.test(card.textContent || "")) return;
  const jobIdInput = card.querySelector('[data-field="jobId"]');
  const invoiceInput = card.querySelector('[data-field="invoiceNumber"]');
  const repPayInput = card.querySelector('[data-field="repPay"]');
  if(jobIdInput) jobIdInput.value = job.jobId || job.businessJobId || jobIdInput.value || "";
  if(invoiceInput) invoiceInput.value = job.invoiceNumber || invoiceInput.value || "";
  if(repPayInput && (job.repPay || job.repCommission || job.commissionAmount || job.repCommissionAmount)) repPayInput.value = job.repPay || job.repCommission || job.commissionAmount || job.repCommissionAmount || "";
}

}


// Consolidated from rep-portal-customer-mobile-and-laith-filter.js. Keep all app JavaScript in app.js.
{

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
    if(!rowsByKey.has(key)) rowsByKey.set(key, { id, name, revenue: 0, completed: 0 });
  });
  Object.values(jobs).filter(validRecord).forEach(job => {
    if(!isCompletedJob(job)) return;
    const name = job.repName || reps[job.repId]?.name || "Rep";
    if(isBlockedName(name)) return;
    const key = stableKey(name) || job.repId || name;
    if(!rowsByKey.has(key)) rowsByKey.set(key, { id: job.repId || key, name, revenue: 0, completed: 0 });
    const row = rowsByKey.get(key);
    row.completed++;
    row.revenue += jobRevenue(job);
  });
  const admin = isAdminish();
  const rows = [...rowsByKey.values()].sort((a,b) => b.revenue - a.revenue).map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${money(row.revenue)}</td><td>${row.completed}</td>${admin ? `<td>${reps[row.id] ? `<button class="ghostBtn smallBtn" onclick="window.crmEdit?.('team','${esc(row.id)}')">Edit</button><button class="dangerBtn smallBtn deleteRepBtn" data-id="${esc(row.id)}" data-name="${esc(row.name)}">Delete</button>` : ""}</td>` : ""}</tr>`);
  const html = rows.length ? `<table class="dataTable"><thead><tr><th>Rep</th><th>Revenue</th><th>Completed Jobs</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No leaderboard data yet.</div>`;
  if(table.innerHTML !== html){ table.innerHTML = html; lastLeaderboardSignature = html; }
}

function renderTeam(){
  const table = $("teamTable");
  if(!table) return;
  const rows = Object.entries(reps).filter(([, rep]) => !isBlockedName(rep.name || rep.displayName)).map(([id, rep]) => {
    const completed = Object.values(jobs).filter(job => validRecord(job) && isCompletedJob(job) && (job.repId === id || sameName(job.repName, rep.name) || job.cleanerId === id || sameName(job.cleanerName || job.cleaner, rep.name)));
    const revenue = completed.reduce((sum, job) => sum + jobRevenue(job), 0);
    const earned = rep.amountEarned === undefined || rep.amountEarned === "" ? "-" : money(rep.amountEarned);
    return `<tr><td><strong>${esc(rep.name || "Rep")}</strong><br><span class="muted">${esc(rep.role || "rep")}</span></td><td>${completed.length}</td><td>${money(revenue)}</td><td>${money(rep.commissionOwed || 0)}</td><td>${earned}</td><td><button class="ghostBtn smallBtn" onclick="window.crmEdit?.('team','${esc(id)}')">Edit</button><button class="dangerBtn smallBtn" onclick="window.removeTeamMember?.('${esc(id)}','${esc(rep.name || "")}')">Remove</button></td></tr>`;
  });
  const html = rows.length ? `<table class="dataTable"><thead><tr><th>Member</th><th>Completed Jobs</th><th>Job Revenue</th><th>Commission</th><th>Amount Earned</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No team members online yet.</div>`;
  if(table.innerHTML !== html){ table.innerHTML = html; lastTeamSignature = html; }
}

function renderDashboardTotals(){
  const week = weekStart();
  const completed = Object.values(jobs).filter(job => validRecord(job) && isCompletedJob(job));
  const weekly = completed.filter(job => completedDate(job) >= week);
  const weekRevenue = weekly.reduce((sum, job) => sum + jobRevenue(job), 0);
  const totalRevenue = completed.reduce((sum, job) => sum + jobRevenue(job), 0);
  const recentWeek = latestRevenueJob(weekly);
  const recentTotal = latestRevenueJob(completed);
  if($("statWeekRevenue")) $("statWeekRevenue").textContent = money(weekRevenue);
  if($("statTotalRevenue")) $("statTotalRevenue").textContent = money(totalRevenue);
  if($("statWeekRevenueDetail")) $("statWeekRevenueDetail").textContent = recentWeek ? `${money(jobRevenue(recentWeek))} from ${latestJobName(recentWeek)}` : "Completed jobs since Monday";
  if($("statTotalRevenueDetail")) $("statTotalRevenueDetail").textContent = recentTotal ? `${money(jobRevenue(recentTotal))} from ${latestJobName(recentTotal)}` : "Completed jobs only";
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
function isBlockedName(name){ return normalizeName(name) === "laith computer"; }
function shouldHideCleanerName(name){ return isBlockedName(name) || normalizeName(name) === "laith" || (isAdminish() && normalizeName(name) === normalizeName(currentName())); }
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
function isCompletedJob(job){ return jobStatus(job.status) === "completed" || !!(job.completedAt || job.cleanedAt || job.lastCleanedAt); }
function completedDate(job){ return dateVal(job.completedAt || job.cleanedAt || job.lastCleanedAt || job.jobDate || job.updatedAt || job.createdAt); }
function jobRevenue(job){ return Number(job.price || job.amount || job.quote || job.lifetimeRevenue || 0); }
function latestRevenueJob(list){ return [...list].sort((a,b) => completedDate(b) - completedDate(a))[0] || null; }
function latestJobName(job){ return job.customer || job.name || job.title || job.address || job.jobId || job.id || "job"; }
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

}


// Consolidated from rep-portal-laith-computer-block.js. Keep all app JavaScript in app.js.
{

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
const observed = new WeakSet();

bootLaithComputerBlock();

function bootLaithComputerBlock(){
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, () => subscribe());
  installScopedStabilizers();
  setInterval(scrubAll, 300);
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

function installScopedStabilizers(){
  const tick = () => {
    ["boardTable", "leaderboardTable", "teamTable", "jobsTable"].forEach(id => observeTable($(id)));
    scrubAll();
    setTimeout(tick, 1000);
  };
  tick();
}

function observeTable(root){
  if(!root || observed.has(root)) return;
  observed.add(root);
  new MutationObserver(() => requestAnimationFrame(scrubAll)).observe(root, { childList: true, subtree: true });
}

function scrubAll(){
  scrubVisibleRows();
  scrubJobActions();
  scrubDashboardTotals();
}

function scrubVisibleRows(){
  ["boardTable", "leaderboardTable", "teamTable"].forEach(id => {
    const root = $(id);
    if(!root) return;
    root.querySelectorAll("tbody tr, .card").forEach(row => {
      if(containsLaithComputer(row.textContent)) row.remove();
    });
  });
}

function scrubJobActions(){
  const root = $("jobsTable");
  if(!root) return;
  root.querySelectorAll("tbody tr").forEach(row => {
    const status = row.querySelector(".status")?.textContent?.trim().toLowerCase() || "";
    const completed = row.querySelector(".completeOpenJobBtn");
    if(completed && ["open", "scheduled"].includes(status)) completed.remove();
  });
}

function scrubDashboardTotals(){
  const week = weekStart();
  const completed = Object.values(jobs).filter(record => !isLaithComputerRecord(record) && isCompletedJob(record));
  const weekly = completed.filter(job => completedDate(job) >= week);
  const weekRevenue = weekly.reduce((sum, job) => sum + jobRevenue(job), 0);
  const totalRevenue = completed.reduce((sum, job) => sum + jobRevenue(job), 0);
  const recentWeek = latestRevenueJob(weekly);
  const recentTotal = latestRevenueJob(completed);
  if($("statWeekRevenue")) $("statWeekRevenue").textContent = money(weekRevenue);
  if($("statTotalRevenue")) $("statTotalRevenue").textContent = money(totalRevenue);
  if($("statWeekRevenueDetail")) $("statWeekRevenueDetail").textContent = recentWeek ? `${money(jobRevenue(recentWeek))} from ${latestJobName(recentWeek)}` : "Completed jobs since Monday";
  if($("statTotalRevenueDetail")) $("statTotalRevenueDetail").textContent = recentTotal ? `${money(jobRevenue(recentTotal))} from ${latestJobName(recentTotal)}` : "Completed jobs only";
}

function isLaithComputerRecord(record){
  const fields = [record.id, record._docId, record.repId, record.cleanerId, record.repName, record.rep, record.cleanerName, record.cleaner, record.createdBy, record.updatedBy];
  const rep = reps[record.repId] || {};
  const cleaner = reps[record.cleanerId] || {};
  fields.push(rep.id, rep._docId, rep.name, rep.displayName, cleaner.id, cleaner._docId, cleaner.name, cleaner.displayName);
  return fields.some(isLaithComputer);
}

function isLaithComputer(value){
  const compact = compactName(value);
  return compact === "laithcomputer" || compact === "userlaithcomputer";
}

function containsLaithComputer(value){
  const compact = compactName(value);
  return compact.includes("laithcomputer") || compact.includes("userlaithcomputer");
}

function compactName(value){ return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function money(n){ return "$" + Number(n || 0).toLocaleString(); }
function dateVal(value){ if(!value) return 0; if(typeof value === "number") return value; if(value.seconds) return value.seconds * 1000; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; }
function todayStart(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function weekStart(){ const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0,0,0,0); return d.getTime(); }

}


// Consolidated from rep-portal-jobs-scroll-fix.js. Keep all app JavaScript in app.js.
{
const $ = id => document.getElementById(id);

let jobsScrollLeft = 0;
let installed = false;

bootJobsScrollFix();

function bootJobsScrollFix(){
  injectCss();
  waitForJobsTable();
}

function waitForJobsTable(){
  const table = $("jobsTable");
  if(!table) return setTimeout(waitForJobsTable, 250);
  install(table);
}

function install(table){
  if(installed) return;
  installed = true;

  table.addEventListener("scroll", () => {
    jobsScrollLeft = table.scrollLeft || 0;
  }, { passive: true });

  new MutationObserver(() => {
    if(!jobsScrollLeft) return;
    requestAnimationFrame(() => {
      const current = $("jobsTable");
      if(current && Math.abs((current.scrollLeft || 0) - jobsScrollLeft) > 2){
        current.scrollLeft = jobsScrollLeft;
      }
    });
  }).observe(table, { childList: true });
}

function injectCss(){
  if($("jobsScrollFixCss")) return;
  const style = document.createElement("style");
  style.id = "jobsScrollFixCss";
  style.textContent = `#jobsTable.tableCard,#jobsTable{overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;touch-action:pan-x pan-y}#jobsTable table.dataTable{min-width:1050px}`;
  document.head.appendChild(style);
}

}
