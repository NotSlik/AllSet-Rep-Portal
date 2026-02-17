console.log("✅ LOCAL-ONLY APP.JS LOADED");

const LS_NAME  = "allset_rep_name";
const LS_STATE = "allset_rep_state_v3";

// Elements
const gate = document.getElementById("gate");
const appRoot = document.getElementById("app");
const nicknameInput = document.getElementById("nicknameInput");
const enterBtn = document.getElementById("enterBtn");

const repNameEl = document.getElementById("repName");
const changeNameBtn = document.getElementById("changeNameBtn");
const resetLocalBtn = document.getElementById("resetLocalBtn");

const gpsBtn = document.getElementById("gpsBtn");
const addDotBtn = document.getElementById("addDotBtn");

const leftPanel  = document.getElementById("leftPanel");
const rightPanel = document.getElementById("rightPanel");
const toggleLeftBtn  = document.getElementById("toggleLeftBtn");
const toggleRightBtn = document.getElementById("toggleRightBtn");

const assignedNeighborhoodEl = document.getElementById("assignedNeighborhood");
const countYesEl = document.getElementById("countYes");
const countNoEl = document.getElementById("countNo");
const countNotHomeEl = document.getElementById("countNotHome");
const countCallbackEl = document.getElementById("countCallback");
const countKnockedEl = document.getElementById("countKnocked");
const countSkipEl = document.getElementById("countSkip");

const assignNorthBtn = document.getElementById("assignNorthBtn");
const assignEastBtn  = document.getElementById("assignEastBtn");
const assignWestBtn  = document.getElementById("assignWestBtn");

const pingText = document.getElementById("pingText");
const sendPingBtn = document.getElementById("sendPingBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const logEl = document.getElementById("log");

// State
const state = loadState();
let map;

// Map / GPS
let addDotMode = false;
let gpsOn = false;
let gpsWatchId = null;
let gpsMarker = null;
let gpsCircle = null;

// House markers registry
const markerById = new Map();

boot();

function boot() {
  // Gate
  const savedName = localStorage.getItem(LS_NAME);
  if (savedName) {
    setName(savedName);
    unlockApp(false);
  } else {
    lockApp();
  }

  enterBtn.addEventListener("click", () => {
    const name = nicknameInput.value.trim();
    if (!name) return;
    setName(name);
    unlockApp(true);
  });

  nicknameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enterBtn.click();
  });

  changeNameBtn.addEventListener("click", () => lockApp(true));

  resetLocalBtn.addEventListener("click", () => {
    if (!confirm("Reset local data on this device?")) return;
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_NAME);
    location.reload();
  });

  // Panels (mobile toggles)
  toggleLeftBtn.addEventListener("click", () => {
    rightPanel.classList.remove("panel--open");
    leftPanel.classList.toggle("panel--open");
  });
  toggleRightBtn.addEventListener("click", () => {
    leftPanel.classList.remove("panel--open");
    rightPanel.classList.toggle("panel--open");
  });

  // Assign
  assignNorthBtn.addEventListener("click", () => assignNeighborhood("Northside"));
  assignEastBtn.addEventListener("click", () => assignNeighborhood("Eastside"));
  assignWestBtn.addEventListener("click", () => assignNeighborhood("Westside"));

  // Notes
  sendPingBtn.addEventListener("click", () => {
    const msg = pingText.value.trim();
    if (!msg) return;
    addLog(`📝 ${getName()}: ${msg}`);
    pingText.value = "";
  });

  clearLogBtn.addEventListener("click", () => {
    if (!confirm("Clear activity log?")) return;
    state.log = [];
    saveState();
    renderLog();
  });

  // Add dot mode
  addDotBtn.addEventListener("click", () => {
    addDotMode = !addDotMode;
    addDotBtn.textContent = addDotMode ? "✓ Add Dot ON" : "+ Add Dot";
    addLog(addDotMode ? "➕ Add Dot ON: tap map to place dot" : "➕ Add Dot OFF");
  });

  // GPS
  gpsBtn.addEventListener("click", () => {
    if (!gpsOn) startGps();
    else stopGps();
  });

  initMap();
  loadAllHouses();
  renderStats();
  renderLog();
}

