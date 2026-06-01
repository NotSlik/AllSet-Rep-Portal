console.log("✅ ALLSET CRM PLATFORM CORING SYSTEM LOADED");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const LS_NAME = "allset_rep_name";
const LS_ROLE = "allset_rep_role";
const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const standardHours = ["12 AM","1 AM","2 AM","3 AM","4 AM","5 AM","6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM","11 PM"];

const $ = (id) => document.getElementById(id);
const gate = $("gate"), appRoot = $("app"), nicknameInput = $("nicknameInput"), roleSelect = $("roleSelect"), enterBtn = $("enterBtn");
const repNameEl = $("repName"), roleNameEl = $("roleName");
const toastEl = $("toast"), modalBackdrop = $("modalBackdrop"), modalCard = $("modalCard");

let map, drawControl, neighborhoodLayer, dotLayer;
let addDotMode = false, drawEnabled = false, gpsOn = false, gpsWatchId = null, gpsMarker = null, gpsCircle = null;
let currentUid = null, currentName = null, currentRole = "rep", lastFoundMarker = null;

const markerById = new Map(), nbLayerById = new Map();
let dotsCache = {}, neighborhoodsCache = {}, repsCache = {};
let leadsCache = {}, jobsCache = {}, customersCache = {}, paymentsCache = {}, equipmentCache = {}, schedulesCache = {}, settingsCache = {};

boot();

async function boot(){
  initStaticEvents();
  initScheduleEditor();
  
  // Safe init layout dimensions map canvas block 
  try { initMap(); } catch(e) { console.error("Operational map crash safety hold:", e); }

  // Auto-Login Implementation Task Block
  const savedName = localStorage.getItem(LS_NAME);
  const savedRole = localStorage.getItem(LS_ROLE);
  
  if (savedName && savedRole) {
    nicknameInput.value = savedName;
    roleSelect.value = (savedRole === "owner") ? "rep" : savedRole;
    currentName = savedName;
    currentRole = savedRole; // Preserves the secret owner assignment across app boots
    
    console.log(`⚡ Automated login sequence run for active session user: ${currentName}`);
    bypassGateTransition();
  } else {
    if (gate) gate.style.display = "grid";
    if (appRoot) appRoot.classList.add("app--locked");
  }

  signInAnonymously(auth).catch(err => console.warn("Firebase credentials lookup delayed:", err.message));
  onAuthStateChanged(auth, async user => {
    if(user){ 
      currentUid = user.uid; 
      if(currentName){ 
        await syncUserWithFirebase();
        subscribeAll(); 
      } 
    }
  });
}

function initStaticEvents(){
  if (enterBtn) enterBtn.onclick = handleEnter;
  if (nicknameInput) nicknameInput.onkeydown = e => { if(e.key === "Enter") handleEnter(); };
  
  document.querySelectorAll(".navBtn").forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.protected === "true") {
        const pinInput = prompt("Enter Administration Code:");
        if (pinInput !== "2122") {
          toast("🚫 Access Denied — Incorrect Security PIN");
          return;
        }
      }
      showPage(btn.dataset.page);
    };
  });

  if ($("saveScheduleBtn")) $("saveScheduleBtn").onclick = saveMySchedule;
  if ($("saveSettingsBtn")) $("saveSettingsBtn").onclick = saveSettings;
  if ($("resetMyProfileBtn")) {
    $("resetMyProfileBtn").onclick = async () => {
      localStorage.removeItem(LS_NAME);
      localStorage.removeItem(LS_ROLE);
      if (currentUid) { try { await deleteDoc(doc(db, "reps", currentUid)); } catch(e){} }
      location.reload();
    };
  }

  if ($("gpsBtn")) $("gpsBtn").onclick = () => gpsOn ? stopGps() : startGps();
  if ($("addDotBtn")) $("addDotBtn").onclick = toggleAddDot;
  if ($("drawBtn")) $("drawBtn").onclick = toggleDraw;
  if ($("searchBtn")) $("searchBtn").onclick = doSearch;
  if ($("clearSearchBtn")) $("clearSearchBtn").onclick = clearSearch;
  if ($("searchInput")) $("searchInput").onkeydown = e => { if(e.key === "Enter") doSearch(); };
  if (modalBackdrop) modalBackdrop.onclick = e => { if(e.target === modalBackdrop) closeModal(); };
}

