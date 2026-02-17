console.log("✅ LOCAL-ONLY APP.JS LOADED");

const LS_NAME  = "allset_rep_name";
const LS_STATE = "allset_rep_state_v5";

// Gate
const gate = document.getElementById("gate");
const appRoot = document.getElementById("app");
const nicknameInput = document.getElementById("nicknameInput");
const enterBtn = document.getElementById("enterBtn");

// Top / controls
const repNameEl = document.getElementById("repName");
const assignedTextEl = document.getElementById("assignedText");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearSearchBtn = document.getElementById("clearSearchBtn");

const gpsBtn = document.getElementById("gpsBtn");
const addDotBtn = document.getElementById("addDotBtn");
const drawBtn = document.getElementById("drawBtn");
const changeNameBtn = document.getElementById("changeNameBtn");
const resetBtn = document.getElementById("resetBtn");

const toggleLeftBtn = document.getElementById("toggleLeftBtn");
const toggleRightBtn = document.getElementById("toggleRightBtn");
const leftPanel = document.getElementById("leftPanel");
const rightPanel = document.getElementById("rightPanel");

// Right panel: info
const onlineListEl = document.getElementById("onlineList");
const countYesEl = document.getElementById("countYes");
const countNoEl = document.getElementById("countNo");
const countNotHomeEl = document.getElementById("countNotHome");
const countCallbackEl = document.getElementById("countCallback");
const countKnockedEl = document.getElementById("countKnocked");
const countSkipEl = document.getElementById("countSkip");
const clearLogBtn = document.getElementById("clearLogBtn");
const logEl = document.getElementById("log");

const toastEl = document.getElementById("toast");

// Map
let map;
let addDotMode = false;
let drawEnabled = false;
let drawControl;
let neighborhoodLayer;
let dotLayer;

// GPS
let gpsOn = false;
let gpsWatchId = null;
let gpsMarker = null;
let gpsCircle = null;

// Dots
const markerById = new Map();
let lastFoundMarker = null;

// State
const state = loadState();

boot();

function boot() {
  // Gate init
  const savedName = localStorage.getItem(LS_NAME);
  if (savedName) {
    setName(savedName);
    unlockApp();
  } else {
    lockApp(true);
  }

  enterBtn.addEventListener("click", () => {
    const name = nicknameInput.value.trim();
    if (!name) return;
    setName(name);
    unlockApp();
  });

  nicknameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enterBtn.click();
  });

  changeNameBtn.addEventListener("click", () => lockApp(true));

  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset local data (dots + neighborhoods + assignment + logs + name)?")) return;
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_NAME);
    location.reload();
  });

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
  gpsBtn.addEventListener("click", () => (gpsOn ? stopGps() : startGps()));

  addDotBtn.addEventListener("click", () => {
    addDotMode = !addDotMode;
    addDotBtn.textContent = addDotMode ? "✓ Add Dot ON" : "+ Add Dot";
    addLog(addDotMode ? "➕ Add Dot ON: click map to place dot" : "➕ Add Dot OFF");
    toast(addDotMode ? "Add Dot ON" : "Add Dot OFF");
  });

  drawBtn.addEventListener("click", toggleDraw);

  // Search
  searchBtn.addEventListener("click", doSearch);
  clearSearchBtn.addEventListener("click", clearSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  // Activity
  clearLogBtn.addEventListener("click", () => {
    if (!confirm("Clear activity log?")) return;
    state.log = [];
    saveState();
    renderLog();
  });

  // Map init
  initMap();
  loadNeighborhoods();
  loadDots();
  renderCounts();
  renderLog();
  renderOnline();
  refreshAssignedText();
}

function lockApp(focus = false) {
  gate.style.display = "grid";
  appRoot.classList.add("app--locked");
  if (focus) setTimeout(() => nicknameInput.focus(), 60);
}

function unlockApp() {
  gate.style.display = "none";
  appRoot.classList.remove("app--locked");
  setTimeout(() => map?.invalidateSize?.(), 250);
  toast(`Welcome, ${getName()}`);
  addLog(`✅ ${getName()} entered`);
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 1600);
}

