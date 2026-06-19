import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyA_CbiovvY9yvdsQ6wzzwoG2QaqBT0r7Bg",authDomain:"allsetrepportal.firebaseapp.com",projectId:"allsetrepportal",storageBucket:"allsetrepportal.firebasestorage.app",messagingSenderId:"590070052736",appId:"1:590070052736:web:193a9edb6fd378fbd27365",measurementId:"G-SY45913J3Z",databaseURL:"https://allsetrepportal-default-rtdb.firebaseio.com"};
const app=getApps()[0]||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id);
const DEFAULT_PAYMENT_IMAGES=window.allsetPaymentDefaultImages||{};
const IMAGE_TARGET_BYTES=260000;
const IMAGE_MAX_BYTES=320000;
const METHODS=[
  {key:"cashApp",label:"Cash App",tagId:"cashAppTag",linkId:"cashAppLink",inputId:"setCashApp"},
  {key:"venmo",label:"Venmo",tagId:"venmoTag",linkId:"venmoLink",inputId:"setVenmo"},
  {key:"paypal",label:"PayPal",tagId:"paypalTag",linkId:"paypalLink",inputId:"setPaypal"}
];
let settings={},uid="",saving=false;

bootPaymentImages();
function bootPaymentImages(){
  injectPaymentCss();
  ensurePaymentModal();
  signInAnonymously(auth).catch(()=>{});
  onAuthStateChanged(auth,u=>{uid=u?.uid||uid;subscribeSettings();});
  document.addEventListener("click",handleClick,true);
  document.addEventListener("change",handleChange,true);
  const mo=new MutationObserver(()=>{upgradeAdminPaymentFields();applyPaymentButtons();});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{upgradeAdminPaymentFields();applyPaymentButtons();},250);
}

function subscribeSettings(){
  if(subscribeSettings.done)return;subscribeSettings.done=true;
  onSnapshot(doc(db,"shared","settings"),snap=>{settings=snap.exists()?snap.data():{};upgradeAdminPaymentFields();applyPaymentButtons();});
}

function handleClick(e){
  const pay=e.target.closest("[data-payment-image]");
  if(pay){e.preventDefault();e.stopPropagation();openPaymentImage(pay.dataset.paymentImage);return;}
  if(e.target.closest("#paymentImageClose")||e.target.closest("#paymentImageBackdrop")){closePaymentImage();return;}
  if(e.target?.id==="saveSettingsBtn"){
    e.preventDefault();
    e.stopImmediatePropagation();
    savePaymentImageSettings();
  }
  const clear=e.target.closest("[data-clear-payment-image]");
  if(clear){e.preventDefault();clearPaymentImage(clear.dataset.clearPaymentImage);}
}

async function handleChange(e){
  const input=e.target.closest("input[data-payment-upload]");
  if(!input||!input.files?.[0])return;
  const key=input.dataset.paymentUpload;
  try{
    const data=await fileToCompressedDataUrl(input.files[0]);
    const preview=document.querySelector(`[data-payment-preview="${key}"]`);
    if(preview)preview.innerHTML=`<img src="${data}" alt="${labelFor(key)} payment image preview" />`;
    input.dataset.imageData=data;
    toast(`${labelFor(key)} image ready. Save Settings to update.`);
  }catch(err){toast(err.message||"Could not read image");}
}

function upgradeAdminPaymentFields(){
  const grid=$("setCashApp")?.closest(".formGrid");
  if(!grid)return;
  removeQrUrlFields();
  METHODS.forEach(method=>{
    if(document.querySelector(`[data-payment-upload-wrap="${method.key}"]`))return;
    const anchor=$(method.inputId)?.closest("label")||grid.firstElementChild;
    const label=document.createElement("label");
    label.dataset.paymentUploadWrap=method.key;
    label.innerHTML=`${method.label} Image<input type="file" accept="image/*" data-payment-upload="${method.key}" /><span class="paymentUploadHint">Upload the scan image customers should use.</span><span class="paymentImagePreview" data-payment-preview="${method.key}"></span><button class="dangerBtn smallBtn paymentClearBtn" type="button" data-clear-payment-image="${method.key}">Remove Custom Image</button>`;
    anchor?.after?anchor.after(label):grid.appendChild(label);
  });
  fillAdminInputs();
}

function removeQrUrlFields(){
  ["setCashAppQr","setVenmoQr","setPaypalQr","setZelleQr"].forEach(id=>$(id)?.closest("label")?.remove());
}

