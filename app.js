console.log("✅ FIREBASE APP.JS LOADED");

// ===================== Firebase Config =====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  serverTimestamp,
  getDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  onDisconnect,
  serverTimestamp as rtServerTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const fbApp  = initializeApp(firebaseConfig);
const auth   = getAuth(fbApp);
const db     = getFirestore(fbApp);
const rtdb   = getDatabase(fbApp);

// ===================== Constants =====================
const LS_NAME = "allset_rep_name";

// ===================== DOM Refs =====================
const gate          = document.getElementById("gate");
const appRoot       = document.getElementById("app");
const nicknameInput = document.getElementById("nicknameInput");
const enterBtn      = document.getElementById("enterBtn");

const repNameEl      = document.getElementById("repName");
const assignedTextEl = document.getElementById("assignedText");
const searchInput    = document.getElementById("searchInput");
const searchBtn      = document.getElementById("searchBtn");
const clearSearchBtn = document.getElementById("clearSearchBtn");

const gpsBtn       = document.getElementById("gpsBtn");
const addDotBtn    = document.getElementById("addDotBtn");
const drawBtn      = document.getElementById("drawBtn");
const changeNameBtn = document.getElementById("changeNameBtn");
const resetBtn     = document.getElementById("resetBtn");

const toggleLeftBtn  = document.getElementById("toggleLeftBtn");
const toggleRightBtn = document.getElementById("toggleRightBtn");
const leftPanel      = document.getElementById("leftPanel");
const rightPanel     = document.getElementById("rightPanel");

const onlineListEl     = document.getElementById("onlineList");
const countYesEl       = document.getElementById("countYes");
const countNoEl        = document.getElementById("countNo");
const countNotHomeEl   = document.getElementById("countNotHome");
const countCallbackEl  = document.getElementById("countCallback");
const countKnockedEl   = document.getElementById("countKnocked");
const countSkipEl      = document.getElementById("countSkip");
const clearLogBtn      = document.getElementById("clearLogBtn");
const logEl            = document.getElementById("log");
const toastEl          = document.getElementById("toast");

// ===================== Runtime State =====================
let map;
let addDotMode   = false;
let drawEnabled  = false;
let drawControl;
let neighborhoodLayer;
let dotLayer;

let gpsOn      = false;
let gpsWatchId = null;
let gpsMarker  = null;
let gpsCircle  = null;

const markerById   = new Map();  // dotId -> leaflet marker
const nbLayerById  = new Map();  // nbId  -> leaflet layer
let lastFoundMarker = null;

// Local mirrors (synced from Firestore)
let dotsCache         = {};  // id -> dot obj
let neighborhoodsCache = {};  // id -> nb obj
let assignedNbId      = null;
let logCache          = [];   // [{t, text}]

// Current user
let currentUid  = null;
let currentName = null;

// Firestore unsubs
const unsubs = [];

// ===================== Boot =====================
boot();

async function boot() {
  // Map init early so tiles load
  initMap();

  // Mobile panel toggles
  toggleLeftBtn.addEventListener("click", () => {
    rightPanel.classList.remove("panel--open");
    leftPanel.classList.toggle("panel--open");
  });
  toggleRightBtn.addEventListener("click", () => {
    leftPanel.classList.remove("panel--open");
    rightPanel.classList.toggle("panel--open");
  });

  // Controls
  gpsBtn.addEventListener("click",    () => (gpsOn ? stopGps() : startGps()));
  addDotBtn.addEventListener("click", toggleAddDot);
  drawBtn.addEventListener("click",   toggleDraw);

  // Search
  searchBtn.addEventListener("click",      doSearch);
  clearSearchBtn.addEventListener("click", clearSearch);
  searchInput.addEventListener("keydown",  e => { if (e.key === "Enter") doSearch(); });

  // Activity
  clearLogBtn.addEventListener("click", async () => {
    if (!confirm("Clear activity log?")) return;
    await clearRemoteLog();
  });

  // Name gate
  enterBtn.addEventListener("click",   handleEnter);
  nicknameInput.addEventListener("keydown", e => { if (e.key === "Enter") enterBtn.click(); });
  changeNameBtn.addEventListener("click", () => showGate());
  resetBtn.addEventListener("click",   handleReset);

  // Auth
  const savedName = localStorage.getItem(LS_NAME);
  if (savedName) nicknameInput.value = savedName;

  lockApp(true);

  onAuthStateChanged(auth, async user => {
    if (user) {
      currentUid = user.uid;
      // Check if name is stored in Firestore already
      const snap = await getDoc(doc(db, "reps", currentUid));
      if (snap.exists()) {
        currentName = snap.data().name;
        localStorage.setItem(LS_NAME, currentName);
        completeLogin();
      } else {
        // Need name from user
        showGate();
      }
    } else {
      signInAnonymously(auth).catch(err => toast("Auth error: " + err.message));
    }
  });
}

