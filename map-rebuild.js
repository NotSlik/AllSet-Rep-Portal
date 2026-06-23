import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
  const nav=$("nav"),btn=$("mobileNavBtn");
  if(!nav)return;
  const open=!nav.classList.contains("open");
  nav.classList.toggle("open",open);
  btn?.setAttribute("aria-expanded",open?"true":"false");
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
