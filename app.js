// ===== Local-only Rep Portal (no auth, no firebase) =====
console.log("✅ NEW LOCAL-ONLY APP.JS LOADED");

const LS_NAME = "allset_rep_name";
const LS_STATE = "allset_rep_state_v1";

const gate = document.getElementById("gate");
const appRoot = document.getElementById("app");
const nicknameInput = document.getElementById("nicknameInput");
const enterBtn = document.getElementById("enterBtn");

const repNameEl = document.getElementById("repName");
const changeNameBtn = document.getElementById("changeNameBtn");
const resetLocalBtn = document.getElementById("resetLocalBtn");

const assignedNeighborhoodEl = document.getElementById("assignedNeighborhood");
const countKnockedEl = document.getElementById("countKnocked");
const countNotHomeEl = document.getElementById("countNotHome");
const countSkippedEl = document.getElementById("countSkipped");

const assignNorthBtn = document.getElementById("assignNorthBtn");
const assignEastBtn = document.getElementById("assignEastBtn");
const assignWestBtn = document.getElementById("assignWestBtn");

const pingText = document.getElementById("pingText");
const sendPingBtn = document.getElementById("sendPingBtn");
const logEl = document.getElementById("log");

console.log({ gate, appRoot, nicknameInput, enterBtn });

let map;

// Basic local state
const state = loadState();

boot();

function boot() {
  // Gate behavior
  const savedName = localStorage.getItem(LS_NAME);
  if (savedName) {
    setName(savedName);
    unlockApp();
  } else {
    lockApp();
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

  changeNameBtn.addEventListener("click", () => {
    lockApp(true);
  });

  resetLocalBtn.addEventListener("click", () => {
    if (!confirm("Reset local data on this device?")) return;
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_NAME);
    location.reload();
  });

  assignNorthBtn.addEventListener("click", () => assignNeighborhood("Northside"));
  assignEastBtn.addEventListener("click", () => assignNeighborhood("Eastside"));
  assignWestBtn.addEventListener("click", () => assignNeighborhood("Westside"));

  sendPingBtn.addEventListener("click", () => {
    const msg = pingText.value.trim();
    if (!msg) return;
    addLog(`📍 ${getName()}: ${msg}`);
    pingText.value = "";
  });

  // init map regardless; it’ll be blurred until name entered
  initMap();
  renderStats();
  renderLog();
}

function lockApp(focusInput = false) {
  gate.style.display = "grid";
  appRoot.classList.add("app--locked");
  if (focusInput) setTimeout(() => nicknameInput.focus(), 50);
}

function unlockApp() {
  gate.style.display = "none";
  appRoot.classList.remove("app--locked");
  addLog(`✅ ${getName()} entered the map`);
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
      houses: {}, // key => status
      log: []
    };
  } catch {
    return { assignedNeighborhood: "None", houses: {}, log: [] };
  }
}

function saveState() {
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}

function assignNeighborhood(name) {
  state.assignedNeighborhood = name;
  saveState();
  renderStats();
  addLog(`🧭 Assigned neighborhood: ${name}`);
}

function addLog(text) {
  state.log.unshift({ t: Date.now(), text });
  state.log = state.log.slice(0, 120);
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

function renderStats() {
  assignedNeighborhoodEl.textContent = state.assignedNeighborhood || "None";

  let knocked = 0, notHome = 0, skipped = 0;
  for (const k of Object.keys(state.houses)) {
    const s = state.houses[k];
    if (s === "knocked") knocked++;
    if (s === "nothome") notHome++;
    if (s === "skipped") skipped++;
  }

  countKnockedEl.textContent = String(knocked);
  countNotHomeEl.textContent = String(notHome);
  countSkippedEl.textContent = String(skipped);
}

function initMap() {
  if (map) return;

  // Soft grey basemap + parks green + water blue using CARTO Voyager (very clean)
  map = L.map("map", { zoomControl: true }).setView([41.6611, -91.5302], 13);

  // CARTO Voyager (grey-ish, green parks, blue water)
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);

  // Demo “house dots” so you can click + mark statuses immediately.
  // Replace later with real addresses / geocoded list.
  const demoHouses = [
    { id: "214-oak", lat: 41.6650, lng: -91.5305, label: "214 Oak" },
    { id: "318-pine", lat: 41.6598, lng: -91.5258, label: "318 Pine" },
    { id: "102-maple", lat: 41.6572, lng: -91.5362, label: "102 Maple" },
    { id: "55-elm",   lat: 41.6627, lng: -91.5400, label: "55 Elm" }
  ];

  demoHouses.forEach(h => addHouseMarker(h));
}

function addHouseMarker(h) {
  const status = state.houses[h.id] || "none";
  const marker = L.circleMarker([h.lat, h.lng], houseStyle(status)).addTo(map);

  marker.bindTooltip(h.label, { direction: "top", offset: [0, -6] });

  marker.on("click", () => {
    const current = state.houses[h.id] || "none";
    const next = cycleStatus(current);
    state.houses[h.id] = next === "none" ? undefined : next;
    if (next === "none") delete state.houses[h.id];
    saveState();
    marker.setStyle(houseStyle(next));
    renderStats();

    const pretty = statusLabel(next);
    addLog(`🏠 ${getName()} marked ${h.label}: ${pretty}`);
  });
}

function cycleStatus(s) {
  // none -> knocked -> nothome -> skipped -> none
  if (s === "none") return "knocked";
  if (s === "knocked") return "nothome";
  if (s === "nothome") return "skipped";
  return "none";
}

function statusLabel(s) {
  if (s === "knocked") return "Knocked";
  if (s === "nothome") return "Not Home";
  if (s === "skipped") return "Skipped";
  return "Reset";
}

function houseStyle(status) {
  // Keep houses grey-ish (as you wanted). Slight tint changes per status but still subtle.
  const base = {
    radius: 7,
    weight: 2,
    opacity: 1,
    fillOpacity: 0.85
  };

  if (status === "knocked") return { ...base, color: "rgba(255,255,255,.85)", fillColor: "rgba(180,180,180,.95)" };
  if (status === "nothome") return { ...base, color: "rgba(56,189,248,.9)", fillColor: "rgba(180,180,180,.95)" };
  if (status === "skipped") return { ...base, color: "rgba(239,68,68,.9)", fillColor: "rgba(180,180,180,.95)" };
  return { ...base, color: "rgba(255,255,255,.55)", fillColor: "rgba(155,155,155,.55)" };
}
