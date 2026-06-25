(function(){
  if(!window.L || !L.Map || L.Map.__allsetBridge) return;
  const originalAddLayer = L.Map.prototype.addLayer;
  L.Map.prototype.addLayer = function(layer){
    window.allsetMap = this;
    if(layer && typeof layer.eachLayer === "function" && !layer.getTileUrl){
      window.allsetFeatureGroups = window.allsetFeatureGroups || [];
      if(!window.allsetFeatureGroups.includes(layer)) window.allsetFeatureGroups.push(layer);
    }
    return originalAddLayer.call(this, layer);
  };
  L.Map.__allsetBridge = true;
})();

import("./rep-portal-fixes.js?v=20260624-crm-workflow-fixes").catch(err => console.warn("AllSet fixes failed to load", err));
import("./rep-portal-followup-fixes.js?v=20260624-job-customer-recurring-fixes").catch(err => console.warn("AllSet follow-up fixes failed to load", err));
import("./rep-portal-followup-hotfix.js?v=20260624-board-history-hotfix").catch(err => console.warn("AllSet board hotfix failed to load", err));