function fillAdminInputs(){
  METHODS.forEach(method=>{
    const img=paymentImageFor(method.key);
    const custom=hasCustomImage(method.key);
    const preview=document.querySelector(`[data-payment-preview="${method.key}"]`);
    if(preview)preview.innerHTML=img?`<img src="${img}" alt="${method.label} payment image preview" /><span>${custom?"Custom image saved":"Default image active"}</span>`:`<span>No image available</span>`;
    const input=$(method.inputId);
    if(input&&!input.value)input.value=settings[method.key]||"";
  });
}

function applyPaymentButtons(){
  METHODS.forEach(method=>{
    const link=$(method.linkId);if(!link)return;
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.href="#";
    link.dataset.paymentImage=method.key;
    link.setAttribute("role","button");
    link.querySelector(".payQr")?.remove();
    const tag=$(method.tagId);if(tag)tag.textContent=settings[method.key]||defaultTag(method.key);
    if(!link.querySelector(".paymentImageState"))link.insertAdjacentHTML("beforeend",`<span class="paymentImageState"></span>`);
    const state=link.querySelector(".paymentImageState");
    if(state)state.textContent=paymentImageFor(method.key)?"Tap to show scan image":"No image available";
  });
}

async function savePaymentImageSettings(){
  if(saving)return;
  saving=true;
  try{
    const current=await getDoc(doc(db,"shared","settings"));
    const existing=current.exists()?current.data():{};
    const patch={
      cashApp:$("setCashApp")?.value||"",
      venmo:$("setVenmo")?.value||"",
      paypal:$("setPaypal")?.value||"",
      zelle:$("setZelle")?.value||"",
      weeklyGoal:$("setWeeklyGoal")?.value||existing.weeklyGoal||"",
      locker:$("setLocker")?.value||existing.locker||"",
      doorCode:$("setDoorCode")?.value||existing.doorCode||"",
      trackerNote:$("setTrackerNote")?.value||existing.trackerNote||"",
      updatedAt:Date.now(),
      updatedBy:currentName()
    };
    METHODS.forEach(method=>{
      const upload=document.querySelector(`input[data-payment-upload="${method.key}"]`);
      patch[`${method.key}Image`]=upload?.dataset.imageData||existing[`${method.key}Image`]||existing[`${method.key}Qr`]||"";
      patch[`${method.key}Qr`]="";
    });
    await setDoc(doc(db,"shared","settings"),patch,{merge:true});
    toast("Payment images saved");
  }catch(err){toast(err.message||"Could not save payment settings");}
  finally{saving=false;}
}

async function clearPaymentImage(key){
  if(!confirm(`Remove the custom ${labelFor(key)} payment image? The default image will still show.`))return;
  const patch={updatedAt:Date.now(),updatedBy:currentName()};
  patch[`${key}Image`]="";
  patch[`${key}Qr`]="";
  await setDoc(doc(db,"shared","settings"),patch,{merge:true});
  const input=document.querySelector(`input[data-payment-upload="${key}"]`);if(input){input.value="";delete input.dataset.imageData;}
  toast(`${labelFor(key)} custom image removed`);
}

function openPaymentImage(key){
  const image=paymentImageFor(key);
  const modal=$("paymentImageModal"),title=$("paymentImageTitle"),body=$("paymentImageBody");
  if(!modal||!title||!body)return;
  title.textContent=labelFor(key);
  body.innerHTML=image?`<img class="paymentScanImage" src="${image}" alt="${labelFor(key)} payment scan image" /><div class="paymentScanTag">${escapeHtml(settings[key]||defaultTag(key))}</div>`:`<div class="paymentMissingImage">No payment image is available for ${labelFor(key)} yet.</div>`;
  modal.classList.remove("hidden");
}
function closePaymentImage(){$("paymentImageModal")?.classList.add("hidden")}

function ensurePaymentModal(){
  if($("paymentImageModal"))return;
  document.body.insertAdjacentHTML("beforeend",`<div id="paymentImageModal" class="paymentImageModal hidden"><div id="paymentImageBackdrop" class="paymentImageBackdrop"></div><div class="paymentImageCard"><div class="paymentImageTop"><div><strong id="paymentImageTitle">Payment</strong><span>Show this to the customer to scan.</span></div><button id="paymentImageClose" class="ghostBtn smallBtn" type="button">Close</button></div><div id="paymentImageBody" class="paymentImageBody"></div></div></div>`);
}

