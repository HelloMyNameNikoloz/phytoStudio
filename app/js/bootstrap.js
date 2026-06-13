(() => {
  const CSS_PARTS = [
    "./css/part-001.css",
    "./css/part-002.css",
    "./css/part-003.css",
    "./css/part-004.css",
    "./css/part-005.css",
    "./css/part-006.css",
    "./css/part-007.css",
    "./css/part-008.css",
    "./css/part-009.css",
    "./css/part-010.css",
    "./css/part-011.css",
    "./css/part-012.css",
    "./css/part-013.css"
  ];
  const HTML_PARTS = [
    "./html/part-001.html",
    "./html/part-002.html",
    "./html/part-003.html"
  ];
  const JS_PARTS = [
    "./js/part-001.js",
    "./js/part-002.js",
    "./js/part-003.js",
    "./js/part-004.js",
    "./js/part-005.js",
    "./js/part-006.js",
    "./js/part-007.js",
    "./js/part-008.js",
    "./js/part-009.js",
    "./js/part-010.js",
    "./js/part-011.js",
    "./js/part-012.js",
    "./js/part-013.js",
    "./js/part-014.js",
    "./js/part-015.js",
    "./js/part-016.js",
    "./js/part-017.js",
    "./js/part-018.js"
  ];

  async function readText(path) {
    if (window.phytoStudio?.assets?.readText) {
      return window.phytoStudio.assets.readText(path.replace(/^\.\//, "app/"));
    }
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load " + path);
    return response.text();
  }

  function mountCss(css) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function mountHtml(html) {
    const root = document.getElementById("appRoot");
    if (!root) throw new Error("App root is missing.");
    root.outerHTML = html;
  }

  function mountScript(source) {
    const script = document.createElement("script");
    script.textContent = source + "\n//# sourceURL=app/js/renderer.bundle.js";
    document.body.appendChild(script);
  }

  async function boot() {
    const [cssParts, htmlParts, jsParts] = await Promise.all([
      Promise.all(CSS_PARTS.map(readText)),
      Promise.all(HTML_PARTS.map(readText)),
      Promise.all(JS_PARTS.map(readText))
    ]);
    mountCss(cssParts.join("\n"));
    mountHtml(htmlParts.join("\n"));
    mountScript(jsParts.join("\n"));
  }

  boot().catch((error) => {
    const pre = document.createElement("pre");
    pre.style.cssText = "padding:24px;color:#ff8ab8;background:#07070c;white-space:pre-wrap";
    pre.textContent = error.stack || error.message;
    document.body.replaceChildren(pre);
  });
})();
