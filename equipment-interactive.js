// equipment-interactive.js: the interactive chromatogram and the "Build a column" stepper
// for the Equipment tab. Self-contained: it only needs the two empty containers in index.html.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const f = (v, d) => Number(v).toFixed(d === undefined ? 2 : d);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  // ---------------- 1. Interactive chromatogram ----------------
  // An illustrative trace (not the user's data). Every number shown is computed from these peaks.
  const PEAKS = [
    { tR: 0.95, h: 70, s: 0.05 }, { tR: 3.0, h: 290, s: 0.09 }, { tR: 6.0, h: 140, s: 0.15 },
    { tR: 6.7, h: 125, s: 0.15 }, { tR: 10.0, h: 105, s: 0.25 },
  ];
  const T0 = PEAKS[0].tR, COL_L = 150, PRESSURE = 2050;
  const M = PEAKS.map(p => {
    const w = 2.355 * p.s, wb = 4 * p.s;
    return { tR: p.tR, h: p.h, w, wb, auc: p.h * p.s * Math.sqrt(2 * Math.PI), K: (p.tR - T0) / T0, N: 5.54 * Math.pow(p.tR / w, 2) };
  });
  const rsPair = i => 2 * (M[i].tR - M[i - 1].tR) / (M[i].wb + M[i - 1].wb);
  let worst = 2; for (let i = 2; i < M.length; i++) if (rsPair(i) < rsPair(worst)) worst = i;

  // kind: "read" = read off the chromatogram, "calc" = calculated from readings
  const RESP = [
    { id: "t0", name: "t0", kind: "read", what: "The dead time: how long a compound that is not retained at all takes to cross the column.", how: "Read the tR of the first, unretained peak (uracil).", effect: "Every retention factor K is measured against it.", val: s => f(T0) + " min" },
    { id: "tR", name: "tR", kind: "read", what: "Retention time: from injection to the top of the peak.", how: "Read at the apex of the peak on the time axis.", effect: "The last peak's tR is compared with the tR spec to decide whether to change retention.", val: s => f(M[s].tR) + " min" },
    { id: "height", name: "Height", kind: "read", what: "The peak height at its apex, measured from the baseline.", how: "Read on the left (mAU) axis.", effect: "Tells you how much signal there is; it rises with injection volume and concentration.", val: s => f(M[s].h, 0) + " mAU" },
    { id: "width", name: "Width (w½)", kind: "read", what: "The peak width measured at half of its height.", how: "Measured across the peak at half height, on the time axis.", effect: "Narrower peaks mean higher efficiency N and an easier separation.", val: s => f(M[s].w, 3) + " min" },
    { id: "area", name: "Area (AUC)", kind: "calc", what: "The area under the peak, which is an indirect measure of how much of that compound was injected.", how: "Integrated by the software between the start and end of the peak.", effect: "Compare areas to compare amounts. A bigger area does not by itself mean a better separation.", val: s => f(M[s].auc, 1) + " mAU\u00b7min" },
    { id: "pressure", name: "Back pressure", kind: "read", what: "The pressure the pump needs to push the mobile phase through the column. It is built by the column; you cannot set it.", how: "Read on the right (psi) axis, the dashed line.", effect: "Must stay under the system limit (for example 4000 psi on HPLC). Smaller beads and longer columns raise it.", val: s => "about " + PRESSURE + " psi" },
    { id: "lastTR", name: "Last tR", kind: "read", what: "The retention time of the last peak to leave the column.", how: "Read at the apex of the final peak.", effect: "This is the run time that is compared with the tR spec (for example 15 min).", val: s => f(M[M.length - 1].tR) + " min" },
    { id: "K", name: "K (retention factor)", kind: "calc", what: "How many times longer a compound spends in the stationary phase than in the mobile phase.", how: "K = (tR \u2212 t0) / t0", effect: "log K against %B gives the straight line used to derive the minimum %B.", val: s => f(M[s].K) },
    { id: "N", name: "N (plate count)", kind: "calc", what: "A measure of efficiency: how narrow the peak is for its retention time.", how: "N = 5.54 \u00d7 (tR / w\u00bd)\u00b2", effect: "Aim for more than 4,000, preferably around 10,000.", val: s => f(M[s].N, 0) },
    { id: "HETP", name: "HETP", kind: "calc", what: "Height equivalent to a theoretical plate. Smaller is better.", how: "HETP = column length / N", effect: "Lets you compare the efficiency of columns of different lengths.", val: s => f(COL_L / M[s].N * 1000, 0) + " \u00b5m (150 mm column)" },
    { id: "rs", name: "Worst-pair Rs", kind: "calc", what: "How well two neighbouring peaks are separated. A run has one Rs: the lowest of its neighbouring pairs.", how: "Rs = 2(tR2 \u2212 tR1) / (wb1 + wb2)", effect: "Needs to be at least the Rs spec (for example 1.4). Below that the peaks overlap.", val: s => f(rsPair(worst)) + " (peaks " + worst + " and " + (worst + 1) + ")" },
  ];
  let sel = 1, hl = "tR";

  function signal(t) { return 4 + PEAKS.reduce((a, p) => a + p.h * Math.exp(-Math.pow(t - p.tR, 2) / (2 * p.s * p.s)), 0); }
  const X = t => 60 + t * 48.33, Y = v => 270 - v * 0.75, YP = p => 270 - p * 0.06;

  function chromSVG() {
    let d = ""; for (let t = 0; t <= 12.001; t += 0.04) d += (d ? "L" : "M") + f(X(t), 1) + " " + f(Y(signal(t)), 1);
    const m = M[sel], on = id => (hl === id ? " on" : "");
    const lb = (id, x, y, w, text) => '<g class="lbl ' + RESP.find(r => r.id === id).kind + on(id) + '" data-id="' + id + '" tabindex="0" role="button" aria-label="' + text + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="24" rx="4"/><text x="' + (x + w / 2) + '" y="' + (y + 16) + '" text-anchor="middle">' + text + "</text></g>";
    let s = '<svg viewBox="0 0 800 330" class="chrom" role="img" aria-label="Illustrative chromatogram">';
    s += '<line x1="60" y1="30" x2="60" y2="270" class="axis"/><line x1="60" y1="270" x2="640" y2="270" class="axis"/><line x1="640" y1="30" x2="640" y2="270" class="axis"/>';
    for (let t = 0; t <= 12; t += 2) s += '<text x="' + X(t) + '" y="288" text-anchor="middle" class="tick">' + t + "</text>";
    for (let v = 0; v <= 300; v += 100) s += '<text x="52" y="' + (Y(v) + 4) + '" text-anchor="end" class="tick">' + v + "</text>";
    for (let p = 0; p <= 4000; p += 1000) s += '<text x="648" y="' + (YP(p) + 4) + '" class="tick">' + p + "</text>";
    s += '<text x="52" y="22" text-anchor="end" class="tick">mAU</text><text x="648" y="22" class="tick">psi</text><text x="350" y="312" text-anchor="middle" class="tick">Time after injection (min)</text>';
    s += '<line x1="60" y1="' + YP(PRESSURE) + '" x2="640" y2="' + YP(PRESSURE) + '" class="pressure' + on("pressure") + '"/>';
    if (hl === "area") { let a = "M" + f(X(m.tR - 3 * PEAKS[sel].s), 1) + " 270"; for (let t = m.tR - 3 * PEAKS[sel].s; t <= m.tR + 3 * PEAKS[sel].s; t += 0.02) a += "L" + f(X(t), 1) + " " + f(Y(signal(t)), 1); s += '<path d="' + a + 'L' + f(X(m.tR + 3 * PEAKS[sel].s), 1) + ' 270Z" class="area"/>'; }
    s += '<path d="' + d + '" class="trace-line"/>';
    PEAKS.forEach((p, i) => { s += '<rect x="' + (X(p.tR) - 14) + '" y="30" width="28" height="240" class="pick' + (i === sel ? " sel" : "") + '" data-peak="' + i + '"><title>Select peak ' + (i + 1) + "</title></rect>"; });
    if (hl === "tR") s += '<line x1="' + X(m.tR) + '" y1="' + Y(m.h) + '" x2="' + X(m.tR) + '" y2="270" class="mark"/>';
    if (hl === "height") s += '<line x1="' + (X(m.tR) + 4) + '" y1="' + Y(m.h) + '" x2="' + (X(m.tR) + 4) + '" y2="270" class="mark"/>';
    if (hl === "width") s += '<line x1="' + X(m.tR - m.w / 2) + '" y1="' + Y(m.h / 2) + '" x2="' + X(m.tR + m.w / 2) + '" y2="' + Y(m.h / 2) + '" class="mark"/>';
    if (hl === "t0") s += '<line x1="' + X(T0) + '" y1="' + Y(M[0].h) + '" x2="' + X(T0) + '" y2="270" class="mark"/>';
    if (hl === "lastTR") s += '<line x1="' + X(M[4].tR) + '" y1="' + Y(M[4].h) + '" x2="' + X(M[4].tR) + '" y2="270" class="mark"/>';
    if (hl === "rs") s += '<path d="M' + X(M[worst - 1].tR) + " 262V252H" + X(M[worst].tR) + 'V262" class="mark nofill"/>';
    const lx = Math.min(X(m.tR) + 10, 560);
    s += lb("t0", X(T0) - 14, Y(M[0].h) - 30, 34, "t0") + lb("tR", X(m.tR) - 18, Y(m.h) - 34, 36, "tR") + lb("height", lx, Y(m.h) + 2, 62, "Height") + lb("width", lx, Y(m.h / 2) - 12, 56, "Width") + lb("area", lx, 232 - 4, 86, "Area (AUC)");
    s += lb("rs", X((M[worst].tR + M[worst - 1].tR) / 2) - 54, Y(M[worst].h) - 56, 108, "Worst-pair Rs") + lb("lastTR", X(M[4].tR) - 24, Y(M[4].h) - 34, 56, "Last tR") + lb("pressure", 660, YP(PRESSURE) - 12, 100, "Pressure");
    return s + "</svg>";
  }

  function buildChromatogram(box) {
    const note = el("p", "hint", "Illustrative teaching trace, not your uploaded data. Click a label or a response button to see what it means and how it affects the decision. Click a peak to measure a different one.");
    const key = el("p", "chrom-key"); key.innerHTML = '<span class="k read"></span> Read / measured <span class="k calc"></span> Calculated / integrated &nbsp; Blue line: detector signal &middot; Orange dashed: pump pressure';
    const chart = el("div", "chrom-wrap"), btns = el("div", "resp-buttons"), detail = el("div", "module-detail");
    btns.setAttribute("role", "group"); btns.setAttribute("aria-label", "Responses");
    function render() {
      chart.innerHTML = chromSVG();
      btns.replaceChildren(...RESP.map(r => { const b = el("button", "resp-btn " + r.kind + (r.id === hl ? " on" : ""), r.name); b.type = "button"; b.addEventListener("click", () => pick(r.id)); return b; }));
      const r = RESP.find(x => x.id === hl); detail.replaceChildren();
      detail.append(el("h3", null, r.name), el("p", null, r.what));
      const tag = el("span", "category-tag " + (r.kind === "read" ? "mechanical" : "both"), r.kind === "read" ? "read / measured" : "calculated");
      const p1 = el("p"); p1.append(tag, document.createTextNode("  How it is obtained: " + r.how));
      const p2 = el("p", "computed-value"); p2.append(el("span", "computed-badge", "this trace"), document.createTextNode(r.id === "pressure" || r.id === "rs" || r.id === "t0" || r.id === "lastTR" ? r.val(sel) : "Peak " + (sel + 1) + ": " + r.val(sel)));
      detail.append(p1, p2, el("p", "note", "Why it matters: " + r.effect));
    }
    function pick(id) { hl = id; render(); }
    chart.addEventListener("click", e => {
      const g = e.target.closest(".lbl"), pk = e.target.closest(".pick");
      if (g) pick(g.dataset.id); else if (pk) { sel = Number(pk.dataset.peak); render(); }
    });
    chart.addEventListener("keydown", e => { const g = e.target.closest && e.target.closest(".lbl"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(g.dataset.id); } });
    const split = el("div", "split wide-left"), mainCol = el("div", "split-main"), side = el("aside", "split-side");
    side.setAttribute("aria-label", "Response details");
    mainCol.append(chart, btns); side.append(detail); split.append(mainCol, side);
    box.append(note, key, split); render();
  }

  // ---------------- 2. Build a column ----------------
  const LIG = [
    { id: "C18", name: "C18", note: "Octadecyl chain: the standard, strongly retentive reversed-phase ligand.", len: 62 },
    { id: "C8", name: "C8", note: "Shorter octyl chain: less retention than C18, so faster elution.", len: 34 },
    { id: "C18aq", name: "C18aq", note: "C18 with polar end-capping: stable in highly aqueous mobile phases.", len: 62, head: "sq" },
    { id: "BiPH", name: "Biphenyl", note: "Two phenyl rings: strong \u03c0-\u03c0 selectivity.", len: 36, head: "bi" },
    { id: "IBD", name: "IBD", note: "Embedded polar group in the chain: different H-bond selectivity.", len: 62, head: "mid" },
    { id: "PFP", name: "PFP", note: "Pentafluorophenyl: \u03c0-\u03c0, dipole and shape selectivity.", len: 34, head: "pf" },
  ];
  const BEADS = [["P", "Pinnacle (P)", "The bead line of the column in this lab."], ["U", "Ultra (U)", "Code used in file names for Ultra columns."], ["F", "Force (F)", "Code used in file names for Force columns."], ["R", "Raptor (R)", "Code used in file names for Raptor columns."]];
  const B = { lig: "C18", bead: "P", core: "fully", pore: 140, load: 11, L: 150, ID: 4.6, dp: 5, cap: false };
  let step = 0, finished = false;
  const STEPS = ["Ligand", "Bead type", "Pore size", "Core-shell", "Carbon load", "Dimensions"];

  function ligSVG(l) { return ligandThumbSVG(l.id); }
  const colVol = () => Math.PI * Math.pow(B.ID / 2, 2) * B.L * 0.68 / 1000; // mL, from the lab slides
  const relP = () => (B.L / 150) * Math.pow(4.6 / B.ID, 2) * Math.pow(5 / B.dp, 2);

  // ---------------- 3. The column report shown when "Done" is clicked ----------------
  const CATEGORY = { C18: "C18 (L1)", C8: "C8 (L7)", C18aq: "modified C18 (L1)", BiPH: "biphenyl (L11)", IBD: "C18 with an embedded polar group", PFP: "pentafluorophenyl (L43)" };
  // Values copied from Restek's product pages (5 um, 150 x 4.6 mm catalogue items), keyed bead|ligand.
  // pore (A), load (% C), cap (end-capped), core ("fully" or "shell"), area (m2/g), pH, tmax (C), name = Restek product name, url = its page.
  const R = "https://www.restek.com/p/";
  const DATASHEET = {
    "P|C18":   { name: "Pinnacle DB C18", pore: 140, load: 11, cap: true,  core: "fully", area: 150, pH: "2.5 to 8", tmax: 80, url: R + "9414565" },
    "P|C18aq": { name: "Pinnacle DB Aqueous C18", pore: 140, load: 6, cap: false, core: "fully", area: 150, pH: "2.5 to 8", tmax: 80, url: R + "9418565" },
    "P|C8":    { name: "Pinnacle DB C8", pore: 140, load: 6, cap: true, core: "fully", area: 150, pH: "2.5 to 8", tmax: 80, url: R + "9413565" },
    "P|BiPH":  { name: "Pinnacle DB Biphenyl", pore: 140, load: 8, cap: true, core: "fully", area: 150, pH: "2.5 to 8", tmax: 80, url: R + "9409565" },
    "P|PFP":   { name: "Pinnacle DB PFP Propyl", pore: 140, load: 6, cap: true, core: "fully", area: 150, pH: "2.5 to 8", tmax: 80, url: R + "9419575" },
    "U|C18":   { name: "Ultra C18", pore: 100, load: 20, cap: true, core: "fully", area: 300, pH: "2.5 to 8", tmax: 80, url: R + "9174565" },
    "U|C18aq": { name: "Ultra Aqueous C18", pore: 100, load: 15, cap: false, core: "fully", area: 300, pH: "2.5 to 8", tmax: 80, url: R + "9178565" },
    "U|C8":    { name: "Ultra C8", pore: 100, load: 12, cap: true, core: "fully", area: 300, pH: "2.5 to 8", tmax: 80, url: R + "9103565" },
    "U|BiPH":  { name: "Ultra Biphenyl", pore: 100, load: 15, cap: true, core: "fully", area: 300, pH: "2.5 to 8", tmax: 80, url: R + "9109365" },
    "U|IBD":   { name: "Ultra IBD", pore: 100, load: 12, cap: false, core: "fully", area: 300, pH: "2.5 to 8", tmax: 80, url: R + "9175565" },
    "U|PFP":   { name: "Ultra PFP Propyl", pore: 100, load: 11, cap: true, core: "fully", area: 300, pH: "2.5 to 8", tmax: 80, url: R + "9179565" },
    "F|C18":   { name: "Force C18", pore: 100, load: 20, cap: true, core: "fully", area: 300, pH: "2.0 to 8", tmax: 80, url: R + "9634565" },
    "F|BiPH":  { name: "Force Biphenyl", pore: 100, load: 15, cap: true, core: "fully", area: 300, pH: "2.0 to 8", tmax: 80, url: R + "9629365" },
    "R|C18":   { name: "Raptor C18", pore: 90, load: 5, cap: true, core: "shell", area: 100, pH: "2.0 to 8", tmax: 80, url: R + "9304565" },
    "R|BiPH":  { name: "Raptor Biphenyl", pore: 90, load: 5, cap: true, core: "shell", area: 100, pH: "2.0 to 8", tmax: 80, url: R + "9309565" },
    "R|PFP":   { name: "Raptor FluoroPhenyl", pore: 90, load: 3, cap: false, core: "shell", area: 100, pH: "2.0 to 8", tmax: 80, url: R + "9319565" },
  };
  const sheetFor = () => DATASHEET[B.bead + "|" + B.lig];
  window.columnFacts = function (lig, bead) { return DATASHEET[bead + "|" + lig] || null; };
  // Restek page to cite for the chosen ligand: the chosen bead line if Restek makes it, otherwise the first line that does.
  const ligandSource = () => sheetFor() || DATASHEET[["P", "U", "F", "R"].map(b => b + "|" + B.lig).find(k => DATASHEET[k])];
  // Copy the Restek values for the chosen bead line and ligand into the builder (if Restek makes that combination).
  function applyPreset() { const d = sheetFor(); if (d) { B.pore = d.pore; B.load = d.load; B.cap = d.cap; B.core = d.core; } }
  applyPreset();
  function rng(seed) { let a = seed; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const GOLD = "#a67c00";
  function arrowH(x1, x2, y, color) { return '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + color + '" stroke-width="3"/><polygon points="' + x1 + "," + y + " " + (x1 + 12) + "," + (y - 7) + " " + (x1 + 12) + "," + (y + 7) + '" fill="' + color + '"/><polygon points="' + x2 + "," + y + " " + (x2 - 12) + "," + (y - 7) + " " + (x2 - 12) + "," + (y + 7) + '" fill="' + color + '"/>'; }
  function arrowV(x, y1, y2, color) { return '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="3"/><polygon points="' + x + "," + y1 + " " + (x - 7) + "," + (y1 + 12) + " " + (x + 7) + "," + (y1 + 12) + '" fill="' + color + '"/><polygon points="' + x + "," + y2 + " " + (x - 7) + "," + (y2 - 12) + " " + (x + 7) + "," + (y2 - 12) + '" fill="' + color + '"/>'; }

  function colSideSVG() {
    const tube = 170 + B.L * 1.4, fit = 34, total = tube + fit * 2, x0 = (640 - total) / 2, t = 14 + B.ID * 5, cy = 78, ft = t + 14, mid = 320;
    let s = '<svg viewBox="0 0 640 200" class="rep-svg" role="img" aria-label="Column drawing: ' + B.L + " mm long, " + B.ID + ' mm internal diameter">';
    s += '<rect x="' + x0 + '" y="' + (cy - t / 2) + '" width="' + total + '" height="' + t + '" rx="4" fill="#9aa1a8" stroke="#6b7178"/>';
    s += '<rect x="' + x0 + '" y="' + (cy - ft / 2) + '" width="' + fit + '" height="' + ft + '" rx="8" fill="#c3c8cd" stroke="#6b7178"/>';
    s += '<rect x="' + (x0 + total - fit) + '" y="' + (cy - ft / 2) + '" width="' + fit + '" height="' + ft + '" rx="8" fill="#c3c8cd" stroke="#6b7178"/>';
    s += '<rect x="' + (x0 - 12) + '" y="' + (cy - t * 0.45) + '" width="14" height="' + t * 0.9 + '" rx="3" fill="#1b5fc1"/>';
    s += '<rect x="' + (x0 + total - 2) + '" y="' + (cy - t * 0.45) + '" width="14" height="' + t * 0.9 + '" rx="3" fill="#1b5fc1"/>';
    s += arrowV(mid, cy - t / 2, cy + t / 2, GOLD) + '<text x="' + mid + '" y="' + (cy - ft / 2 - 10) + '" text-anchor="middle" font-size="20" fill="' + GOLD + '">' + B.ID + " mm</text>";
    s += arrowH(x0, x0 + total, 134, "#8a8f96") + '<text x="' + mid + '" y="182" text-anchor="middle" font-size="28" font-weight="700">' + B.L + "mm</text>";
    return s + "</svg>";
  }

  function crossSVG() {
    let beads = "";
    for (let row = -8; row <= 8; row++) { const y = row * 8.4, off = row % 2 ? 4.2 : 0; for (let x = -72; x <= 72; x += 8.4) { const px = x + off; if (px * px + y * y <= 64 * 64) beads += '<circle cx="' + (100 + px) + '" cy="' + (100 + y) + '" r="3.8" fill="#f3e6d3" stroke="#c9ad88" stroke-width=".6"/>'; } }
    return '<svg viewBox="0 0 200 200" class="rep-svg sq" role="img" aria-label="Cross-section of the column"><circle cx="100" cy="100" r="94" fill="#7b8189"/><circle cx="100" cy="100" r="84" fill="#b8902a"/><circle cx="100" cy="100" r="72" fill="#e6d2b3"/>' + beads +
      '<rect x="46" y="84" width="108" height="32" rx="6" fill="#fff" fill-opacity=".85"/>' + arrowH(34, 166, 100, GOLD).replace(/stroke-width="3"/, 'stroke-width="3" stroke-dasharray="6 4"') + '<text x="100" y="96" text-anchor="middle" font-size="19" font-weight="700">' + B.ID + " mm</text></svg>";
  }

  function beadSVG() {
    const r = rng(3), R = 88, cx = 100, cy = 100, pw = Math.max(1.5, Math.min(7, B.pore / 36)), rIn = B.core === "shell" ? 52 : 6;
    let pores = "";
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2 + r() * 0.18, depth = 0.55 + r() * 0.45, ph = r() * 6; let d = "";
      for (let j = 0; j <= 16; j++) { const rad = (R - 2) - (R - 2 - rIn) * depth * (j / 16), ang = a + Math.sin(j * 0.7 + ph) * 0.06; d += (j ? "L" : "M") + f(cx + rad * Math.cos(ang), 1) + " " + f(cy + rad * Math.sin(ang), 1); }
      pores += '<path d="' + d + '" fill="none" stroke="#f3e6d3" stroke-width="' + f(pw, 1) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    const halo = ' stroke="#fff" stroke-width="3" paint-order="stroke"';
    let s = '<svg viewBox="0 0 200 200" class="rep-svg sq" role="img" aria-label="Cross-section of one bead, ' + B.dp + " µm with " + B.pore + ' Å pores"><circle cx="100" cy="100" r="' + R + '" fill="#b9c8e6" stroke="#8fa3cc" stroke-width="2"/>' + pores;
    if (B.core === "shell") s += '<circle cx="100" cy="100" r="' + rIn + '" fill="#8793b3"/><text x="100" y="78" text-anchor="middle" font-size="13" fill="#fff">solid core</text>';
    s += arrowH(12, 188, 100, "#4a5568").replace(/stroke-width="3"/, 'stroke-width="1.5"') + '<text x="100" y="' + (B.core === "shell" ? 132 : 84) + '" text-anchor="middle" font-size="18" font-weight="700"' + halo + ">" + B.dp + " µm</text>";
    s += '<text x="100" y="26" text-anchor="middle" font-size="15"' + halo + ">" + B.pore + " Å pores</text>";
    return s + "</svg>";
  }

  function siohSVG() {
    const order = Array.from({ length: 100 }, (_, i) => i), rs = rng(11); for (let i = 99; i > 0; i--) { const j = Math.floor(rs() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const kind = new Array(100).fill("oh"); order.slice(0, B.load).forEach(i => { kind[i] = "lig"; }); if (B.cap) order.slice(B.load).forEach((i, n) => { if (n % 2 === 0) kind[i] = "cap"; });
    const r = rng(5), W = 540, H = 400, TOP = 44, LEN = 330, N = 25;
    const walls = [{ c: 138, side: -1, ph: 0 }, { c: 138, side: 1, ph: 0 }, { c: 402, side: -1, ph: 2 }, { c: 402, side: 1, ph: 2 }];
    const hw = 64, P = (w, t) => { const a = t * 7.5 + w.ph, x = w.c + w.side * (hw + 12 * Math.sin(a)), dx = w.side * 12 * 7.5 * Math.cos(a), dy = LEN, L = Math.hypot(dx, dy); return { x, y: TOP + t * LEN, tx: dx / L, ty: dy / L, nx: (w.side < 0 ? dy : -dy) / L, ny: (w.side < 0 ? -dx : dx) / L }; };
    let s = '<svg viewBox="0 0 860 ' + H + '" class="rep-svg" role="img" aria-label="Inside one pore of the silica: 100 SiOH sites, ' + B.load + ' of them carrying a ligand"><rect x="0" y="0" width="' + W + '" height="' + H + '" rx="12" fill="#9fb4dd" stroke="#7f95c4"/>';
    [138, 402].forEach((c, k) => { const L = [], R = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = P(walls[k * 2], t), b = P(walls[k * 2 + 1], t); L.push(f(a.x, 1) + " " + f(a.y - 0, 1)); R.push(f(b.x, 1) + " " + f(b.y, 1)); } s += '<path d="M' + L.join("L") + "L" + R.reverse().join("L") + 'Z" fill="#f3e6d3" stroke="#7f95c4" stroke-width="2"/>'; });
    s += '<text x="' + (W / 2) + '" y="26" text-anchor="middle" font-size="16" font-weight="700" fill="#16232e">Inside two pores of a bead (100 SiOH sites)</text>';
    s += '<text x="138" y="' + (H - 6) + '" text-anchor="middle" font-size="12" fill="#16232e">pore space</text><text x="402" y="' + (H - 6) + '" text-anchor="middle" font-size="12" fill="#16232e">pore space</text><text x="270" y="' + (H / 2) + '" text-anchor="middle" font-size="13" fill="#16232e" transform="rotate(-90 270 ' + (H / 2) + ')">silica (solid)</text>';
    let lig = 0, cap = 0, k = 0;
    walls.forEach(w => {
      for (let i = 0; i < N; i++) {
        const t = 0.02 + (i / (N - 1)) * 0.96, p = P(w, t), kd = kind[k++], ang = f(Math.atan2(p.tx, p.ty) * 180 / Math.PI * -w.side, 1);
        s += '<circle cx="' + f(p.x, 1) + '" cy="' + f(p.y, 1) + '" r="3.2" fill="#fff" stroke="#566a99" stroke-width="1"/>';
        if (kd === "lig") {
          lig++;
          s += '<g transform="translate(' + f(p.x, 1) + ' ' + f(p.y, 1) + ') rotate(' + f(Math.atan2(p.ny, p.nx) * 180 / Math.PI, 2) + ')">' + ligandLocal(B.lig, { B: 3.3, labels: false, color: "#d32f2f", lw: 1.3 }) + '</g><line x1="' + f(p.x - p.tx * 6, 1) + '" y1="' + f(p.y - p.ty * 6, 1) + '" x2="' + f(p.x + p.tx * 6, 1) + '" y2="' + f(p.y + p.ty * 6, 1) + '" stroke="#f08a00" stroke-width="2.6" stroke-linecap="round"/>';
        } else if (kd === "cap") {
          cap++; s += '<line x1="' + f(p.x, 1) + '" y1="' + f(p.y, 1) + '" x2="' + f(p.x + p.nx * 9, 1) + '" y2="' + f(p.y + p.ny * 9, 1) + '" stroke="#4c9a63" stroke-width="2.4" stroke-linecap="round"/><circle cx="' + f(p.x + p.nx * 11, 1) + '" cy="' + f(p.y + p.ny * 11, 1) + '" r="2.8" fill="#4c9a63"/>';
        } else {
          const ex = p.x + p.nx * 6, ey = p.y + p.ny * 6;
          s += '<line x1="' + f(p.x, 1) + '" y1="' + f(p.y, 1) + '" x2="' + f(ex, 1) + '" y2="' + f(ey, 1) + '" stroke="#566a99" stroke-width="1.2"/><text x="' + f(ex + p.nx * 2, 1) + '" y="' + f(ey + 3 + p.ny * 2, 1) + '" text-anchor="' + (w.side < 0 ? "start" : "end") + '" font-size="9.5" fill="#16232e" transform="rotate(' + ang + " " + f(ex, 1) + " " + f(ey, 1) + ')">OH</text>';
        }
      }
    });
    const lx = 574, info = LIGAND_INFO[B.lig]; let y = 62;
    s += '<text x="' + lx + '" y="' + y + '" font-size="15" font-weight="700">Ligand: ' + lig + ' sites</text><text x="' + lx + '" y="' + (y + 19) + '" font-size="13">' + CATEGORY[B.lig] + '</text>';
    s += '<g transform="translate(' + lx + ' ' + (y + 52) + ')">' + ligandLocal(B.lig, { B: 4.2, labels: false, color: "#d32f2f", lw: 1.6 }) + '</g>';
    s += '<text x="' + lx + '" y="' + (y + 84) + '" font-size="12" fill="#a85a00">orange dash = bond to silica</text>';
    s += '<text x="' + lx + '" y="' + (y + 101) + '" font-size="12" fill="#566672">' + (info.exact ? "ligand drawn as its real structure" : "dashed or dotted = not published by Restek") + '</text>';
    y = 190; s += '<line x1="' + lx + '" y1="' + y + '" x2="' + (lx + 12) + '" y2="' + y + '" stroke="#4c9a63" stroke-width="2.4"/><circle cx="' + (lx + 15) + '" cy="' + y + '" r="2.8" fill="#4c9a63"/><text x="' + (lx + 34) + '" y="' + (y + 5) + '" font-size="15" font-weight="700">End-cap: ' + (B.cap ? cap + " sites" : "none") + '</text>';
    y = 232; s += '<line x1="' + lx + '" y1="' + y + '" x2="' + (lx + 10) + '" y2="' + y + '" stroke="#566a99" stroke-width="1.2"/><text x="' + (lx + 12) + '" y="' + (y + 3) + '" font-size="9.5">OH</text><text x="' + (lx + 34) + '" y="' + (y + 5) + '" font-size="15" font-weight="700">Free silanol: ' + (100 - lig - cap) + ' sites</text>';
    s += ['Carbon load ' + B.load + '% = ' + B.load + ' of 100 sites.', 'A simple way to make the % countable;', 'an estimate, not exact chemistry.'].map((t, i) => '<text x="' + lx + '" y="' + (290 + i * 18) + '" font-size="13" fill="#566672">' + t + "</text>").join("");
    return s + "</svg>";
  }

  function columnReport() {
    const l = LIG.find(x => x.id === B.lig), bead = BEADS.find(b => b[0] === B.bead)[1].replace(/ \(.\)/, ""), code = B.lig + "-" + B.bead + "-" + B.L + "x" + B.ID + "x" + B.dp;
    const sheet = sheetFor();
    const rows = [
      ["Stationary phase category", CATEGORY[B.lig]], ["Ligand type", l.note.replace(/\.$/, "")], ["Bead line", bead + " (" + B.bead + ")"],
      ["Particle", B.dp + " µm, spherical, " + (B.core === "shell" ? "core-shell" : "fully porous")], ["Pore size", B.pore + " Å"],
      ["Carbon load", B.load + "%"], ["End-cap", B.cap ? "yes" : "no"], ["Dimensions", B.L + " mm × " + B.ID + " mm"],
      ["Column volume", f(colVol()) + " mL"], ["Relative back pressure", f(relP(), 1) + "\u00d7 the lab column (150 \u00d7 4.6 mm, 5 \u00b5m), an estimate"], ["Used in file names as", code],
    ];
    const wrap = el("div", "col-report");
    wrap.append(el("h3", null, "Your column: " + l.name + " " + bead + " " + B.L + " × " + B.ID + " mm, " + B.dp + " µm"));
    const match = el("p", "note");
    if (sheet) {
      const diff = []; if (B.pore !== sheet.pore) diff.push("pore size"); if (B.load !== sheet.load) diff.push("carbon load"); if (B.cap !== sheet.cap) diff.push("end-cap"); if (B.core !== sheet.core) diff.push("particle type");
      const a = document.createElement("a"); a.href = sheet.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = sheet.name;
      match.append(document.createTextNode(diff.length ? "Based on Restek " : "Matches Restek "), a, document.createTextNode(diff.length ? ", but you changed the " + diff.join(", ") + ", so it is no longer a real catalogue column." : ". Pore size, carbon load, end-cap and particle type are the catalogue values."));
    } else match.textContent = "Restek does not list this bead line and ligand together (for example Pinnacle has no IBD, and only Ultra has IBD), so every value here is your own choice.";
    wrap.append(match);
    const top = el("div", "rep-top"), fig = el("figure"); fig.innerHTML = colSideSVG(); top.append(fig);
    const dl = el("dl", "rep-specs");
    rows.forEach(r => { dl.append(el("dt", null, r[0]), el("dd", null, r[1])); });
    if (sheet) { dl.append(el("dt", null, "Surface area"), el("dd", null, sheet.area + " m²/g (Restek)"), el("dt", null, "pH range"), el("dd", null, sheet.pH + " (Restek)"), el("dt", null, "Maximum temperature"), el("dd", null, sheet.tmax + " °C (Restek)")); }
    top.append(dl); wrap.append(top);
    { const src = ligandSource(); wrap.append(ligandCard(B.lig, src && src.url, src && src.name)); }
    const bottom = el("div", "rep-bottom"), a = el("figure"), side = el("div", "rep-side");
    a.innerHTML = siohSVG(); a.append(el("figcaption", null, "Zoom in on the surface of a bead: some of the 100 silanol sites carry the ligand."));
    const f1 = el("figure"), f2 = el("figure"); f1.innerHTML = crossSVG(); f1.append(el("figcaption", null, "Cross-section of the column: packed beads."));
    f2.innerHTML = beadSVG(); f2.append(el("figcaption", null, B.core === "shell" ? "One core-shell bead: solid core, porous shell." : "One fully porous bead: pores run through it."));
    side.append(f1, f2); bottom.append(a, side); wrap.append(bottom);
    wrap.append(el("p", "note", "Restek values are for the 5 \u00b5m, 150 \u00d7 4.6 mm catalogue item. The drawings are illustrations built from your choices, not to scale."));
    return wrap;
  }

  function buildColumn(box) {
    const bar = el("div", "step-bar"), body = el("div", "step-body"), side = el("div", "col-so-far");
    bar.setAttribute("role", "tablist");
    function option(label, desc, active, fn, extra) {
      const b = el("button", "opt" + (active ? " on" : "")); b.type = "button"; b.setAttribute("aria-pressed", active ? "true" : "false");
      if (extra) b.insertAdjacentHTML("afterbegin", extra);
      b.append(el("strong", null, label), el("span", null, desc)); b.addEventListener("click", fn); return b;
    }
    function selectBox(label, key, values, unit) {
      const w = el("div", "converter-field"), l = el("label", null, label), s = el("select");
      values.forEach(v => { const o = el("option", null, v + " " + unit); o.value = v; s.append(o); }); s.value = String(B[key]);
      s.addEventListener("change", () => { B[key] = Number(s.value); render(); }); w.append(l, s); return w;
    }
    function render() {
      bar.replaceChildren(...STEPS.map((n, i) => { const b = el("button", "step-pill" + (!finished && i === step ? " on" : "") + (finished || i < step ? " done" : ""), (i + 1) + "  " + n); b.type = "button"; b.addEventListener("click", () => { step = i; finished = false; render(); }); return b; }));
      wrap.classList.toggle("finished", finished); side.hidden = finished;
      if (finished) {
        const again = el("button", "secondary", "Change something"); again.type = "button"; again.addEventListener("click", () => { finished = false; step = 0; render(); });
        body.replaceChildren(columnReport(), again); return;
      }
      const g = el("div", "opt-grid"), name = STEPS[step]; body.replaceChildren(el("h3", null, "Step " + (step + 1) + " of 6: " + name));
      if (step === 0) LIG.forEach(l => g.append(option(l.name, l.note, B.lig === l.id, () => { B.lig = l.id; applyPreset(); render(); }, ligSVG(l))));
      if (step === 1) BEADS.forEach(b => g.append(option(b[1], b[2], B.bead === b[0], () => { B.bead = b[0]; applyPreset(); render(); })));
      if (step === 2) { [[90, "Raptor (core-shell) columns."], [100, "Ultra and Force columns."], [140, "Pinnacle DB columns: the lab column."]].forEach(p => g.append(option(p[0] + " \u00c5", p[1], B.pore === p[0], () => { B.pore = p[0]; render(); }))); body.append(el("p", "note", "Pore size decides which compounds can enter the pores of the bead. Choosing a bead line and ligand fills in the Restek pore size where Restek makes that column; the other values are typical figures for illustration.")); }
      if (step === 3) { g.append(option("Fully porous", "The whole bead is porous: more surface area, more retention.", B.core === "fully", () => { B.core = "fully"; render(); }), option("Core-shell", "Solid core with a porous shell (usually 2.7 \u00b5m or larger): narrower peaks at lower pressure.", B.core === "shell", () => { B.core = "shell"; render(); })); }
      if (step === 4) {
        const r = el("input"); r.type = "range"; r.min = 3; r.max = 20; r.step = 1; r.value = B.load; r.setAttribute("aria-label", "Carbon load in percent");
        const out = el("p", "computed-value", B.load + "% carbon load: about " + B.load + " of the 100 SiOH sites carry a ligand");
        let grid = '<svg viewBox="0 0 220 220" class="sioh">'; for (let i = 0; i < 100; i++) grid += '<circle cx="' + (12 + (i % 10) * 21) + '" cy="' + (12 + Math.floor(i / 10) * 21) + '" r="7" class="' + (i < B.load ? "on" : "") + '"/>'; grid += "</svg>";
        r.addEventListener("input", () => { B.load = Number(r.value); out.textContent = B.load + "% carbon load: about " + B.load + " of the 100 SiOH sites carry a ligand"; const c = body.querySelectorAll(".sioh circle"); c.forEach((e, i) => e.classList.toggle("on", i < B.load)); side.replaceChildren(...summary()); });
        const wrap = el("div"); wrap.innerHTML = grid; body.append(wrap.firstChild, r, out, el("p", "note", "Carbon load is the mass of carbon as a percentage of the packing's total mass. Counting 11 ligands out of 100 sites is only a simple way to make 11% countable; it is an estimate, not exact chemistry. Higher carbon load means a more hydrophobic phase and more retention."));
        const capL = el("label", "cap-check"), capI = el("input"); capI.type = "checkbox"; capI.checked = B.cap; capI.addEventListener("change", () => { B.cap = capI.checked; }); capL.append(capI, document.createTextNode(" End-capped: small groups cover some of the SiOH sites left after the ligand is bonded")); body.append(capL);
      }
      if (step === 5) {
        const row = el("div", "converter"); row.append(selectBox("Length", "L", [30, 50, 100, 150, 250], "mm"), selectBox("Internal diameter", "ID", [2.1, 3.2, 4.6], "mm"), selectBox("Particle size", "dp", [1.8, 1.9, 2.7, 3, 5], "\u00b5m")); body.append(row);
        const out = el("div", "convert-result"); out.append(el("p", "convert-headline", "Column volume " + f(colVol()) + " mL. At 1.5 mL/min one flush takes about " + f(colVol() / 1.5) + " min, so 10 flushes take about " + f(colVol() * 10 / 1.5, 0) + " min."), el("p", "note", "Back pressure is built by the column, not set. Compared with a 150 \u00d7 4.6 mm, 5 \u00b5m column at the same flow rate, this one gives about " + f(relP(), 1) + "\u00d7 the back pressure (estimate from length, diameter and particle size).")); body.append(out);
      }
      if (g.children.length) body.append(g);
      if (step === 0) { const src = ligandSource(); body.append(ligandCard(B.lig, src && src.url, src && src.name)); }
      const nav = el("div", "confirm-buttons"), back = el("button", "secondary", "Back"), next = el("button", null, step === 5 ? "Done" : "Next");
      back.type = next.type = "button"; back.disabled = step === 0; back.addEventListener("click", () => { step--; render(); }); next.addEventListener("click", () => { if (step === 5) finished = true; else step++; render(); }); nav.append(back, next); body.append(nav);
      side.replaceChildren(...summary());
    }
    function summary() {
      const l = LIG.find(x => x.id === B.lig), h = el("h3", null, "Column so far");
      const t = el("p", "computed-value", l.name + " " + (BEADS.find(b => b[0] === B.bead)[1].split(" ")[0]) + "  " + B.L + " \u00d7 " + B.ID + " mm, " + B.dp + " \u00b5m");
      const d = el("p", "note", (B.core === "shell" ? "Core-shell" : "Fully porous") + ", " + B.pore + " \u00c5, " + B.load + "% carbon load. Used in file names as " + B.lig + "-" + B.bead + "-" + B.L + "x" + B.ID + "x" + B.dp + ".");
      const fig = el("div"); fig.innerHTML = ligSVG(l); return [h, fig.firstChild, t, d];
    }
    const wrap = el("div", "builder"); wrap.append(body, side); box.append(bar, wrap); render();
  }

  const c = document.getElementById("chromatogram-lab"), b = document.getElementById("column-builder");
  if (c) buildChromatogram(c); if (b) buildColumn(b);
})();

// Steps along the top of the Equipment tab.
(function () {
  const buttons = document.querySelectorAll(".eq-sub-button");
  function show(name) {
    buttons.forEach(function (b) {
      const on = b.dataset.eqSub === name;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-eq-panel]").forEach(function (s) {
      s.hidden = s.dataset.eqPanel !== name;
    });
  }
  buttons.forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.eqSub); }); });
  show("instrument");
})();
