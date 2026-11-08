// eff-settings.js: the "Efficiency settings and preferences" box on the isocratic Specification step.
// It feeds efficiency.js (EFF) and decides every isocratic run again when a value changes.
(function () {
  const E = window.hplcEfficiency;
  const box = document.getElementById("eff-settings");
  if (!E || !box) return;
  const KEY = "hplc-eff-settings-v1";
  const $ = function (id) { return document.getElementById(id); };
  const IDS = ["eff-rankby", "eff-levers", "eff-avoid-order", "eff-vda", "eff-vdb", "eff-vdc", "eff-spp", "eff-trfast", "eff-use-ratings", "eff-r5", "eff-r3", "eff-r19"];
  const val = function (el) { return el.type === "checkbox" ? el.checked : el.value; };
  const def = function (el) {
    if (el.type === "checkbox") return el.defaultChecked;
    if (el.tagName === "SELECT") { const o = Array.from(el.options).find(function (x) { return x.defaultSelected; }) || el.options[0]; return o.value; }
    return el.defaultValue;
  };
  const num = function (id, fb) { const v = Number($(id).value); return Number.isFinite(v) && v > 0 ? v : fb; };

  function read() {
    const d = E.defaults;
    const r3 = num("eff-r3", 8700), r19 = num("eff-r19", 12000);
    return {
      A: num("eff-vda", d.A), B: num("eff-vdb", d.B), C: num("eff-vdc", d.C), spp: num("eff-spp", d.spp),
      trFastFraction: Math.min(Math.max(num("eff-trfast", 0.5), 0.05), 0.95),
      useColumnRatings: $("eff-use-ratings").checked,
      ratings: { "5": num("eff-r5", 5800), "3": r3, "2.7": r3, "1.9": r19, "1.8": r19 },
      rankBy: $("eff-rankby").value || "rs",
      leverOrder: $("eff-levers").value ? $("eff-levers").value.split(",") : [],
      avoidOrder: $("eff-avoid-order").checked,
    };
  }
  function save() { const s = {}; IDS.forEach(function (id) { s[id] = val($(id)); }); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    if (!s) return;
    IDS.forEach(function (id) { const el = $(id); if (!el || s[id] === undefined) return; if (el.type === "checkbox") el.checked = !!s[id]; else el.value = s[id]; });
  }
  function mark() {
    let n = 0;
    IDS.forEach(function (id) {
      const el = $(id), field = el.closest(".field"); if (!field) return;
      const d = def(el), v = val(el);
      const changed = typeof d === "boolean" ? d !== v : (Number.isFinite(Number(d)) && d !== "" && v !== "" ? Number(d) !== Number(v) : String(d) !== String(v));
      field.classList.toggle("adv-changed", changed);
      let tag = field.querySelector(".adv-default");
      if (changed) {
        n++;
        if (!tag) { tag = document.createElement("span"); tag.className = "adv-default"; field.appendChild(tag); }
        tag.textContent = "Default: " + (typeof d === "boolean" ? (d ? "ticked" : "not ticked") : el.tagName === "SELECT" ? Array.from(el.options).find(function (o) { return o.value === d; }).textContent : d);
      } else if (tag) tag.remove();
    });
    const pill = $("eff-changed-pill"); pill.hidden = !n; pill.textContent = n + " changed";
  }
  function validate(s) {
    const w = [];
    if (s.A <= 0 || s.B <= 0 || s.C <= 0) w.push("Van Deemter A, B and C must be above 0.");
    if (s.spp < 1) w.push("The core-shell factor should be 1 or more (1.5 in the course).");
    if (Number($("eff-trfast").value) <= 0 || Number($("eff-trfast").value) >= 1) w.push("The tR « spec fraction must be between 0 and 1.");
    const warn = $("eff-warn"); warn.hidden = !w.length; warn.replaceChildren();
    if (w.length) { const b = document.createElement("strong"); b.textContent = "Check these values"; warn.appendChild(b); const ul = document.createElement("ul"); w.forEach(function (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }); warn.appendChild(ul); }
  }
  function apply(note) {
    const s = read();
    validate(s);
    E.setSettings(s);
    save(); mark();
    try {
      if (typeof readHistory === "function" && readHistory().length && typeof autoCalculateRuns === "function") autoCalculateRuns(runRecordsFromHistory());
      if (typeof currentSummary !== "undefined" && currentSummary && typeof handleCalculate === "function") { autoCalculating = true; try { handleCalculate(); } finally { autoCalculating = false; } }
    } catch (e) { /* the dashboard isn't ready */ }
    const st = $("eff-status"); if (st) st.textContent = note || "Saved. Every run decided again.";
  }
  IDS.forEach(function (id) { const el = $(id); if (el) el.addEventListener("change", function () { apply(); }); });
  $("eff-reset").addEventListener("click", function () {
    IDS.forEach(function (id) { const el = $(id); if (el.type === "checkbox") el.checked = el.defaultChecked; else el.value = def(el); });
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    apply("Back to the defaults.");
  });
  load();
  E.setSettings(read());
  mark();
  // Runs decided before this script loaded used the defaults; decide them again with the saved settings.
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  if (saved) apply("Your saved settings are in use.");
  window.effSettings = { apply: apply, read: read };
})();
