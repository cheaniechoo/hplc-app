// mindmap.js: the whole method-development flow chart as one zoomable map (Flow chart guide → Mind map),
// laid out like the course's RET-SEL-N-GRA flow chart: isocratic on the left (retention, selectivity,
// then efficiency once all 7 peaks are there) and gradient on the right. Click a shape for what it means;
// the steps your current runs are at are ringed.
(function () {
  const host = document.getElementById("mindmap");
  if (!host) return;
  const NS = "http://www.w3.org/2000/svg";
  const W = 2860, H = 1440;

  // [id, shape, x, y, w, h, text, extra]
  const N = [];
  const add = function (id, shape, x, y, w, h, text, extra) { N.push(Object.assign({ id: id, shape: shape, x: x, y: y, w: w, h: h, text: text }, extra || {})); };

  // ---- top ----
  add("root", "root", 1270, 46, 360, 44, "HPLC METHOD DEVELOPMENT");

  // ---- isocratic: retention ----
  add("ret", "box", 150, 126, 140, 48, "RETENTION\nFACTOR K");
  add("pol", "diamond", 300, 126, 130, 60, "POLARITY\nof the last peak");
  const pcts = ["100%", "90%", "80%", "70%", "60%", "50%", "40%", "30%"];
  pcts.forEach(function (p, i) { add("p" + i, "chev", 180, 190 + i * 38, 110, 30, p); });
  add("minb", "chev", 180, 494, 110, 30, "Min %B", { observe: true });
  add("intb", "chev", 180, 534, 130, 30, "Intermediate %B");
  add("c1", "cloud", 150, 598, 124, 50, "#Pks < spec");
  // ---- selectivity ----
  add("sel", "box", 150, 660, 140, 46, "SELECTIVITY");
  add("abd", "diamond", 300, 660, 120, 56, "ABD\nspacing");
  // Each block: (solvent) -> 40 °C -> 60 °C -> other °C -> #Pks < spec, stacked with clear gaps.
  const ladder = [["t", "ACN"], ["s", "Solvent: MeOH"], ["m", "Solvent: MIX"]];
  let y = 722;
  ladder.forEach(function (L, k) {
    if (k > 0) { add(L[0] + "0", "chev", 180, y, 140, 30, L[1]); y += 40; }
    add(L[0] + "40", "chev", 180, y, 110, 30, "40 °C");
    add(L[0] + "60", "chev", 180, y + 38, 110, 30, "60 °C", { observe: true });
    add(L[0] + "ot", "chev", 180, y + 76, 110, 30, "other °C", { faded: true });
    add(L[0] + "b1", "tag", 335, y + 19, 50, 22, "%B");
    add(L[0] + "b2", "tag", 335, y + 57, 50, 22, "%B");
    add("c" + (k + 2), "cloud", 150, y + 136, 124, 50, "#Pks < spec");
    y += 136 + 66;
  });
  add("lig", "tall", 46, 1190, 46, 170, "Ligand");

  // ---- isocratic: all 7 peaks -> efficiency ----
  add("pk7", "cloud", 600, 712, 170, 84, "#Pks = spec");
  add("effhead", "box", 1060, 470, 210, 84, "Fine-tune: EFFICIENCY (N)\ninc Rs if < spec\nor dec tR if Rs > spec", { small: true });
  add("effdia", "diamond", 1290, 470, 190, 76, "Dec W, or shrink /\nexpand proportionally");
  const trs = [["trA", 610, "tR << spec"], ["trB", 770, "tR < spec"], ["trC", 930, "tR > spec"]];
  const rr = ["Rs << spec (below floor)", "floor < Rs < spec", "Rs > spec"];
  trs.forEach(function (t, i) {
    add(t[0], "cloud", 850, t[1], 130, 52, t[2]);
    rr.forEach(function (r, j) { add(t[0] + "r" + j, "rbox", 1020, t[1] - 46 + j * 46, 160, 32, r); add("case" + (i * 3 + j + 1), "num", 1112, t[1] - 46 + j * 46, 22, 22, String(i * 3 + j + 1)); });
  });
  // actions, one row per case: [case, items]  item = [shape, text, bp] or "OR"/"AND"
  const ACT = {
    1: [["chev", "Inc L", 1]],
    2: [["chev", "Inc L", 1], "OR", ["chev", "Dec F"], "OR", ["chev", "Dec PS", 1], "OR", ["chev", "SPP"]],
    3: [["star", "MET"], "AND", ["chev", "Inc F to\nshorten run"]],
    4: [["box", "SELECTIVITY"]],
    5: [["chev", "Dec F"], "OR", ["chev", "Dec PS", 1], "OR", ["chev", "SPP"]],
    6: [["star", "MET"], "AND", ["chev", "Inc F to\nshorten run"]],
    7: [["box", "SELECTIVITY"]],
    8: [["chev", "Dec PS", 1], "OR", ["chev", "SPP"], "AND", ["chev", "Inc F to\nshorten run"]],
    9: [["chev", "Inc F to\nshorten run"]],
  };
  Object.keys(ACT).forEach(function (c) {
    const n = Number(c), y = trs[Math.floor((n - 1) / 3)][1] - 46 + ((n - 1) % 3) * 46;
    let x = 1190;
    ACT[c].forEach(function (it, k) {
      if (typeof it === "string") { add("e" + c + "w" + k, "word", x + 6, y, 36, 20, it); x += 44; return; }
      const w = it[0] === "star" ? 60 : it[0] === "box" ? 130 : 110;
      add(k === 0 ? "e" + c : "e" + c + "_" + k, it[0], x + w / 2, y, w, it[0] === "star" ? 40 : 32, it[1], { bp: !!it[2], caseNo: n });
      x += w + 12;
    });
  });

  // ---- gradient ----
  add("grad", "box", 2060, 206, 140, 46, "GRADIENT");
  add("scout", "chev", 2060, 288, 270, 44, "Scouting gradient\n5–100 %B in 20 (to 60) min");
  add("gup", "chev", 2080, 356, 180, 40, "Inc GS\ntG (or F) × 0.5", { g: "G1 ↑" });
  add("gdown", "chev", 2080, 418, 180, 40, "Dec GS\ntG × 1.2 (or F × 1.2)", { g: "G1 ↓" });
  add("gdphi", "chev", 2080, 480, 180, 40, "Inc GS\nby inc Δφ");
  add("gless", "cloud", 1900, 410, 136, 60, "#Pks < spec\nchange GS");
  add("gchange", "tall", 1790, 420, 48, 210, "Change temp – solvent – ligand", { g: "G1 ✕", vertical: true });
  add("gk", "cloud", 2310, 430, 140, 60, "#Pks = spec\nkeep GS cst");
  add("gkd", "diamond", 2450, 430, 120, 64, "KEEP\nGS CST");
  add("glt", "cloud", 2555, 330, 140, 64, "Rs < 1.4\nexpand tG\nwhile GS cst", { g: "G2" });
  add("g2", "chev", 2745, 330, 180, 48, "dec F × 0.8\n+ tG ÷ 0.8 → GS cst");
  add("gge", "cloud", 2555, 540, 140, 60, "Rs ≥ 1.4\nshrink both ends", { g: "G3" });
  add("gfinal", "chev", 2745, 540, 210, 92, "Final run:\n%B ini = %B 1st peak − 20\n%B fin = %B last peak + 5\nGS cst", { g: "G3 → G4", small: true });

  const byId = {}; N.forEach(function (n) { byId[n.id] = n; });

  // ---- edges: [from, to, kind, how] kind: red (next step) | green (all peaks there) ; how: v | h | c (curve) | path fn ----
  const E = [];
  const e = function (a, b, kind, how) { E.push({ a: a, b: b, kind: kind || "red", how: how || "c" }); };
  e("ret", "p0", "red", "v");
  for (let i = 0; i < pcts.length - 1; i++) e("p" + i, "p" + (i + 1), "red", "v");
  e("p7", "minb", "red", "v"); e("minb", "intb", "red", "v"); e("intb", "c1", "red", "v"); e("c1", "sel", "red", "v");
  e("ret", "pol", "red", "h"); e("sel", "abd", "red", "h");
  e("sel", "t40", "red", "v"); e("t40", "t60", "red", "v"); e("t60", "tot", "red", "v"); e("tot", "c2", "red", "v");
  e("c2", "s0", "red", "v"); e("s0", "s40", "red", "v"); e("s40", "s60", "red", "v"); e("s60", "sot", "red", "v"); e("sot", "c3", "red", "v");
  e("c3", "m0", "red", "v"); e("m0", "m40", "red", "v"); e("m40", "m60", "red", "v"); e("m60", "mot", "red", "v"); e("mot", "c4", "red", "v");
  e("c4", "lig", "red", "toLig"); e("lig", "ret", "red", "up");
  ["p2", "p3", "p4", "p5", "p6", "p7", "minb", "intb", "t40", "t60", "tot", "s0", "s40", "s60", "sot", "m0", "m40", "m60", "mot"].forEach(function (id) { e(id, "pk7", "green", "c"); });
  ["trA", "trB", "trC"].forEach(function (t) { e("pk7", t, "red", "c"); [0, 1, 2].forEach(function (j) { e(t, t + "r" + j, "red", "c"); }); });
  for (let c = 1; c <= 9; c++) { const t = ["trA", "trB", "trC"][Math.floor((c - 1) / 3)] + "r" + ((c - 1) % 3); e(t, "e" + c, "red", "h"); }
  e("root", "ret", "grey", "rootL"); e("root", "grad", "red", "rootR");
  e("grad", "scout", "red", "v"); e("scout", "gup", "red", "v"); e("gup", "gdown", "red", "v"); e("gdown", "gdphi", "red", "v");
  e("gdphi", "gchange", "red", "loopB"); e("gchange", "grad", "red", "loopT");
  ["scout", "gup", "gdown", "gdphi"].forEach(function (id) { e(id, "gk", "green", "c"); });
  e("gk", "gkd", "green", "h"); e("gkd", "glt", "red", "c"); e("gkd", "gge", "red", "c"); e("glt", "g2", "green", "h"); e("g2", "gge", "green", "loopR"); e("gge", "gfinal", "green", "h");

  // ---- what each shape means (click) ----
  const INFO = {
    root: ["HPLC method development", "Two separate entries: isocratic (left) and gradient (right). Each has its own dashboard, specification and decisions in this app."],
    ret: ["Retention (k)", "Start at a high %B and come down 10 points at a time until all compounds are retained and the last peak is near the tR spec. Each 10 points of %B roughly doubles tR (the 3× rule)."],
    pol: ["Polarity of the last peak", "The most hydrophobic compound elutes last; it sets the run time, so tR of the last peak is what is checked against the spec."],
    minb: ["Min %B", "The %B that puts the last peak exactly at the tR spec, from the log k vs %B fit (or estimated from one run). Observe the chromatogram here."],
    intb: ["Intermediate %B", "A %B between the last run and Min %B, when a full 10-point step would push tR past the spec."],
    c1: ["#Pks < spec", "Fewer peaks than the target (spec) with no retention left to use: compounds co-elute, so the spacing (selectivity) must change."],
    c2: ["#Pks < spec", "The temperature ladder didn't separate them: change the solvent."], c3: ["#Pks < spec", "Still fewer peaks than the target: try the mixed solvent."], c4: ["#Pks < spec", "Temperature and solvent changes didn't work: change the ligand and start retention again."],
    sel: ["Selectivity", "Change the chemistry of the interactions: temperature first (only the oven), then solvent, then ligand."],
    abd: ["ABD: spacing", "Selectivity changes the spacing (α) between peaks; efficiency only narrows them."],
    lig: ["Change the ligand", "A new stationary phase: go back to retention (%B) on the new column."],
    pk7: ["#Pks = spec", "All compounds are separated into peaks: from here the method is fine-tuned with efficiency (column and flow), using tR and Rs against the specs and the Rs floor."],
    effhead: ["Efficiency (N)", "Raise Rs with more plates (longer column, smaller particles, core-shell, lower F) or shorten the run when Rs has room. Rs grows with √N; the Rs floor says if it can still reach spec."],
    effdia: ["Peak width", "Efficiency narrows peaks (lower W) without moving them; tR and BP scale with L, F and 1/PS²."],
    trA: ["tR << spec", "The last peak is at most half the tR spec (editable in Efficiency settings): lots of time to spend on plates."],
    trB: ["tR < spec", "Some time left, but not enough for a longer column."], trC: ["tR > spec", "Over the run-time spec: the flow has to go up (after a smaller particle size if Rs needs it)."],
    grad: ["Gradient", "%B ramps up during the run. Gradient steepness GS = Δφ·Vm/(tG·F) sets the spacing; keep GS constant to keep selectivity."],
    scout: ["Scouting gradient", "5–100 %B in 20 min (up to 60). The first run of every new chemistry (temperature, solvent or ligand)."],
    gup: ["G1 ↑ Increase GS", "Fewer peaks than the target: same %B window, tG × 0.5 (steeper)."], gdown: ["G1 ↓ Decrease GS", "Still fewer than the target after G1 ↑: back to the scouting run, tG × 1.2 (shallower)."],
    gdphi: ["Increase GS by Δφ", "The last GS lever: a wider %B window."], gless: ["#Pks < spec: change GS", "Peaks are missing, so the spacing must change: change GS (tG or F first, Δφ last)."],
    gchange: ["G1 ✕ Change selectivity", "GS changes did not separate them: change temperature, then solvent, then ligand, and start again from a scouting gradient."],
    gk: ["#Pks = spec: keep GS constant", "All peaks there: GS now stays constant so the spacing stays."], gkd: ["Keep GS constant", "Any change of tG is matched by F (or the %B window) so GS doesn't move."],
    glt: ["G2 Rs < 1.4", "Stretch the chromatogram at constant GS: F × 0.8 and tG ÷ 0.8. Rs grows about as 1/√F."], g2: ["G2 conditions", "dec F × 0.8 + inc tG ÷ 0.8: GS stays the same."],
    gge: ["G3 Rs ≥ 1.4", "Trim the unused %B at both ends and cut tG in proportion (GS constant)."],
    gfinal: ["Final run (G3 → G4)", "%B ini = %B at the first peak − 20, %B fin = %B at the last peak + 5, tG cut in proportion. When all peaks, Rs and tR meet spec: method met, lock it (G4)."],
  };
  for (let c = 1; c <= 9; c++) {
    const r = ["Rs below the floor", "floor < Rs < spec", "Rs > spec"][(c - 1) % 3], t = ["tR << spec", "tR < spec", "tR > spec"][Math.floor((c - 1) / 3)];
    INFO["e" + c] = INFO["case" + c] = ["Efficiency case " + c + " of 9", t + ", " + r + ". " + ({ 1: "Increase L (watch BP).", 2: "Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP.", 3: "MET. Optionally increase F to shorten the run.", 4: "SELECTIVITY: no column or flow can reach the spec.", 5: "Decrease F OR decrease PS (BP) OR SPP.", 6: "MET. Optionally increase F to shorten the run.", 7: "SELECTIVITY.", 8: "Decrease PS (BP), then increase F to shorten the run.", 9: "Increase F to shorten the run." })[c] + " The app shows the next run and the most optimal column and flow for this case."];
  }
  ["t", "s", "m"].forEach(function (k) {
    INFO[k + "40"] = ["40 °C", "Raise the temperature: retention drops (about 1.5% per °C) and the spacing can change. Re-adjust %B if tR moves too far."];
    INFO[k + "60"] = ["60 °C", "The last temperature step (oven limit). Observe: compare the runs at the three temperatures."];
    INFO[k + "ot"] = ["Other temperature", "Optional: an in-between temperature if the trend suggests one."];
  });
  INFO.s0 = ["Solvent: MeOH", "Switch solvent B to methanol (back to ambient). Use the nomogram for the isoeluotropic %B."];
  INFO.m0 = ["Solvent: MIX", "ACN:MeOH mixed solvent (50:50 by default), at the isoeluotropic %B."];

  // ---- draw ----
  const el = function (tag, attrs, parent) { const n = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); }); if (parent) parent.appendChild(n); return n; };
  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "mm-svg", role: "img", "aria-label": "Method development flow chart as a mind map" });
  const defs = el("defs", {}, svg);
  [["red", "#a3141c"], ["green", "#2e9a2e"], ["grey", "#7a8790"]].forEach(function (m) {
    const mk = el("marker", { id: "mm-arr-" + m[0], viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    el("path", { d: "M0 0 L10 5 L0 10 z", fill: m[1] }, mk);
  });
  const view = el("g", { class: "mm-view" }, svg);
  // section bands
  [[20, 80, 360, 1345, "ISOCRATIC · retention → selectivity"], [450, 380, 1290, 640, "ISOCRATIC · efficiency (all peaks there)"], [1730, 150, 1110, 520, "GRADIENT"]].forEach(function (b) {
    el("rect", { x: b[0], y: b[1], width: b[2], height: b[3], rx: 18, class: "mm-band" }, view);
    const t = el("text", { x: b[0] + 16, y: b[1] + b[3] - 14, class: "mm-band-label" }, view); t.textContent = b[4];
  });
  const edgesG = el("g", {}, view), nodesG = el("g", {}, view);

  const L = function (n) { return n.x - n.w / 2; }, R = function (n) { return n.x + n.w / 2; }, T = function (n) { return n.y - n.h / 2; }, B = function (n) { return n.y + n.h / 2; };
  E.forEach(function (ed) {
    const a = byId[ed.a], b = byId[ed.b];
    if (!a || !b) return;
    let d;
    if (ed.how === "v") d = "M" + a.x + " " + B(a) + " L" + b.x + " " + (T(b) - 2);
    else if (ed.how === "h") d = "M" + R(a) + " " + a.y + " L" + (L(b) - 2) + " " + b.y;
    else if (ed.how === "toLig") d = "M" + L(a) + " " + a.y + " L" + b.x + " " + a.y + " L" + b.x + " " + (B(b) + 2);
    else if (ed.how === "up") d = "M" + a.x + " " + T(a) + " L" + a.x + " " + b.y + " L" + (L(b) - 2) + " " + b.y;
    else if (ed.how === "rootL") d = "M" + L(a) + " " + a.y + " L" + b.x + " " + a.y + " L" + b.x + " " + (T(b) - 2);
    else if (ed.how === "rootR") d = "M" + R(a) + " " + a.y + " L" + b.x + " " + a.y + " L" + b.x + " " + (T(b) - 2);
    else if (ed.how === "loopB") d = "M" + a.x + " " + B(a) + " L" + a.x + " " + (B(a) + 40) + " L" + b.x + " " + (B(a) + 40) + " L" + b.x + " " + (B(b) + 2);
    else if (ed.how === "loopT") d = "M" + b.x + " " + T(a) + " C" + b.x + " " + (b.y - 10) + " " + (b.x - 200) + " " + (b.y) + " " + (L(b) - 2) + " " + b.y;
    else if (ed.how === "loopR") d = "M" + R(a) + " " + a.y + " L" + (R(a) + 30) + " " + a.y + " L" + (R(a) + 30) + " " + (b.y - 70) + " L" + b.x + " " + (b.y - 70) + " L" + b.x + " " + (T(b) - 2);
    else {
      const x1 = R(a), y1 = a.y, x2 = L(b) - 2, y2 = b.y, mx = (x1 + x2) / 2;
      d = "M" + x1 + " " + y1 + " C" + mx + " " + y1 + " " + mx + " " + y2 + " " + x2 + " " + y2;
    }
    if (ed.how === "loopT") d = "M" + a.x + " " + T(a) + " C" + a.x + " " + (b.y - 30) + " " + (a.x + 40) + " " + b.y + " " + (L(b) - 2) + " " + b.y;
    el("path", { d: d, class: "mm-edge mm-" + ed.kind, "marker-end": "url(#mm-arr-" + ed.kind + ")" }, edgesG);
  });

  function text(g, n, cls) {
    const lines = n.text.split("\n");
    const fs = n.small ? 11 : n.shape === "tag" || n.shape === "num" ? 11 : n.shape === "word" ? 12 : 12.5;
    if (n.vertical) {
      const t = el("text", { x: n.x, y: n.y, class: "mm-text " + (cls || ""), "text-anchor": "middle", "font-size": 12, transform: "rotate(-90 " + n.x + " " + n.y + ")", "dominant-baseline": "middle" }, g);
      t.textContent = n.text; return;
    }
    const lh = fs * 1.22, y0 = n.y - (lines.length - 1) * lh / 2;
    lines.forEach(function (ln, i) {
      const t = el("text", { x: n.x, y: y0 + i * lh, class: "mm-text " + (cls || ""), "text-anchor": "middle", "dominant-baseline": "middle", "font-size": fs }, g);
      t.textContent = ln;
    });
  }
  function cloudShape(g, n) {
    const rx = n.w / 2, ry = n.h / 2, k = 9, pts = [];
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; pts.push([n.x + Math.cos(a) * rx * 0.78, n.y + Math.sin(a) * ry * 0.72]); }
    const r = Math.min(rx, ry) * 0.48;
    pts.forEach(function (p) { el("circle", { cx: p[0], cy: p[1], r: r, class: "mm-cloud-o" }, g); });
    pts.forEach(function (p) { el("circle", { cx: p[0], cy: p[1], r: r - 1.6, class: "mm-cloud-i" }, g); });
    el("ellipse", { cx: n.x, cy: n.y, rx: rx * 0.78, ry: ry * 0.72, class: "mm-cloud-i" }, g);
  }
  N.forEach(function (n) {
    const g = el("g", { class: "mm-node mm-" + n.shape + (n.faded ? " mm-faded" : ""), "data-id": n.id, tabindex: n.shape === "word" ? -1 : 0 }, nodesG);
    const x = L(n), y = T(n), w = n.w, h = n.h;
    if (n.shape === "box" || n.shape === "rbox") el("rect", { x: x, y: y, width: w, height: h, rx: 8, class: "mm-shape" }, g);
    else if (n.shape === "root") { el("rect", { x: x, y: y, width: w, height: h, class: "mm-shape" }, g); el("line", { x1: x + 22, x2: x + 22, y1: y, y2: y + h, class: "mm-root-line" }, g); el("line", { x1: x + w - 22, x2: x + w - 22, y1: y, y2: y + h, class: "mm-root-line" }, g); }
    else if (n.shape === "chev" || n.shape === "tag") { const p = Math.min(14, h / 2); el("polygon", { points: [x, y, x + w - p, y, x + w, y + h / 2, x + w - p, y + h, x, y + h, x + p, y + h / 2].join(" "), class: "mm-shape", "stroke-linejoin": "round" }, g); }
    else if (n.shape === "diamond") el("polygon", { points: [n.x, y, x + w, n.y, n.x, y + h, x, n.y].join(" "), class: "mm-shape", "stroke-linejoin": "round" }, g);
    else if (n.shape === "cloud") cloudShape(g, n);
    else if (n.shape === "tall") el("path", { d: "M" + x + " " + (y + 14) + " Q" + n.x + " " + (y - 10) + " " + (x + w) + " " + (y + 14) + " L" + (x + w) + " " + (y + h) + " L" + n.x + " " + (y + h - 14) + " L" + x + " " + (y + h) + " Z", class: "mm-shape" }, g);
    else if (n.shape === "star") { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? h * 0.26 : h * 0.62; pts.push(n.x + Math.cos(a) * r * 1.1, n.y + Math.sin(a) * r); } el("polygon", { points: pts.join(" "), class: "mm-shape" }, g); }
    else if (n.shape === "num") el("circle", { cx: n.x, cy: n.y, r: 11, class: "mm-shape" }, g);
    if (n.shape === "num") { const t = el("text", { x: n.x, y: n.y + 0.5, class: "mm-text", "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 11 }, g); t.textContent = n.text; }
    else text(g, n);
    if (n.bp) { el("circle", { cx: x + w - 6, cy: y - 2, r: 11, class: "mm-bp" }, g); const t = el("text", { x: x + w - 6, y: y - 1.5, class: "mm-bp-t", "text-anchor": "middle", "dominant-baseline": "middle" }, g); t.textContent = "BP"; }
    if (n.observe) { const t = el("text", { x: x + w + 24, y: n.y + 4, class: "mm-observe", "text-anchor": "middle" }, g); t.textContent = "👁 observe"; }
    if (n.g) { const t = el("text", { x: n.shape === "tall" ? n.x : x + w - 4, y: n.shape === "tall" ? y - 14 : y - 6, class: "mm-gtag", "text-anchor": n.shape === "tall" ? "middle" : "end" }, g); t.textContent = n.g; }
    if (n.shape !== "word") {
      g.addEventListener("click", function (ev) { ev.stopPropagation(); select(n.id); });
      g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(n.id); } });
    }
  });

  // ---- info panel, legend, controls ----
  const wrap = document.createElement("div"); wrap.className = "mm-canvas";
  wrap.appendChild(svg);
  const controls = document.createElement("div"); controls.className = "mm-controls";
  [["+", "Zoom in", function () { zoomAt(1.25); }], ["−", "Zoom out", function () { zoomAt(0.8); }], ["Fit", "Show the whole map", fit], ["Retention & selectivity", "Zoom to the isocratic retention and selectivity steps", function () { zoomTo(0, 80, 1000, 560); }], ["Efficiency", "Zoom to efficiency", function () { zoomTo(440, 370, 1320, 660); }], ["Gradient", "Zoom to gradient", function () { zoomTo(1720, 140, 1130, 540); }]].forEach(function (b) {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "secondary mm-btn"; btn.textContent = b[0]; btn.title = b[1]; btn.addEventListener("click", b[2]); controls.appendChild(btn);
  });
  const info = document.createElement("div"); info.className = "mm-info"; info.setAttribute("aria-live", "polite");
  info.innerHTML = "<strong>Click any shape</strong> to see what it means. Drag to move, scroll or use the buttons to zoom. Ringed shapes are where your loaded runs are now.";
  const legend = document.createElement("div"); legend.className = "mm-legend";
  legend.innerHTML = '<span><i class="lg lg-box"></i>Stage</span><span><i class="lg lg-chev"></i>Step / action</span><span><i class="lg lg-cloud"></i>Result of the run</span><span><i class="lg lg-dia"></i>What it changes</span><span><i class="lg lg-red"></i>Next step</span><span><i class="lg lg-green"></i>All peaks there → fine-tune</span><span><i class="lg lg-bp"></i>BP: watch the back pressure</span><span><i class="lg lg-here"></i>Your runs are here</span>';
  host.replaceChildren(controls, wrap, info, legend);

  function select(id) {
    nodesG.querySelectorAll(".mm-sel").forEach(function (x) { x.classList.remove("mm-sel"); });
    const g = nodesG.querySelector('[data-id="' + id + '"]'); if (g) g.classList.add("mm-sel");
    const i = INFO[id] || INFO[id.replace(/_\d+$/, "")] || [byId[id].text.replace(/\n/g, " "), "A step of the flow chart."];
    info.replaceChildren();
    const h = document.createElement("strong"); h.textContent = i[0]; info.appendChild(h);
    const p = document.createElement("p"); p.textContent = i[1]; info.appendChild(p);
  }

  // ---- pan and zoom (viewBox) ----
  let vb = { x: 0, y: 0, w: W, h: H };
  const apply = function () { svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h); };
  function fit() { vb = { x: 0, y: 0, w: W, h: H }; apply(); }
  function zoomTo(x, y, w, h) { const ar = W / H; if (w / h > ar) { const nh = w / ar; y -= (nh - h) / 2; h = nh; } else { const nw = h * ar; x -= (nw - w) / 2; w = nw; } vb = { x: x, y: y, w: w, h: h }; apply(); }
  function zoomAt(f, cx, cy) {
    const px = cx === undefined ? vb.x + vb.w / 2 : cx, py = cy === undefined ? vb.y + vb.h / 2 : cy;
    const nw = Math.min(Math.max(vb.w / f, 300), W * 1.5), nh = nw * H / W;
    vb = { x: px - (px - vb.x) * nw / vb.w, y: py - (py - vb.y) * nh / vb.h, w: nw, h: nh }; apply();
  }
  const toSvg = function (ev) { const r = svg.getBoundingClientRect(); return { x: vb.x + (ev.clientX - r.left) / r.width * vb.w, y: vb.y + (ev.clientY - r.top) / r.height * vb.h }; };
  svg.addEventListener("wheel", function (ev) { ev.preventDefault(); const p = toSvg(ev); zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", function (ev) { if (ev.target.closest(".mm-node")) return; drag = { x: ev.clientX, y: ev.clientY, vb: Object.assign({}, vb) }; svg.setPointerCapture(ev.pointerId); svg.classList.add("dragging"); });
  svg.addEventListener("pointermove", function (ev) { if (!drag) return; const r = svg.getBoundingClientRect(); vb.x = drag.vb.x - (ev.clientX - drag.x) / r.width * vb.w; vb.y = drag.vb.y - (ev.clientY - drag.y) / r.height * vb.h; apply(); });
  const end = function () { drag = null; svg.classList.remove("dragging"); };
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);

  // ---- where are the loaded runs? ----
  function here() {
    nodesG.querySelectorAll(".mm-here").forEach(function (x) { x.classList.remove("mm-here"); });
    const ring = function (id) { const g = nodesG.querySelector('[data-id="' + id + '"]'); if (g) g.classList.add("mm-here"); };
    try {
      const o = typeof summaryOutcome !== "undefined" ? summaryOutcome : null;
      if (o) {
        const st = String(o.stage || "");
        if (o.efficiency && o.efficiency.caseNumber) { ring("e" + o.efficiency.caseNumber); ring("case" + o.efficiency.caseNumber); }
        else if (/^Retention/.test(st) && !/Selectivity/.test(st)) ring(/Min|Intermediate/i.test(o.action || "") ? "minb" : "ret");
        else if (/Selectivity/.test(st)) { const a = String(o.action || "") + " " + String((o.selectivity && o.selectivity.action) || ""); const sv = /MeOH/.test(a) ? "s" : /MIX|mixed/i.test(a) ? "m" : "t"; ring(/ligand/i.test(a) ? "lig" : /60/.test(a) ? sv + "60" : /40/.test(a) ? sv + "40" : sv === "t" ? "sel" : sv + "0"); }
        else if (/Complete/.test(st)) ring("pk7");
      }
    } catch (err) { /* no isocratic run */ }
    try {
      const r = window.gradientApp && window.gradientApp.current();
      const id = r && r.decision ? ({ G1up: "gup", G1down: "gdown", G1x: "gchange", G2: "glt", G2stop: "gchange", G3: "gge", G3fast: "gge", G4: "gfinal" })[r.decision.caseId] : null;
      if (id) ring(id);
    } catch (err) { /* no gradient run */ }
  }
  window.mindMap = { refresh: here, select: select };
  document.querySelectorAll('.fsub-button[data-fsub="mindmap"], #tab-guide').forEach(function (b) { b.addEventListener("click", function () { setTimeout(here, 0); }); });
  here();
})();
