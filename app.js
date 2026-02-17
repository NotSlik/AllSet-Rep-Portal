console.log("✅ LOCAL-ONLY APP.JS LOADED");

const LS_NAME  = "allset_rep_name";
const LS_STATE = "allset_rep_state_v4";

const gate = document.getElementById("gate");
const appRoot = document.getElementById("app");
const nicknameInput = document.getElementById("nicknameInput");
const enterBtn = document.getElementById("enterBtn");

const repNameEl = document.getElementById("repName");
const assignedTextEl = document.getElementById("assignedText");

const gpsBtn = document.getElementById("gpsBtn");
const addDotBtn = document.getElementById("addDotBtn");
const drawBtn = document.getElementById("drawBtn");
const changeNameBtn = document.getElementById("changeNameBtn");
const resetBtn = document.getElementById("resetBtn");

const toastEl = document.getElementById("toast");

let map;
let addDotMode = false;

// GPS
let gpsOn = false;
let gpsWatchId = null;
let gpsMarker = null;
let gpsCircle = null;

// Leaflet layers
const markerById = new Map();
let neighborhoodLayer; // FeatureGroup for neighborhoods
let dotLayer;          // FeatureGroup for dots

// Leaflet Draw control
let drawControl;
let drawEnabled = false;

// Local state
const state = loadState();

boot();

function boot() {
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
    unlockApp(true); // user gesture => can request GPS
  });

  nicknameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enterBtn.click();
  });

  changeNameBtn.addEventListener("click", () => lockApp(true));

  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset local data (dots + neighborhoods + assignment + name)?")) return;
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_NAME);
    location.reload();
  });

  gpsBtn.addEventListener("click", () => {
    if (!gpsOn) startGps();
    else stopGps();
  });

  addDotBtn.addEventListener("click", () => {
    addDotMode = !addDotMode;
    addDotBtn.textContent = addDotMode ? "✓ Add Dot ON" : "+ Add Dot";
    toast(addDotMode ? "Add Dot ON: tap map to place a dot" : "Add Dot OFF");
  });

  drawBtn.addEventListener("click", () => toggleDraw());

  initMap();
  loadNeighborhoods();
  loadDots();
  refreshAssignedText();
}

function lockApp(focus = false) {
  gate.style.display = "grid";
  appRoot.classList.add("app--locked");
  if (focus) setTimeout(() => nicknameInput.focus(), 60);
}

function unlockApp(startGpsAfterGesture) {
  gate.style.display = "none";
  appRoot.classList.remove("app--locked");

  setTimeout(() => map?.invalidateSize?.(), 250);

  toast(`Welcome, ${getName()}`);

  if (startGpsAfterGesture) {
    // optional: don’t auto-start. If you want auto, uncomment next line.
    // startGps();
  }
}

function setName(name) {
  localStorage.setItem(LS_NAME, name);
  repNameEl.textContent = name;
  nicknameInput.value = name;
}

function getName() {
  return localStorage.getItem(LS_NAME) || "Rep";
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 1800);
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATE)) || {
      // dots: { id: {id, lat, lng, label, status} }
      dots: {},
      // neighborhoods: { id: {id, name, color, geojson} }
      neighborhoods: {},
      // assignment
      assignedNeighborhoodId: null
    };
  } catch {
    return { dots: {}, neighborhoods: {}, assignedNeighborhoodId: null };
  }
}

function saveState() {
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}

/* ===================== MAP ===================== */

