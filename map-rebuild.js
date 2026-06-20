// Safe Live Map fullscreen controller.
// Does not replace Firebase, Leaflet, dots, territories, or app.js logic.

const $ = id => document.getElementById(id);
let observerStarted = false;

function ensureMapTools(){
  const page = $("page-map");
  if(!page || $("mapFullscreenTools")) return;
  page.insertAdjacentHTML("afterbegin", `
    <div id="mapFullscreenTools" class="mapFullscreenTools" aria-label="Map navigation controls">
      <button id="mapMenuBtn" type="button">Menu</button>
      <button id="mapControlsBtn" type="button">Controls</button>
    </div>
  `);
}

function resizeLeafletSoon(){
  window.dispatchEvent(new Event("resize"));
  setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
  setTimeout(() => window.dispatchEvent(new Event("resize")), 360);
}

function syncMapMode(){
  const page = $("page-map");
  const onMap = !!page?.classList.contains("active");
  document.body.classList.toggle("map-mode", onMap);
  if(onMap){
    ensureMapTools();
    resizeLeafletSoon();
  }else{
    page?.classList.remove("map-controls-collapsed");
    $("nav")?.classList.remove("open");
  }
}

function wire(){
  ensureMapTools();
  document.addEventListener("click", event => {
    if(event.target.closest("#mapMenuBtn")){
      event.preventDefault();
      $("nav")?.classList.toggle("open");
      return;
    }
    if(event.target.closest("#mapControlsBtn")){
      event.preventDefault();
      $("page-map")?.classList.toggle("map-controls-collapsed");
      resizeLeafletSoon();
      return;
    }
    if(event.target.closest(".navBtn")){
      setTimeout(syncMapMode, 50);
      setTimeout(syncMapMode, 250);
    }
  });

  if(!observerStarted){
    observerStarted = true;
    const main = document.querySelector(".main");
    if(main){
      new MutationObserver(syncMapMode).observe(main,{subtree:true,attributes:true,attributeFilter:["class"]});
    }
  }

  syncMapMode();
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", wire);
}else{
  wire();
}

window.addEventListener("resize", () => {
  if(document.body.classList.contains("map-mode")) resizeLeafletSoon();
});
