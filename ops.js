import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const money = n => "$" + Number(n || 0).toLocaleString();

let uid = "";
let role = localStorage.getItem("allset_rep_role") || "rep";
let name = localStorage.getItem("allset_rep_name") || "Team";
let activeChannel = "General";
let reps = {}, leads = {}, jobs = {}, chat = {};

ensureOpsPages();
wireOps();
signInAnonymously(auth).catch(() => {});
onAuthStateChanged(auth, user => {
  uid = user?.uid || uid;
  subscribeOps();
  applyRoleNav();
});

function ensureOpsPages(){
  const main = document.querySelector(".main");
  if(!main) return;
  if(!$("page-leaderboard")) main.insertAdjacentHTML("beforeend", `<section id="page-leaderboard" class="page tablePage"><div class="pageHeader"><div><h1>Leaderboard</h1><p>Rep revenue, sold jobs, converted leads, and close rate.</p></div></div><div id="leaderboardTable" class="tableCard"></div></section>`);
  if(!$("page-board")) main.insertAdjacentHTML("beforeend", `<section id="page-board" class="page tablePage"><div class="pageHeader"><div><h1>Board</h1><p>Cleaner claimed jobs, completed jobs, and completion pace.</p></div></div><div id="boardTable" class="tableCard"></div></section>`);
  if(!$("page-chat")) main.insertAdjacentHTML("beforeend", `<section id="page-chat" class="page tablePage"><div class="pageHeader"><div><h1>Chat</h1><p>Team channels for the field.</p></div></div><div class="chatShell panel softPanel"><div class="chatChannels"><button class="chatChannel active" data-channel="General" type="button">General</button><button class="chatChannel" data-channel="Sales" type="button">Sales</button><button class="chatChannel" data-channel="Cleaning" type="button">Cleaning</button><button class="chatChannel" data-channel="Announcements" type="button">Announcements</button></div><div id="chatMessages" class="chatMessages"></div><div class="chatComposer"><input id="chatInput" placeholder="Message the team" /><button id="chatSendBtn" class="actionBtn" type="button">Send</button></div></div></section>`);
}

function wireOps(){
  document.addEventListener("click", event => {
    const nav = event.target.closest(".navBtn");
    if(nav?.dataset.page){ setTimeout(() => { role = localStorage.getItem("allset_rep_role") || role; applyRoleNav(); renderOps(); }, 0); }
    const channel = event.target.closest(".chatChannel");
    if(channel){
      if(channel.dataset.channel === "Announcements" && role !== "admin") return toast("Only admins can post announcements");
      activeChannel = channel.dataset.channel || "General";
      document.querySelectorAll(".chatChannel").forEach(btn => btn.classList.toggle("active", btn === channel));
      renderChat();
    }
  });
  $("enterBtn")?.addEventListener("click", () => setTimeout(() => { role = $("roleSelect")?.value || role; name = $("nicknameInput")?.value || name; applyRoleNav(); renderOps(); }, 250));
  document.addEventListener("click", e => { if(e.target?.id === "chatSendBtn") sendChat(); });
  document.addEventListener("keydown", e => { if(e.target?.id === "chatInput" && e.key === "Enter") sendChat(); });
}

let subscribed = false;
function subscribeOps(){
  if(subscribed) return;
  subscribed = true;
  onSnapshot(collection(db,"reps"), snap => { reps = snapObj(snap); renderOps(); });
  onSnapshot(collection(db,"leads"), snap => { leads = snapObj(snap); renderOps(); });
  onSnapshot(collection(db,"jobs"), snap => { jobs = snapObj(snap); renderOps(); });
  onSnapshot(collection(db,"chatMessages"), snap => { chat = snapObj(snap); renderChat(); });
}

function snapObj(snap){ const out = {}; snap.forEach(d => out[d.id] = {...d.data(), id:d.data().id || d.id}); return out; }
function rolePages(){ return { rep:["dashboard","map","leads","jobs","leaderboard","payments","chat"], cleaner:["dashboard","jobs","board","schedule","payments","chat"], admin:["dashboard","map","leads","jobs","leaderboard","board","schedule","customers","team","payments","chat","admin","equipment"] }; }
function applyRoleNav(){
  const allowed = rolePages()[role] || rolePages().rep;
  document.querySelectorAll(".navBtn").forEach(btn => {
    const page = btn.dataset.page;
    btn.classList.toggle("hidden", !allowed.includes(page));
    btn.dataset.locked = "";
    btn.classList.remove("navBtn--locked");
    btn.textContent = page === "map" ? "Live Map" : page === "schedule" && role === "cleaner" ? "Schedule" : page.charAt(0).toUpperCase() + page.slice(1);
  });
  document.querySelectorAll(".adminOnly").forEach(el => el.classList.toggle("hidden", role !== "admin"));
}
function renderOps(){ renderLeaderboard(); renderBoard(); renderCleanerJobs(); renderChat(); }

