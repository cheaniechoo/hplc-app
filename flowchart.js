// flowchart.js: the "Flow chart guide" tab.
//   1. An interactive flow chart (isocratic and gradient). Click a box to read about it;
//      the box the current run sits in is marked "You are here".
//   2. Every stage explained: what it does, how the app decides, the equations.
//   3. The case tables (efficiency 1-9, gradient G1-G4) with the current case marked.
//   4. A formula sheet and a glossary.
// Edit the text in STAGES, FORMULAS and GLOSSARY below; the page is built from them.
(function () {
  const STAGES = {
    // ---------- Isocratic ----------
    "iso-start": {
      lane: "iso", title: "Start: isocratic method",
      short: "%B stays constant through each run.",
      what: "In an isocratic method the mobile phase composition (%B) stays the same for the whole run. Method development changes one family of parameters at a time, in the order of the resolution equation: retention factor K first (%B), selectivity α second (temperature, solvent, ligand), efficiency N last (column and flow).",
      decides: [
        "Load one export per run (.csv or Excel). Conditions are read from the file name.",
        "Every run is judged with the runs before it, in run-number order, so the answer doesn't depend on upload order.",
      ],
      eq: ["Rs = ¼ √N × (α − 1)/α × k/(k + 1)"],
    },
    equip: {
      lane: "iso", title: "Equipment and safety",
      short: "Column, mobile phase, back pressure first.",
      what: "The column (ligand, bead line, pore size, carbon load, length × ID × particle size) and mobile phase (solvent B, pH) set what the separation can do. Before any decision, the run's back pressure is checked, because over-pressure is a safety hazard.",
      decides: [
        "Back pressure: the highest pump pressure in the file (raw trace × Intensity Multiplier) is compared with your limit. At or over the limit the run stops: no decision is given.",
        "No pressure trace in the file: the check is marked “couldn't check” and the run continues.",
        "Small integration blips under the area threshold (default 1% of total peak area) are removed and listed, and Rs is recalculated next to them.",
        "If the Sample Name inside the file doesn't match the file name, you are warned to check the file.",
      ],
      eq: ["BP (psi) = raw pressure × Intensity Multiplier"],
    },
    ret: {
      lane: "iso", title: "Retention (K): %B",
      short: "−10 %B steps while tR ≪ spec.",
      what: "%B controls how long every compound is retained. Lowering %B moves all peaks later and spreads them apart, which can reveal peaks hiding under others. A 10-point drop in %B roughly doubles the last peak's tR.",
      decides: [
        "Fewer peaks than the target and tR ≤ half the spec (tR ≪ spec): drop %B by 10 and run again. If several steps fit inside the spec they are listed, with −10 as the main one.",
        "Fewer peaks and tR < spec (but over half): run Min %B (the %B that puts the last peak on the spec) and an intermediate %B, then compare.",
        "Fewer peaks and tR > spec: go back to the previous %B and move to selectivity, or try the intermediate %B that puts the last peak on the spec.",
        "Min %B comes from a straight-line fit of log k against %B once there are 4 retention runs; before that it is estimated from one run with the 10-points-doubles-tR rule.",
        "Retention is finished once %B reaches Min %B with peaks still missing.",
      ],
      eq: ["k = (tR − t0) / t0", "log k = a + b × %B (straight line)", "Min %B (one run) = %B − 10 × log₂(tR spec / tR)"],
    },
    sel: {
      lane: "iso", title: "Selectivity (α)",
      short: "Temperature, then solvent, then ligand.",
      what: "Selectivity changes the spacing between peaks, and can change their order, by changing the chemistry of the interactions. It is what separates two compounds that co-elute.",
      decides: [
        "Temperature ladder on the current solvent: ambient → 40 °C → 60 °C, then an Observe step (compare the chromatograms: a human judgement).",
        "Solvent: switch from ACN to MeOH at the isoeluotropic %B (from the nomogram), then to the mixed solvent, each through the temperatures again.",
        "Ligand: when temperature and solvents are exhausted, change the stationary phase (C18, C8, C18aq, BiPH, IBD, PFP) and start again.",
        "Higher temperature also shortens tR (about 1.5% per °C), which the app uses to predict the next run.",
      ],
      eq: ["α = k₂ / k₁", "tR at a new temperature ≈ tR × (1 − 0.015 × ΔT)"],
    },
    peaks: {
      lane: "iso", title: "All peaks found?", decision: true,
      short: "Peaks = target?",
      what: "The decision point between the chemistry (retention, selectivity) and efficiency. Efficiency narrows peaks but cannot make co-eluting peaks appear, so it is only used once every compound is visible.",
      decides: [
        "Fewer peaks than the target: Rs is 0 (peaks co-elute); stay in retention or selectivity.",
        "More peaks than the target: check the integration (noise) or purge for carry-over.",
        "Exactly the target: go to efficiency.",
      ],
      eq: [],
    },
    eff: {
      lane: "iso", title: "Efficiency (N)",
      short: "9 cases: column and flow.",
      what: "Efficiency changes peak width, not peak position or order. With the chemistry frozen (solvent, %B, pH, temperature stay), the levers are column length L, particle size PS, bead type (fully porous or core-shell SPP), flow F and internal diameter ID. Rs grows only with √N, so efficiency closes small gaps.",
      decides: [
        "The run is placed in one of 9 cases by its tR (≪, <, > spec) and its Rs (below the floor, between floor and spec, above spec).",
        "The Rs floor is the lowest Rs that column and flow changes can still bring to spec within the tR and BP limits (Awesome Calculator). It moves with the specs. The SPP floor is used when your column list has a core-shell column with this ligand.",
        "Below the floor, or no column meeting all three specs in case 1: back to selectivity.",
        "Otherwise every column in your list (same ligand) is tried at its best flow, and the best one allowed by the case is recommended, with predicted tR, BP and Rs. Other options are ranked underneath.",
      ],
      eq: ["H = (1.5·PS + 3/u + 0.15·PS²·u) / SPP", "N = L × 1000 / H", "Rs₂ = Rs₁ × √(N₂/N₁)", "Rs floor = Rs spec × √(N₁ / Nmax)"],
    },
    met: {
      lane: "iso", title: "Method met",
      short: "Peaks, tR, Rs and BP all in spec.",
      what: "All target peaks are separated (Rs at or above spec), the last peak is within the tR spec, and back pressure is under the limit. The flow can optionally be raised to shorten the run, as long as Rs and BP stay in spec.",
      decides: ["Cases 3 and 6 of the efficiency table: the app shows the fastest flow that keeps Rs and BP in spec."],
      eq: [],
    },
    // ---------- Gradient ----------
    "gra-start": {
      lane: "gra", title: "Start: gradient method",
      short: "%B changes during the run.",
      what: "In a gradient method %B rises during the run (after a short isocratic hold). Peaks are sharper, and the spacing is steered with one number: the gradient steepness GS. Keeping GS constant keeps the selectivity; changing GS changes it.",
      decides: ["The gradient flow chart has its own dashboard, specification and history, separate from the isocratic one."],
      eq: ["GS = Δφ × Vm / (tG × F)", "Vm = π × (ID/2)² × L × 0.68 / 1000 (mL)"],
    },
    scout: {
      lane: "gra", title: "Scouting gradient",
      short: "5–100 %B in 20 min, 1.5 mL/min.",
      what: "The first gradient run: a wide window (5–100 %B) over tG = 20 min at 1.5 mL/min, after a 2 min hold at 5 %B. It shows how many peaks there are and at what %B they elute. GS ≈ 0.054 on a 150 × 4.6 mm column.",
      decides: ["Each new chemistry (temperature, solvent, ligand) starts again from a scouting gradient, and is the reference for G1 ↑ and G1 ↓."],
      eq: ["%B at elution = %B ini + (tR − hold) × (%B fin − %B ini) / tG"],
    },
    gpeaks: {
      lane: "gra", title: "All peaks found?", decision: true,
      short: "Peaks = target?",
      what: "Fewer peaks: change GS to change the spacing (G1). All peaks: keep GS, so the spacing stays, and adjust time and resolution (G2, G3, G4).",
      decides: [], eq: [],
    },
    g1up: {
      lane: "gra", title: "G1 ↑ Increase GS",
      short: "Same window, tG × 0.5.",
      what: "Fewer peaks than the target on the scouting run: some compounds co-elute. A steeper gradient (shorter tG) changes the spacing.",
      decides: ["Next run: same %B window and flow, tG × 0.5 (GS doubles)."],
      eq: ["GS₂ = GS₁ / 0.5"],
    },
    g1down: {
      lane: "gra", title: "G1 ↓ Decrease GS",
      short: "Back to scouting, tG × 1.2.",
      what: "Raising GS didn't give all the peaks, so try the other way: a shallower gradient than the scouting run.",
      decides: ["Next run: the scouting run's window and flow, tG × 1.2 (GS ÷ 1.2)."],
      eq: [],
    },
    g1x: {
      lane: "gra", title: "G1 ✕ Change selectivity",
      short: "Temperature, then solvent, then ligand.",
      what: "Neither a steeper nor a shallower gradient gave all the peaks: GS alone cannot separate them, so the chemistry changes. Each new condition runs the cases again from a scouting gradient.",
      decides: [
        "Order: temperature 40 °C, then 60 °C; then solvent MeOH, then MIX (at ambient); then a change of ligand.",
        "G2 exhausted (tG at its 60 min limit, Rs still below spec) also leads here.",
      ],
      eq: [],
    },
    g2: {
      lane: "gra", title: "G2 Keep GS, stretch",
      short: "Rs < spec: F × 0.8, tG ÷ 0.8.",
      what: "All peaks are there but Rs is below spec. Keeping GS keeps the spacing; a lower flow and longer tG stretch the chromatogram and gain plates (Rs grows with √N).",
      decides: [
        "Next run: F × 0.8 and tG ÷ 0.8 (GS unchanged), capped at tG = 60 min.",
        "Predicted Rs: best case Rs × √(F₁/F₂), or fitted to your earlier G2 runs.",
      ],
      eq: ["Rs₂ ≈ Rs₁ × (F₁/F₂)^0.5 (best case)"],
    },
    g3: {
      lane: "gra", title: "G3 Keep GS, shrink",
      short: "Trim unused %B, cut tG in proportion.",
      what: "All peaks resolved but part of the %B window is wasted. Trimming it shortens the run without changing the spacing, because tG is cut in the same proportion as Δφ.",
      decides: [
        "New %B ini = %B at the first peak (after uracil) − 20; new %B fin = %B at the last peak + 5; tG × (new Δφ / old Δφ).",
        "Shrink once. If the run is still over the run-time spec: F × x and tG ÷ x, with BP × x ≤ limit and Rs ÷ √x ≥ spec.",
      ],
      eq: ["x ≤ BP limit / BP and x ≤ (Rs / Rs spec)²"],
    },
    g4: {
      lane: "gra", title: "G4 Method met",
      short: "Lock it.",
      what: "All peaks, Rs at or above spec, last peak inside the run-time spec and no %B wasted. If F can't be raised without losing Rs or exceeding BP, a longer run is accepted.",
      decides: [], eq: [],
    },
  };

  const ISO_FLOW = ["iso-start", "equip", "ret", "peaks", "sel", "eff", "met"];

  const EFF_CASES = [
    [1, "tR ≪ spec", "Rs below the floor", "Increase L (watch BP); if no column meets all three specs, SELECTIVITY"],
    [2, "tR ≪ spec", "floor < Rs < spec", "Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP"],
    [3, "tR ≪ spec", "Rs > spec", "MET. Optionally increase F to shorten the run"],
    [4, "tR < spec", "Rs below the floor", "SELECTIVITY"],
    [5, "tR < spec", "floor < Rs < spec", "Decrease F OR decrease PS (BP) OR SPP"],
    [6, "tR < spec", "Rs > spec", "MET. Optionally increase F to shorten the run"],
    [7, "tR > spec", "Rs below the floor", "SELECTIVITY"],
    [8, "tR > spec", "floor < Rs < spec", "Decrease PS (BP), then increase F to shorten the run"],
    [9, "tR > spec", "Rs > spec", "Increase F to shorten the run"],
  ];
  const GRA_CASES = [
    ["G1up", "G1 ↑", "< target", "0", "Increase GS: same %B window, tG × 0.5"],
    ["G1down", "G1 ↓", "< target (after G1 ↑)", "0", "Decrease GS: back to the scouting run, tG × 1.2"],
    ["G1x", "G1 ✕", "< target (after G1 ↑ and ↓)", "0", "Change selectivity: temperature, solvent or ligand"],
    ["G2", "G2", "= target", "< spec", "Keep GS: F × 0.8 and tG ÷ 0.8"],
    ["G3", "G3", "= target", "≥ spec, slow / wasted %B", "Keep GS, shrink: trim unused %B, cut tG in proportion"],
    ["G4", "G4", "= target", "≥ spec, tR ≤ run-time spec", "Method met: lock it"],
  ];

  const FORMULAS = [
    ["Retention and selectivity", [
      ["Retention factor", "k = (tR − t0) / t0", "t0: the unretained peak (uracil)."],
      ["Selectivity", "α = k₂ / k₁", "Two neighbouring peaks."],
      ["log k against %B", "log k = a + b × %B", "Straight line fitted to the retention runs; used for Min %B."],
      ["10-point rule", "tR(%B − 10) ≈ 2 × tR(%B)", "A 10-point drop in %B doubles the last peak's tR."],
      ["Min %B from one run", "%B − 10 × log₂(tR spec / tR)", "Used until the log k fit has 4 runs."],
      ["Temperature", "tR(T₂) ≈ tR(T₁) × (1 − 0.015 × (T₂ − T₁))", "About 1.5% shorter per °C (estimate)."],
    ]],
    ["Resolution and efficiency", [
      ["Resolution (practical)", "Rs = 2 (tR₂ − tR₁) / (Wb₁ + Wb₂)", "The run's Rs is the worst neighbouring pair."],
      ["Resolution (theoretical)", "Rs = ¼ √N × (α − 1)/α × k/(k + 1)", "N, α and k each contribute."],
      ["Plate number", "N = 5.54 (tR / W½)² = 16 (tR / Wb)²", "LabSolutions reports it as Plate #."],
      ["Base width", "Wb = 4 tR / √N", "Used to recalculate Rs next to removed noise peaks."],
      ["Plate height", "H = L / N", "About 3 particle diameters in a good column."],
      ["Van Deemter", "H = (1.5·PS + 3/u + 0.15·PS²·u) / SPP", "µm; u in mm/s; SPP = 1.5 for core-shell, 1 for fully porous."],
      ["Linear velocity", "u = L / t0", "mm/s, t0 in seconds."],
      ["Rs with N", "Rs₂ = Rs₁ × √(N₂ / N₁)", "Chemistry unchanged."],
    ]],
    ["Column and flow changes (Awesome Calculator)", [
      ["Retention time", "tR₂ = tR₁ × F₁/F₂ × ID₂²/ID₁² × L₂/L₁", "t0 scales the same way."],
      ["Back pressure", "BP₂ = BP₁ × (L₂ F₂)/(L₁ F₁) × ((PS₁ ID₁)/(PS₂ ID₂))²", ""],
      ["Flow for tR on spec", "F = F₁ × tR₁ / tR spec", "Same column."],
      ["Flow for BP on the limit", "F = F₁ × BP limit / BP₁", "Same column."],
      ["Headroom", "HR = √((BP limit / BP₁) × (tR spec / tR₁))", ""],
      ["Most plates possible", "Nmax = 1000 L₁ HR / (PS₁ (1.5 + 2√(3 × 0.15)))", "× 1.5 with a core-shell bead."],
      ["Rs floor", "Rs floor = Rs spec × √(N₁ / Nmax)", "Moves with the tR, BP and Rs specs."],
      ["Column volume", "V = π (ID/2)² L × 0.68 / 1000", "mL."],
    ]],
    ["Gradient", [
      ["Gradient steepness", "GS = Δφ × Vm / (tG × F)", "Δφ = (%B fin − %B ini) / 100."],
      ["Column volume", "Vm = π (ID/2)² L × 0.68 / 1000", "1.69 mL for 150 × 4.6 mm."],
      ["%B at elution", "%B = %B ini + (tR − hold) × (%B fin − %B ini) / tG", "Hold: 2 min at the start."],
      ["G3 shrink", "%B ini = %B first peak − 20; %B fin = %B last peak + 5", "tG cut in proportion, GS kept."],
      ["Faster at constant GS", "F × x, tG ÷ x with BP × x ≤ limit, Rs/√x ≥ spec", ""],
    ]],
  ];

  const GLOSSARY = [
    ["%B", "Percentage of the organic solvent (ACN, MeOH or the mix) in the mobile phase."],
    ["t0", "Void time: the time of the unretained peak (uracil, the first peak)."],
    ["tR", "Retention time of a peak; the app uses the last peak's tR against the tR spec."],
    ["k (K)", "Retention factor: how long a compound is held compared with t0."],
    ["α", "Selectivity: the ratio of the k values of two neighbouring peaks."],
    ["N", "Plate number (efficiency): how narrow a peak is for its retention time."],
    ["H / HETP", "Plate height: column length divided by N."],
    ["Rs", "Resolution between two neighbouring peaks; the run's Rs is the worst pair. Below the target peak count it is 0."],
    ["Rs floor", "The lowest Rs that column and flow changes can still bring to spec within the tR and BP limits."],
    ["BP", "Back pressure (psi), the highest pump pressure during the run."],
    ["L, ID, PS", "Column length (mm), internal diameter (mm), particle size (µm)."],
    ["SPP / core-shell", "Superficially porous particles (Raptor): a solid core with a thin porous shell, about 1.5× the plates."],
    ["F", "Flow rate (mL/min)."],
    ["Min %B", "The %B that puts the last peak on the tR spec."],
    ["Isoeluotropic", "Two solvents at %B values that give the same retention (from the nomogram)."],
    ["GS", "Gradient steepness: the gradient's slope relative to the column volume and flow."],
    ["tG", "Gradient time: how long %B takes to go from %B ini to %B fin."],
    ["Δφ", "Width of the gradient window: (%B fin − %B ini) / 100."],
    ["Vm", "Volume of mobile phase in the column."],
    ["Dwell / hold", "The isocratic hold at the start of a gradient (2 min) keeps all compounds at the head of the column until the gradient starts."],
  ];

  // ---------- helpers ----------
  const mk = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  function currentIso() {
    const o = typeof window.isoCurrentOutcome === "function" ? window.isoCurrentOutcome() : null;
    if (!o) return null;
    const st = String(o.stage || "");
    let node = "equip";
    if (o.unsafe || st === "Safety check") node = "equip";
    else if (/^Check the peak integration/.test(String(o.action || ""))) node = "peaks";
    else if (st === "Retention") node = "ret";
    else if (/^Retention -> Selectivity|^Selectivity/.test(st)) node = "sel";
    else if (st === "Efficiency") node = "eff";
    else if (st === "Complete") node = "met";
    return { node: node, action: o.action || "", stage: st, file: window.isoCurrentFile ? window.isoCurrentFile() : "", effCase: o.efficiency ? o.efficiency.caseNumber : null };
  }
  function currentGra() {
    const g = window.gradientApp && window.gradientApp.current ? window.gradientApp.current() : null;
    if (!g || !g.decision) return null;
    const id = g.decision.caseId;
    const map = { G1up: "g1up", G1down: "g1down", G1x: "g1x", G2stop: "g1x", G2: "g2", G3: "g3", G3fast: "g3", G4: "g4" };
    return { node: map[id] || "scout", action: g.decision.action || "", caseId: id === "G2stop" ? "G2" : id === "G3fast" ? "G3" : id, file: g.fileName };
  }

  let selected = "ret";

  // ---------- the diagram ----------
  function nodeEl(id, here) {
    const s = STAGES[id];
    const b = mk("button", "fc-node" + (s.decision ? " fc-decision" : "") + (id === selected ? " sel" : "") + (here ? " here" : "") + " fc-" + s.lane);
    b.type = "button";
    b.dataset.node = id;
    b.setAttribute("aria-pressed", id === selected ? "true" : "false");
    if (here) b.appendChild(mk("span", "fc-here", "You are here"));
    b.appendChild(mk("span", "fc-title", s.title));
    b.appendChild(mk("span", "fc-short", s.short));
    b.addEventListener("click", function () { selected = id; render(); });
    return b;
  }
  function arrow(label, cls) {
    const a = mk("div", "fc-arrow" + (cls ? " " + cls : ""));
    a.appendChild(mk("span", "fc-arrow-line"));
    if (label) a.appendChild(mk("span", "fc-arrow-label", label));
    return a;
  }

  function buildDiagram(iso, gra) {
    const wrap = mk("div", "fc-diagram");
    // Isocratic lane
    const isoLane = mk("div", "fc-lane");
    isoLane.appendChild(mk("h3", "fc-lane-title", "Isocratic"));
    const here = function (id) { return iso && iso.node === id; };
    isoLane.appendChild(nodeEl("iso-start", false));
    isoLane.appendChild(arrow());
    isoLane.appendChild(nodeEl("equip", here("equip")));
    isoLane.appendChild(arrow("safe"));
    isoLane.appendChild(nodeEl("ret", here("ret")));
    isoLane.appendChild(arrow());
    isoLane.appendChild(nodeEl("peaks", false));
    const split = mk("div", "fc-split");
    const left = mk("div", "fc-branch");
    left.appendChild(arrow("fewer peaks, %B exhausted or tR > spec"));
    left.appendChild(nodeEl("sel", here("sel")));
    left.appendChild(mk("p", "fc-loop", "↺ each change: run again, count the peaks"));
    const right = mk("div", "fc-branch");
    right.appendChild(arrow("all peaks"));
    right.appendChild(nodeEl("eff", here("eff")));
    right.appendChild(mk("p", "fc-loop", "Rs below the floor → back to selectivity"));
    right.appendChild(arrow("all three in spec"));
    right.appendChild(nodeEl("met", here("met")));
    split.append(left, right);
    isoLane.appendChild(split);

    // Gradient lane
    const graLane = mk("div", "fc-lane");
    graLane.appendChild(mk("h3", "fc-lane-title", "Gradient"));
    const gh = function (id) { return gra && gra.node === id; };
    graLane.appendChild(nodeEl("gra-start", false));
    graLane.appendChild(arrow());
    graLane.appendChild(nodeEl("scout", gh("scout")));
    graLane.appendChild(arrow());
    graLane.appendChild(nodeEl("gpeaks", false));
    const gsplit = mk("div", "fc-split");
    const gl = mk("div", "fc-branch");
    gl.appendChild(arrow("fewer peaks"));
    gl.appendChild(nodeEl("g1up", gh("g1up")));
    gl.appendChild(arrow("still fewer"));
    gl.appendChild(nodeEl("g1down", gh("g1down")));
    gl.appendChild(arrow("still fewer"));
    gl.appendChild(nodeEl("g1x", gh("g1x")));
    gl.appendChild(mk("p", "fc-loop", "↺ new chemistry: scouting gradient again"));
    const gr = mk("div", "fc-branch");
    gr.appendChild(arrow("all peaks, Rs < spec"));
    gr.appendChild(nodeEl("g2", gh("g2")));
    gr.appendChild(arrow("Rs ≥ spec"));
    gr.appendChild(nodeEl("g3", gh("g3")));
    gr.appendChild(arrow("no %B wasted, tR in spec"));
    gr.appendChild(nodeEl("g4", gh("g4")));
    gsplit.append(gl, gr);
    graLane.appendChild(gsplit);

    wrap.append(isoLane, graLane);
    return wrap;
  }

  function stageBody(id, opts) {
    const s = STAGES[id];
    const box = mk("div", "fc-stage-body");
    box.appendChild(mk("p", null, s.what));
    if (s.decides.length) {
      box.appendChild(mk("h4", null, "How the app decides"));
      const ul = mk("ul");
      s.decides.forEach(function (d) { ul.appendChild(mk("li", null, d)); });
      box.appendChild(ul);
    }
    if (s.eq.length) {
      box.appendChild(mk("h4", null, "Equations"));
      const eqs = mk("div", "fc-eqs");
      s.eq.forEach(function (e) { eqs.appendChild(mk("code", "fc-eq", e)); });
      box.appendChild(eqs);
    }
    if (opts && opts.current) {
      const cur = mk("div", "fc-current");
      cur.appendChild(mk("span", "fc-here", "You are here"));
      cur.appendChild(mk("p", "fc-current-file", opts.current.file || ""));
      cur.appendChild(mk("p", "fc-current-action", opts.current.action));
      box.appendChild(cur);
    }
    return box;
  }

  function buildDetail(iso, gra) {
    const s = STAGES[selected];
    const panel = mk("aside", "fc-detail");
    panel.setAttribute("aria-live", "polite");
    panel.appendChild(mk("span", "fc-detail-lane", s.lane === "iso" ? "Isocratic" : "Gradient"));
    panel.appendChild(mk("h3", null, s.title));
    const cur = s.lane === "iso" ? (iso && iso.node === selected ? iso : null) : (gra && gra.node === selected ? gra : null);
    panel.appendChild(stageBody(selected, { current: cur }));
    const go = mk("button", "secondary", s.lane === "iso" ? "Open the isocratic dashboard" : "Open the gradient dashboard");
    go.type = "button";
    go.addEventListener("click", function () { const t = document.getElementById(s.lane === "iso" ? "tab-flowchart" : "tab-gradient"); if (t) t.click(); });
    panel.appendChild(go);
    return panel;
  }

  // ---------- panels ----------
  function renderFlow(box, iso, gra) {
    box.replaceChildren();
    const status = mk("div", "fc-status");
    const line = function (label, c) {
      const p = mk("p");
      p.appendChild(mk("strong", null, label + ": "));
      p.appendChild(document.createTextNode(c ? STAGES[c.node].title + " — " + c.action : "no run loaded yet."));
      return p;
    };
    status.append(line("Isocratic", iso), line("Gradient", gra));
    box.appendChild(status);
    box.appendChild(mk("p", "hint", "Click a box to read what that stage does and how the app decides. The box your current run is in is marked “You are here”."));
    const grid = mk("div", "fc-grid");
    grid.append(buildDiagram(iso, gra), buildDetail(iso, gra));
    box.appendChild(grid);
  }

  function renderStages(box, iso, gra) {
    box.replaceChildren();
    [["Isocratic", ISO_FLOW], ["Gradient", ["gra-start", "scout", "gpeaks", "g1up", "g1down", "g1x", "g2", "g3", "g4"]]].forEach(function (grp) {
      box.appendChild(mk("h3", "fc-group-title", grp[0]));
      grp[1].forEach(function (id) {
        const d = mk("details", "fc-stage");
        const curr = STAGES[id].lane === "iso" ? (iso && iso.node === id ? iso : null) : (gra && gra.node === id ? gra : null);
        if (curr) d.open = true;
        const sum = mk("summary");
        sum.appendChild(mk("span", "fc-stage-title", STAGES[id].title));
        sum.appendChild(mk("span", "fc-stage-short", STAGES[id].short));
        if (curr) sum.appendChild(mk("span", "fc-here", "You are here"));
        d.appendChild(sum);
        d.appendChild(stageBody(id, { current: curr }));
        box.appendChild(d);
      });
    });
  }

  function renderCases(box, iso, gra) {
    box.replaceChildren();
    box.appendChild(mk("h3", "fc-group-title", "Efficiency: the nine cases (7 peaks)"));
    const t = mk("table", "options-table fc-table");
    const hr = t.createTHead().insertRow();
    ["Case", "Run time", "Resolution", "Action"].forEach(function (h) { hr.appendChild(mk("th", null, h)); });
    const b = t.createTBody();
    EFF_CASES.forEach(function (c) {
      const tr = b.insertRow();
      if (iso && iso.effCase === c[0]) tr.className = "primary-option";
      c.forEach(function (v) { tr.insertCell().textContent = String(v); });
    });
    box.appendChild(t);
    box.appendChild(mk("p", "note", "tR ≪ spec means the last peak is at or under half the spec (room for another −10 %B). " + (iso && iso.effCase ? "Highlighted: your current run (case " + iso.effCase + ")." : "Load a 7-peak isocratic run to highlight its case.")));
    box.appendChild(mk("h3", "fc-group-title", "Gradient: the cases"));
    const g = mk("table", "options-table fc-table");
    const gh = g.createTHead().insertRow();
    ["Case", "Peaks", "Rs min", "Action"].forEach(function (h) { gh.appendChild(mk("th", null, h)); });
    const gb = g.createTBody();
    GRA_CASES.forEach(function (c) {
      const tr = gb.insertRow();
      if (gra && gra.caseId === c[0]) tr.className = "primary-option";
      c.slice(1).forEach(function (v) { tr.insertCell().textContent = v; });
    });
    box.appendChild(g);
    box.appendChild(mk("p", "note", gra ? "Highlighted: your current gradient run." : "Load a gradient run to highlight its case."));
  }

  function renderFormulas(box) {
    box.replaceChildren();
    FORMULAS.forEach(function (grp) {
      box.appendChild(mk("h3", "fc-group-title", grp[0]));
      const dl = mk("div", "fc-formulas");
      grp[1].forEach(function (f) {
        const row = mk("div", "fc-formula");
        row.appendChild(mk("span", "fc-formula-name", f[0]));
        row.appendChild(mk("code", "fc-eq", f[1]));
        if (f[2]) row.appendChild(mk("span", "fc-formula-note", f[2]));
        dl.appendChild(row);
      });
      box.appendChild(dl);
    });
  }

  function renderGlossary(box) {
    box.replaceChildren();
    const filter = mk("input", "fc-search");
    filter.type = "search";
    filter.placeholder = "Search a term";
    filter.setAttribute("aria-label", "Search the glossary");
    const dl = mk("dl", "fc-glossary");
    const fill = function () {
      dl.replaceChildren();
      const q = filter.value.trim().toLowerCase();
      GLOSSARY.forEach(function (g) {
        if (q && (g[0] + " " + g[1]).toLowerCase().indexOf(q) === -1) return;
        dl.append(mk("dt", null, g[0]), mk("dd", null, g[1]));
      });
      if (!dl.children.length) dl.appendChild(mk("p", "hint", "No term matches."));
    };
    filter.addEventListener("input", fill);
    fill();
    box.append(filter, dl);
  }

  // ---------- sub-steps and refresh ----------
  const subs = document.querySelectorAll(".fsub-button");
  function showF(name) {
    subs.forEach(function (b) { const on = b.dataset.fsub === name; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    document.querySelectorAll("[data-fsub-panel]").forEach(function (p) { p.hidden = p.dataset.fsubPanel !== name; });
  }
  subs.forEach(function (b) { b.addEventListener("click", function () { showF(b.dataset.fsub); }); });

  function render() {
    const iso = currentIso();
    const gra = currentGra();
    const get = function (id) { return document.getElementById(id); };
    if (get("fc-flow")) renderFlow(get("fc-flow"), iso, gra);
    if (get("fc-stages")) renderStages(get("fc-stages"), iso, gra);
    if (get("fc-cases")) renderCases(get("fc-cases"), iso, gra);
  }

  if (document.getElementById("fc-formulas")) renderFormulas(document.getElementById("fc-formulas"));
  if (document.getElementById("fc-glossary")) renderGlossary(document.getElementById("fc-glossary"));
  const tab = document.getElementById("tab-guide");
  if (tab) tab.addEventListener("click", function () {
    // Start on the current run's box.
    const iso = currentIso();
    const gra = currentGra();
    if (iso) selected = iso.node; else if (gra) selected = gra.node;
    render();
  });
  const pr = document.getElementById("fc-print");
  if (pr) pr.addEventListener("click", function () { window.print(); });
  showF("flow");
  render();
  window.flowchartGuide = { render: render, show: showF };
})();
