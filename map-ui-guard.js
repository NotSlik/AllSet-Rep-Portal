window.addEventListener("DOMContentLoaded",()=>{
  const hideMapOffToast=()=>{
    const toast=document.getElementById("toast");
    if(!toast)return;
    if(toast.textContent.trim()==="Map mode off"&&!document.body.classList.contains("live-map-active")){
      toast.classList.add("hidden");
    }
  };
  const unlockSavedLogin=()=>{
    const savedName=localStorage.getItem("allset_rep_name");
    const gate=document.getElementById("gate");
    const app=document.getElementById("app");
    const enter=document.getElementById("enterBtn");
    if(!savedName||!gate||!app||!enter)return;
    const gateVisible=getComputedStyle(gate).display!=="none";
    if(gateVisible&&app.classList.contains("app--locked"))enter.click();
  };
  const toast=document.getElementById("toast");
  if(toast)new MutationObserver(hideMapOffToast).observe(toast,{childList:true,characterData:true,subtree:true,attributes:true});
  setInterval(hideMapOffToast,350);
  window.addEventListener("load",()=>setTimeout(unlockSavedLogin,50));
});
