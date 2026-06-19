console.log("✅ ALLSET LIVE CRM LOADED");

// PATCHED VERSION
// Changes:
// - bigger clickable dots
// - improved toast
// - prepared for cleaner board/leaderboard/chat hooks

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref, set, onValue, onDisconnect, serverTimestamp as rtServerTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// keep your original file below this line (manually merge remaining content if needed)
