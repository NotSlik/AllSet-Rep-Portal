console.log("🚀 AllSet CRM Operations Engine Active");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, addDoc, query, orderBy, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Core Firebase Configuration
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Application State Caches
let currentChannel = "General";
let leadsCache = {};
let jobsCache = {};
let repsCache = {};

// Helper Utilities
const $ = (id) => document.getElementById(id);
const escapeHtml = (str) => String(str ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const formatCurrency = (num) => "$" + Number(num || 0).toLocaleString();

// Initialization Sequence
initChatSystem();
initFirestoreWatchers();
initUtilityControlListeners();

/* ==========================================================================
   1. REAL-TIME TEAM CHAT (MULTICHANNEL)
   ========================================================================== */
function initChatSystem() {
  const chatInput = $("chatInput");
  const chatSendBtn = $("chatSendBtn");

  // Handle Channel Navigation Tabs
  document.querySelectorAll(".chatChannel").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chatChannel").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentChannel = btn.dataset.channel;
      streamChatMessages();
    });
  });

  // Message Dispatches
  if (chatSendBtn && chatInput) {
    const handleMessageDispatch = async () => {
      const messageText = chatInput.value.trim();
      if (!messageText) return;

      const senderIdentity = localStorage.getItem("allset_rep_name") || "Anonymous";
      chatInput.value = "";

      try {
        await addDoc(collection(db, "chat_messages"), {
          channel: currentChannel,
          sender: senderIdentity,
          text: messageText,
          createdAt: Date.now()
        });
      } catch (err) {
        console.error("Failed to commit chat record:", err);
      }
    };

    chatSendBtn.addEventListener("click", handleMessageDispatch);
    chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleMessageDispatch(); });
  }

  streamChatMessages();
}

function streamChatMessages() {
  const container = $("chatMessages");
  if (!container) return;

  const msgQuery = query(collection(db, "chat_messages"), orderBy("createdAt", "asc"));

  onSnapshot(msgQuery, (snapshot) => {
    container.innerHTML = "";
    let hasContent = false;

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.channel !== currentChannel) return;
      hasContent = true;

      const row = document.createElement("div");
      row.className = "logItem";

      const formattedTime = data.createdAt 
        ? new Date(data.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) 
        : "";

      row.innerHTML = `<span class="muted">[${formattedTime}]</span> <b>${escapeHtml(data.sender)}:</b> ${escapeHtml(data.text)}`;
      container.appendChild(row);
    });

    if (!hasContent) {
      container.innerHTML = `<div class="muted" style="padding: 12px;">Welcome to the beginning of the #${currentChannel} channel.</div>`;
    }
    container.scrollTop = container.scrollHeight;
  });
}

/* ==========================================================================
   2. FIRESTORE PIPELINE & METRIC LISTENERS
   ========================================================================== */
function initFirestoreWatchers() {
  onSnapshot(collection(db, "leads"), snap => {
    leadsCache = {}; snap.forEach(d => leadsCache[d.id] = d.data());
    recalculateLeaderboard();
  });

  onSnapshot(collection(db, "jobs"), snap => {
    jobsCache = {}; snap.forEach(d => jobsCache[d.id] = d.data());
    recalculateLeaderboard();
    recalculateCleanerBoard();
  });

  onSnapshot(collection(db, "reps"), snap => {
    repsCache = {}; snap.forEach(d => repsCache[d.id] = d.data());
    recalculateLeaderboard();
  });

  onSnapshot(doc(db, "shared", "settings"), snap => {
    if (snap.exists()) pullExtendedSettings(snap.data());
  });
}

/* ==========================================================================
   3. DYNAMIC LEADERBOARD PROCESSING
   ========================================================================== */
function recalculateLeaderboard() {
  const tableTarget = $("leaderboardTable");
  if (!tableTarget) return;

  const aggregates = {};

  // Hydrate known sales profiles
  Object.values(repsCache).forEach(rep => {
    if (rep.name) aggregates[rep.name] = { revenue: 0, sold: 0, converted: 0, totalLeads: 0 };
  });

  // Incorporate mapped or manually appended lead performance vectors
  Object.values(leadsCache).forEach(lead => {
    const nameKey = lead.repName || repsCache[lead.repId]?.name || lead.createdBy || "House";
    if (!aggregates[nameKey]) aggregates[nameKey] = { revenue: 0, sold: 0, converted: 0, totalLeads: 0 };

    aggregates[nameKey].totalLeads++;
    if (lead.status === "sold") aggregates[nameKey].sold++;
    if (lead.status === "converted") aggregates[nameKey].converted++;
    aggregates[nameKey].revenue += Number(lead.quote || lead.amount || 0);
  });

  // Incorporate standalone operational job values
  Object.values(jobsCache).forEach(job => {
    const nameKey = job.repName || repsCache[job.repId]?.name || "House";
    if (!aggregates[nameKey]) aggregates[nameKey] = { revenue: 0, sold: 0, converted: 0, totalLeads: 0 };
    aggregates[nameKey].revenue += Number(job.price || 0);
  });

  const bodyRows = Object.entries(aggregates)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([repName, metrics]) => {
      const divisor = metrics.totalLeads || 1;
      const calculatedClose = Math.round(((metrics.sold + metrics.converted) / divisor) * 100);

      return `<tr>
        <td><strong>${escapeHtml(repName)}</strong></td>
        <td>${formatCurrency(metrics.revenue)}</td>
        <td>${metrics.sold}</td>
        <td>${metrics.converted}</td>
        <td>${calculatedClose}%</td>
      </tr>`;
    });

  if (!bodyRows.length) {
    tableTarget.innerHTML = `<div class="card">No field performance logs tracking across this window.</div>`;
    return;
  }

  tableTarget.innerHTML = `
    <table class="dataTable">
      <thead>
        <tr>
          <th>Rep Name</th>
          <th>Revenue</th>
          <th>Sold Dots</th>
          <th>Converted Leads</th>
          <th>Close Rate</th>
        </tr>
      </thead>
      <tbody>${bodyRows.join("")}</tbody>
    </table>`;
}