function initMap() {
  if (map) return;

  map = L.map("map", { zoomControl: true }).setView([41.6611, -91.5302], 13);

  // Grey-ish roads/buildings, green parks, blue water
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);

  neighborhoodLayer = new L.FeatureGroup();
  dotLayer = new L.FeatureGroup();
  map.addLayer(neighborhoodLayer);
  map.addLayer(dotLayer);

  // Map click: add dot if mode enabled
  map.on("click", (e) => {
    if (!addDotMode) return;

    const id = `dot-${Date.now()}`;
    const dot = { id, lat: e.latlng.lat, lng: e.latlng.lng, label: "", status: "none" };
    state.dots[id] = dot;
    saveState();

    const marker = addDotMarker(dot);
    openDotPopup(dot.id, marker);
  });

  // Draw control (we toggle it)
  drawControl = new L.Control.Draw({
    draw: {
      polygon: true,
      rectangle: true,
      circle: false,
      circlemarker: false,
      marker: false,
      polyline: false
    },
    edit: {
      featureGroup: neighborhoodLayer
    }
  });

  map.on(L.Draw.Event.CREATED, (event) => {
    const layer = event.layer;

    // Ask name + choose color
    const name = prompt("Neighborhood name? (ex: Eastside)")?.trim() || "Neighborhood";
    const color = prompt("Color hex? (ex: #38bdf8 for blue)", "#38bdf8")?.trim() || "#38bdf8";

    layer.setStyle({ color, weight: 3, fillColor: color, fillOpacity: 0.18 });
    neighborhoodLayer.addLayer(layer);

    const id = `nb-${Date.now()}`;
    const geojson = layer.toGeoJSON();
    state.neighborhoods[id] = { id, name, color, geojson };
    saveState();

    bindNeighborhoodInteractions(id, layer);
    toast(`Neighborhood created: ${name}`);
  });

  map.on(L.Draw.Event.EDITED, (event) => {
    // Save geometry changes
    event.layers.eachLayer((layer) => {
      const id = layer._nbId;
      if (!id || !state.neighborhoods[id]) return;
      state.neighborhoods[id].geojson = layer.toGeoJSON();
    });
    saveState();
    toast("Neighborhood updated");
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
    toast("Neighborhood deleted");
  });
}

function toggleDraw() {
  drawEnabled = !drawEnabled;

  if (drawEnabled) {
    map.addControl(drawControl);
    drawBtn.textContent = "✏️ Draw ON";
    toast("Draw ON: use map tools to draw neighborhoods");
  } else {
    map.removeControl(drawControl);
    drawBtn.textContent = "✏️ Draw";
    toast("Draw OFF");
  }
}

/* ===================== DOTS ===================== */

function loadDots() {
  // Load saved dots
  Object.values(state.dots || {}).forEach(addDotMarker);

  // Optional demo dots if empty (remove if you want)
  if (Object.keys(state.dots || {}).length === 0) {
    const demo = [
      { id: "demo-1", lat: 41.6650, lng: -91.5305, label: "214 Oak", status: "none" },
      { id: "demo-2", lat: 41.6598, lng: -91.5258, label: "318 Pine", status: "none" }
    ];
    demo.forEach(d => {
      state.dots[d.id] = d;
      addDotMarker(d);
    });
    saveState();
  }
}

function addDotMarker(dot) {
  if (markerById.has(dot.id)) return markerById.get(dot.id);

  const marker = L.circleMarker([dot.lat, dot.lng], dotStyle(dot.status)).addTo(dotLayer);

  markerById.set(dot.id, marker);

  if (dot.label) marker.bindTooltip(dot.label, { direction: "top", offset: [0, -6] });

  marker.on("click", () => openDotPopup(dot.id, marker));

  return marker;
}

