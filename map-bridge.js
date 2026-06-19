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