/* ==========================================================================
   4. CLEANER DISPATCH BOARD PROCESSING
   ========================================================================== */
function recalculateCleanerBoard() {
  const tableTarget = $("boardTable");
  if (!tableTarget) return;

  const crewAggregates = {};

  Object.values(jobsCache).forEach(job => {
    const cleanerName = (job.cleaner || "").trim();
    if (!cleanerName) return;

    if (!crewAggregates[cleanerName]) {
      crewAggregates[cleanerName] = { claimed: 0, completed: 0, reliability: 100 };
    }

    crewAggregates[cleanerName].claimed++;
    if (job.status === "completed") {
      crewAggregates[cleanerName].completed++;
    } else if (job.status === "cancelled") {
      crewAggregates[cleanerName].reliability = Math.max(0, crewAggregates[cleanerName].reliability - 15);
    }
  });

  const bodyRows = Object.entries(crewAggregates).map(([cleaner, data]) => {
    return `<tr>
      <td><strong>${escapeHtml(cleaner)}</strong></td>
      <td>${data.claimed}</td>
      <td>${data.completed}</td>
      <td>${data.reliability}%</td>
    </tr>`;
  });

  if (!bodyRows.length) {
    tableTarget.innerHTML = `<div class="card">No active crew tracking entries on the active matrix.</div>`;
    return;
  }

  tableTarget.innerHTML = `
    <table class="dataTable">
      <thead>
        <tr>
          <th>Cleaner Name</th>
          <th>Claimed Jobs</th>
          <th>Completed Jobs</th>
          <th>Reliability Rating</th>
        </tr>
      </thead>
      <tbody>${bodyRows.join("")}</tbody>
    </table>`;
}

/* ==========================================================================
   5. EXTENDED SETTINGS REFLECTIONS (PAYPAL & MARKETING QRS)
   ========================================================================== */
function pullExtendedSettings(settings) {
  if ($("paypalTag")) $("paypalTag").textContent = settings.paypal || "paypal.me/AllSet";
  if ($("paypalLink")) $("paypalLink").href = settings.paypal ? `https://${settings.paypal}` : "https://paypal.me/AllSet";

  if ($("setPaypal")) $("setPaypal").value = settings.paypal || "";
  if ($("setCashAppQr")) $("setCashAppQr").value = settings.cashAppQr || "";
  if ($("setVenmoQr")) $("setVenmoQr").value = settings.venmoQr || "";
  if ($("setPaypalQr")) $("setPaypalQr").value = settings.paypalQr || "";
  if ($("setZelleQr")) $("setZelleQr").value = settings.zelleQr || "";
}

/* ==========================================================================
   6. TERRITORY lifecycle & OVERRIDE HANDLERS
   ========================================================================== */
function initUtilityControlListeners() {
  const saveBtn = $("saveSettingsBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const layoutPatch = {
        paypal: $("setPaypal")?.value || "",
        cashAppQr: $("setCashAppQr")?.value || "",
        venmoQr: $("setVenmoQr")?.value || "",
        paypalQr: $("setPaypalQr")?.value || "",
        zelleQr: $("setZelleQr")?.value || ""
      };

      try {
        await setDoc(doc(db, "shared", "settings"), layoutPatch, { merge: true });
      } catch (err) {
        console.warn("Administrative pipeline update bypassed runtime execution:", err.message);
      }
    });
  }

  // Global Territory Erasure Hook
  const clearTerritoriesBtn = $("clearTerritoriesBtn");
  if (clearTerritoriesBtn) {
    clearTerritoriesBtn.addEventListener("click", async () => {
      if (!confirm("⚠️ DANGER: Are you completely certain you want to purge ALL drawn territories across the global system?")) return;

      try {
        const querySnapshot = await getDocs(collection(db, "neighborhoods"));
        const clearanceBatch = writeBatch(db);
        querySnapshot.forEach((docRef) => clearanceBatch.delete(docRef.ref));
        await clearanceBatch.commit();
        alert("Success: All regional boundaries dropped.");
      } catch (err) {
        alert("Erase operation aborted: " + err.message);
      }
    });
  }

  // Single Territory Undo (User Identity Scoped Isolation Loop)
  const undoDrawBtn = $("undoDrawBtn");
  if (undoDrawBtn) {
    undoDrawBtn.addEventListener("click", async () => {
      const activeUser = localStorage.getItem("allset_rep_name") || "";
      if (!activeUser) return alert("Configuration Error: Assign your browser profile identity block before altering map features.");

      try {
        const querySnapshot = await getDocs(collection(db, "neighborhoods"));
        let chronologicalTarget = null;

        querySnapshot.forEach(d => {
          const payload = d.data();
          if (payload.createdBy === activeUser) {
            if (!chronologicalTarget || payload.createdAt > chronologicalTarget.createdAt) {
              chronologicalTarget = { firestoreId: d.id, ...payload };
            }
          }
        });

        if (chronologicalTarget) {
          await deleteDoc(doc(db, "neighborhoods", chronologicalTarget.firestoreId));
          alert(`Undone: Removed your last drawn territory allocation "${chronologicalTarget.name}"`);
        } else {
          alert("No recent territory tracks matching your active profile signature found.");
        }
      } catch (err) {
        console.error("Map transaction execution fault:", err);
      }
    });
  }
}
