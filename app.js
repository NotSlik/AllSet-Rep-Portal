import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
 
const firebaseConfig={apiKey:"AIzaSyA_CbiovvY9yvdsQ6wzzwoG2QaqBT0r7Bg",authDomain:"allsetrepportal.firebaseapp.com",projectId:"allsetrepportal",storageBucket:"allsetrepportal.firebasestorage.app",messagingSenderId:"590070052736",appId:"1:590070052736:web:193a9edb6fd378fbd27365",measurementId:"G-SY45913J3Z",databaseURL:"https://allsetrepportal-default-rtdb.firebaseio.com"};
const app=getApps()[0]||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
 
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const money=n=>"$"+Number(n||0).toLocaleString();
 
let uid="",role=localStorage.getItem("allset_rep_role")||"rep",name=localStorage.getItem("allset_rep_name")||"Team";
let leads={},jobs={},customers={},reps={},subscribed=false;
let editKind="",editId="";
 
/* ---------- GATE / LOGIN ---------- */
 
function openCrm(){
  const nameInput=$("nicknameInput"),roleInput=$("roleSelect");
  name=(nameInput&&nameInput.value.trim())?nameInput.value.trim():"Laith";
  role=(roleInput&&roleInput.value)?roleInput.value:"rep";
  try{localStorage.setItem("allset_rep_name",name);localStorage.setItem("allset_rep_role",role);}catch(e){}
  if($("repName"))$("repName").textContent=name;
  if($("roleName"))$("roleName").textContent=role;
  if($("gate"))$("gate").style.display="none";
  if($("app"))$("app").classList.remove("app--locked");
  showPage("dashboard");
  bootFirebase();
}
 
function showGate(){
  if($("gate"))$("gate").style.display="grid";
  if($("app"))$("app").classList.add("app--locked");
}
 
function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const target=$("page-"+page);
  if(target)target.classList.add("active");
  document.querySelectorAll(".navBtn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const nav=$("nav");
  if(nav)nav.classList.remove("open");
  renderAll();
}
 
function toast(text){
  const t=$("toast");
  if(!t)return;
  t.textContent=text;
  t.classList.remove("hidden");
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.add("hidden"),2000);
}
 
/* ---------- FIREBASE ---------- */
 
function bootFirebase(){
  signInAnonymously(auth).catch(()=>{});
  onAuthStateChanged(auth,u=>{uid=u?.uid||uid;subscribe();});
}
 
function subscribe(){
  if(subscribed)return;
  subscribed=true;
  onSnapshot(collection(db,"leads"),s=>{leads=snapObj(s);renderAll();});
  onSnapshot(collection(db,"jobs"),s=>{jobs=snapObj(s);renderAll();});
  onSnapshot(collection(db,"customers"),s=>{customers=snapObj(s);renderAll();});
  onSnapshot(collection(db,"reps"),s=>{reps=snapObj(s);renderAll();});
}
 
function snapObj(s){const o={};s.forEach(d=>o[d.id]={...d.data(),id:d.data().id||d.id});return o;}
 
function jobStatus(s){s=String(s||"open").toLowerCase().replace(/\s+/g,"_").replace("-","_");return s==="scheduled"?"open":s;}
function labelStatus(s){return jobStatus(s).replaceAll("_"," ").replace(/^./,c=>c.toUpperCase());}
function dateVal(v){if(!v)return 0;if(typeof v==="number")return v;if(v.seconds)return v.seconds*1000;const t=new Date(v).getTime();return Number.isFinite(t)?t:0;}
function readableDate(v){const t=dateVal(v);return t?new Date(t).toLocaleString([],{month:"2-digit",day:"2-digit",year:"numeric",hour:"numeric",minute:"2-digit"}):"";}
 
/* ---------- TABLE RENDER HELPER ---------- */
 
function table(id,headers,rows,empty){
  const el=$(id);
  if(!el)return;
  el.innerHTML=rows.length
    ? `<table class="dataTable"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`
    : `<div class="card">${empty}</div>`;
}
 
/* ---------- LEADS ---------- */
 