// ===================== Gate / Auth =====================
async function handleEnter() {
  const name = nicknameInput.value.trim();
  if (!name) return;
  if (!currentUid) {
    toast("Signing in...");
    return;
  }
  await saveRepName(name);
  completeLogin();
}

async function saveRepName(name) {
  currentName = name;
  localStorage.setItem(LS_NAME, name);
  await setDoc(doc(db, "reps", currentUid), { name, uid: currentUid, updatedAt: serverTimestamp() }, { merge: true });
}

function completeLogin() {
  gate.style.display = "none";
  appRoot.classList.remove("app--locked");
  repNameEl.textContent = currentName;
  nicknameInput.value   = currentName;

  setupPresence();
  subscribeAll();

  setTimeout(() => map?.invalidateSize?.(), 250);
  toast(`Welcome, ${currentName} 👋`);
}

function showGate() {
  gate.style.display = "grid";
  appRoot.classList.add("app--locked");
  setTimeout(() => nicknameInput.focus(), 60);
}

function lockApp(focus = false) {
  gate.style.display = "grid";
  appRoot.classList.add("app--locked");
  if (focus) setTimeout(() => nicknameInput.focus(), 60);
}

async function handleReset() {
  if (!confirm("Reset ALL data (dots, neighborhoods, logs)? This affects everyone.")) return;

  // Delete all dots, neighborhoods, logs for this session
  // (We only nuke reps own data — shared data stays)
  localStorage.removeItem(LS_NAME);
  if (currentUid) {
    await deleteDoc(doc(db, "reps", currentUid));
    await setPresenceOffline();
  }
  location.reload();
}

// ===================== Presence (RTDB) =====================
function setupPresence() {
  if (!currentUid) return;
  const presenceRef = ref(rtdb, `presence/${currentUid}`);
  const connRef     = ref(rtdb, ".info/connected");

  onValue(connRef, snap => {
    if (!snap.val()) return;
    onDisconnect(presenceRef).remove();
    set(presenceRef, { name: currentName, uid: currentUid, online: true, lastSeen: rtServerTimestamp() });
  });

  // Listen to all presence
  onValue(ref(rtdb, "presence"), snap => {
    const data = snap.val() || {};
    renderOnline(data);
  });
}

async function setPresenceOffline() {
  if (!currentUid) return;
  await set(ref(rtdb, `presence/${currentUid}`), null);
}

function renderOnline(data) {
  onlineListEl.innerHTML = "";
  const users = Object.values(data);
  if (users.length === 0) {
    const div = document.createElement("div");
    div.className = "listItem";
    div.textContent = "No one online yet";
    onlineListEl.appendChild(div);
    return;
  }
  users.forEach(u => {
    const div = document.createElement("div");
    div.className = "listItem";
    const isYou = u.uid === currentUid;
    div.textContent = `🟢 ${u.name}${isYou ? " (you)" : ""}`;
    onlineListEl.appendChild(div);
  });
}

// ===================== Firestore Subscriptions =====================
function subscribeAll() {
  // Dots
  unsubs.push(onSnapshot(collection(db, "dots"), snap => {
    dotsCache = {};
    snap.forEach(d => { dotsCache[d.id] = d.data(); });
    syncDotMarkers();
    renderCounts();
  }));

  // Neighborhoods
  unsubs.push(onSnapshot(collection(db, "neighborhoods"), snap => {
    neighborhoodsCache = {};
    snap.forEach(d => { neighborhoodsCache[d.id] = d.data(); });
    syncNeighborhoodLayers();
    refreshAssignedText();
  }));

  // Assignment (per-rep)
  if (currentUid) {
    unsubs.push(onSnapshot(doc(db, "reps", currentUid), snap => {
      if (!snap.exists()) return;
      assignedNbId = snap.data().assignedNeighborhoodId || null;
      refreshAssignedText();
    }));
  }

  // Log
  unsubs.push(onSnapshot(doc(db, "shared", "activityLog"), snap => {
    if (!snap.exists()) return;
    logCache = snap.data().entries || [];
    renderLog();
  }));
}

