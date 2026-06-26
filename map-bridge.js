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

import("./rep-portal-fixes.js?v=20260626-board-cleaner-filter").catch(err => console.warn("AllSet fixes failed to load", err));
import("./rep-portal-followup-fixes.js?v=20260624-recurring-only").catch(err => console.warn("AllSet follow-up fixes failed to load", err));
import("./rep-portal-followup-hotfix.js?v=20260624-retired-board-renderer").catch(err => console.warn("AllSet board hotfix failed to load", err));
import("./rep-portal-identity-fix.js?v=20260624-identity-retired").catch(err => console.warn("AllSet identity fix failed to load", err));
import("./rep-portal-ui-hotfix-2.js?v=20260626-board-cleaner-filter").catch(err => console.warn("AllSet UI hotfix failed to load", err));
import("./rep-portal-bookkeeping-guard.js?v=20260625-preserve-bookkeeping-ids").catch(err => console.warn("AllSet bookkeeping guard failed to load", err));
import("./rep-portal-customer-mobile-and-laith-filter.js?v=20260626-board-cleaner-filter").catch(err => console.warn("AllSet customer mobile/filter fix failed to load", err));
import("./rep-portal-laith-computer-block.js?v=20260625-scoped-crm-stabilizer").catch(err => console.warn("AllSet Laith computer block failed to load", err));
import("./rep-portal-jobs-scroll-fix.js?v=20260625-jobs-mobile-scroll").catch(err => console.warn("AllSet jobs scroll fix failed to load", err));
import("./rep-portal-board-source-finder.js?v=20260626-board-source-finder").catch(err => console.warn("AllSet board source finder failed to load", err));