function renderLeads(){
  const el=$("leadsTable");
  if(!el)return;
  const rows=Object.values(leads)
    .sort((a,b)=>dateVal(b.createdAt)-dateVal(a.createdAt))
    .map(l=>`<tr>
      <td><strong>${esc(l.customer||l.name||"Lead")}</strong><br><span class="muted">${esc(l.address||"")}</span></td>
      <td>${esc(l.phone||"-")}</td>
      <td><span class="status">${esc(l.status||"new")}</span></td>
      <td>${l.quote?money(l.quote):"-"}</td>
      <td>${esc(l.repName||name||"-")}</td>
      <td><div class="tableActions">
        <button class="ghostBtn smallBtn" onclick="window.crmEdit('lead','${esc(l.id)}')">Edit</button>
        <button class="dangerBtn smallBtn" onclick="window.crmDelete('lead','${esc(l.id)}')">Delete</button>
      </div></td>
    </tr>`);
  table("leadsTable",["Lead","Phone","Status","Quote","Rep",""],rows,"No leads yet. Tap + Add Lead to log a door knock.");
}
 
/* ---------- JOBS ---------- */
 
function renderJobs(){
  const el=$("jobsTable");
  if(!el||role==="cleaner")return; // ops.js renders the cleaner-specific job board view
  const rows=Object.values(jobs)
    .sort((a,b)=>dateVal(b.createdAt)-dateVal(a.createdAt))
    .map(j=>`<tr>
      <td><strong>${esc(j.customer||j.title||"Job")}</strong><br><span class="muted">${esc(j.address||"")}</span></td>
      <td>${esc(j.phone||"-")}</td>
      <td>${esc(readableDate(j.scheduledAt)||"-")}</td>
      <td><span class="status ${jobStatus(j.status)}">${esc(labelStatus(j.status))}</span></td>
      <td>${esc(j.repName||"-")}</td>
      <td>${j.price?money(j.price):"-"}</td>
      <td><div class="tableActions">
        <button class="ghostBtn smallBtn" onclick="window.crmEdit('job','${esc(j.id)}')">Edit</button>
        <button class="dangerBtn smallBtn" onclick="window.crmDelete('job','${esc(j.id)}')">Delete</button>
      </div></td>
    </tr>`);
  table("jobsTable",["Job","Phone","Scheduled","Status","Rep","Price",""],rows,"No jobs yet. Tap + Add Job to schedule work.");
}
 
/* ---------- CUSTOMERS (basic list, full edit comes later) ---------- */
 
function renderCustomers(){
  const el=$("customersTable");
  if(!el)return;
  const rows=Object.values(customers)
    .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")))
    .map(c=>`<tr>
      <td><strong>${esc(c.name||"Customer")}</strong></td>
      <td>${esc(c.address||"-")}</td>
      <td>${esc(c.phone||"-")}</td>
      <td><div class="tableActions">
        <button class="ghostBtn smallBtn" onclick="window.crmEdit('customer','${esc(c.id)}')">Edit</button>
        <button class="dangerBtn smallBtn" onclick="window.crmDelete('customer','${esc(c.id)}')">Delete</button>
      </div></td>
    </tr>`);
  table("customersTable",["Name","Address","Phone",""],rows,"No customers yet.");
}
 
/* ---------- TEAM (basic list) ---------- */
 
function renderTeam(){
  const el=$("teamTable");
  if(!el)return;
  const rows=Object.values(reps)
    .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")))
    .map(r=>`<tr>
      <td><strong>${esc(r.name||"Team member")}</strong></td>
      <td>${esc(r.role||"rep")}</td>
      <td><div class="tableActions">
        <button class="ghostBtn smallBtn" onclick="window.crmEdit('team','${esc(r.id)}')">Edit</button>
      </div></td>
    </tr>`);
  table("teamTable",["Name","Role",""],rows,"No team members yet.");
}
 
/* ---------- DASHBOARD STATS ---------- */
 
