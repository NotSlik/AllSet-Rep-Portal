console.log("✅ ALLSET CRM RECOVERY LOADER");

// Recovery loader: loads the last full working app.js from the commit before the broken stub.
// This keeps the site running while we patch the full source safely.

const RECOVERY_REF = "d311bbbda8634e780874311abec3eb2d1f5d86b5^";
const API_URL = `https://api.github.com/repos/NotSlik/AllSet-Rep-Portal/contents/app.js?ref=${encodeURIComponent(RECOVERY_REF)}`;

async function loadRecoveredApp(){
  try{
    const res = await fetch(API_URL, { headers: { "Accept": "application/vnd.github+json" } });
    if(!res.ok) throw new Error(`GitHub recovery fetch failed: ${res.status}`);
    const json = await res.json();
    const source = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ""))));
    const blob = new Blob([source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    await import(url);
    console.log("✅ Full AllSet CRM app recovered from previous commit");
  }catch(err){
    console.error("❌ Could not recover AllSet CRM app.js", err);
    alert("AllSet CRM could not load app.js. Open GitHub and revert commit d311bbb, then refresh.");
  }
}

loadRecoveredApp();
