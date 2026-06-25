const $ = id => document.getElementById(id);

let jobsScrollLeft = 0;
let installed = false;

bootJobsScrollFix();

function bootJobsScrollFix(){
  injectCss();
  waitForJobsTable();
}

function waitForJobsTable(){
  const table = $("jobsTable");
  if(!table) return setTimeout(waitForJobsTable, 250);
  install(table);
}

function install(table){
  if(installed) return;
  installed = true;

  table.addEventListener("scroll", () => {
    jobsScrollLeft = table.scrollLeft || 0;
  }, { passive: true });

  new MutationObserver(() => {
    if(!jobsScrollLeft) return;
    requestAnimationFrame(() => {
      const current = $("jobsTable");
      if(current && Math.abs((current.scrollLeft || 0) - jobsScrollLeft) > 2){
        current.scrollLeft = jobsScrollLeft;
      }
    });
  }).observe(table, { childList: true });
}

function injectCss(){
  if($("jobsScrollFixCss")) return;
  const style = document.createElement("style");
  style.id = "jobsScrollFixCss";
  style.textContent = `#jobsTable.tableCard,#jobsTable{overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;touch-action:pan-x pan-y}#jobsTable table.dataTable{min-width:1050px}`;
  document.head.appendChild(style);
}