// ===================== Dots: Firestore CRUD =====================
async function createDot(dot) {
  await setDoc(doc(db, "dots", dot.id), dot);
}

async function updateDot(dot) {
  await setDoc(doc(db, "dots", dot.id), dot, { merge: true });
}

async function deleteDot(id) {
  await deleteDoc(doc(db, "dots", id));
}

// ===================== Dot Markers: sync local map to cache =====================
function syncDotMarkers() {
  const cacheIds = new Set(Object.keys(dotsCache));

  // Remove markers no longer in cache
  for (const [id, marker] of markerById.entries()) {
    if (!cacheIds.has(id)) {
      dotLayer.removeLayer(marker);
      markerById.delete(id);
    }
  }

  // Add / update
  for (const dot of Object.values(dotsCache)) {
    if (markerById.has(dot.id)) {
      // Update style + tooltip
      const marker = markerById.get(dot.id);
      marker.setStyle(dotStyle(dot.status));
      marker.unbindTooltip();
      if (dot.label) marker.bindTooltip(dot.label, { direction:"top", offset:[0,-6] });
    } else {
      addDotMarker(dot);
    }
  }
}

function addDotMarker(dot) {
  if (markerById.has(dot.id)) return markerById.get(dot.id);

  const marker = L.circleMarker([dot.lat, dot.lng], dotStyle(dot.status)).addTo(dotLayer);
  markerById.set(dot.id, marker);

  if (dot.label) marker.bindTooltip(dot.label, { direction:"top", offset:[0,-6] });
  marker.on("click", () => openDotPopup(dot.id, marker));
  return marker;
}

// ===================== Open Dot Popup =====================
function openDotPopup(dotId, marker) {
  const dot = dotsCache[dotId];
  if (!dot) return;

  const html = `
    <div style="min-width:240px">
      <div style="font-weight:950; margin-bottom:6px">House</div>
      <div style="font-size:12px; opacity:.75; margin-bottom:6px">Label (editable)</div>
      <input id="lbl_${dotId}" value="${escapeHtml(dot.label || "")}"
        placeholder="Optional: 214 Oak"
        style="width:100%; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,.15); margin-bottom:10px;"
      />
      <div style="font-size:12px; opacity:.75; margin-bottom:10px">
        Status: <b>${statusLabel(dot.status || "none")}</b>
      </div>
      <div style="display:grid; gap:7px">
        ${popupBtn("yes","✅ Yes / Closed")}
        ${popupBtn("no","❌ No")}
        ${popupBtn("nothome","🏃 Not Home")}
        ${popupBtn("callback","📞 Callback")}
        ${popupBtn("knocked","🟨 Knocked")}
        ${popupBtn("skip","⏭️ Skip")}
        ${popupBtn("none","↩ Reset","ghost")}
        ${popupBtn("delete","🗑 Remove Dot","danger")}
      </div>
    </div>
  `;

  marker.bindPopup(L.popup({ closeButton:true, autoPan:true }).setContent(html)).openPopup();

  setTimeout(() => {
    const root = document.querySelector(".leaflet-popup-content");
    if (!root) return;

    const labelInput = root.querySelector(`#lbl_${CSS.escape(dotId)}`);

    const getLabel = () => (labelInput?.value || "").trim();

    root.querySelectorAll("button[data-s]").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const s     = btn.getAttribute("data-s");
        const label = getLabel();

        if (s === "delete") {
          await deleteDot(dotId);
          map.closePopup();
          await addRemoteLog(`🗑 ${currentName} removed a dot`);
          return;
        }

        const updated = { ...dot, label, status: s };
        await updateDot(updated);
        map.closePopup();
        await addRemoteLog(`🏠 ${currentName} set ${label || dotId}: ${statusLabel(s)}`);
      });
    });

    // Label blur save
    labelInput?.addEventListener("blur", async () => {
      const label = getLabel();
      if (label !== dot.label) {
        await updateDot({ ...dot, label });
      }
    });
  }, 0);
}