function lockApp(focusInput = false) {
  gate.style.display = "grid";
  appRoot.classList.add("app--locked");
  if (focusInput) setTimeout(() => nicknameInput.focus(), 60);
}

function unlockApp(startGpsAfterGesture) {
  gate.style.display = "none";
  appRoot.classList.remove("app--locked");
  addLog(`✅ ${getName()} entered the map`);

  setTimeout(() => map?.invalidateSize?.(), 250);

  if (startGpsAfterGesture && !gpsOn) startGps();
}

function setName(name) {
  localStorage.setItem(LS_NAME, name);
  repNameEl.textContent = name;
  nicknameInput.value = name;
}

function getName() {
  return localStorage.getItem(LS_NAME) || "Rep";
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATE)) || {
      assignedNeighborhood: "None",
      houses: {},       // {id: status}
      customHouses: {}, // {id: {id,lat,lng,label}}
      log: []
    };
  } catch {
    return { assignedNeighborhood: "None", houses: {}, customHouses: {}, log: [] };
  }
}

function saveState() {
  localStorage.setItem(LS_STATE, JSON.stringify(state));
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
    const time = new Date(item.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    div.textContent = `[${time}] ${item.text}`;
    logEl.appendChild(div);
  }
}

function assignNeighborhood(name) {
  state.assignedNeighborhood = name;
  saveState();
  renderStats();
  addLog(`🧭 Assigned neighborhood: ${name}`);
}

function renderStats() {
  assignedNeighborhoodEl.textContent = state.assignedNeighborhood || "None";

  const counts = { yes:0, no:0, nothome:0, callback:0, knocked:0, skip:0 };

  for (const id of Object.keys(state.houses || {})) {
    const s = state.houses[id];
    if (s in counts) counts[s]++;
  }

  countYesEl.textContent = String(counts.yes);
  countNoEl.textContent = String(counts.no);
  countNotHomeEl.textContent = String(counts.nothome);
  countCallbackEl.textContent = String(counts.callback);
  countKnockedEl.textContent = String(counts.knocked);
  countSkipEl.textContent = String(counts.skip);
}

/* ===================== MAP ===================== */

function initMap() {
  if (map) return;

  map = L.map("map", { zoomControl: true }).setView([41.6611, -91.5302], 13);

  // Grey-ish base with blue water/green parks
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);

  // Add-dot click
  map.on("click", (e) => {
    if (!addDotMode) return;

    const label = prompt("Address / label? (ex: 214 Oak)")?.trim();
    if (!label) return;

    const id = `custom-${Date.now()}`;
    const h = { id, lat: e.latlng.lat, lng: e.latlng.lng, label };

    state.customHouses[id] = h;
    saveState();

    addHouseMarker(h);
    addLog(`➕ ${getName()} added dot: ${label}`);
  });
}

function loadAllHouses() {
  // Demo (replace later with real dataset)
  const demo = [
    { id: "214-oak",   lat: 41.6650, lng: -91.5305, label: "214 Oak" },
    { id: "318-pine",  lat: 41.6598, lng: -91.5258, label: "318 Pine" },
    { id: "102-maple", lat: 41.6572, lng: -91.5362, label: "102 Maple" },
    { id: "55-elm",    lat: 41.6627, lng: -91.5400, label: "55 Elm" }
  ];

  demo.forEach(addHouseMarker);
  Object.values(state.customHouses || {}).forEach(addHouseMarker);
}

function addHouseMarker(h) {
  if (markerById.has(h.id)) return;

  const status = state.houses[h.id] || "none";
  const marker = L.circleMarker([h.lat, h.lng], houseStyle(status)).addTo(map);

  markerById.set(h.id, marker);
  marker.bindTooltip(h.label, { direction: "top", offset: [0, -6] });

  marker.on("click", () => openHousePopup(h));
}

