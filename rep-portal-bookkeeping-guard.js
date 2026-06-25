import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
let jobs = {};
let pendingJobId = "";
let wrapped = false;

bootBookkeepingGuard();

function bootBookkeepingGuard(){
  signInAnonymously(auth).catch(() => {});
  onAuthStateChanged(auth, () => {
    onSnapshot(collection(db, "jobs"), snap => {
      jobs = {};
      snap.forEach(item => jobs[item.id] = { ...item.data(), id: item.data().id || item.id });
    });
  });
  document.addEventListener("click", event => {
    const edit = event.target.closest?.('[onclick*="crmEdit"]');
    const add = event.target.closest?.('[data-open="jobModal"]');
    if(add) pendingJobId = "";
    if(edit){
      const id = String(edit.getAttribute("onclick") || "").match(/crmEdit\?\.\('job','([^']+)'\)/)?.[1] || "";
      if(id) pendingJobId = id;
    }
    setTimeout(syncJobBookkeepingFields, 180);
    setTimeout(syncJobBookkeepingFields, 420);
  }, true);
  setInterval(() => { wrapCrmEdit(); syncJobBookkeepingFields(); }, 700);
}

function wrapCrmEdit(){
  if(wrapped || typeof window.crmEdit !== "function") return;
  const original = window.crmEdit;
  window.crmEdit = function(kind, id){
    if(kind === "job") pendingJobId = id || "";
    const result = original.apply(this, arguments);
    setTimeout(syncJobBookkeepingFields, 80);
    setTimeout(syncJobBookkeepingFields, 260);
    return result;
  };
  window.crmEdit.__bookkeepingGuard = true;
  wrapped = true;
}

function syncJobBookkeepingFields(){
  if(!pendingJobId) return;
  const job = jobs[pendingJobId];
  const card = document.getElementById("modalCard");
  if(!job || !card || !/edit job/i.test(card.textContent || "")) return;
  const jobIdInput = card.querySelector('[data-field="jobId"]');
  const invoiceInput = card.querySelector('[data-field="invoiceNumber"]');
  const repPayInput = card.querySelector('[data-field="repPay"]');
  if(jobIdInput) jobIdInput.value = job.jobId || job.businessJobId || jobIdInput.value || "";
  if(invoiceInput) invoiceInput.value = job.invoiceNumber || invoiceInput.value || "";
  if(repPayInput && (job.repPay || job.repCommission || job.commissionAmount || job.repCommissionAmount)) repPayInput.value = job.repPay || job.repCommission || job.commissionAmount || job.repCommissionAmount || "";
}