function popupBtn(status, text, kind) {
  const cls =
    kind === "danger" ? "popBtn popBtn--danger" :
    kind === "ghost"  ? "popBtn popBtn--ghost" :
    "popBtn";
  return `<button class="${cls}" data-s="${status}" type="button">${text}</button>`;
}

// ===================== Neighborhoods: Firestore CRUD =====================
async function createNeighborhood(nb) {
  await setDoc(doc(db, "neighborhoods", nb.id), nb);
}

async function updateNeighborhood(nb) {
  await setDoc(doc(db, "neighborhoods", nb.id), nb, { merge: true });
}

async function deleteNeighborhood(id) {
  await deleteDoc(doc(db, "neighborhoods", id));
}

// ===================== Neighborhood Layers: sync =====================
function syncNeighborhoodLayers() {
  const cacheIds = new Set(Object.keys(neighborhoodsCache));

  // Remove stale
  for (const [id, layer] of nbLayerById.entries()) {
    if (!cacheIds.has(id)) {
      neighborhoodLayer.removeLayer(layer);
      nbLayerById.delete(id);
    }
  }

  // Add new
  for (const nb of Object.values(neighborhoodsCache)) {
    if (!nbLayerById.has(nb.id)) {
      const layerGroup = L.geoJSON(nb.geojson, {
        style: { color: nb.color, weight: 3, fillColor: nb.color, fillOpacity: 0.18 }
      });
      layerGroup.eachLayer(layer => {
        neighborhoodLayer.addLayer(layer);
        bindNeighborhoodInteractions(nb.id, layer);
      });
      // Store first child as representative layer
      const layers = [];
      layerGroup.eachLayer(l => layers.push(l));
      nbLayerById.set(nb.id, layers[0] || layerGroup);
    }
  }
}

function bindNeighborhoodInteractions(nbId, layer) {
  layer._nbId = nbId;

  layer.on("click", () => {
    const nb = neighborhoodsCache[nbId];
    if (!nb) return;

    const isAssigned = assignedNbId === nbId;

    const html = `
      <div style="min-width:230px">
        <div style="font-weight:950; margin-bottom:6px">${escapeHtml(nb.name)}</div>
        <div style="font-size:12px; opacity:.75; margin-bottom:10px">Color: ${escapeHtml(nb.color)}</div>
        <div style="display:grid; gap:7px">
          <button class="popBtn" data-a="${isAssigned ? "unassign" : "assign"}" type="button">
            ${isAssigned ? "🚫 Unassign Me" : "✅ Assign Me Here"}
          </button>
          <button class="popBtn popBtn--danger" data-a="delete" type="button">🗑 Delete Neighborhood</button>
        </div>
      </div>
    `;

    layer.bindPopup(L.popup({ closeButton:true, autoPan:true }).setContent(html)).openPopup();

    setTimeout(() => {
      const root = document.querySelector(".leaflet-popup-content");
      if (!root) return;

      root.querySelectorAll("button[data-a]").forEach(btn => {
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const act = btn.getAttribute("data-a");

          if (act === "assign") {
            assignedNbId = nbId;
            await setDoc(doc(db, "reps", currentUid), { assignedNeighborhoodId: nbId }, { merge: true });
            refreshAssignedText();
            await addRemoteLog(`🧭 ${currentName} assigned to ${nb.name}`);
            map.closePopup();
          } else if (act === "unassign") {
            assignedNbId = null;
            await setDoc(doc(db, "reps", currentUid), { assignedNeighborhoodId: null }, { merge: true });
            refreshAssignedText();
            await addRemoteLog(`🧭 ${currentName} unassigned`);
            map.closePopup();
          } else if (act === "delete") {
            if (!confirm(`Delete neighborhood "${nb.name}"?`)) return;
            await deleteNeighborhood(nbId);
            if (assignedNbId === nbId) {
              assignedNbId = null;
              await setDoc(doc(db, "reps", currentUid), { assignedNeighborhoodId: null }, { merge: true });
            }
            refreshAssignedText();
            await addRemoteLog(`🗑 ${currentName} deleted neighborhood ${nb.name}`);
            map.closePopup();
          }
        });
      });
    }, 0);
  });
}