async function handleEnter(){
  const name = nicknameInput.value.trim();
  if(!name){ toast("Provide structural nickname validation profile entry."); nicknameInput.focus(); return; }

  currentName = name;
  
  // Custom Role Rule: Check explicitly for profile name override variables
  if (name.toLowerCase() === "laith") {
    currentRole = "owner";
    toast("👑 Owner Overwrite Access Key Confirmed");
  } else {
    currentRole = roleSelect.value || "rep";
  }

  localStorage.setItem(LS_NAME, currentName);
  localStorage.setItem(LS_ROLE, currentRole);

  bypassGateTransition();
}

async function bypassGateTransition() {
  if (!currentUid) {
    try {
      const cred = await signInAnonymously(auth);
      currentUid = cred.user.uid;
    } catch(e) {
      toast("Firebase structural pipeline mapping failed.");
      return;
    }
  }

  await syncUserWithFirebase();
  subscribeAll();

  if (gate) gate.style.display = "none";
  if (appRoot) appRoot.classList.remove("app--locked");
  if (repNameEl) repNameEl.textContent = currentName;
  if (roleNameEl) roleNameEl.textContent = currentRole;

  setTimeout(() => { if(map) map.invalidateSize(); }, 300);
  toast(`Logged in: ${currentName}`);
}