function renderDashboard(){
  const leadList=Object.values(leads),jobList=Object.values(jobs);
  const todayStart=new Date();todayStart.setHours(0,0,0,0);
  const weekStart=Date.now()-7*86400000;
  const isClosed=l=>["sold","converted"].includes(String(l.status||"").toLowerCase());
  const todayRevenue=jobList.filter(j=>jobStatus(j.status)==="completed"&&dateVal(j.completedAt)>=todayStart.getTime()).reduce((s,j)=>s+Number(j.price||0),0)
    + leadList.filter(l=>isClosed(l)&&dateVal(l.createdAt)>=todayStart.getTime()).reduce((s,l)=>s+Number(l.quote||0),0);
  const weekRevenue=jobList.filter(j=>jobStatus(j.status)==="completed"&&dateVal(j.completedAt)>=weekStart).reduce((s,j)=>s+Number(j.price||0),0)
    + leadList.filter(l=>isClosed(l)&&dateVal(l.createdAt)>=weekStart).reduce((s,l)=>s+Number(l.quote||0),0);
  const activeJobs=jobList.filter(j=>["open","claimed","in_progress"].includes(jobStatus(j.status))).length;
 
  if($("statTodayRevenue"))$("statTodayRevenue").textContent=money(todayRevenue);
  if($("statWeekRevenue"))$("statWeekRevenue").textContent=money(weekRevenue);
  if($("statActiveJobs"))$("statActiveJobs").textContent=activeJobs;
 
  if($("dashLeads"))$("dashLeads").textContent=leadList.length;
  if($("dashQuotes"))$("dashQuotes").textContent=leadList.filter(l=>Number(l.quote)>0).length;
  if($("dashScheduled"))$("dashScheduled").textContent=jobList.filter(j=>jobStatus(j.status)==="open").length;
  if($("dashCompleted"))$("dashCompleted").textContent=jobList.filter(j=>jobStatus(j.status)==="completed").length;
  if($("dashUnpaid"))$("dashUnpaid").textContent=jobList.filter(j=>jobStatus(j.status)==="completed"&&!j.paid).length;
}
 
function renderAll(){
  renderLeads();
  renderJobs();
  renderCustomers();
  renderTeam();
  renderDashboard();
}
 
/* ---------- MODAL / CRM EDIT ---------- */
 
const FIELD_DEFS={
  lead:{
    title:id=>id?"Edit Lead":"Add Lead",
    fields:[
      ["customer","Customer Name","text"],
      ["address","Address","text"],
      ["phone","Phone","text"],
      ["status","Status","select",["new","contacted","quoted","sold","converted","no"]],
      ["quote","Quote Amount","number"],
      ["notes","Notes","textarea"]
    ]
  },
  job:{
    title:id=>id?"Edit Job":"Add Job",
    fields:[
      ["customer","Customer Name","text"],
      ["address","Address","text"],
      ["phone","Phone","text"],
      ["status","Status","select",["open","claimed","in_progress","completed","cancelled"]],
      ["scheduledAt","Scheduled Date/Time","datetime-local"],
      ["price","Price","number"],
      ["cleaner","Cleaner Name","text"],
      ["notes","Notes","textarea"]
    ]
  },
  customer:{
    title:id=>id?"Edit Customer":"Add Customer",
    fields:[
      ["name","Name","text"],
      ["address","Address","text"],
      ["phone","Phone","text"],
      ["email","Email","text"],
      ["notes","Notes","textarea"]
    ]
  },
  team:{
    title:id=>id?"Edit Team Member":"Add Team Member",
    fields:[
      ["name","Name","text"],
      ["role","Role","select",["rep","cleaner","admin"]],
      ["phone","Phone","text"]
    ]
  }
};
 
const COLLECTION_FOR={lead:"leads",job:"jobs",customer:"customers",team:"reps"};
const STORE_FOR={lead:leads,job:jobs,customer:customers,team:reps};
 
function fieldInput(key,label,type,options,value){
  if(type==="select"){
    return `<label>${esc(label)}<select data-field="${key}">${options.map(o=>`<option value="${esc(o)}" ${value===o?"selected":""}>${esc(labelStatus(o))}</option>`).join("")}</select></label>`;
  }
  if(type==="textarea"){
    return `<label>${esc(label)}<textarea data-field="${key}">${esc(value||"")}</textarea></label>`;
  }
  if(type==="datetime-local"){
    let v="";
    const t=dateVal(value);
    if(t){const d=new Date(t);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());v=d.toISOString().slice(0,16);}
    return `<label>${esc(label)}<input data-field="${key}" type="datetime-local" value="${esc(v)}" /></label>`;
  }
  return `<label>${esc(label)}<input data-field="${key}" type="${type}" value="${esc(value??"")}" /></label>`;
}
 