// ===================== Activity Log (Firestore shared doc) =====================
async function addRemoteLog(text) {
  const entry = { t: Date.now(), text };
  const newEntries = [entry, ...logCache].slice(0, 150);
  await setDoc(doc(db, "shared", "activityLog"), { entries: newEntries });
}

async function clearRemoteLog() {
  if (!confirm("Clear activity log for everyone?")) return;
  await setDoc(doc(db, "shared", "activityLog"), { entries: [] });
}

function renderLog() {
  logEl.innerHTML = "";
  for (const item of logCache) {
    const div = document.createElement("div");
    div.className = "logItem";
    const time = new Date(item.t).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    div.textContent = `[${time}] ${item.text}`;
    logEl.appendChild(div);
  }
}

// ===================== Counts =====================
function renderCounts() {
  const counts = { yes:0, no:0, nothome:0, callback:0, knocked:0, skip:0 };
  for (const dot of Object.values(dotsCache)) {
    const s = dot.status || "none";
    if (s in counts) counts[s]++;
  }
  countYesEl.textContent      = String(counts.yes);
  countNoEl.textContent       = String(counts.no);
  countNotHomeEl.textContent  = String(counts.nothome);
  countCallbackEl.textContent = String(counts.callback);
  countKnockedEl.textContent  = String(counts.knocked);
  countSkipEl.textContent     = String(counts.skip);
}

function refreshAssignedText() {
  if (!assignedNbId) return (assignedTextEl.textContent = "None");
  const nb = neighborhoodsCache[assignedNbId];
  assignedTextEl.textContent = nb ? nb.name : "None";
}

// ===================== Map =====================
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([41.6611, -91.5302], 13);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);

  neighborhoodLayer = new L.FeatureGroup();
  dotLayer          = new L.FeatureGroup();
  map.addLayer(neighborhoodLayer);
  map.addLayer(dotLayer);

  // Click map to add dot (when mode ON)
  map.on("click", async (e) => {
    if (!addDotMode) return;

    const id  = `dot-${Date.now()}`;
    const dot = { id, lat: e.latlng.lat, lng: e.latlng.lng, label: "", status: "none", createdBy: currentName || "Rep" };
    await createDot(dot);
    await addRemoteLog(`➕ ${currentName} placed a dot`);
    toast("Dot placed — tap it to set status");
  });

  // Draw control
  drawControl = new L.Control.Draw({
    draw: {
      polygon:      true,
      rectangle:    true,
      circle:       false,
      circlemarker: false,
      marker:       false,
      polyline:     false
    },
    edit: { featureGroup: neighborhoodLayer }
  });

  map.on(L.Draw.Event.CREATED, async (event) => {
    const layer = event.layer;
    const name  = prompt("Neighborhood name? (ex: Eastside)")?.trim() || "Neighborhood";
    const color = prompt("Color hex? (ex: #38bdf8)", "#38bdf8")?.trim() || "#38bdf8";

    layer.setStyle({ color, weight: 3, fillColor: color, fillOpacity: 0.18 });

    const id = `nb-${Date.now()}`;
    const nb = { id, name, color, geojson: layer.toGeoJSON() };
    await createNeighborhood(nb);
    await addRemoteLog(`🗺️ ${currentName} created neighborhood: ${name}`);
  });

  map.on(L.Draw.Event.EDITED, async (event) => {
    const batch = writeBatch(db);
    event.layers.eachLayer(async layer => {
      const id = layer._nbId;
      if (!id || !neighborhoodsCache[id]) return;
      batch.set(doc(db, "neighborhoods", id), { geojson: layer.toGeoJSON() }, { merge: true });
    });
    await batch.commit();
    await addRemoteLog(`✏️ ${currentName} edited neighborhoods`);
  });

  map.on(L.Draw.Event.DELETED, async (event) => {
    const batch = writeBatch(db);
    event.layers.eachLayer(layer => {
      const id = layer._nbId;
      if (!id) return;
      batch.delete(doc(db, "neighborhoods", id));
    });
    await batch.commit();
    await addRemoteLog(`🗑 ${currentName} deleted a neighborhood`);
  });
}

// ===================== Add Dot Toggle =====================
function toggleAddDot() {
  addDotMode = !addDotMode;
  addDotBtn.textContent = addDotMode ? "✓ Add Dot ON" : "+ Add Dot";
  toast(addDotMode ? "Add Dot ON — tap map to place" : "Add Dot OFF");
}

