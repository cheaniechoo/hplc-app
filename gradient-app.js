// gradient-app.js: the gradient flow chart's dashboard (DASHBOARD GRA) and run history.
// It works separately from the isocratic dashboard: its own specification, its own
// files, its own history. The decisions come from gradient.js (DECISION ENGINE GRA).
(function () {
  const G = window.hplcGradient;
  if (!G) return;
  const KEY = "hplc-gradient-history-v1";
  const SPEC_KEY = "hplc-gradient-specs-v1";
  const $ = function (id) { return document.getElementById(id); };
  const mk = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const fmt = function (v, d) { return typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : ""; };

  // ---------- sub-steps ----------
  const subButtons = document.querySelectorAll(".gsub-button");
  function showGSub(name) {
    subButtons.forEach(function (b) { const on = b.dataset.gsub === name; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    document.querySelectorAll("[data-gsub-panel]").forEach(function (s) { s.hidden = s.dataset.gsubPanel !== name; });
  }
  subButtons.forEach(function (b) { b.addEventListener("click", function () { showGSub(b.dataset.gsub); }); });

  // ---------- specification ----------
  const SPEC_FIELDS = [
    ["targetPeaks", "g-spec-peaks"], ["rsSpec", "g-spec-rs"], ["runTimeSpec", "g-spec-runtime"], ["maxPressure", "g-spec-pressure"], ["minAreaPercent", "g-spec-min-area"],
    ["hold", "g-adv-hold"], ["tGMax", "g-adv-tgmax"], ["g1UpFactor", "g-adv-g1up"], ["g1DownFactor", "g-adv-g1down"], ["g2Factor", "g-adv-g2"],
    ["shrinkStartMargin", "g-adv-shrink-start"], ["shrinkEndMargin", "g-adv-shrink-end"],
  ];
  function readSpecs() {
    const s = {};
    SPEC_FIELDS.forEach(function (f) { const el = $(f[1]); const v = el ? Number(el.value) : NaN; if (Number.isFinite(v)) s[f[0]] = v; });
    const marker = $("g-adv-marker");
    s.firstPeakIsMarker = marker ? marker.checked : true;
    s.scouting = Object.assign({}, G.defaults.scouting);
    return s;
  }
  function saveSpecs() {
    const s = {};
    SPEC_FIELDS.forEach(function (f) { const el = $(f[1]); if (el) s[f[1]] = el.value; });
    const marker = $("g-adv-marker"); if (marker) s["g-adv-marker"] = marker.checked;
    try { localStorage.setItem(SPEC_KEY, JSON.stringify(s)); } catch (err) { /* ignore */ }
  }
  function loadSpecs() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SPEC_KEY) || "null"); } catch (err) { s = null; }
    if (!s) return;
    SPEC_FIELDS.forEach(function (f) { const el = $(f[1]); if (el && s[f[1]] !== undefined) el.value = s[f[1]]; });
    const marker = $("g-adv-marker"); if (marker && typeof s["g-adv-marker"] === "boolean") marker.checked = s["g-adv-marker"];
  }
  function resetSpecs() {
    SPEC_FIELDS.forEach(function (f) { const el = $(f[1]); if (el) el.value = el.defaultValue; });
    const marker = $("g-adv-marker"); if (marker) marker.checked = true;
    try { localStorage.removeItem(SPEC_KEY); } catch (err) { /* ignore */ }
  }

  // ---------- history ----------
  function readHistory() {
    try { const h = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(h) ? h : []; } catch (err) { return []; }
  }
  function writeHistory(h) { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch (err) { /* ignore */ } }
  function clearHistory() { try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ } currentFile = null; renderAll(); }

  let currentFile = null;

  // Remove small noise peaks from a run's raw peak table (threshold from the gradient specification).
  function applyFilter(r, pct) {
    if (!Array.isArray(r.rawPeaks)) return;
    const f = filterSmallPeaks(r.rawPeaks, pct);
    const sm = summarizeRun(f.kept);
    r.peaks = f.kept;
    r.removedPeaks = f.removed;
    r.numPeaks = sm.numPeaks; r.minResolution = sm.minResolution; r.trLastPeak = sm.trLastPeak; r.t0 = sm.t0;
    r.peakTimes = f.kept.map(function (p) { return p.rTime; }).filter(function (v) { return typeof v === "number"; });
    r.filterNotice = smallPeaksNotice(f);
  }

  function decideAll() {
    const h = readHistory();
    const specs = readSpecs();
    h.forEach(function (r) { applyFilter(r, specs.minAreaPercent || 0); });
    h.forEach(function (r) { try { r.decision = G.decide(r, h, specs); delete r.decision.run; } catch (err) { r.decision = { caseId: "error", stage: "Could not decide", action: "", message: err.message }; } });
    writeHistory(h);
    return h;
  }

  // ---------- reading files ----------
  function stripExt(n) { return String(n).replace(/\.[^.]+$/, ""); }
  function readText(file) {
    if (/\.(xlsx|xls)$/i.test(file.name) && typeof readExcelAsText === "function") return readExcelAsText(file);
    return new Promise(function (resolve, reject) { const r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(new Error("The file couldn't be read.")); }; r.readAsText(file); });
  }
  function recordFromText(text, fileName) {
    const lines = splitIntoLines(text);
    const name = stripExt(fileName);
    const parsed = G.parseName(name);
    const tbl = findPeakTable(lines);
    const summary = summarizeRun(tbl.peaks);
    const bp = findMaxBackPressure(lines);
    const c = parsed.conditions || {};
    const warnings = parsed.warnings.slice();
    const sampleName = findSampleName(lines);
    if (sampleName && stripExt(sampleName) !== name) warnings.push("The Sample Name inside the file (" + sampleName + ") doesn't match the file name. Check the file belongs to this run.");
    if (tbl.declaredCount !== null && tbl.declaredCount !== tbl.peaks.length) warnings.push("The file says it has " + tbl.declaredCount + " peaks, but " + tbl.peaks.length + " rows were read.");
    if (!bp) warnings.push("No pump pressure trace was found, so back pressure couldn't be checked.");
    return {
      fileName: name, runNumber: c.runNumber || "", grNumber: c.grNumber || "", hplcNumber: c.hplcNumber || "", pH: c.pH || "",
      solvent: c.solvent || "", temperature: c.temperature || "", ligand: c.ligand || "", columnType: c.columnType || "",
      columnDimensions: c.columnDimensions || "", sampleVolume: c.sampleVolume || "", sampleType: c.sampleType || "",
      sampleConcentration: c.sampleConcentration || "", wavelength: c.wavelength || "",
      bIni: parsed.gradient.bIni, bFin: parsed.gradient.bFin, tG: parsed.gradient.tG, F: parsed.gradient.F,
      numPeaks: summary.numPeaks, peakTimes: tbl.peaks.map(function (p) { return p.rTime; }).filter(function (v) { return typeof v === "number"; }),
      minResolution: summary.minResolution, trLastPeak: summary.trLastPeak, t0: summary.t0,
      maxPressure: bp && Number.isFinite(bp.maxActual) ? bp.maxActual : null,
      peaks: tbl.peaks, rawPeaks: tbl.peaks, warnings: warnings,
    };
  }

  function handleFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return Promise.resolve();
    const bad = list.filter(function (f) { return !/\.(csv|xlsx|xls)$/i.test(f.name); });
    if (bad.length) { status("Choose files that end in .csv, .xlsx or .xls.", true); return Promise.resolve(); }
    return Promise.all(list.map(readText)).then(function (texts) {
      const h = readHistory();
      texts.forEach(function (t, i) {
        const rec = recordFromText(t, list[i].name);
        const at = h.findIndex(function (r) { return r.fileName === rec.fileName; });
        if (at === -1) h.push(rec); else h[at] = rec;
        currentFile = rec.fileName;
      });
      writeHistory(h);
      const decided = decideAll();
      const sorted = G.sort(decided);
      if (list.length > 1) currentFile = sorted[sorted.length - 1].fileName;
      const removedN = decided.filter(function (r) { return list.some(function (f) { return stripExt(f.name) === r.fileName; }); }).reduce(function (n, r) { return n + (r.removedPeaks ? r.removedPeaks.length : 0); }, 0);
      status("Loaded " + list.length + " gradient file" + (list.length === 1 ? "" : "s") + ". Showing “" + currentFile + "”." + (removedN ? " " + removedN + " small noise peak" + (removedN === 1 ? " was" : "s were") + " removed (see Upload and conditions for details)." : ""), false);
      renderAll();
      showGSub("result");
    }).catch(function (err) { status("A file couldn't be read. " + err.message, true); });
  }

  function status(text, isError) { const el = $("g-upload-status"); if (!el) return; el.textContent = text; el.className = isError ? "error" : ""; }

  // ---------- rendering: conditions ----------
  const COND = [["%B ini", "bIni"], ["%B fin", "bFin"], ["tG (min)", "tG"], ["Flow rate (mL/min)", "F"], ["Column (L x ID x PS)", "columnDimensions"], ["Solvent B", "solvent"], ["Temperature", "temperature"], ["Ligand", "ligand"]];
  function renderConditions(rec) {
    const box = $("g-conditions");
    if (!box) return;
    if (!rec) { box.replaceChildren(mk("p", "empty", "No gradient file loaded yet.")); return; }
    const t = mk("table");
    const b = t.createTBody();
    COND.forEach(function (f) {
      const tr = b.insertRow();
      tr.insertCell().textContent = f[0];
      const inp = mk("input"); inp.type = "text"; inp.value = rec[f[1]] === null || rec[f[1]] === undefined ? "" : rec[f[1]]; inp.dataset.gfield = f[1];
      tr.insertCell().appendChild(inp);
    });
    const vm = G.Vm(rec.columnDimensions);
    const gs = G.GS(rec.bIni, rec.bFin, rec.tG, rec.F, vm);
    const info = mk("p", "hint", "Vm = π × (ID/2)² × L × 0.68 = " + (vm ? vm.toFixed(3) + " mL" : "?") + ".  GS = Δφ × Vm ÷ (tG × F) = " + (gs !== null ? gs.toFixed(4) : "?") + ".");
    const btn = mk("button", null, "Save conditions and decide again"); btn.type = "button";
    btn.addEventListener("click", function () {
      const h = readHistory();
      const r = h.find(function (x) { return x.fileName === rec.fileName; });
      if (!r) return;
      box.querySelectorAll("[data-gfield]").forEach(function (inp) {
        const k = inp.dataset.gfield;
        r[k] = ["bIni", "bFin", "tG", "F"].indexOf(k) !== -1 ? (inp.value.trim() === "" || !Number.isFinite(Number(inp.value)) ? null : Number(inp.value)) : inp.value.trim();
      });
      writeHistory(h);
      decideAll();
      renderAll();
      showGSub("result");
    });
    const warn = mk("ul", "warnings");
    (rec.filterNotice ? [rec.filterNotice] : []).concat(rec.warnings || []).forEach(function (w) { warn.appendChild(mk("li", null, w)); });
    box.replaceChildren(t, info, btn, warn);
  }

  function renderPeaks(rec) {
    const box = $("g-peaks");
    if (!box) return;
    if (!rec || !rec.peaks || !rec.peaks.length) { box.replaceChildren(mk("p", "empty", rec ? "No peak table found in this file." : "No gradient file loaded yet.")); return; }
    const specs = readSpecs();
    const t = mk("table");
    const hr = t.createTHead().insertRow();
    ["Peak", "tR (min)", "%B at elution", "Resolution", "Plates (N)"].forEach(function (x) { hr.appendChild(mk("th", null, x)); });
    const b = t.createTBody();
    rec.peaks.forEach(function (p) {
      const tr = b.insertRow();
      tr.insertCell().textContent = p.peakNum === null ? "" : p.peakNum;
      tr.insertCell().textContent = fmt(p.rTime, 3);
      const okRun = [rec.bIni, rec.bFin, rec.tG].every(function (v) { return typeof v === "number"; });
      tr.insertCell().textContent = okRun && typeof p.rTime === "number" ? G.percentBAt(p.rTime, rec, specs).toFixed(1) : "";
      tr.insertCell().textContent = fmt(p.resolution, 2);
      tr.insertCell().textContent = p.plateCount === null ? "" : Math.round(p.plateCount);
    });
    const removedNote = rec.removedPeaks && rec.removedPeaks.length ? mk("p", "removed-peaks-note", "Removed as noise (not counted): " + rec.removedPeaks.map(function (p) { return "peak " + (p.peakNum === null ? "?" : p.peakNum) + " at " + fmt(p.rTime, 2) + " min (" + fmt(p.areaPercent, 2) + "% of total area)"; }).join("; ") + ".") : null;
    if (removedNote) box.replaceChildren(removedNote);
    box[removedNote ? "append" : "replaceChildren"](mk("p", "hint", "%B at elution = %B ini + (tR − " + specs.hold + " min hold) × (%B fin − %B ini) / tG." + (typeof rec.maxPressure === "number" ? " Highest back pressure: " + Math.round(rec.maxPressure) + " psi." : "")), t);
  }

  // ---------- rendering: decision ----------
  const CASES = [
    ["G1up", "G1 ↑", "< target", "0", "Increase GS: same %B window, tG × 0.5"],
    ["G1down", "G1 ↓", "< target (after G1 ↑)", "0", "Decrease GS: back to the scouting run, tG × 1.2"],
    ["G1x", "G1 ✕", "< target (after G1 ↑ and ↓)", "0", "Change selectivity: temperature, solvent or ligand"],
    ["G2", "G2", "= target", "< spec", "Keep GS: F × 0.8 and tG ÷ 0.8"],
    ["G3", "G3", "= target", "≥ spec, slow / wasted %B", "Keep GS, shrink: trim unused %B, cut tG in proportion"],
    ["G4", "G4", "= target", "≥ spec, tR ≤ run-time spec", "Method met: lock it"],
  ];
  function caseRowId(caseId) { return caseId === "G2stop" ? "G2" : caseId === "G3fast" ? "G3" : caseId; }

  function nextFileName(rec, n) {
    if (!n) return "";
    const name = rec.fileName;
    const t = name.split("-");
    const mi = t.findIndex(function (x) { return /^GRA(D)?$/i.test(x); });
    if (mi === -1) return "";
    if (/^\d+$/.test(t[1] || "")) t[1] = String(Number(t[1]) + 1).padStart(t[1].length, "0");
    const set = function (off, v) { if (t[mi + off] !== undefined) t[mi + off] = String(v); };
    set(1, n.bIni); set(2, n.bFin); set(3, /min$/i.test(t[mi + 3] || "") ? n.tG + "min" : n.tG); set(4, n.F);
    if (n.solvent && t[3] !== undefined && mi >= 4) t[3] = n.solvent;
    const di = t.findIndex(function (x, i) { return i > mi && /^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/i.test(x); });
    if (di !== -1 && n.temperature !== undefined && t[di + 1] !== undefined) {
      const T = String(n.temperature);
      t[di + 1] = T === "amb" ? "amb" : (/^T/i.test(t[di + 1]) ? "T" + T : T);
    }
    return t.join("-");
  }

  function renderResult(rec) {
    const box = $("g-result");
    if (!box) return;
    if (!rec || !rec.decision) { box.replaceChildren(mk("p", "empty", "Load a gradient run to see the decision.")); return; }
    const d = rec.decision;
    const specs = readSpecs();
    const card = mk("div", "result-card g-card" + (d.pass ? " pass" : "") + (d.unsafe ? " unsafe" : ""));
    const h = mk("h3", null, "");
    if (d.caseLabel) h.appendChild(mk("span", "g-case-badge", d.caseLabel));
    h.appendChild(document.createTextNode(" " + d.stage));
    card.appendChild(h);
    card.appendChild(mk("p", "card-action", d.action || ""));

    if (typeof d.GS === "number") {
      const gs = mk("div", "eff-pred");
      const cell = function (label, value, sub) { const c = mk("div", "eff-pred-cell"); c.appendChild(mk("span", "eff-floor-label", label)); c.appendChild(mk("strong", null, value)); if (sub) c.appendChild(mk("span", "eff-spec", sub)); return c; };
      gs.appendChild(cell("GS of this run", d.GS.toFixed(4), rec.bIni + "–" + rec.bFin + " %B, " + rec.tG + " min, " + rec.F + " mL/min"));
      if (d.next) {
        const same = Math.abs(d.next.GS / d.GS - 1) < 0.01;
        gs.appendChild(cell("GS of the next run", d.next.GS.toFixed(4), same ? "same GS: same selectivity" : (d.next.GS > d.GS ? "higher GS (steeper)" : "lower GS (shallower)")));
      }
      gs.appendChild(cell("Peaks", String(rec.numPeaks), "target " + specs.targetPeaks));
      gs.appendChild(cell("Rs (worst pair)", rec.numPeaks < specs.targetPeaks ? "0" : fmt(rec.minResolution, 2), "spec " + specs.rsSpec));
      card.appendChild(gs);
    }

    if (d.next) {
      const n = d.next;
      const nr = mk("div", "nr-group");
      nr.appendChild(mk("h4", null, "Conditions for the next run"));
      const dl = mk("dl", "nr-list");
      const row = function (label, now, then, unit) {
        const changed = String(now) !== String(then);
        dl.appendChild(mk("dt", null, label));
        const dd = mk("dd", changed ? "nr-changed" : null, then + (unit || ""));
        if (changed) dd.appendChild(mk("span", "nr-chip", "changes"));
        dl.appendChild(dd);
      };
      row("%B ini", rec.bIni, n.bIni, " %");
      row("%B fin", rec.bFin, n.bFin, " %");
      row("tG", rec.tG, n.tG, " min");
      row("Flow rate", rec.F, n.F, " mL/min");
      row("Solvent B", rec.solvent, n.solvent || rec.solvent, "");
      row("Temperature", rec.temperature, n.temperature || rec.temperature, "");
      row("Ligand / column", rec.ligand + " " + rec.columnDimensions, (n.ligand || rec.ligand) + " " + (n.columnDimensions || rec.columnDimensions), "");
      if (typeof n.predictedRs === "number") { dl.appendChild(mk("dt", null, "Predicted Rs")); dl.appendChild(mk("dd", null, n.predictedRs.toFixed(2))); }
      if (typeof n.predictedBP === "number") { dl.appendChild(mk("dt", null, "Predicted back pressure")); dl.appendChild(mk("dd", null, Math.round(n.predictedBP) + " psi")); }
      nr.appendChild(dl);
      const fname = nextFileName(rec, n);
      if (fname) {
        const fb = mk("div", "nr-filename");
        fb.appendChild(mk("span", "nr-fn-label", "Data file name for the next run"));
        const r = mk("div", "nr-fn-row");
        r.appendChild(mk("code", "nr-fn", fname));
        const copy = mk("button", "secondary nr-copy", "Copy"); copy.type = "button";
        copy.addEventListener("click", function () { if (navigator.clipboard) navigator.clipboard.writeText(fname).then(function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500); }, function () {}); });
        r.appendChild(copy);
        fb.appendChild(r);
        nr.appendChild(fb);
      }
      card.appendChild(nr);
    } else if (d.selectivity && d.selectivity.kind === "ligand") {
      const p = mk("p", "eff-none", "Choose a new ligand: ");
      const a = mk("a", null, "see the Equipment tab, Build a ligand/column");
      a.href = "#"; a.addEventListener("click", function (e) { e.preventDefault(); const t = $("tab-equipment"); if (t) t.click(); });
      p.appendChild(a);
      card.appendChild(p);
    }

    const more = mk("details", "more-details");
    more.appendChild(mk("summary", null, "Why, and details"));
    more.appendChild(mk("p", null, d.message || ""));
    if (d.reference && d.reference.fileName && d.reference.fileName !== rec.fileName) more.appendChild(mk("p", "note", "Scouting (reference) run for this chemistry: " + d.reference.fileName + ", GS " + (d.reference.GS ? d.reference.GS.toFixed(4) : "?") + "."));
    card.appendChild(more);

    // The case table, with this run's case highlighted.
    const tbl = mk("table", "options-table g-cases");
    const hr = tbl.createTHead().insertRow();
    ["Case", "Peaks", "Rs min", "Action"].forEach(function (x) { hr.appendChild(mk("th", null, x)); });
    const tb = tbl.createTBody();
    CASES.forEach(function (c) {
      const tr = tb.insertRow();
      if (c[0] === caseRowId(d.caseId)) tr.className = "primary-option";
      tr.insertCell().textContent = c[1]; tr.insertCell().textContent = c[2]; tr.insertCell().textContent = c[3]; tr.insertCell().textContent = c[4];
    });
    const tw = mk("details", "eff-options");
    tw.appendChild(mk("summary", null, "The gradient cases"));
    tw.appendChild(tbl);
    card.appendChild(tw);
    box.replaceChildren(card);
  }

  // ---------- rendering: history ----------
  function renderHistory() {
    const box = $("g-history");
    if (!box) return;
    const h = G.sort(readHistory());
    if (!h.length) { box.replaceChildren(mk("p", "empty", "No gradient runs yet.")); return; }
    const specs = readSpecs();
    const cols = ["Run", "Solvent", "Temp", "Ligand", "Column", "%B ini", "%B fin", "tG (min)", "F (mL/min)", "GS", "# Peaks", "Rs", "tR last (min)", "BP (psi)", "Case", "Action"];
    const wrap = mk("div", "table-scroll");
    const t = mk("table", "hist-table g-hist");
    const hr = t.createTHead().insertRow();
    cols.forEach(function (c) { hr.appendChild(mk("th", null, c)); });
    const b = t.createTBody();
    h.forEach(function (r) {
      const d = r.decision || {};
      const tr = b.insertRow();
      tr.className = "hist-row" + (d.pass ? " st-pass" : "") + (d.unsafe ? " st-unsafe" : "") + (r.fileName === currentFile ? " g-current" : "");
      const runCell = tr.insertCell();
      runCell.appendChild(mk("strong", null, r.runNumber ? "R" + String(r.runNumber).replace(/^0+(?=\d)/, "").padStart(2, "0") : "?"));
      runCell.appendChild(mk("small", "hist-file", r.fileName));
      runCell.style.cursor = "pointer";
      runCell.addEventListener("click", function () { currentFile = r.fileName; renderAll(); showGSub("result"); });
      [r.solvent, r.temperature, r.ligand, r.columnDimensions, r.bIni, r.bFin, r.tG, r.F, typeof d.GS === "number" ? d.GS.toFixed(4) : "",
        r.numPeaks, r.numPeaks < specs.targetPeaks ? "0" : fmt(r.minResolution, 2), fmt(r.trLastPeak, 2), typeof r.maxPressure === "number" ? Math.round(r.maxPressure) : "",
        d.caseLabel || d.stage || "", d.action || ""].forEach(function (v, i) {
        const c = tr.insertCell(); c.textContent = v === null || v === undefined ? "" : String(v);
        if (i === 9 && typeof r.numPeaks === "number") c.className = r.numPeaks === specs.targetPeaks ? "spec-ok" : "spec-bad";
        if (i === 10 && typeof r.minResolution === "number" && r.numPeaks >= specs.targetPeaks) c.className = r.minResolution >= specs.rsSpec ? "spec-ok" : "spec-bad";
      });
      // The next run's conditions, pre-filled in the row below.
      if (d.next) {
        const n = d.next;
        const nx = b.insertRow();
        nx.className = "g-next-row";
        const c0 = nx.insertCell(); c0.textContent = "↳ Next run";
        [n.solvent || r.solvent, n.temperature || r.temperature, n.ligand || r.ligand, n.columnDimensions || r.columnDimensions, n.bIni, n.bFin, n.tG, n.F, n.GS.toFixed(4)].forEach(function (v) { nx.insertCell().textContent = v === null || v === undefined ? "" : String(v); });
        const rest = nx.insertCell(); rest.colSpan = 6;
        rest.textContent = "GS " + (typeof d.GS === "number" ? d.GS.toFixed(4) : "?") + " → " + n.GS.toFixed(4) + (typeof n.predictedRs === "number" ? "; predicted Rs " + n.predictedRs.toFixed(2) : "");
      }
    });
    wrap.appendChild(t);
    box.replaceChildren(wrap);
  }

  function renderAll() {
    const h = readHistory();
    let rec = h.find(function (r) { return r.fileName === currentFile; }) || null;
    if (!rec && h.length) { const s = G.sort(h); rec = s[s.length - 1]; currentFile = rec.fileName; }
    renderConditions(rec);
    renderPeaks(rec);
    renderResult(rec);
    renderHistory();
  }

  // ---------- wiring ----------
  const input = $("g-file");
  if (input) input.addEventListener("change", function (e) { handleFiles(e.target.files).then(function () { e.target.value = ""; }); });
  SPEC_FIELDS.map(function (f) { return $(f[1]); }).concat([$("g-adv-marker")]).forEach(function (el) {
    if (el) el.addEventListener("change", function () { saveSpecs(); decideAll(); renderAll(); });
  });
  const clr = $("g-clear-history");
  if (clr) clr.addEventListener("click", clearHistory);
  loadSpecs();
  decideAll();
  renderAll();
  showGSub("spec");

  window.gradientApp = { current: function () { return readHistory().find(function (r) { return r.fileName === currentFile; }) || null; }, handleFiles: handleFiles, clear: function () { clearHistory(); resetSpecs(); decideAll(); renderAll(); showGSub("spec"); }, show: showGSub };
})();
