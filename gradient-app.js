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
    ["targetPeaks", "g-spec-peaks"], ["rsSpec", "g-spec-rs"], ["runTimeSpec", "g-spec-runtime"], ["maxPressure", "g-spec-pressure"], ["minHeight", "g-spec-min-height"],
    ["hold", "g-adv-hold"], ["tGMax", "g-adv-tgmax"], ["g1UpFactor", "g-adv-g1up"], ["g1DownFactor", "g-adv-g1down"], ["g2Factor", "g-adv-g2"],
    ["shrinkStartMargin", "g-adv-shrink-start"], ["shrinkEndMargin", "g-adv-shrink-end"],
    ["maxOvenTemp", "g-adv-tmax"], ["dwellVolume", "g-adv-dwell"],
    ["wastedThreshold", "g-adv-wasted"], ["g3RsMargin", "g-adv-g3margin"], ["mixAcnShare", "g-adv-mix"], ["vmPorosity", "g-adv-porosity"],
  ];
  const SCOUT_FIELDS = [["bIni", "g-adv-sc-bini"], ["bFin", "g-adv-sc-bfin"], ["tG", "g-adv-sc-tg"], ["F", "g-adv-sc-f"]];
  const TEXT_FIELDS = ["g-adv-tsteps", "g-adv-solvents", "g-adv-ligands", "g-adv-vmsource"];
  const listOf = function (id) { const el = $(id); return el ? el.value.split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean) : []; };
  const normSolv = function (x) { const u = x.toUpperCase(); return u === "MEOH" || u === "MOH" ? "MeOH" : u === "ACN" ? "ACN" : u === "MIX" ? "MIX" : null; };
  function readSpecs() {
    const s = {};
    SPEC_FIELDS.forEach(function (f) { const el = $(f[1]); const v = el ? Number(el.value) : NaN; if (Number.isFinite(v)) s[f[0]] = v; });
    const marker = $("g-adv-marker");
    s.firstPeakIsMarker = marker ? marker.checked : true;
    s.scouting = Object.assign({}, G.defaults.scouting);
    SCOUT_FIELDS.forEach(function (f) { const el = $(f[1]); const v = el ? Number(el.value) : NaN; if (Number.isFinite(v) && el.value !== "") s.scouting[f[0]] = v; });
    const ts = $("g-adv-tsteps");
    const steps = ts ? ts.value.split(/[,;\s]+/).map(Number).filter(function (v) { return Number.isFinite(v) && v > 25; }) : [];
    s.tempSteps = steps.length ? steps.sort(function (a, b) { return a - b; }) : [40, 60];
    const solv = listOf("g-adv-solvents").map(normSolv).filter(Boolean);
    s.solventOrder = solv.length ? solv : ["ACN", "MeOH", "MIX"];
    s.ligandOrder = listOf("g-adv-ligands");
    const vs = $("g-adv-vmsource"); s.vmSource = vs && vs.value === "measured" ? "measured" : "geometry";
    return s;
  }
  function saveSpecs() {
    const s = {};
    SPEC_FIELDS.concat(SCOUT_FIELDS).forEach(function (f) { const el = $(f[1]); if (el) s[f[1]] = el.value; });
    TEXT_FIELDS.forEach(function (id) { const el = $(id); if (el) s[id] = el.value; });
    const marker = $("g-adv-marker"); if (marker) s["g-adv-marker"] = marker.checked;
    try { localStorage.setItem(SPEC_KEY, JSON.stringify(s)); } catch (err) { /* ignore */ }
  }
  function loadSpecs() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SPEC_KEY) || "null"); } catch (err) { s = null; }
    if (!s) return;
    SPEC_FIELDS.concat(SCOUT_FIELDS).forEach(function (f) { const el = $(f[1]); if (el && s[f[1]] !== undefined) el.value = s[f[1]]; });
    TEXT_FIELDS.forEach(function (id) { const el = $(id); if (el && s[id] !== undefined) el.value = s[id]; });
    const marker = $("g-adv-marker"); if (marker && typeof s["g-adv-marker"] === "boolean") marker.checked = s["g-adv-marker"];
  }
  function resetSpecs() {
    SPEC_FIELDS.concat(SCOUT_FIELDS).forEach(function (f) { const el = $(f[1]); if (el) el.value = el.defaultValue; });
    TEXT_FIELDS.forEach(function (id) { const el = $(id); if (!el) return; if (el.tagName === "SELECT") el.value = defaultOf(el); else el.value = el.defaultValue; });
    const marker = $("g-adv-marker"); if (marker) marker.checked = true;
    try { localStorage.removeItem(SPEC_KEY); } catch (err) { /* ignore */ }
  }

  // ---------- history ----------
  function readHistory() {
    try { const h = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(h) ? h : []; } catch (err) { return []; }
  }
  // Saves the history. If the browser's storage is full, the runs are kept without their
  // chromatograms rather than lost, and the user is told.
  let storageWarned = false;
  function writeHistory(h) {
    try { localStorage.setItem(KEY, JSON.stringify(h)); return true; } catch (err) { /* fall through */ }
    try {
      localStorage.setItem(KEY, JSON.stringify(h.map(function (r) { const c = Object.assign({}, r); delete c.chrom; return c; })));
      if (!storageWarned) { storageWarned = true; status("Your browser's storage is full, so the runs were saved without their chromatograms. Clear old runs (isocratic or gradient history) and load the files again to keep the chromatograms.", true); }
      return false;
    } catch (err2) { return false; }
  }
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
    h.forEach(function (r) { applyFilter(r, specs.minHeight || 0); });
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
    const fromName = G.parseName(name);
    const inside = G.fromFile(lines, fromName);
    const parsed = inside.parsed;
    const tbl = findPeakTable(lines);
    const summary = summarizeRun(tbl.peaks);
    const bp = findMaxBackPressure(lines);
    const c = parsed.conditions || {};
    const nameHasGradient = /(^|-)GRA(D)?(-|$)/i.test(name);
    // Warnings about the file name only matter when the conditions come from it.
    const warnings = nameHasGradient ? fromName.warnings.slice() : [];
    if (inside.sources.length) warnings.unshift("Read from " + inside.sources.join(", and ") + ", because the file name doesn't give them. Check them below.");
    inside.warnings.forEach(function (w) { warnings.push(w); });
    const missing = [];
    if (parsed.gradient.bIni === null || parsed.gradient.bFin === null) missing.push("%B ini and %B fin");
    if (parsed.gradient.tG === null) missing.push("tG");
    if (parsed.gradient.F === null) missing.push("flow rate");
    if (!c.columnDimensions) missing.push("column dimensions");
    if (missing.length) warnings.unshift("Couldn't find " + missing.join(", ") + " in the file name or inside the file. Type them into the table and press Save.");
    const sampleName = findSampleName(lines);
    if (nameHasGradient && sampleName && stripExt(sampleName) !== name) warnings.push("The Sample Name inside the file (" + sampleName + ") doesn't match the file name. Check the file belongs to this run.");
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
      hold: typeof inside.hold === "number" ? inside.hold : null,
      nameForNext: nameHasGradient ? name : (inside.nameUsed ? inside.nameUsed.value : name),
      peaks: tbl.peaks, rawPeaks: tbl.peaks, warnings: warnings,
      chrom: typeof buildChromData === "function" ? buildChromData(lines, tbl.peaks) : null,
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
    const vm = G.VmFor ? G.VmFor(rec, readSpecs()) : G.Vm(rec.columnDimensions);
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

  function bprogOf(rec) {
    const specs = readSpecs();
    return { bIni: rec.bIni, bFin: rec.bFin, tG: rec.tG, hold: typeof rec.hold === "number" ? rec.hold : specs.hold };
  }
  function chromSVG(rec) {
    if (!rec || !rec.chrom || typeof chromatogramSVGFromData !== "function") return "";
    return chromatogramSVGFromData(Object.assign({}, rec.chrom, { peaks: rec.peaks || rec.chrom.peaks }), rec.fileName, bprogOf(rec));
  }

  function renderPeaks(rec) {
    const box = $("g-peaks");
    const chromBox = $("g-chrom");
    const pr = $("g-pressure-readout");
    if (pr) pr.textContent = !rec ? "" : (typeof rec.maxPressure === "number" ? "Highest back pressure in this run: " + Math.round(rec.maxPressure) + " psi (limit " + readSpecs().maxPressure + " psi). In a gradient the pressure peaks mid-gradient." : "No pump pressure trace was found in this file.");
    if (chromBox) {
      if (!rec) chromBox.replaceChildren(mk("p", "empty", "No gradient file loaded yet."));
      else {
        const svgText = chromSVG(rec);
        if (!svgText) chromBox.replaceChildren(mk("p", "empty", rec.chrom ? "No peaks to draw a chromatogram from." : "Load this file again to draw its chromatogram."));
        else {
          const note = mk("p", "hint", (rec.chrom.real ? "Detector trace read from the file. " : "No detector trace in this file, so the signal is rebuilt from the peak table. ") + "The number above each peak is its peak number and R.Time. The green line is the %B programme (hold, ramp from " + rec.bIni + " to " + rec.bFin + " %B over " + rec.tG + " min) on the % axis.");
          const fig = mk("div", "run-chrom-wrap");
          fig.innerHTML = svgText;
          chromBox.replaceChildren(mk("h3", null, "Chromatogram"), note, fig);
        }
      }
    }
    if (!box) return;
    if (!rec || !rec.peaks || !rec.peaks.length) { box.replaceChildren(mk("p", "empty", rec ? "No peak table found in this file." : "No gradient file loaded yet.")); return; }
    const specs = Object.assign(readSpecs(), { hold: bprogOf(rec).hold });
    const t = mk("table");
    const hr = t.createTHead().insertRow();
    ["Peak #", "R.Time (min)", "%B at elution", "k'", "Plate #", "Tailing", "Resolution"].forEach(function (x) { hr.appendChild(mk("th", null, x)); });
    const b = t.createTBody();
    const okRun = [rec.bIni, rec.bFin, rec.tG].every(function (v) { return typeof v === "number"; });
    rec.peaks.forEach(function (p) {
      const tr = b.insertRow();
      tr.insertCell().textContent = p.peakNum === null ? "" : p.peakNum;
      tr.insertCell().textContent = fmt(p.rTime, 3);
      tr.insertCell().textContent = okRun && typeof p.rTime === "number" ? G.percentBAt(p.rTime, rec, specs).toFixed(1) : "";
      tr.insertCell().textContent = fmt(p.kPrime, 3);
      tr.insertCell().textContent = p.plateCount === null || p.plateCount === undefined ? "" : Math.round(p.plateCount);
      tr.insertCell().textContent = fmt(p.tailing, 2);
      tr.insertCell().textContent = fmt(p.resolution, 2);
    });
    const parts = [];
    if (rec.removedPeaks && rec.removedPeaks.length) parts.push(mk("p", "removed-peaks-note", "Removed as noise (not counted): " + rec.removedPeaks.map(function (p) { return "peak " + (p.peakNum === null ? "?" : p.peakNum) + " at " + fmt(p.rTime, 2) + " min (height " + (typeof p.height === "number" ? Math.round(p.height).toLocaleString("en-AU") : "?") + ")"; }).join("; ") + "."));
    parts.push(mk("p", "hint", "%B at elution = %B ini + (tR \u2212 " + specs.hold + " min hold) \u00d7 (%B fin \u2212 %B ini) / tG."));
    parts.push(t);
    box.replaceChildren.apply(box, parts);
  }

  // ---------- rendering: Current run panel (like the isocratic one) ----------
  function renderSummary(rec) {
    const box = $("g-run-summary");
    if (!box) return;
    box.replaceChildren(mk("h2", null, "Current run"));
    if (!rec) { box.appendChild(mk("p", "hint", "Load a gradient file in step 2 and its decision, GS, spec checks and conditions appear here.")); return; }
    box.appendChild(mk("p", "rs-file", rec.fileName));
    const d = rec.decision || {};
    const dec = mk("div", "rs-decision" + (d.pass ? " pass" : "") + (d.unsafe ? " unsafe" : ""));
    dec.appendChild(mk("span", "rs-label", "Decision"));
    dec.appendChild(mk("strong", null, d.stage || ""));
    dec.appendChild(mk("p", null, d.action || ""));
    const open = mk("button", "secondary", "Open the decision");
    open.type = "button";
    open.addEventListener("click", function () { showGSub("result"); });
    dec.appendChild(open);
    box.appendChild(dec);
    if (typeof d.GS === "number") {
      const g = mk("div", "rs-minb rs-gs");
      g.appendChild(mk("span", "rs-label", "Gradient steepness"));
      g.appendChild(mk("strong", null, d.GS.toFixed(4) + (d.next ? " \u2192 " + d.next.GS.toFixed(4) : "")));
      g.appendChild(mk("small", null, d.next ? (Math.abs(d.next.GS / d.GS - 1) < 0.01 ? "next run keeps GS: same selectivity" : d.next.GS > d.GS ? "next run: steeper (higher GS)" : "next run: shallower (lower GS)") : "this run"));
      box.appendChild(g);
    }
    const specs = readSpecs();
    box.appendChild(mk("h3", null, "Against your specification"));
    const ul = mk("ul", "rs-checks");
    const check = function (ok, label, value, sub) {
      const li = mk("li", ok === true ? "ok" : ok === false ? "bad" : "");
      li.appendChild(mk("span", "rs-mark", ok === true ? "\u2713" : ok === false ? "\u2715" : "\u2013"));
      const t = mk("div");
      t.appendChild(mk("span", "rs-label", label));
      t.appendChild(mk("strong", null, value));
      t.appendChild(mk("small", null, sub));
      li.appendChild(t);
      ul.appendChild(li);
    };
    const tr = rec.trLastPeak;
    check(typeof tr === "number" ? tr <= specs.runTimeSpec : null, "Last peak tR", typeof tr === "number" ? tr.toFixed(2) + " min" : "?", "run-time spec " + specs.runTimeSpec + " min or less");
    check(typeof rec.numPeaks === "number" ? rec.numPeaks === specs.targetPeaks : null, "Peaks found", String(rec.numPeaks === null || rec.numPeaks === undefined ? "?" : rec.numPeaks), "target " + specs.targetPeaks);
    const rsShown = rec.numPeaks < specs.targetPeaks ? 0 : rec.minResolution;
    check(typeof rsShown === "number" ? rsShown >= specs.rsSpec : null, "Worst Rs", typeof rsShown === "number" ? rsShown.toFixed(2) : "?", "spec " + specs.rsSpec + " or more" + (rec.numPeaks < specs.targetPeaks && typeof rec.minResolution === "number" ? " (peaks co-eluting; calculated " + rec.minResolution.toFixed(2) + ")" : ""));
    check(typeof rec.maxPressure === "number" ? rec.maxPressure < specs.maxPressure : null, "Peak pressure", typeof rec.maxPressure === "number" ? Math.round(rec.maxPressure) + " psi" : "not in file", "max " + specs.maxPressure + " psi");
    box.appendChild(ul);
    box.appendChild(mk("h3", null, "Conditions read from the file"));
    const dl = mk("dl", "rs-cond");
    [["%B ini", rec.bIni], ["%B fin", rec.bFin], ["tG", rec.tG === null ? null : rec.tG + " min"], ["Hold", (typeof rec.hold === "number" ? rec.hold : specs.hold) + " min"], ["Flow rate", rec.F === null ? null : rec.F + " mL/min"], ["Solvent", rec.solvent], ["Temperature", rec.temperature], ["Ligand", rec.ligand], ["Column", rec.columnDimensions]].forEach(function (r) {
      dl.appendChild(mk("dt", null, r[0]));
      dl.appendChild(mk("dd", null, r[1] === null || r[1] === undefined || r[1] === "" ? "?" : String(r[1])));
    });
    box.appendChild(dl);
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
    const name = rec.nameForNext || rec.fileName;
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

  // ---------- rendering: history (own tab, laid out like the isocratic run history) ----------
  const shownChrom = new Set();
  function gStageClass(d) {
    if (!d || !d.caseId) return "st-none";
    if (d.unsafe || d.caseId === "more") return "st-unsafe";
    if (d.caseId === "G1up" || d.caseId === "G1down") return "st-ret";
    if (d.caseId === "G1x" || d.caseId === "G2stop") return "st-sel";
    if (d.caseId === "G2" || d.caseId === "G3" || d.caseId === "G3fast") return "st-handoff";
    if (d.caseId === "G4") return "st-pass";
    return "st-err";
  }
  // Column groups shown (kept in this browser), like the isocratic history.
  const G_COLS_KEY = "hplc-gradient-history-column-groups-v1";
  const gCols = { cond: true, resp: true, dec: true };
  try { Object.assign(gCols, JSON.parse(localStorage.getItem(G_COLS_KEY) || "{}")); } catch (err) { /* defaults */ }
  function applyGCols() {
    const box = $("g-history-container");
    if (box) Object.keys(gCols).forEach(function (g) { box.classList.toggle("hide-" + g, !gCols[g]); });
    document.querySelectorAll(".g-colbtn").forEach(function (b) { b.setAttribute("aria-pressed", gCols[b.dataset.group] ? "true" : "false"); });
  }
  document.querySelectorAll(".g-colbtn").forEach(function (b) {
    b.addEventListener("click", function () {
      gCols[b.dataset.group] = !gCols[b.dataset.group];
      try { localStorage.setItem(G_COLS_KEY, JSON.stringify(gCols)); } catch (err) { /* ignore */ }
      applyGCols();
    });
  });
  function updateGHistoryExtras(h) {
    const all = $("g-toggle-all-chroms");
    if (!all) return;
    const withChrom = h.filter(function (r) { return r.chrom; });
    all.hidden = withChrom.length === 0;
    const everyOpen = withChrom.length > 0 && withChrom.every(function (r) { return shownChrom.has(r.fileName); });
    all.textContent = everyOpen ? "Hide all chromatograms" : "Show all chromatograms";
    all.onclick = function () {
      if (everyOpen) shownChrom.clear(); else withChrom.forEach(function (r) { shownChrom.add(r.fileName); });
      renderHistory();
    };
  }
  function renderHistory() {
    const box = $("g-history-container");
    if (!box) return;
    const h = G.sort(readHistory());
    updateGHistoryExtras(h);
    applyGCols();
    if (!h.length) { box.replaceChildren(mk("p", "empty", "No gradient runs in the history yet.")); return; }
    const specs = readSpecs();
    const cols = [
      ["Run", "run", "run"],
      ["Ligand", "ligand", "cond"], ["Length (mm)", "L", "cond"], ["\u00d8 (mm)", "ID", "cond"], ["PS (\u00b5m)", "dp", "cond"],
      ["Solvent", "solvent", "cond"], ["Temp (\u00b0C)", "temp", "cond"], ["%B ini", "bIni", "cond"], ["%B fin", "bFin", "cond"], ["tG (min)", "tG", "cond"], ["Flow (mL/min)", "F", "cond"],
      ["# Peaks", "peaks", "resp first"], ["Run time (tR last, min)", "tr", "resp"], ["Resolution (Rmin)", "rs", "resp"], ["Back-pressure (psi)", "bp", "resp"], ["GS", "gs", "resp"],
      ["Case", "case", "dec first"], ["Action", "action", "dec"], ["GS next run", "gsnext", "dec"], ["Chromatogram", "chrom", "dec"],
    ];
    const groups = [["", "run", 1], ["Run conditions", "cond", 10], ["Responses", "resp first", 5], ["Decision", "dec first", 4]];
    const wrap = mk("div", "table-scroll");
    const t = mk("table", "hist-table");
    const head = t.createTHead();
    const gr = head.insertRow(); gr.className = "hist-group-row";
    groups.forEach(function (g) { const th = mk("th", (g[1].indexOf("first") !== -1 ? "grp-start " : "") + "g-" + g[1].split(" ")[0], g[0]); th.colSpan = g[2]; gr.appendChild(th); });
    const hr = head.insertRow();
    cols.forEach(function (c) { hr.appendChild(mk("th", (c[2].indexOf("first") !== -1 ? "grp-start " : "") + "g-" + c[2].split(" ")[0], c[0])); });
    const body = t.createTBody();
    h.forEach(function (r) {
      const d = r.decision || {};
      const dims = String(r.columnDimensions || "").split("x");
      const tr = body.insertRow();
      tr.className = "hist-row " + gStageClass(d) + (r.fileName === currentFile ? " g-current" : "");
      cols.forEach(function (c) {
        const td = tr.insertCell();
        if (c[2].indexOf("first") !== -1) td.classList.add("grp-start");
        td.classList.add("g-" + c[2].split(" ")[0]);
        const put = function (v) { td.textContent = v === null || v === undefined ? "" : String(v); };
        switch (c[1]) {
          case "run": {
            const n = String(r.runNumber || "").replace(/^0+(?=\d)/, "");
            const btn = mk("button", "link-button", n ? "R" + n.padStart(2, "0") : "Run");
            btn.type = "button";
            btn.title = "Open this run on the gradient dashboard";
            btn.addEventListener("click", function () { currentFile = r.fileName; renderAll(); const tab = $("tab-gradient"); if (tab) tab.click(); showGSub("result"); });
            td.appendChild(btn);
            td.appendChild(mk("small", "hist-file", r.fileName));
            td.classList.add("hist-run");
            break;
          }
          case "ligand": put(r.ligand); break;
          case "L": put(dims[0]); break;
          case "ID": put(dims[1]); break;
          case "dp": put(dims[2]); break;
          case "solvent": put(r.solvent); break;
          case "temp": put(String(r.temperature || "").replace(/^T(?=\d)/i, "")); break;
          case "bIni": put(r.bIni); break;
          case "bFin": put(r.bFin); break;
          case "tG": put(r.tG); break;
          case "F": put(r.F); break;
          case "peaks": put(r.numPeaks); if (typeof r.numPeaks === "number") td.classList.add(r.numPeaks === specs.targetPeaks ? "spec-ok" : "spec-bad"); break;
          case "tr": put(fmt(r.trLastPeak, 2)); if (typeof r.trLastPeak === "number") td.classList.add(r.trLastPeak <= specs.runTimeSpec ? "spec-ok" : "spec-bad"); break;
          case "rs": {
            const shown = r.numPeaks < specs.targetPeaks ? 0 : r.minResolution;
            put(typeof shown === "number" ? shown.toFixed(2) : "");
            if (typeof shown === "number") td.classList.add(shown >= specs.rsSpec ? "spec-ok" : "spec-bad");
            break;
          }
          case "bp": put(typeof r.maxPressure === "number" ? Math.round(r.maxPressure) : ""); if (typeof r.maxPressure === "number") td.classList.add(r.maxPressure < specs.maxPressure ? "spec-ok" : "spec-bad"); break;
          case "gs": put(typeof d.GS === "number" ? d.GS.toFixed(4) : ""); break;
          case "case": { const chip = mk("span", "stage-chip", d.caseLabel || d.stage || ""); td.appendChild(chip); td.classList.add("hist-case"); break; }
          case "action": put(d.action || ""); td.classList.add("hist-result", gStageClass(d)); break;
          case "gsnext": put(d.next ? d.next.GS.toFixed(4) : ""); break;
          case "chrom": {
            if (!r.chrom) { td.textContent = "Not stored: load the file again"; td.className = "hist-pending"; td.title = "This run was saved before chromatograms were kept, or the browser's storage was full. Upload the file again to store its chromatogram."; break; }
            const open = shownChrom.has(r.fileName);
            const btn = mk("button", "secondary chrom-toggle", open ? "Hide" : "Show");
            btn.type = "button";
            btn.setAttribute("aria-expanded", open ? "true" : "false");
            btn.addEventListener("click", function () { if (shownChrom.has(r.fileName)) shownChrom.delete(r.fileName); else shownChrom.add(r.fileName); renderHistory(); });
            td.appendChild(btn);
            break;
          }
        }
      });
      if (shownChrom.has(r.fileName) && r.chrom) {
        const cr = body.insertRow(); cr.className = "hist-chrom-row";
        const cell = cr.insertCell(); cell.colSpan = cols.length;
        const div = mk("div", "run-chrom-wrap");
        div.innerHTML = chromSVG(r);
        cell.appendChild(div);
        cell.appendChild(mk("p", "hint", (r.chrom.real ? "Detector trace saved from the file." : "Rebuilt from the peak table (the file had no detector trace).") + " Green line: the %B programme."));
      }
      // The next run's conditions, pre-filled in the row below.
      if (d.next) {
        const n = d.next;
        const nx = body.insertRow();
        nx.className = "g-next-row";
        const nd = String(n.columnDimensions || r.columnDimensions || "").split("x");
        const vals = { run: "\u21b3 Next run", ligand: n.ligand || r.ligand, L: nd[0], ID: nd[1], dp: nd[2], solvent: n.solvent || r.solvent, temp: String(n.temperature || r.temperature || "").replace(/^T(?=\d)/i, ""), bIni: n.bIni, bFin: n.bFin, tG: n.tG, F: n.F, gs: n.GS.toFixed(4), rs: typeof n.predictedRs === "number" ? "\u2248 " + n.predictedRs.toFixed(2) : "", bp: typeof n.predictedBP === "number" ? "\u2248 " + Math.round(n.predictedBP) : "" };
        cols.forEach(function (c) {
          const td = nx.insertCell();
          if (c[2].indexOf("first") !== -1) td.classList.add("grp-start");
          td.classList.add("g-" + c[2].split(" ")[0]);
          td.textContent = vals[c[1]] === undefined || vals[c[1]] === null ? "" : String(vals[c[1]]);
        });
      }
    });
    wrap.appendChild(t);
    box.replaceChildren(wrap);
  }

  function renderAll() {
    try { liveGS(); } catch (err) { /* settings box not on the page */ }
    const h = readHistory();
    let rec = h.find(function (r) { return r.fileName === currentFile; }) || null;
    if (!rec && h.length) { const s = G.sort(h); rec = s[s.length - 1]; currentFile = rec.fileName; }
    renderConditions(rec);
    renderPeaks(rec);
    renderResult(rec);
    renderSummary(rec);
    renderHistory();
    const gPaste = $("g-paste-btn");
  if (gPaste) gPaste.addEventListener("click", function () {
    const text = $("g-paste-text").value;
    if (!text.trim()) { status("Paste the CSV data first.", true); return; }
    if (!/\[Peak Table/i.test(text)) { status("The pasted data has no [Peak Table] section. Paste the whole export.", true); return; }
    handleFiles([fileFromPaste(text, $("g-paste-name").value)]).then(function () { $("g-paste-text").value = ""; });
  });
  const again = $("g-decide-btn");
    if (again) again.disabled = !h.length;
  }

  // ---------- wiring ----------
  const input = $("g-file");
  if (input) input.addEventListener("change", function (e) { handleFiles(e.target.files).then(function () { e.target.value = ""; }); });
  // ---------- advanced settings: highlights, impact, validation, live GS, save/load ----------
  const ADV_IDS = SPEC_FIELDS.slice(5).map(function (f) { return f[1]; }).concat(SCOUT_FIELDS.map(function (f) { return f[1]; }), TEXT_FIELDS, ["g-adv-marker"]);
  function defaultOf(el) {
    if (el.type === "checkbox") return el.defaultChecked;
    if (el.tagName === "SELECT") { const o = Array.from(el.options).find(function (x) { return x.defaultSelected; }) || el.options[0]; return o ? o.value : ""; }
    return el.defaultValue;
  }
  function valueOf(el) { return el.type === "checkbox" ? el.checked : el.value; }
  function sameValue(a, b) {
    if (typeof a === "boolean") return a === b;
    const na = Number(a), nb = Number(b);
    if (String(a).trim() !== "" && String(b).trim() !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
    return String(a).replace(/\s+/g, "").toLowerCase() === String(b).replace(/\s+/g, "").toLowerCase();
  }
  function markChanged() {
    let n = 0;
    ADV_IDS.forEach(function (id) {
      const el = $(id); if (!el) return;
      const field = el.closest(".field"); if (!field) return;
      const d = defaultOf(el), changed = !sameValue(valueOf(el), d);
      field.classList.toggle("adv-changed", changed);
      let tag = field.querySelector(".adv-default");
      if (changed) {
        n++;
        if (!tag) { tag = mk("span", "adv-default"); field.appendChild(tag); }
        const shown = el.type === "checkbox" ? (d ? "ticked" : "not ticked") : el.tagName === "SELECT" ? (Array.from(el.options).find(function (o) { return o.value === d; }) || {}).textContent : (d === "" ? "blank" : d);
        tag.textContent = "Case table: " + shown;
      } else if (tag) tag.remove();
    });
    const pill = $("g-adv-changed-pill");
    if (pill) { pill.hidden = n === 0; pill.textContent = n + " changed"; }
  }
  function validate() {
    const s = readSpecs(), w = [];
    const sc = s.scouting;
    if (!(sc.bFin > sc.bIni)) w.push("Scouting %B fin (" + sc.bFin + ") must be higher than %B ini (" + sc.bIni + ").");
    if (sc.bIni < 0 || sc.bFin > 100) w.push("Scouting %B must stay between 0 and 100.");
    if (!(s.g1UpFactor > 0 && s.g1UpFactor < 1)) w.push("The G1 ↑ tG factor must be between 0 and 1: a shorter tG is what raises GS.");
    if (!(s.g1DownFactor > 1)) w.push("The G1 ↓ tG factor must be above 1: a longer tG is what lowers GS.");
    if (!(s.g2Factor > 0 && s.g2Factor < 1)) w.push("The G2 F factor must be between 0 and 1 (lower F, longer tG, same GS).");
    if (!(s.tGMax > sc.tG)) w.push("The G2 tG limit (" + s.tGMax + " min) should be longer than the scouting tG (" + sc.tG + " min).");
    const hot = (s.tempSteps || []).filter(function (t) { return t > s.maxOvenTemp; });
    if (hot.length) w.push("Temperature step" + (hot.length > 1 ? "s " : " ") + hot.join(", ") + " °C " + (hot.length > 1 ? "are" : "is") + " above the oven maximum (" + s.maxOvenTemp + " °C) and will be skipped.");
    const ts = $("g-adv-tsteps"); if (ts && ts.value.trim() && ts.value.split(/[,;\s]+/).filter(Boolean).some(function (x) { const v = Number(x); return !Number.isFinite(v) || v <= 25; })) w.push("Temperature steps must be numbers above 25 °C (ambient is always first).");
    const badSolv = listOf("g-adv-solvents").filter(function (x) { return !normSolv(x); });
    if (badSolv.length) w.push("Unknown solvent" + (badSolv.length > 1 ? "s" : "") + ": " + badSolv.join(", ") + ". Use ACN, MeOH or MIX.");
    if (s.mixAcnShare < 0 || s.mixAcnShare > 100) w.push("The MIX ACN share must be between 0 and 100 %.");
    if (s.vmPorosity < 0.3 || s.vmPorosity > 0.95) w.push("Porosity is usually 0.5–0.8 (0.68 in the workshop).");
    if (s.dwellVolume < 0 || s.hold < 0 || s.shrinkStartMargin < 0 || s.shrinkEndMargin < 0 || s.wastedThreshold < 0 || s.g3RsMargin < 0) w.push("Hold, dwell volume, margins and thresholds can't be negative.");
    const box = $("g-adv-warn");
    if (box) { box.hidden = !w.length; box.replaceChildren(); if (w.length) { box.appendChild(mk("strong", null, "Check these values")); const ul = mk("ul"); w.forEach(function (t) { ul.appendChild(mk("li", null, t)); }); box.appendChild(ul); } }
    return w;
  }
  function liveGS() {
    const box = $("g-adv-gs"); if (!box) return;
    const s = readSpecs(), sc = s.scouting;
    const rec = readHistory().filter(function (r) { return r.fileName === currentFile; })[0] || readHistory()[0];
    const dims = rec && rec.columnDimensions ? rec.columnDimensions : "150x4.6x5";
    const vm = s.vmSource === "measured" && rec ? G.VmFor(rec, s) : G.Vm(dims, s.vmPorosity);
    const gs = function (tG) { return G.GS(sc.bIni, sc.bFin, tG, sc.F, vm); };
    box.replaceChildren();
    if (!vm) return;
    const cell = function (label, v, hint) { const d = mk("div", "adv-gs-cell"); d.appendChild(mk("span", null, label)); d.appendChild(mk("strong", null, typeof v === "number" ? (label === "Vm used" ? v.toFixed(3) + " mL" : v.toFixed(4)) : "–")); if (hint) d.appendChild(mk("small", null, hint)); return d; };
    box.appendChild(cell("Scouting GS", gs(sc.tG), sc.bIni + "–" + sc.bFin + " %B, " + sc.tG + " min, " + sc.F + " mL/min"));
    box.appendChild(cell("After G1 ↑", gs(sc.tG * s.g1UpFactor), "tG " + (sc.tG * s.g1UpFactor).toFixed(1) + " min (steeper)"));
    box.appendChild(cell("After G1 ↓", gs(sc.tG * s.g1DownFactor), "tG " + (sc.tG * s.g1DownFactor).toFixed(1) + " min (shallower)"));
    box.appendChild(cell("Vm used", vm, (s.vmSource === "measured" && rec ? "F × t0 of " : "column ") + (rec ? (rec.runNumber ? "R" + String(rec.runNumber).padStart(2, "0") + " " : "") : "") + dims.replace(/x/g, " × ") + (s.vmSource === "measured" ? "" : ", porosity " + s.vmPorosity)));
  }
  function ligandChips() {
    const box = $("g-adv-ligand-chips"), inp = $("g-adv-ligands"); if (!box || !inp) return;
    let ligs = [];
    try { ligs = Array.from(new Set((window.userColumns ? window.userColumns.read() : []).map(function (c) { return c.ligand; }))); } catch (err) { ligs = []; }
    if (!ligs.length && window.monashColumns) ligs = window.monashColumns.ligands.slice();
    box.replaceChildren();
    box.appendChild(mk("span", "adv-chips-label", "From your column list:"));
    const chosen = listOf("g-adv-ligands").map(function (x) { return x.toLowerCase(); });
    ligs.forEach(function (l) {
      const on = chosen.indexOf(l.toLowerCase()) !== -1;
      const b = mk("button", "adv-chip" + (on ? " on" : ""), (on ? "✓ " : "+ ") + l);
      b.type = "button";
      b.addEventListener("click", function () {
        const cur = listOf("g-adv-ligands");
        const i = cur.map(function (x) { return x.toLowerCase(); }).indexOf(l.toLowerCase());
        if (i === -1) cur.push(l); else cur.splice(i, 1);
        inp.value = cur.join(", ");
        inp.dispatchEvent(new Event("change"));
      });
      box.appendChild(b);
    });
  }
  function snapshot() { const m = {}; readHistory().forEach(function (r) { m[r.fileName] = { label: r.decision ? (r.decision.caseLabel || r.decision.stage || "") : "", action: r.decision ? r.decision.action : "", run: r.runNumber }; }); return m; }
  function showImpact(before, after, note) {
    const box = $("g-adv-impact"); if (!box) return;
    const changed = Object.keys(after).filter(function (k) { return before[k] && (before[k].label !== after[k].label || before[k].action !== after[k].action); });
    box.hidden = false; box.replaceChildren();
    const total = Object.keys(after).length;
    if (!total) { box.appendChild(mk("span", null, (note ? note + " " : "") + "No gradient runs loaded yet, so no decisions changed.")); return; }
    if (!changed.length) { box.className = "adv-impact same"; box.appendChild(mk("span", null, (note ? note + " " : "") + "All " + total + " gradient run" + (total === 1 ? "" : "s") + " decided again: no decision changed.")); return; }
    box.className = "adv-impact diff";
    box.appendChild(mk("strong", null, (note ? note + " " : "") + changed.length + " of " + total + " run" + (total === 1 ? "" : "s") + " now get a different decision:"));
    const ul = mk("ul");
    changed.forEach(function (k) {
      const li = mk("li");
      const n = String(after[k].run || "").replace(/^0+(?=\d)/, "");
      li.appendChild(mk("b", null, n ? "R" + n.padStart(2, "0") + " " : k + " "));
      li.appendChild(mk("span", "adv-was", before[k].label || "–"));
      li.appendChild(document.createTextNode(" → "));
      li.appendChild(mk("span", "adv-now", after[k].label || "–"));
      if (before[k].label === after[k].label) li.appendChild(mk("small", null, " (new conditions: " + (after[k].action || "").slice(0, 90) + ")"));
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  function applyAdvanced(note) {
    const before = snapshot();
    validate();
    saveSpecs(); decideAll(); renderAll();
    markChanged(); liveGS(); ligandChips();
    showImpact(before, snapshot(), note);
    const st = $("g-adv-status"); if (st) st.textContent = "Saved.";
  }
  SPEC_FIELDS.concat(SCOUT_FIELDS).map(function (f) { return $(f[1]); }).concat([$("g-adv-marker")], TEXT_FIELDS.map($)).forEach(function (el) {
    if (el) el.addEventListener("change", function () { applyAdvanced(); });
  });
  const advReset = $("g-adv-reset");
  if (advReset) advReset.addEventListener("click", function () {
    // Only the advanced factors: the specification values on the dashboard stay.
    const keep = ["g-spec-peaks", "g-spec-rs", "g-spec-runtime", "g-spec-pressure", "g-spec-min-height"].map(function (id) { const el = $(id); return el ? [el, el.value] : null; }).filter(Boolean);
    resetSpecs();
    keep.forEach(function (k) { k[0].value = k[1]; });
    applyAdvanced("Back to the case-table values.");
  });
  const exp = $("g-adv-export");
  if (exp) exp.addEventListener("click", function () {
    const out = { app: "HPLC flow chart – gradient advanced settings", version: 1, saved: new Date().toISOString(), settings: {} };
    ADV_IDS.forEach(function (id) { const el = $(id); if (el) out.settings[id] = valueOf(el); });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gradient-settings.json";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    const st = $("g-adv-status"); if (st) st.textContent = "Settings saved to gradient-settings.json.";
  });
  const imp = $("g-adv-import");
  if (imp) imp.addEventListener("change", function () {
    const f = imp.files && imp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      try {
        const data = JSON.parse(r.result);
        const set = data && data.settings ? data.settings : null;
        if (!set) throw new Error("this isn't a settings file from this app");
        let n = 0;
        ADV_IDS.forEach(function (id) { const el = $(id); if (!el || set[id] === undefined) return; if (el.type === "checkbox") el.checked = !!set[id]; else el.value = set[id]; n++; });
        applyAdvanced("Loaded " + n + " settings from " + f.name + ".");
      } catch (err) { const st = $("g-adv-status"); if (st) st.textContent = "Couldn't load " + f.name + ": " + err.message + "."; }
      imp.value = "";
    };
    r.readAsText(f);
  });
  if (window.userColumns && window.userColumns.onChange) window.userColumns.onChange(ligandChips);
  const openAdv = $("g-open-advanced");
  if (openAdv) openAdv.addEventListener("click", function (e) { e.preventDefault(); const t = $("tab-gadvanced"); if (t) t.click(); });
  const again = $("g-decide-btn");
  if (again) again.addEventListener("click", function () { decideAll(); renderAll(); showGSub("result"); });
  const clr = $("g-clear-history");
  if (clr) clr.addEventListener("click", function () {
    const n = readHistory().length;
    const msg = $("g-clear-message");
    if (n === 0) { if (msg) msg.textContent = "There are no saved gradient runs to clear."; return; }
    if (msg) msg.textContent = "";
    $("g-clear-question").textContent = "Delete all " + n + (n === 1 ? " saved gradient run?" : " saved gradient runs?");
    $("g-clear-confirm").hidden = false;
    clr.hidden = true;
  });
  const cno = $("g-clear-no");
  if (cno) cno.addEventListener("click", function () { $("g-clear-confirm").hidden = true; clr.hidden = false; });
  const cyes = $("g-clear-yes");
  if (cyes) cyes.addEventListener("click", function () {
    const n = readHistory().length;
    shownChrom.clear();
    clearHistory();
    $("g-clear-confirm").hidden = true;
    clr.hidden = false;
    $("g-clear-message").textContent = "Cleared " + n + (n === 1 ? " run." : " runs.") + " The gradient history is empty.";
  });
  loadSpecs();
  decideAll();
  renderAll();
  markChanged(); ligandChips(); validate();
  showGSub("spec");

  window.gradientApp = { current: function () { return readHistory().find(function (r) { return r.fileName === currentFile; }) || null; }, handleFiles: handleFiles, clear: function () { clearHistory(); resetSpecs(); decideAll(); renderAll(); showGSub("spec"); }, show: showGSub };
})();
