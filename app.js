console.log("✅ ALLSET LIVE CRM LOADED");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, set, onValue, onDisconnect, serverTimestamp as rtServerTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
  const leads = Object.values(leadsCache), jobs = Object.values(jobsCache), payments = Object.values(paymentsCache), dots = Object.values(dotsCache);
  const ws = weekStart(), ts = todayStart();
  const weekRevenue = [...leads,...jobs].filter(x=>dateVal(x.createdAt||x.scheduledAt)>=ws).reduce((s,x)=>s+Number(x.amount||x.quote||x.price||0),0);
  const todayRevenue = [...leads,...jobs].filter(x=>dateVal(x.createdAt||x.completedAt)>=ts).reduce((s,x)=>s+Number(x.amount||x.quote||x.price||0),0);
  
  if ($("statTodayRevenue")) $("statTodayRevenue").textContent = money(todayRevenue); 
  if ($("statWeekRevenue")) $("statWeekRevenue").textContent = money(weekRevenue);
  if ($("statSoldDots")) $("statSoldDots").textContent = String(dots.filter(d=>d.status==="yes").length);
  if ($("statActiveJobs")) $("statActiveJobs").textContent = String(jobs.filter(j=>["scheduled","in progress"].includes((j.status||"").toLowerCase())).length);
  if ($("dashLeads")) $("dashLeads").textContent = leads.length; 
  if ($("dashQuotes")) $("dashQuotes").textContent = leads.filter(l=>l.status==="quote").length;
  if ($("dashScheduled")) $("dashScheduled").textContent = jobs.filter(j=>j.status==="scheduled").length; 
  if ($("dashCompleted")) $("dashCompleted").textContent = jobs.filter(j=>j.status==="completed").length;
  if ($("dashUnpaid")) $("dashUnpaid").textContent = payments.filter(p=>p.status!=="paid").length;
  renderGoalGauge(weekRevenue);
  
  const repRevenue = {};
  leads.filter(l=>dateVal(l.createdAt)>=ws).forEach(l=>{ const n=leadRepName(l); repRevenue[n]=(repRevenue[n]||0)+Number(l.amount||l.quote||0); });
  jobs.filter(j=>dateVal(j.createdAt||j.scheduledAt)>=ws).forEach(j=>{ const n=j.repName||repsCache[j.repId]?.name||"House"; repRevenue[n]=(repRevenue[n]||0)+Number(j.price||0); });
  const leaders = Object.entries(repRevenue).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const podium = $("podium");
  if(!podium) return;
  if(!leaders.length){ podium.innerHTML = `<div class="podiumCard second"><div class="rank">🥈</div><div class="podiumName">No data</div><div class="podiumMoney">$0</div></div><div class="podiumCard first"><div class="rank">🥇</div><div class="podiumName">Start selling</div><div class="podiumMoney">$0</div><div class="podiumSub">this week</div></div><div class="podiumCard third"><div class="rank">🥉</div><div class="podiumName">No data</div><div class="podiumMoney">$0</div></div>`; return; }
  const cards = [leaders[1],leaders[0],leaders[2]];
  const cls = ["second","first","third"], emoji=["🥈","🥇","🥉"];
  podium.innerHTML = cards.map((x,i)=> x ? `<div class="podiumCard ${cls[i]}"><div class="rank">${emoji[i]}</div><div class="podiumName">${esc(x[0])}</div><div class="podiumMoney">${money(x[1])}</div><div class="podiumSub">weekly D2D revenue</div></div>` : `<div class="podiumCard ${cls[i]}"><div class="rank">${emoji[i]}</div><div class="podiumName">Open spot</div><div class="podiumMoney">$0</div></div>`).join("");
}

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
  const rows = Object.entries(repsCache).map(([id,r])=>{ const revenue=Object.values(leadsCache).filter(l=>l.repId===id||l.repName===r.name).reduce((s,l)=>s+Number(l.quote||l.amount||0),0); const sold=Object.values(leadsCache).filter(l=>(l.repId===id||l.repName===r.name)&&l.status==="sold").length; return `<tr><td><strong>${esc(r.name||"Rep")}</strong><br><span class="muted">${esc(r.role||"rep")}</span></td><td>${sold}</td><td>${money(revenue)}</td><td>${money(r.commissionOwed||0)}</td><td>${esc(r.assignedNeighborhoodId||"—")}</td><td><button class="dangerBtn smallBtn" onclick="window.removeTeamMember('${id}','${esc(r.name||"")}')">Remove</button></td></tr>`; });
  renderTable("teamTable",["Member","Sales","Revenue","Commission","Assigned",""],rows,"No team members online yet.");
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
    jobModal:{title:"Job",coll:"jobs",fields:["title","customer","phone","address","scheduledAt","cleaner","price","status","notes"],defaults:{status:"scheduled",repName:currentName,repId:currentUid},selects:{status:["scheduled","in progress","completed","cancelled"]}},
    customerModal:{title:"Customer",coll:"customers",fields:["name","phone","address","service","lifetimeRevenue","notes"],defaults:{service:"Window Cleaning"}},
    teamModal:{title:"Team Member",coll:"reps",fields:["name","role","phone","commissionOwed"],defaults:{role:"rep"},selects:{role:["rep","cleaner","admin"]}},
    paymentModal:{title:"Payment",coll:"payments",fields:["customer","amount","method","status","note"],defaults:{status:"unpaid",method:"Cash App"},selects:{method:["Cash App","Venmo","Zelle","Cash","Check","Card"],status:["unpaid","paid","partial","refunded"]}},
    equipmentModal:{title:"Equipment",coll:"equipment",fields:["name","status","holder","location","tracker","notes"],defaults:{status:"available",location:settingsCache.locker||""},selects:{status:["available","checked out","missing","maintenance"]}}
  };
  const cfg=configs[type]; 
  openRecordModal(cfg,{...cfg.defaults,...seed});
}

