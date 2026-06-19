window.addEventListener("DOMContentLoaded",()=>{
  const hideMapOffToast=()=>{
    const toast=document.getElementById("toast");
    if(!toast)return;
    if(toast.textContent.trim()==="Map mode off"&&!document.body.classList.contains("live-map-active")){
      toast.classList.add("hidden");
    }
  };
  const toast=document.getElementById("toast");
  if(toast)new MutationObserver(hideMapOffToast).observe(toast,{childList:true,characterData:true,subtree:true,attributes:true});
  setInterval(hideMapOffToast,350);
});