function setName(name) {
  localStorage.setItem(LS_NAME, name);
  repNameEl.textContent = name;
  nicknameInput.value = name;
  renderOnline();
}

function getName() {
  return localStorage.getItem(LS_NAME) || "Rep";
}

/* ===================== State ===================== */

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATE)) || {
      dots: {},           // id -> {id,lat,lng,label,status}
      neighborhoods: {},  // id -> {id,name,color,geojson}
      assignedNeighborhoodId: null,
      log: []
    };
  } catch {
    return { dots:{}, neighborhoods:{}, assignedNeighborhoodId:null, log:[] };
  }
}
function saveState() {
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}

/* ===================== Online / Logs / Counts ===================== */

function renderOnline() {
  // Local-only placeholder: just shows you
  onlineListEl.innerHTML = "";
  const div = document.createElement("div");
  div.className = "listItem";
  div.textContent = `🟢 ${getName()} (you)`;
  onlineListEl.appendChild(div);
}

function addLog(text) {
  state.log.unshift({ t: Date.now(), text });
  state.log = state.log.slice(0, 150);
  saveState();
  renderLog();
}

function renderLog() {
  logEl.innerHTML = "";
  for (const item of state.log) {
    const div = document.createElement("div");
    div.className = "logItem";
    const time = new Date(item.t).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    div.textContent = `[${time}] ${item.text}`;
    logEl.appendChild(div);
  }
}

function renderCounts() {
  const counts = { yes:0, no:0, nothome:0, callback:0, knocked:0, skip:0 };
  for (const id of Object.keys(state.dots || {})) {
    const s = state.dots[id]?.status || "none";
    if (s in counts) counts[s]++;
  }
  countYesEl.textContent = String(counts.yes);
  countNoEl.textContent = String(counts.no);
  countNotHomeEl.textContent = String(counts.nothome);
  countCallbackEl.textContent = String(counts.callback);
  countKnockedEl.textContent = String(counts.knocked);
  countSkipEl.textContent = String(counts.skip);
}

function refreshAssignedText() {
  const id = state.assignedNeighborhoodId;
  if (!id) return (assignedTextEl.textContent = "None");
  const nb = state.neighborhoods[id];
  assignedTextEl.textContent = nb ? nb.name : "None";
}

/* ===================== Map ===================== */

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([41.6611, -91.5302], 13);

  // Clean basemap with grey-ish features, blue water, green parks
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);

  neighborhoodLayer = new L.FeatureGroup();
  dotLayer = new L.FeatureGroup();
  map.addLayer(neighborhoodLayer);
  map.addLayer(dotLayer);

  // Click map to add dot (when mode ON)
  map.on("click", (e) => {
    if (!addDotMode) return;

    const id = `dot-${Date.now()}`;
    const dot = { id, lat: e.latlng.lat, lng: e.latlng.lng, label: "", status: "none" };
    state.dots[id] = dot;
    saveState();

    addDotMarker(dot); // place it quietly
addLog(`➕ ${getName()} placed a dot`);
toast("Dot placed (tap it to set status)");
renderCounts();
  });

  // Leaflet Draw control (toggle on/off)
  drawControl = new L.Control.Draw({
    draw: {
      polygon: true,
      rectangle: true,
      circle: false,
      circlemarker: false,
      marker: false,
      polyline: false
    },
    edit: { featureGroup: neighborhoodLayer }
  });

  map.on(L.Draw.Event.CREATED, (event) => {
    const layer = event.layer;

    const name = prompt("Neighborhood name? (ex: Eastside)")?.trim() || "Neighborhood";
    const color = prompt("Color hex? (ex: #38bdf8)", "#38bdf8")?.trim() || "#38bdf8";

    layer.setStyle({ color, weight: 3, fillColor: color, fillOpacity: 0.18 });
    neighborhoodLayer.addLayer(layer);

    const id = `nb-${Date.now()}`;
    state.neighborhoods[id] = { id, name, color, geojson: layer.toGeoJSON() };
    saveState();

    bindNeighborhoodInteractions(id, layer);
    addLog(`🗺️ ${getName()} created neighborhood: ${name}`);
  });

  map.on(L.Draw.Event.EDITED, (event) => {
    event.layers.eachLayer((layer) => {
      const id = layer._nbId;
      if (!id || !state.neighborhoods[id]) return;
      state.neighborhoods[id].geojson = layer.toGeoJSON();
    });
    saveState();
    addLog("✏️ Neighborhoods edited");
  });

  map.on(L.Draw.Event.DELETED, (event) => {
    event.layers.eachLayer((layer) => {
      const id = layer._nbId;
      if (!id) return;
      delete state.neighborhoods[id];
      if (state.assignedNeighborhoodId === id) state.assignedNeighborhoodId = null;
    });
    saveState();
    refreshAssignedText();
    addLog("🗑 Neighborhood deleted");
  });
}