function openModal(kind,id){
  const def=FIELD_DEFS[kind];
  if(!def)return;
  editKind=kind;editId=id||"";
  const store=kind==="lead"?leads:kind==="job"?jobs:kind==="customer"?customers:reps;
  const record=id?store[id]:{};
  const fieldsHtml=def.fields.map(([key,label,type,options])=>fieldInput(key,label,type,options,record?.[key])).join("");
  const card=$("modalCard");
  if(!card)return;
  card.innerHTML=`
    <div class="modalHeader"><h2>${esc(def.title(id))}</h2><button id="modalCloseBtn" class="ghostBtn smallBtn" type="button">Close</button></div>
    <div class="formGrid">${fieldsHtml}</div>
    <div class="buttonRow" style="margin-top:14px">
      ${id?`<button id="modalDeleteBtn" class="dangerBtn" type="button">Delete</button>`:""}
      <button id="modalSaveBtn" class="actionBtn" type="button">Save</button>
    </div>`;
  $("modalBackdrop").classList.remove("hidden");
  $("modalCloseBtn").onclick=closeModal;
  $("modalSaveBtn").onclick=saveModal;
  if($("modalDeleteBtn"))$("modalDeleteBtn").onclick=()=>{deleteRecord(kind,id);closeModal();};
}
 
function closeModal(){
  $("modalBackdrop")?.classList.add("hidden");
  editKind="";editId="";
}
 
async function saveModal(){
  const def=FIELD_DEFS[editKind];
  if(!def)return;
  const card=$("modalCard");
  const data={};
  def.fields.forEach(([key,,type])=>{
    const input=card.querySelector(`[data-field="${key}"]`);
    if(!input)return;
    let v=input.value;
    if(type==="number")v=v===""?0:Number(v);
    if(type==="datetime-local")v=v?new Date(v).getTime():"";
    data[key]=v;
  });
  const id=editId||`${editKind}-${Date.now()}`;
  data.id=id;
  data.updatedAt=Date.now();
  data.updatedBy=name;
  if(!editId){
    data.createdAt=Date.now();
    data.createdBy=name;
    if(editKind==="lead"||editKind==="job")data.repName=name;
  }
  const collectionName=COLLECTION_FOR[editKind];
  await setDoc(doc(db,collectionName,id),data,{merge:true});
  toast(`${def.title(editId).replace("Edit ","").replace("Add ","")} saved`);
  closeModal();
}
 
async function deleteRecord(kind,id){
  if(!id)return;
  if(!confirm("Delete this record?"))return;
  await deleteDoc(doc(db,COLLECTION_FOR[kind],id));
  toast("Deleted");
}
 
window.crmEdit=(kind,id)=>openModal(kind,id);
window.crmDelete=(kind,id)=>deleteRecord(kind,id);
window.crmSave=saveModal;
 
/* ---------- BOOT / WIRE ---------- */
 
window.addEventListener("DOMContentLoaded",function(){
  let savedName=null,savedRole=null;
  try{savedName=localStorage.getItem("allset_rep_name");savedRole=localStorage.getItem("allset_rep_role");}catch(e){}
  if(savedName&&$("nicknameInput"))$("nicknameInput").value=savedName;
  if(savedRole&&$("roleSelect"))$("roleSelect").value=savedRole;
 
  if($("enterBtn"))$("enterBtn").addEventListener("click",openCrm);
  if($("nicknameInput"))$("nicknameInput").addEventListener("keydown",e=>{if(e.key==="Enter")openCrm();});
  if($("changeNameBtn"))$("changeNameBtn").addEventListener("click",showGate);
  if($("mobileNavBtn"))$("mobileNavBtn").addEventListener("click",()=>{if($("nav"))$("nav").classList.toggle("open");});
 
  document.querySelectorAll(".navBtn").forEach(btn=>{
    btn.addEventListener("click",function(){showPage(this.getAttribute("data-page"));});
  });
 
  document.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click",function(){
      const target=this.getAttribute("data-open");
      if(target==="leadModal")openModal("lead","");
      else if(target==="jobModal")openModal("job","");
      else if(target==="customerModal")openModal("customer","");
      else if(target==="teamModal")openModal("team","");
    });
  });
 
  if($("modalBackdrop")){
    $("modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal();});
  }
 
  if($("clearLogBtn"))$("clearLogBtn").addEventListener("click",()=>{if($("log"))$("log").innerHTML="";});
 
  // If a session is already active (page refresh after login), skip the gate.
  if(savedName){
    name=savedName;
    role=savedRole||"rep";
    if($("repName"))$("repName").textContent=name;
    if($("roleName"))$("roleName").textContent=role;
  }
});
 