window.crmEdit = (kind,id) => { 
  const configs={
    lead:{title:"Lead",coll:"leads",fields:["name","phone","address","service","quote","status","notes"],selects:{status:["lead","quote","sold","converted","no","callback"]}},
    job:{title:"Job",coll:"jobs",fields:["title","customer","phone","address","scheduledAt","cleaner","price","status","notes"],selects:{status:["scheduled","in progress","completed","cancelled"]}},
    customer:{title:"Customer",coll:"customers",fields:["name","phone","address","service","lifetimeRevenue","notes"]},
    payment:{title:"Payment",coll:"payments",fields:["customer","amount","method","status","note"],selects:{method:["Cash App","Venmo","Zelle","Cash","Check","Card"],status:["unpaid","paid","partial","refunded"]}},
    equipment:{title:"Equipment",coll:"equipment",fields:["name","status","holder","location","tracker","notes"],selects:{status:["available","checked out","missing","maintenance"]}}
  };
  const data={lead:leadsCache[id],job:jobsCache[id],customer:customersCache[id],payment:paymentsCache[id],equipment:equipmentCache[id]}[kind];
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
  const type = ["quote","amount","price","lifetimeRevenue","commissionOwed"].includes(f) ? "number" : "text";
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
    await setDoc(doc(db,cfg.coll,rec.id),rec,{merge:true}); 
    if(cfg.coll==="leads" && rec.dotId && rec.address){
      await setDoc(doc(db,"dots",rec.dotId),{label:rec.address,notes:rec.address,leadId:rec.id,updatedAt:Date.now(),updatedBy:currentName},{merge:true});
    }
    await addRemoteLog(`💾 ${currentName} saved ${cfg.title}: ${rec.name||rec.title||rec.customer||rec.address||rec.id}`); 
    closeModal(); 
    toast(`${cfg.title} saved live`); 
  };
  $("deleteRecordBtn").onclick = async () => { if(confirm("Delete this record?")){ await deleteDoc(doc(db,cfg.coll,id)); await addRemoteLog(`🗑 ${currentName} deleted ${cfg.title}`); closeModal(); } };
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