function toggleDraw() {
  drawEnabled = !drawEnabled;
  if (drawEnabled) {
    map.addControl(drawControl);
    drawBtn.textContent = "✏️ Draw ON";
    toast("Draw ON (use tools on map)");
    addLog("✏️ Draw enabled");
  } else {
    map.removeControl(drawControl);
    drawBtn.textContent = "✏️ Draw";
    toast("Draw OFF");
    addLog("✏️ Draw disabled");
  }
}

/* ===================== Dots ===================== */

function loadDots() {
  Object.values(state.dots || {}).forEach(addDotMarker);

  // Small demo if empty (optional)
  if (Object.keys(state.dots || {}).length === 0) {
    const demo = [
      { id: "demo-214", lat: 41.6650, lng: -91.5305, label: "214 Oak", status: "none" },
      { id: "demo-318", lat: 41.6598, lng: -91.5258, label: "318 Pine", status: "none" }
    ];
    demo.forEach(d => { state.dots[d.id] = d; addDotMarker(d); });
    saveState();
  }
  renderCounts();
}

function addDotMarker(dot) {
  if (markerById.has(dot.id)) return markerById.get(dot.id);

  const marker = L.circleMarker([dot.lat, dot.lng], dotStyle(dot.status)).addTo(dotLayer);
  markerById.set(dot.id, marker);

  if (dot.label) marker.bindTooltip(dot.label, { direction:"top", offset:[0,-6] });

  marker.on("click", () => openDotPopup(dot.id, marker));
  return marker;
}

function openDotPopup(dotId, marker) {
  const dot = state.dots[dotId];
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

    const saveLabel = () => {
      dot.label = (labelInput?.value || "").trim();
      marker.unbindTooltip();
      if (dot.label) marker.bindTooltip(dot.label, { direction:"top", offset:[0,-6] });
      saveState();
    };

    labelInput?.addEventListener("change", saveLabel);
    labelInput?.addEventListener("blur", saveLabel);

    root.querySelectorAll("button[data-s]").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        saveLabel();

        const s = btn.getAttribute("data-s");

        if (s === "delete") {
          delete state.dots[dotId];
          saveState();
          dotLayer.removeLayer(marker);
          markerById.delete(dotId);
          map.closePopup();
          addLog(`🗑 ${getName()} removed a dot`);
          renderCounts();
          return;
        }

        dot.status = s;
        marker.setStyle(dotStyle(s));
        saveState();
        map.closePopup();
        addLog(`🏠 ${getName()} set ${dot.label || dotId}: ${statusLabel(s)}`);
        renderCounts();
      });
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

function statusLabel(s) {
  if (s === "yes") return "Yes / Closed";
  if (s === "no") return "No";
  if (s === "nothome") return "Not Home";
  if (s === "callback") return "Callback";
  if (s === "knocked") return "Knocked";
  if (s === "skip") return "Skip";
  return "Unmarked";
}

