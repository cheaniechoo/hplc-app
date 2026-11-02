// nav.js: adds a drop-down list of steps under "Dashboard" and "Equipment" in the left-hand menu.
// The items are built from the step buttons already on each page, so the two always match.
(function () {
  const groups = [
    { group: "flowchart", tab: "tab-flowchart", selector: ".sub-button", dataKey: "sub" },
    { group: "history", tab: "tab-history", selector: ".hist-sub-button", dataKey: "histSub" },
    { group: "gradient", tab: "tab-gradient", selector: ".gsub-button", dataKey: "gsub" },
    { group: "equipment", tab: "tab-equipment", selector: ".eq-sub-button", dataKey: "eqSub" },
  ];

  groups.forEach(function (g) {
    const wrap = document.querySelector('.nav-group[data-group="' + g.group + '"]');
    const tabBtn = document.getElementById(g.tab);
    const sources = Array.from(document.querySelectorAll(g.selector));
    if (!wrap || !tabBtn || sources.length === 0) return;

    wrap.classList.add("has-sub");
    const caret = document.createElement("button");
    caret.type = "button"; caret.className = "nav-caret";
    caret.setAttribute("aria-label", "Show or hide the steps under " + tabBtn.textContent);
    caret.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const list = document.createElement("ul");
    list.className = "nav-sub"; list.id = "nav-sub-" + g.group;
    caret.setAttribute("aria-controls", list.id);

    const items = sources.map(function (src) {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = "nav-sub-item";
      b.textContent = src.textContent.replace(/\s+/g, " ").trim();
      b.addEventListener("click", function () { tabBtn.click(); src.click(); });
      li.appendChild(b); list.appendChild(li);
      return { src: src, btn: b };
    });

    function setOpen(open) {
      wrap.classList.toggle("open", open);
      caret.setAttribute("aria-expanded", open ? "true" : "false");
    }
    caret.addEventListener("click", function () { setOpen(!wrap.classList.contains("open")); });
    tabBtn.addEventListener("click", function () { setOpen(true); });

    function sync() {
      items.forEach(function (it) { it.btn.classList.toggle("on", it.src.classList.contains("on")); });
    }
    const obs = new MutationObserver(sync);
    sources.forEach(function (s) { obs.observe(s, { attributes: true, attributeFilter: ["class"] }); });
    sync();

    // The tab button, the caret and the list sit together in one row/column.
    wrap.append(caret, list);
    // Open the group that is showing when the page loads, and close the others.
    setOpen(tabBtn.classList.contains("active"));
  });

  // When another main tab is chosen, close the groups that are not showing.
  document.querySelectorAll(".tab-button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".nav-group.has-sub").forEach(function (w) {
        const own = w.querySelector(".tab-button");
        if (own !== btn) { w.classList.remove("open"); const c = w.querySelector(".nav-caret"); if (c) c.setAttribute("aria-expanded", "false"); }
      });
    });
  });
})();