async function syncUserWithFirebase() {
  if (!currentUid) return;
  try {
    await setDoc(doc(db, "reps", currentUid), {
      uid: currentUid,
      name: currentName,
      role: currentRole,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch(e) { console.warn("Firebase cloud persistence connection warning"); }
}

function showPage(page){
  document.querySelectorAll(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const targetPage = $(`page-${page}`);
  if (targetPage) targetPage.classList.add("active");
  if (page === "map" && map) {
    setTimeout(() => { map.invalidateSize(); }, 100);
  }
}

function subscribeAll(){
  onSnapshot(collection(db,"dots"), snap => { dotsCache={}; snap.forEach(d=>dotsCache[d.id]=d.data()); syncDotMarkers(); renderCounts(); });
  onSnapshot(collection(db,"neighborhoods"), snap => { neighborhoodsCache={}; snap.forEach(d=>neighborhoodsCache[d.id]=d.data()); syncNeighborhoodLayers(); });
  onSnapshot(collection(db,"reps"), snap => { repsCache={}; snap.forEach(d=>repsCache[d.id]=d.data()); renderTeam(); });
  onSnapshot(collection(db,"leads"), snap => { leadsCache={}; snap.forEach(d=>leadsCache[d.id]=d.data()); renderLeads(); });
  onSnapshot(collection(db,"jobs"), snap => { jobsCache={}; snap.forEach(d=>jobsCache[d.id]=d.data()); renderJobs(); });
  onSnapshot(collection(db,"customers"), snap => { customersCache={}; snap.forEach(d=>customersCache[d.id]=d.data()); renderCustomers(); });
  onSnapshot(collection(db,"payments"), snap => { paymentsCache={}; snap.forEach(d=>paymentsCache[d.id]=d.data()); renderPayments(); });
  onSnapshot(collection(db,"equipment"), snap => { equipmentCache={}; snap.forEach(d=>equipmentCache[d.id]=d.data()); renderEquipment(); });
  onSnapshot(collection(db,"schedules"), snap => { schedulesCache={}; snap.forEach(d=>schedulesCache[d.id]=d.data()); renderSchedules(); });
  onSnapshot(doc(db,"shared","settings"), snap => { settingsCache=snap.exists()?snap.data():{}; applySettings(); });
}

function money(n){ return "$" + Number(n||0).toLocaleString(); }
function esc(str){ return String(str??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

function renderTable(elId, headers, rows, empty) {
  const el=$(elId); if(!el) return;
  if(!rows.length){ el.innerHTML=`<div class="card">${empty}</div>`; return; }
  el.innerHTML = `<table class="dataTable"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderLeads(){
  const rows = Object.values(leadsCache).map(l=>`<tr><td><strong>${esc(l.name)}</strong><br><span class="muted">${esc(l.address)}</span></td><td>${esc(l.phone)}</td><td>${esc(l.service)}</td><td>${money(l.quote)}</td><td><span class="status">${esc(l.status)}</span></td><td><button class="ghostBtn" onclick="window.crmEdit('lead','${l.id}')">Edit</button></td></tr>`);
  renderTable("leadsTable",["Lead","Phone","Service","Quote","Status",""],rows,"No current field pipeline leads tracking logs matching.");
}

function renderJobs(){
  const rows = Object.values(jobsCache).map(j=>`<tr><td><strong>${esc(j.title)}</strong><br><span class="muted">${esc(j.address)}</span></td><td>${esc(j.scheduledAt)}</td><td>${esc(j.cleaner)}</td><td>${money(j.price)}</td><td><span class="status">${esc(j.status)}</span></td><td><button class="ghostBtn" onclick="window.crmEdit('job','${j.id}')">Edit</button></td></tr>`);
  renderTable("jobsTable",["Job","Scheduled","Cleaner","Price","Status",""],rows,"No operational field jobs initialized inside tracking blocks.");
}

function renderCustomers(){
  const rows = Object.values(customersCache).map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td><td>${money(c.lifetimeRevenue)}</td><td><button class="ghostBtn" onclick="window.crmEdit('customer','${c.id}')">Edit</button></td></tr>`);
  renderTable("customersTable",["Customer","Phone","Address","Lifetime Rev",""],rows,"No database customer logs found.");
}

// 5. Team Management Row Purge Execution
window.purgeTeamMember = async (uid) => {
  if (confirm("Are you sure you want to permanently remove this member from the live roster layout view?")) {
    await deleteDoc(doc(db, "reps", uid));
    toast("Removed record node layout.");
  }
};

function renderTeam(){
  const rows = Object.values(repsCache).map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td><span class="status">${esc(r.role)}</span></td><td>${r.uid === currentUid ? '⭐ Online Context' : 'Offline Node'}</td><td><button class="dangerBtn" onclick="window.purgeTeamMember('${r.uid}')">Remove Member</button></td></tr>`);
  renderTable("teamTable",["Roster Profile Name","Assigned Level Role","Status Mapping","Actions Menu"],rows,"No team members actively synchronized.");
}

function renderPayments(){
  const rows = Object.values(paymentsCache).map(p=>`<tr><td><strong>${esc(p.customer)}</strong></td><td>${money(p.amount)}</td><td>${esc(p.method)}</td><td>${esc(p.status)}</td><td><button class="ghostBtn" onclick="window.crmEdit('payment','${p.id}')">Edit</button></td></tr>`);
  renderTable("paymentsTable",["Customer Target","Total Amount","Payment Method","Collection Status",""],rows,"Ledger index transactions array empty.");
}

function renderEquipment(){
  const rows = Object.values(equipmentCache).map(e=>`<tr><td><strong>${esc(e.name)}</strong></td><td>${esc(e.status)}</td><td>${esc(e.holder)}</td><td>${esc(e.location)}</td><td><button class="ghostBtn" onclick="window.crmEdit('equipment','${e.id}')">Edit</button></td></tr>`);
  renderTable("equipmentTable",["Hardware Label Asset","Status Index","Active Holder","Storage Assignment",""],rows,"No hardware inventory entries registered.");
}

// 4. Standard 12-Hour Non-Military Time System UI Controls
function initScheduleEditor(){
  const wrap = $("mySchedule"); if(!wrap) return;
  wrap.innerHTML = days.map(d=>`
    <div class="dayRow card" data-day="${d}" style="display:flex; flex-wrap:wrap; gap:15px; align-items:center; margin:0;">
      <label style="flex:1; min-width:120px;"><input type="checkbox" class="schedAvail" checked /> <b>${d}</b></label>
      <label>Shift Start: <select class="schedStart">${standardHours.map(h=>`<option value="${h}" ${h==="9 AM"?"selected":""}>${h}</option>`).join("")}</select></label>
      <label>Shift End: <select class="schedEnd">${standardHours.map(h=>`<option value="${h}" ${h==="5 PM"?"selected":""}>${h}</option>`).join("")}</select></label>
      <label>Status: <select class="schedBusy"><option value="Available">Available</option><option value="Busy">Busy Out</option></select></label>
    </div>
  `).join("");
}

async function saveMySchedule(){
  const availability = {};
  document.querySelectorAll(".dayRow").forEach(row => {
    availability[row.dataset.day] = {
      available: row.querySelector(".schedAvail").checked,
      start: row.querySelector(".schedStart").value,
      end: row.querySelector(".schedEnd").value,
      status: row.querySelector(".schedBusy").value
    };
  });
  if(currentUid) await setDoc(doc(db,"schedules",currentUid),{uid:currentUid,name:currentName,role:currentRole,availability,updatedAt:serverTimestamp()},{merge:true});
  toast("Your live availability update has been dispatched.");
}

function renderSchedules(){
  const grid = $("teamGrid"); if(!grid) return;
  grid.innerHTML = "";
  Object.values(schedulesCache).forEach(s => {
    const box = document.createElement("div"); box.className = "card";
    box.innerHTML = `<h3 style="color:var(--accent); margin-bottom:10px;">${esc(s.name)}</h3><div style="font-size:12px; text-transform:uppercase; opacity:0.6; margin-bottom:12px;">Role: ${esc(s.role)}</div>`;
    days.forEach(d => {
      const dayData = s.availability?.[d];
      box.innerHTML += `<div style="display:flex; justify-content:between; font-size:13px; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.03);">
        <span style="color:#94a3b8; width:90px;">${d}:</span> 
        <span>${dayData?.available ? `${dayData.start} - ${dayData.end} (${dayData.status})` : '🚫 Off'}</span>
      </div>`;
    });
    grid.appendChild(box);
  });
}

function applySettings(){
  if($("setCashApp")) $("setCashApp").value = settingsCache.cashApp || "";
  if($("setVenmo")) $("setVenmo").value = settingsCache.venmo || "";
  if($("setZelle")) $("setZelle").value = settingsCache.zelle || "";
}
async function saveSettings(){
  await setDoc(doc(db,"shared","settings"),{cashApp:$("setCashApp").value,venmo:$("setVenmo").value,zelle:$("setZelle").value,updatedAt:serverTimestamp()},{merge:true});
  toast("Global parameters saved live.");
}

// Map Core Engine Operations Section Logic
function initMap(){
  const mapContainer = $("map"); if(!mapContainer) return;
  map = L.map("map",{zoomControl:true}).setView([26.1224,-80.1373],12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:19}).addTo(map);
  
  neighborhoodLayer = new L.FeatureGroup(); 
  dotLayer = new L.FeatureGroup(); 
  map.addLayer(neighborhoodLayer); 
  map.addLayer(dotLayer);
  
  map.on("click", async e => {
    if(!addDotMode) return;
    const id=`dot-${Date.now()}`;
    await setDoc(doc(db,"dots",id),{id,lat:e.latlng.lat,lng:e.latlng.lng,label:"",status:"none",createdBy:currentName,createdAt:Date.now()});
    toast("Map element coordinate pin logged.");
  });

  drawControl = new L.Control.Draw({draw:{polygon:true,rectangle:true,circle:false,circlemarker:false,marker:false,polyline:false},edit:{featureGroup:neighborhoodLayer}});
  
  map.on(L.Draw.Event.CREATED, async event => {
    const name=prompt("Territory Layer Name?","Zone Region")?.trim()||"Territory Zone";
    const id=`nb-${Date.now()}`;
    await setDoc(doc(db,"neighborhoods",id),{id,name,color:"#38bdf8",geojson:event.layer.toGeoJSON(),createdAt:Date.now()});
  });
}

function syncDotMarkers(){
  if(!dotLayer) return;
  const ids=new Set(Object.keys(dotsCache));
  for(const [id,marker] of markerById.entries()){ if(!ids.has(id)){dotLayer.removeLayer(marker); markerById.delete(id);} }
  Object.values(dotsCache).forEach(dot=>{
    if(markerById.has(dot.id)){
      const m=markerById.get(dot.id); m.setStyle({fillColor:dot.status==="yes"?"#22c55e":"#ef4444", color:"#fff"});
    } else {
      const marker = L.circleMarker([dot.lat,dot.lng],{radius:8, fillColor:"#38bdf8", color:"#fff", fillOpacity:0.9}).addTo(dotLayer);
      markerById.set(dot.id,marker);
      marker.on("click",()=> {
        const inputState = prompt("Update Dot Description Label:", dot.label||"");
        if(inputState !== null) setDoc(doc(db,"dots",dot.id),{label:inputState, status:"yes"},{merge:true});
      });
    }
  });
}

function syncNeighborhoodLayers(){
  if(!neighborhoodLayer) return;
  Object.values(neighborhoodsCache).forEach(nb=>{
    if(nbLayerById.has(nb.id)) return;
    const group=L.geoJSON(nb.geojson,{style:{color:"#38bdf8",weight:2,fillOpacity:0.15}});
    group.eachLayer(layer=>{ neighborhoodLayer.addLayer(layer); });
    nbLayerById.set(nb.id,group);
  });
}

function toggleAddDot(){ addDotMode=!addDotMode; $("addDotBtn").classList.toggle("active",addDotMode); $("addDotBtn").textContent=addDotMode?"✓ Sticking Dots Enabled":"+ Add Tracking Dot"; }
function toggleDraw(){ drawEnabled=!drawEnabled; if(drawEnabled) map.addControl(drawControl); else map.removeControl(drawControl); $("drawBtn").textContent=drawEnabled?"✓ Draw Control Active":"✏️ Draw Territory"; }
function doSearch(){ const q=$("searchInput").value.trim().toLowerCase(); if(!q) return; const match=Object.values(dotsCache).find(d=>(d.label||"").toLowerCase().includes(q)); if(match&&map) map.setView([match.lat,match.lng],16); else toast("No coordinates record matched location text query."); }
function clearSearch(){ $("searchInput").value=""; syncDotMarkers(); }
function startGps(){ if(!navigator.geolocation) return toast("GPS API stream not tracking."); gpsOn=true; $("gpsBtn").textContent="Tracking Pin Live"; gpsWatchId=navigator.geolocation.watchPosition(pos=>{ if(!gpsMarker){gpsMarker=L.circleMarker([pos.coords.latitude,pos.coords.longitude],{radius:6,fillColor:"#38bdf8"}).addTo(map);}else{gpsMarker.setLatLng([pos.coords.latitude,pos.coords.longitude]);} }); }
function stopGps(){ gpsOn=false; $("gpsBtn").textContent="GPS Tracking: Off"; if(gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId); if(gpsMarker) map.removeLayer(gpsMarker); gpsMarker=null; }
function renderCounts(){}

// Entity Popup Initialization Layout Management Modules
function openEntityModal(type, seed={}){
  const configs = {
    leadModal:{title:"Lead Pipeline",coll:"leads",fields:["name","phone","address","service","quote","status"],defaults:{service:"Window Cleaning",status:"lead"}},
    jobModal:{title:"Job Operations Assignment",coll:"jobs",fields:["title","customer","address","scheduledAt","cleaner","price","status"],defaults:{status:"scheduled"}},
    customerModal:{title:"Customer Card Record",coll:"customers",fields:["name","phone","address","lifetimeRevenue"],defaults:{lifetimeRevenue:0}},
    paymentModal:{title:"Payment Receipt Node",coll:"payments",fields:["customer","amount","method","status"],defaults:{status:"unpaid"}}
  };
  const cfg=configs[type]; if(!cfg) return;
  openRecordModal(cfg,{...cfg.defaults,...seed});
}
window.openEntityModal = openEntityModal;

window.crmEdit = (kind,id) => {
  const maps={lead:["Lead","leads",leadsCache[id]],job:["Job","jobs",jobsCache[id]],customer:["Customer","customers",customersCache[id]],payment:["Payment","payments",paymentsCache[id]],equipment:["Equipment","equipment",equipmentCache[id]]};
  const m=maps[kind]; if(!m) return;
  openRecordModal({title:m[0],coll:m[1],fields:Object.keys(m[2]).filter(k=>!["id","createdAt","updatedAt"].includes(k))},m[2],id);
};

function openRecordModal(cfg, data={}, id=null){
  if(!modalBackdrop || !modalCard) return;
  modalBackdrop.classList.remove("hidden");
  modalCard.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:15px;"><h2>${id?"Modify":"Add"} ${cfg.title}</h2><button class="ghostBtn" onclick="window.crmCloseModal()">Close</button></div>
  <div class="formGrid">${cfg.fields.map(f=>`<label>${f.toUpperCase()}<input data-field="${f}" value="${data[f]||''}" /></label>`).join("")}</div>
  <button class="actionBtn" id="saveRecordBtn">Commit Record Changes</button>`;
  
  $("saveRecordBtn").onclick = async () => {
    const rec={...data}; modalCard.querySelectorAll("[data-field]").forEach(inp=>rec[inp.dataset.field]=inp.value);
    rec.id=id||`${cfg.coll}-${Date.now()}`;
    await setDoc(doc(db,cfg.coll,rec.id),rec,{merge:true});
    closeModal();
    toast("Database entry successfully written.");
  };
}
window.crmCloseModal = closeModal;
function closeModal(){ if(modalBackdrop) modalBackdrop.classList.add("hidden"); }
function toast(msg){ if(!toastEl) return; toastEl.textContent=msg; toastEl.classList.remove("hidden"); clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>toastEl.classList.add("hidden"),1800); }