function openDotPopup(dotId, marker) {
  const dot = state.dots[dotId];
  if (!dot) return;

  const currentLabel = dot.label || "";
  const currentStatus = dot.status || "none";

  const html = `
    <div style="min-width:220px">
      <div style="font-weight:900; margin-bottom:6px">House</div>

      <div style="font-size:12px; opacity:.75; margin-bottom:6px">Label (editable):</div>
      <input id="lbl_${dotId}" value="${escapeHtml(currentLabel)}" placeholder="Optional: 214 Oak" style="
        width:100%; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,.15);
        margin-bottom:10px;
      "/>

      <div style="font-size:12px; opacity:.75; margin-bottom:8px">
        Status: <b>${statusLabel(currentStatus)}</b>
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

  const popup = L.popup({ closeButton: true, autoPan: true }).setContent(html);
  marker.bindPopup(popup).openPopup();

  // bind events AFTER DOM exists
  setTimeout(() => {
    const popupRoot = document.querySelector(".leaflet-popup-content");
    if (!popupRoot) return;

    const labelInput = popupRoot.querySelector(`#lbl_${CSS.escape(dotId)}`);
    const saveLabel = () => {
      dot.label = (labelInput?.value || "").trim();
      // tooltip update
      marker.unbindTooltip();
      if (dot.label) marker.bindTooltip(dot.label, { direction: "top", offset: [0, -6] });
      saveState();
    };

    // Save label on change and on blur
    labelInput?.addEventListener("change", saveLabel);
    labelInput?.addEventListener("blur", saveLabel);

    popupRoot.querySelectorAll("button[data-s]").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        // always save label before status
        saveLabel();

        const s = btn.getAttribute("data-s");

        if (s === "delete") {
          delete state.dots[dotId];
          saveState();
          dotLayer.removeLayer(marker);
          markerById.delete(dotId);
          map.closePopup();
          toast("Dot removed");
          return;
        }

        dot.status = s;
        marker.setStyle(dotStyle(s));
        saveState();
        map.closePopup();
        toast(`Saved: ${statusLabel(s)}`);
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
  // FULL fill colors (your request)
  const base = { radius: 7, weight: 2, opacity: 1, fillOpacity: 0.92 };

  if (status === "yes")     return { ...base, color: "rgba(34,197,94,.95)",  fillColor: "rgba(34,197,94,.85)" };
  if (status === "no")      return { ...base, color: "rgba(239,68,68,.95)",  fillColor: "rgba(239,68,68,.85)" };
  if (status === "nothome") return { ...base, color: "rgba(56,189,248,.95)", fillColor: "rgba(56,189,248,.80)" };
  if (status === "callback")return { ...base, color: "rgba(167,139,250,.95)",fillColor: "rgba(167,139,250,.80)" };
  if (status === "knocked") return { ...base, color: "rgba(245,158,11,.95)", fillColor: "rgba(245,158,11,.85)" };
  if (status === "skip")    return { ...base, color: "rgba(255,255,255,.35)",fillColor: "rgba(255,255,255,.18)" };

  return { ...base, color: "rgba(255,255,255,.40)", fillColor: "rgba(160,160,160,.65)", fillOpacity: 0.75 };
}

/* ===================== NEIGHBORHOODS ===================== */

function loadNeighborhoods() {
  Object.values(state.neighborhoods || {}).forEach(nb => {
    const layer = L.geoJSON(nb.geojson, {
      style: { color: nb.color, weight: 3, fillColor: nb.color, fillOpacity: 0.18 }
    });

    // geoJSON returns a layer group; get first layer
    layer.eachLayer((single) => {
      neighborhoodLayer.addLayer(single);
      bindNeighborhoodInteractions(nb.id, single);
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
      <div style="min-width:220px">
        <div style="font-weight:900; margin-bottom:6px">${escapeHtml(nb.name)}</div>
        <div style="font-size:12px; opacity:.75; margin-bottom:10px">
          Color: ${escapeHtml(nb.color)}
        </div>

        <div style="display:grid; gap:7px">
          <button class="popBtn" data-a="${isAssigned ? "unassign" : "assign"}" type="button">
            ${isAssigned ? "🚫 Unassign Me" : "✅ Assign Me Here"}
          </button>
          <button class="popBtn popBtn--danger" data-a="delete" type="button">🗑 Delete Neighborhood</button>
        </div>
      </div>
    `;

    layer.bindPopup(html).openPopup();

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
            map.closePopup();
            toast(`Assigned to ${nb.name}`);
            return;
          }

          if (act === "unassign") {
            state.assignedNeighborhoodId = null;
            saveState();
            refreshAssignedText();
            map.closePopup();
            toast("Unassigned");
            return;
          }

          if (act === "delete") {
            if (!confirm(`Delete neighborhood "${nb.name}"?`)) return;
            delete state.neighborhoods[nbId];
            if (state.assignedNeighborhoodId === nbId) state.assignedNeighborhoodId = null;
            saveState();

            neighborhoodLayer.removeLayer(layer);
            refreshAssignedText();
            map.closePopup();
            toast("Neighborhood deleted");
          }
        });
      });
    }, 0);
  });
}

function refreshAssignedText() {
  const nbId = state.assignedNeighborhoodId;
  if (!nbId) {
    assignedTextEl.textContent = "None";
    return;
  }
  const nb = state.neighborhoods[nbId];
  assignedTextEl.textContent = nb ? nb.name : "None";
}

/* ===================== GPS ===================== */

function startGps() {
  if (!navigator.geolocation) {
    toast("GPS not supported");
    return;
  }
  if (gpsOn) return;

  gpsOn = true;
  gpsBtn.textContent = "GPS: On";
  toast("GPS starting…");

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
    (err) => {
      toast(`GPS error: ${err.message}`);
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

  toast("GPS stopped");
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