function renderLeaderboard(){
  const stats = new Map();
  Object.entries(reps).filter(([,r]) => (r.role || "rep") === "rep").forEach(([id,r]) => stats.set(id,{id,name:r.name||"Rep",revenue:0,sold:0,converted:0,total:0}));
  Object.values(leads).forEach(l => { const id = l.repId || l.repName || "unknown"; if(!stats.has(id)) stats.set(id,{id,name:l.repName || reps[l.repId]?.name || "Rep",revenue:0,sold:0,converted:0,total:0}); const s = stats.get(id); s.total++; if(["sold","converted"].includes(l.status)){ s.converted++; s.revenue += Number(l.quote || l.amount || 0); } });
  Object.values(jobs).forEach(j => { const id = j.repId || j.repName || "unknown"; if(!stats.has(id)) stats.set(id,{id,name:j.repName || reps[j.repId]?.name || "Rep",revenue:0,sold:0,converted:0,total:0}); const s = stats.get(id); if(["open","claimed","in_progress","completed","scheduled"].includes(jobStatus(j.status))) s.sold++; s.revenue += Number(j.price || 0); });
  const rows = [...stats.values()].sort((a,b)=>b.revenue-a.revenue).map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${money(s.revenue)}</td><td>${s.sold}</td><td>${s.converted}</td><td>${s.total ? Math.round((s.converted/s.total)*100) : 0}%</td></tr>`);
  renderTable("leaderboardTable",["Rep","Revenue","Sold Jobs","Leads Converted","Close Rate"],rows,"No leaderboard data yet.");
}

function renderBoard(){
  const stats = new Map();
  Object.entries(reps).filter(([,r]) => r.role === "cleaner").forEach(([id,r]) => stats.set(id,{id,name:r.name||"Cleaner",claimed:0,completed:0,totalMs:0,speedCount:0}));
  Object.values(jobs).forEach(j => { const id = j.cleanerId || j.cleanerName || j.cleaner || "unassigned"; if(!stats.has(id)) stats.set(id,{id,name:j.cleanerName || j.cleaner || "Unassigned",claimed:0,completed:0,totalMs:0,speedCount:0}); const s = stats.get(id); if(j.claimedAt) s.claimed++; if(jobStatus(j.status) === "completed" || j.completedAt || j.cleanedAt) s.completed++; if(j.startedAt && (j.completedAt || j.cleanedAt)){ s.totalMs += dateVal(j.completedAt || j.cleanedAt) - dateVal(j.startedAt); s.speedCount++; } });
  const rows = [...stats.values()].sort((a,b)=>b.completed-a.completed).map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${s.claimed}</td><td>${s.completed}</td><td>${s.speedCount ? Math.round((s.totalMs/s.speedCount)/60000) + " min" : "-"}</td><td>${s.claimed ? Math.round((s.completed/s.claimed)*100) : 0}%</td></tr>`);
  renderTable("boardTable",["Cleaner","Jobs Claimed","Jobs Completed","Avg Completion","Reliability"],rows,"No cleaner board data yet.");
}