function openHousePopup(h) {
  const marker = markerById.get(h.id);
  if (!marker) return;

  const current = state.houses[h.id] || "none";

  const html = `
    <div style="min-width:200px">
      <div style="font-weight:900; margin-bottom:6px">${escapeHtml(h.label)}</div>
      <div style="font-size:12px; opacity:.75; margin-bottom:10px">
        Status: <b>${statusLabel(current)}</b>
      </div>

      <div style="display:grid; gap:7px">
        ${popupBtn("yes", "✅ Yes / Closed")}
        ${popupBtn("no", "❌ No")}
        ${popupBtn("nothome", "🏃 Not Home")}
        ${popupBtn("callback", "📞 Callback")}
        ${popupBtn("knocked", "🟨 Knocked")}
        ${popupBtn("skip", "⏭️ Skip")}
        ${popupBtn("none", "↩ Reset", "ghost")}
        ${popupBtn("delete", "🗑 Remove Dot", "danger")}
      </div>
    </div>
  `;

  const popup = L.popup({ closeButton: true, autoPan: true }).setContent(html);
  marker.bindPopup(popup).openPopup();

  // IMPORTANT: bind after popup is in DOM
  setTimeout(() => {
    const root = document.querySelector(".leaflet-popup-content");
    if (!root) return;

    root.querySelectorAll("button[data-s]").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const s = btn.getAttribute("data-s");

        if (s === "delete") {
          removeHouse(h.id);
          map.closePopup();
          return;
        }

        setHouseStatus(h.id, s);
        map.closePopup();
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

function setHouseStatus(id, status) {
  if (status === "none") delete state.houses[id];
  else state.houses[id] = status;

  saveState();
  renderStats();

  const marker = markerById.get(id);
  if (marker) marker.setStyle(houseStyle(state.houses[id] || "none"));

  const label = state.customHouses[id]?.label || id;
  addLog(`🏠 ${getName()} → ${label}: ${statusLabel(status)}`);
}

function removeHouse(id) {
  delete state.houses[id];
  if (state.customHouses[id]) delete state.customHouses[id];

  saveState();
  renderStats();

  const marker = markerById.get(id);
  if (marker) map.removeLayer(marker);
  markerById.delete(id);

  addLog(`🗑 ${getName()} removed a dot`);
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

function houseStyle(status) {
  // FULL FILL COLOR (your request)
  const base = {
    radius: 7,
    weight: 2,
    opacity: 1,
    fillOpacity: 0.95
  };

  if (status === "yes")     return { ...base, color: "rgba(34,197,94,.95)",  fillColor: "rgba(34,197,94,.85)" };
  if (status === "no")      return { ...base, color: "rgba(239,68,68,.95)",  fillColor: "rgba(239,68,68,.85)" };
  if (status === "nothome") return { ...base, color: "rgba(56,189,248,.95)", fillColor: "rgba(56,189,248,.80)" };
  if (status === "callback")return { ...base, color: "rgba(167,139,250,.95)",fillColor: "rgba(167,139,250,.80)" };
  if (status === "knocked") return { ...base, color: "rgba(245,158,11,.95)", fillColor: "rgba(245,158,11,.85)" };
  if (status === "skip")    return { ...base, color: "rgba(255,255,255,.35)",fillColor: "rgba(255,255,255,.18)" };

  // none = grey
  return { ...base, color: "rgba(255,255,255,.40)", fillColor: "rgba(160,160,160,.65)", fillOpacity: 0.75 };
}

/* ===================== GPS ===================== */

function startGps() {
  if (!navigator.geolocation) {
    addLog("❌ GPS not supported");
    return;
  }
  if (gpsOn) return;

  gpsOn = true;
  gpsBtn.textContent = "GPS: On";
  addLog("📡 GPS starting…");

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

        map.setView(latlng, 16);
      } else {
        gpsMarker.setLatLng(latlng);
        gpsCircle.setLatLng(latlng);
        gpsCircle.setRadius(Math.max(accuracy, 15));
      }
    },
    (err) => {
      addLog(`❌ GPS error: ${err.message}`);
      stopGps();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function stopGps() {
  gpsOn = false;
  gpsBtn.textContent = "GPS: Off";

  if (gpsWatchId != null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (gpsMarker) { map.removeLayer(gpsMarker); gpsMarker = null; }
  if (gpsCircle) { map.removeLayer(gpsCircle); gpsCircle = null; }

  addLog("🛑 GPS stopped");
}

/* ===================== Utils ===================== */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
