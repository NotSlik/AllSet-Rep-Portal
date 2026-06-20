// CRM stabilization loader. The stable source bundle is pinned to the last full generated app.js commit.
(function () {
  const SOURCE_BUNDLE_URL = "https://raw.githubusercontent.com/NotSlik/AllSet-Rep-Portal/7373f51ede086483d1a64173a467516baf3d6f34/app.js";
  const loaderState = { stage: "start", bundle: SOURCE_BUNDLE_URL };
  try { window.__allsetCrmLoader = loaderState; } catch (_err) {}

  const setStage = stage => {
    loaderState.stage = stage;
    document.documentElement.setAttribute("data-crm-loader", stage);
  };

  (async () => {
    try {
      if (!("DecompressionStream" in window)) {
        throw new Error("This browser does not support DecompressionStream, which is required for the stabilized CRM bundle.");
      }

      setStage("fetching");
      const bundle = await fetch(SOURCE_BUNDLE_URL, { cache: "no-store" }).then(response => {
        if (!response.ok) throw new Error(`Could not load CRM bundle: ${response.status}`);
        return response.text();
      });
      const payloadMatch = bundle.match(/const payload = "([^"]+)";/);
      if (!payloadMatch) throw new Error("CRM bundle payload was not found.");

      setStage("decompressing");
      const bytes = Uint8Array.from(atob(payloadMatch[1]), char => char.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      let source = await new Response(stream).text();
      loaderState.sourceLength = source.length;

      source = source.replace(/^import\s+\{([^}]+)\}\s+from\s+"([^"]+)";\s*$/gm, (_line, names, url) => {
        return `const { ${names.trim()} } = await import("${url}");`;
      });

      setStage("importing");
      const moduleUrl = URL.createObjectURL(new Blob([source + "\n//# sourceURL=allset-crm-stabilized.js"], { type: "text/javascript" }));
      try {
        await import(moduleUrl);
        setStage("ready");
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    } catch (err) {
      loaderState.message = err?.message || String(err);
      console.error("CRM boot loader failed:", err);
      setStage("failed");
    }
  })();
})();