function renderCleanerJobs(){
  const table = $("jobsTable");
  if(!table || role !== "cleaner") return;
  const visible = Object.values(jobs).filter(j => jobStatus(j.status) === "open" || j.cleanerId === uid || j.cleanerName === name || j.cleaner === name);
  const rows = visible.map(j => `<tr><td><strong>${esc(j.customer || j.title || "Job")}</strong><br><span class="muted">${esc(j.address || "")}</span></td><td>${esc(j.phone || "-")}</td><td>${esc(readableDate(j.scheduledAt) || "-")}</td><td><span class="status ${jobStatus(j.status)}">${esc(labelStatus(j.status))}</span></td><td>${esc(j.repName || "-")}</td><td>${esc(j.cleanerName || j.cleaner || "-")}</td><td>${money(j.price)}</td><td><div class="tableActions">${jobButtons(j)}</div></td></tr>`);
  table.innerHTML = rows.length ? `<table class="dataTable"><thead><tr><th>Job</th><th>Phone</th><th>Scheduled</th><th>Status</th><th>Rep</th><th>Cleaner</th><th>Price</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">No open jobs yet.</div>`;
}
function jobButtons(j){ const s = jobStatus(j.status); const mine = j.cleanerId === uid || j.cleanerName === name || j.cleaner === name; if(s === "open") return `<button class="actionBtn smallBtn" onclick="window.opsClaimJob('${j.id}')">Claim Job</button>`; if(s === "claimed" && mine) return `<button class="actionBtn smallBtn" onclick="window.opsStartJob('${j.id}')">Start Job</button>`; if(s === "in_progress" && mine) return `<button class="actionBtn smallBtn" onclick="window.opsCompleteJob('${j.id}')">Complete Job</button>`; return ""; }
window.opsClaimJob = async id => { const j = jobs[id]; if(!j || jobStatus(j.status) !== "open") return toast("That job is already claimed"); const now = Date.now(); await setDoc(doc(db,"jobs",id),{status:"claimed",cleanerId:uid,cleanerName:name,cleaner:name,claimedAt:now,updatedAt:now,updatedBy:name},{merge:true}); await log(`Job claimed: ${j.customer || j.title || id} by ${name}`); };
window.opsStartJob = async id => { const j = jobs[id]; if(!j) return; const now = Date.now(); await setDoc(doc(db,"jobs",id),{status:"in_progress",startedAt:now,updatedAt:now,updatedBy:name},{merge:true}); await log(`Job started: ${j.customer || j.title || id} by ${name}`); };
window.opsCompleteJob = async id => { const j = jobs[id]; if(!j) return; const now = Date.now(); await setDoc(doc(db,"jobs",id),{status:"completed",completedAt:now,cleanedAt:now,lastCleanedAt:now,updatedAt:now,updatedBy:name},{merge:true}); await log(`Job completed: ${j.customer || j.title || id} by ${name}`); };

async function sendChat(){ const input = $("chatInput"), text = input?.value.trim(); if(!text) return; if(activeChannel === "Announcements" && role !== "admin") return toast("Only admins can post announcements"); const id = `chat-${Date.now()}`; await setDoc(doc(db,"chatMessages",id),{id,channel:activeChannel,text,senderId:uid,senderName:name,senderRole:role,createdAt:Date.now()},{merge:true}); input.value = ""; }
function renderChat(){ const box = $("chatMessages"); if(!box) return; const messages = Object.values(chat).filter(m => m.channel === activeChannel).sort((a,b)=>dateVal(a.createdAt)-dateVal(b.createdAt)).slice(-80); box.innerHTML = messages.length ? messages.map(m => `<div class="chatMessage"><div><strong>${esc(m.senderName || "Team")}</strong><span>${esc(m.senderRole || "")}</span><time>${esc(readableDate(m.createdAt))}</time></div><p>${esc(m.text || "")}</p></div>`).join("") : `<div class="card noMargin">No messages in ${esc(activeChannel)} yet.</div>`; box.scrollTop = box.scrollHeight; }
async function log(text){ await setDoc(doc(db,"shared","activityLog"),{entries:[{t:Date.now(),text}]},{merge:true}); }
function renderTable(id, headers, rows, empty){ const el = $(id); if(!el) return; el.innerHTML = rows.length ? `<table class="dataTable"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<div class="card">${empty}</div>`; }
function jobStatus(s){ s = String(s || "open").toLowerCase().replace(/\s+/g,"_").replace("-","_"); return s === "scheduled" ? "open" : s; }
function labelStatus(s){ return jobStatus(s).replaceAll("_"," ").replace(/^./,c=>c.toUpperCase()); }
function dateVal(v){ if(!v) return 0; if(typeof v === "number") return v; if(v.seconds) return v.seconds * 1000; const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; }
function readableDate(v){ const t = dateVal(v); return t ? new Date(t).toLocaleString([],{month:"2-digit",day:"2-digit",year:"numeric",hour:"numeric",minute:"2-digit"}) : ""; }
function toast(msg){ const el = $("toast"); if(!el) return; el.textContent = msg; el.classList.remove("hidden"); clearTimeout(el._t); el._t = setTimeout(()=>el.classList.add("hidden"),1800); }