function dotStyle(status) {
  const base = { radius: 7, weight: 2, opacity: 1, fillOpacity: 0.92 };

  if (status === "yes")     return { ...base, color:"rgba(34,197,94,.95)",  fillColor:"rgba(34,197,94,.85)" };
  if (status === "no")      return { ...base, color:"rgba(239,68,68,.95)",  fillColor:"rgba(239,68,68,.85)" };
  if (status === "nothome") return { ...base, color:"rgba(56,189,248,.95)", fillColor:"rgba(56,189,248,.80)" };
  if (status === "callback")return { ...base, color:"rgba(167,139,250,.95)",fillColor:"rgba(167,139,250,.80)" };
  if (status === "knocked") return { ...base, color:"rgba(245,158,11,.95)", fillColor:"rgba(245,158,11,.85)" };
  if (status === "skip")    return { ...base, color:"rgba(255,255,255,.35)",fillColor:"rgba(255,255,255,.18)" };

  return { ...base, color:"rgba(255,255,255,.40)", fillColor:"rgba(160,160,160,.65)", fillOpacity:0.75 };
}

/* ===================== Neighborhoods ===================== */

function loadNeighborhoods() {
  Object.values(state.neighborhoods || {}).forEach(nb => {
    const layerGroup = L.geoJSON(nb.geojson, {
      style: { color: nb.color, weight: 3, fillColor: nb.color, fillOpacity: 0.18 }
    });

    layerGroup.eachLayer((layer) => {
      neighborhoodLayer.addLayer(layer);
      bindNeighborhoodInteractions(nb.id, layer);
    });
  });
}

function bindNeighborhoodInteractions(nbId, layer) {
  layer._nbId = nbId;

  layer.on("click", () => {
    const nb = state.neighborhoods[nbId];
    if (!nb) return;

    const isAssigned = state.assignedNeighborhoodId === nbId;

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
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const act = btn.getAttribute("data-a");

          if (act === "assign") {
            state.assignedNeighborhoodId = nbId;
            saveState();
            refreshAssignedText();
            addLog(`🧭 ${getName()} assigned to ${nb.name}`);
            map.closePopup();
            return;
          }

          if (act === "unassign") {
            state.assignedNeighborhoodId = null;
            saveState();
            refreshAssignedText();
            addLog(`🧭 ${getName()} unassigned`);
            map.closePopup();
            return;
          }

          if (act === "delete") {
            if (!confirm(`Delete neighborhood "${nb.name}"?`)) return;
            delete state.neighborhoods[nbId];
            if (state.assignedNeighborhoodId === nbId) state.assignedNeighborhoodId = null;
            saveState();
            refreshAssignedText();
            neighborhoodLayer.removeLayer(layer);
            addLog(`🗑 ${getName()} deleted neighborhood ${nb.name}`);
            map.closePopup();
          }
        });
      });
    }, 0);
  });
}

/* ===================== Search ===================== */

function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return;

  // Find first matching label
  const match = Object.values(state.dots || {}).find(d => (d.label || "").toLowerCase().includes(q));
  if (!match) {
    toast("No match");
    return;
  }

  const marker = markerById.get(match.id);
  if (!marker) return;

  if (lastFoundMarker) lastFoundMarker.setStyle(dotStyle(state.dots[lastFoundMarker._dotId]?.status || "none"));

  marker._dotId = match.id;
  lastFoundMarker = marker;

  map.setView([match.lat, match.lng], Math.max(map.getZoom(), 17));
  marker.setStyle({ ...dotStyle(match.status), radius: 10, weight: 3 });

  toast(`Found: ${match.label || match.id}`);
}

function clearSearch() {
  searchInput.value = "";
  toast("Search cleared");
}

/* ===================== GPS ===================== */

function startGps() {
  if (!navigator.geolocation) return toast("GPS not supported");
  if (gpsOn) return;

  gpsOn = true;
  gpsBtn.textContent = "GPS: On";
  addLog("📡 GPS started");

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = [latitude, longitude];

      if (!gpsMarker) {
        gpsMarker = L.circleMarker(latlng, {
          radius: 7,
          weight: 3,
          color: "rgba(56,189,248,.95)",
          fillColor: "rgba(56,189,248,.55)",
          fillOpacity: 1
        }).addTo(map).bindTooltip(`${getName()} (you)`);

        gpsCircle = L.circle(latlng, {
          radius: Math.max(accuracy, 15),
          weight: 1,
          color: "rgba(56,189,248,.35)",
          fillColor: "rgba(56,189,248,.12)",
          fillOpacity: 1
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

  addLog("🛑 GPS stopped");
}

/* ===================== Utils ===================== */

function escapeHtml(str) {
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