function injectPaymentCss(){
  if($("paymentImageCss"))return;
  const s=document.createElement("style");s.id="paymentImageCss";s.textContent=`
    .paymentImageState{display:block;margin-top:8px;color:var(--muted);font-size:11px;font-weight:800}.paymentUploadHint{display:block;color:var(--muted);font-size:11px;margin-top:6px}.paymentImagePreview{display:grid;gap:6px;place-items:center;min-height:86px;margin-top:8px;border:1px dashed rgba(255,255,255,.18);border-radius:12px;background:rgba(0,0,0,.14);overflow:hidden;color:var(--muted);font-size:12px}.paymentImagePreview img{width:100%;max-height:170px;object-fit:contain;background:#fff}.paymentClearBtn{margin-top:8px}.paymentImageModal{position:fixed;inset:0;z-index:2600;display:grid;place-items:center;padding:18px}.paymentImageModal.hidden{display:none!important}.paymentImageBackdrop{position:absolute;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(8px)}.paymentImageCard{position:relative;width:min(520px,94vw);max-height:92dvh;display:grid;grid-template-rows:auto 1fr;background:linear-gradient(180deg,rgba(13,20,34,.98),rgba(8,13,23,.98));border:1px solid rgba(255,255,255,.16);border-radius:18px;box-shadow:0 26px 90px rgba(0,0,0,.58);overflow:hidden}.paymentImageTop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px;border-bottom:1px solid rgba(255,255,255,.12)}.paymentImageTop strong,.paymentImageTop span{display:block}.paymentImageTop span{color:var(--muted);font-size:12px;margin-top:2px}.paymentImageBody{padding:16px;overflow:auto;text-align:center}.paymentScanImage{display:block;width:100%;max-height:72dvh;object-fit:contain;background:#fff;border-radius:14px;padding:10px;margin:0 auto}.paymentScanTag{margin-top:10px;color:var(--muted);font-size:13px;font-weight:850}.paymentMissingImage{border:1px dashed rgba(255,255,255,.18);border-radius:14px;padding:28px 14px;color:var(--muted);background:rgba(255,255,255,.05)}@media(max-width:520px){.paymentImageCard{width:calc(100vw - 18px);border-radius:16px}.paymentImageBody{padding:10px}.paymentScanImage{max-height:70dvh;padding:7px}}
  `;document.head.appendChild(s);
}

async function fileToCompressedDataUrl(file){
  if(!file.type.startsWith("image/"))throw new Error("Choose an image file");
  const raw=await readFile(file);
  const img=await loadImage(raw);
  const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.width*scale));
  canvas.height=Math.max(1,Math.round(img.height*scale));
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let data=canvas.toDataURL("image/jpeg",.78);
  let guard=0;
  while(data.length>IMAGE_TARGET_BYTES&&guard<5){
    const small=document.createElement("canvas");
    const ratio=Math.max(.64,Math.sqrt(IMAGE_TARGET_BYTES/data.length)*.9);
    small.width=Math.max(1,Math.round(canvas.width*ratio));
    small.height=Math.max(1,Math.round(canvas.height*ratio));
    const smallCtx=small.getContext("2d");
    smallCtx.fillStyle="#fff";smallCtx.fillRect(0,0,small.width,small.height);smallCtx.drawImage(canvas,0,0,small.width,small.height);
    canvas.width=small.width;canvas.height=small.height;
    ctx.drawImage(small,0,0);
    data=small.toDataURL("image/jpeg",.72-guard*.04);
    guard++;
  }
  if(data.length>IMAGE_MAX_BYTES)throw new Error("Image is still too large. Try a tighter screenshot of the payment code.");
  return data;
}
function paymentImageFor(key){return settings[`${key}Image`]||settings[`${key}Qr`]||DEFAULT_PAYMENT_IMAGES[key]||""}
function hasCustomImage(key){return Boolean(settings[`${key}Image`]||settings[`${key}Qr`])}
function readFile(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error("Could not read image"));r.readAsDataURL(file);});}
function loadImage(src){return new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>rej(new Error("Could not load image"));img.src=src;});}
function labelFor(key){return METHODS.find(m=>m.key===key)?.label||"Payment"}
function defaultTag(key){return{cashApp:"$NotS1ick",venmo:"@notslik",paypal:"PayPal"}[key]||""}
function currentName(){return localStorage.getItem("allset_rep_name")||$("nicknameInput")?.value||"Team"}
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function toast(msg){const el=$("toast");if(!el)return;el.textContent=msg;el.classList.remove("hidden");clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add("hidden"),2200)}