// ===================== Draw Toggle =====================
function toggleDraw() {
  drawEnabled = !drawEnabled;
  if (drawEnabled) {
    map.addControl(drawControl);
    drawBtn.textContent = "✏️ Draw ON";
    toast("Draw ON — use tools on map");
  } else {
    map.removeControl(drawControl);
    drawBtn.textContent = "✏️ Draw";
    toast("Draw OFF");
  }
}

// ===================== Search =====================
function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return;

  const match = Object.values(dotsCache).find(d => (d.label || "").toLowerCase().includes(q));
  if (!match) { toast("No match"); return; }

  const marker = markerById.get(match.id);
  if (!marker) return;

  if (lastFoundMarker) lastFoundMarker.setStyle(dotStyle(dotsCache[lastFoundMarker._dotId]?.status || "none"));

  marker._dotId   = match.id;
  lastFoundMarker = marker;

  map.setView([match.lat, match.lng], Math.max(map.getZoom(), 17));
  marker.setStyle({ ...dotStyle(match.status), radius: 10, weight: 3 });
  toast(`Found: ${match.label || match.id}`);
}

function clearSearch() {
  searchInput.value = "";
  toast("Search cleared");
}

// ===================== GPS =====================
function startGps() {
  if (!navigator.geolocation) return toast("GPS not supported");
  if (gpsOn) return;

  gpsOn = true;
  gpsBtn.textContent = "GPS: On";

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = [latitude, longitude];

      if (!gpsMarker) {
        gpsMarker = L.circleMarker(latlng, {
          radius: 7, weight: 3,
          color: "rgba(56,189,248,.95)",
          fillColor: "rgba(56,189,248,.55)", fillOpacity: 1
        }).addTo(map).bindTooltip(`${currentName} (you)`);

        gpsCircle = L.circle(latlng, {
          radius: Math.max(accuracy, 15), weight: 1,
          color: "rgba(56,189,248,.35)",
          fillColor: "rgba(56,189,248,.12)", fillOpacity: 1
        }).addTo(map);
      } else {
        gpsMarker.setLatLng(latlng);
        gpsCircle.setLatLng(latlng);
        gpsCircle.setRadius(Math.max(accuracy, 15));
      }
    },
    (err) => { toast(`GPS error: ${err.message}`); stopGps(); },
    { enableHighAccuracy:true, maximumAge:5000, timeout:15000 }
  );
}

function stopGps() {
  gpsOn = false;
  gpsBtn.textContent = "GPS: Off";
  if (gpsWatchId != null) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId = null;
  if (gpsMarker) map.removeLayer(gpsMarker);
  if (gpsCircle) map.removeLayer(gpsCircle);
  gpsMarker = null;
  gpsCircle = null;
}

// ===================== Styles / Utils =====================
function statusLabel(s) {
  if (s === "yes")      return "Yes / Closed";
  if (s === "no")       return "No";
  if (s === "nothome")  return "Not Home";
  if (s === "callback") return "Callback";
  if (s === "knocked")  return "Knocked";
  if (s === "skip")     return "Skip";
  return "Unmarked";
}

function dotStyle(status) {
  const base = { radius:7, weight:2, opacity:1, fillOpacity:0.92 };
  if (status === "yes")      return { ...base, color:"rgba(34,197,94,.95)",   fillColor:"rgba(34,197,94,.85)"   };
  if (status === "no")       return { ...base, color:"rgba(239,68,68,.95)",   fillColor:"rgba(239,68,68,.85)"   };
  if (status === "nothome")  return { ...base, color:"rgba(56,189,248,.95)",  fillColor:"rgba(56,189,248,.80)"  };
  if (status === "callback") return { ...base, color:"rgba(167,139,250,.95)", fillColor:"rgba(167,139,250,.80)" };
  if (status === "knocked")  return { ...base, color:"rgba(245,158,11,.95)",  fillColor:"rgba(245,158,11,.85)"  };
  if (status === "skip")     return { ...base, color:"rgba(255,255,255,.35)", fillColor:"rgba(255,255,255,.18)" };
  return { ...base, color:"rgba(255,255,255,.40)", fillColor:"rgba(160,160,160,.65)", fillOpacity:0.75 };
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 1600);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
