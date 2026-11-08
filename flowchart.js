// flowchart.js: the "Flow chart guide" tab.
//   1. An interactive flow chart (isocratic and gradient). Click a box to read about it;
//      the box the current run sits in is marked "You are here".
//   2. Every stage explained: what it does, how the app decides, the equations.
//   3. The case tables (efficiency 1-9, gradient G1-G4) with the current case marked.
//   4. A formula sheet and a glossary.
// Edit the text in STAGES, FORMULAS and GLOSSARY below; the page is built from them.
(function () {
  // Each stage: title, short (box text), key (one-line highlight), fig (guide-figures.js),
  // rules (if -> then cards; tone: go / wait / stop / info), eq (equations), more (longer text, folded).
  const STAGES = {
    // ---------- Isocratic ----------
    "iso-start": {
      lane: "iso", title: "Start: isocratic method", short: "%B stays constant through each run.",
      key: "Change one thing at a time: %B first, then the chemistry, then the column and flow.",
      fig: "resolution",
      rules: [
        { if: "Load one export per run", then: "Conditions are read from the file name", tone: "info" },
        { if: "Runs uploaded in any order", then: "Each is judged in run-number order", tone: "info" },
      ],
      eq: [],
      more: "In an isocratic method the mobile phase composition (%B) stays the same for the whole run. Method development follows the resolution equation: retention factor k first (%B), selectivity α second (temperature, solvent, ligand), efficiency N last (column and flow).",
    },
    equip: {
      lane: "iso", title: "Equipment and safety", short: "Column, mobile phase, back pressure first.",
      key: "Safety first: a run at or over the pressure limit stops here.",
      fig: "pressure",
      rules: [
        { if: "BP ≥ your limit", then: "Stop: no decision for this run", tone: "stop" },
        { if: "No pressure trace in the file", then: "“Couldn't check”, the run continues", tone: "wait" },
        { if: "Peaks lower than 10,000 (editable)", then: "Removed as noise and listed", tone: "info" },
        { if: "Sample Name ≠ file name", then: "Warning: check the file", tone: "wait" },
      ],
      eq: ["BP (psi) = raw pressure × Intensity Multiplier"],
      more: "The column (ligand, bead line, pore size, carbon load, length × ID × particle size) and mobile phase (solvent B, pH) set what the separation can do. The highest pump pressure in the file is compared with your limit before anything else. Removed noise peaks get their neighbour's Rs recalculated (Wb = 4 tR/√N).",
    },
    ret: {
      lane: "iso", title: "Retention (K): %B", short: "−10 %B steps while tR ≪ spec.",
      key: "Lower %B = more retention. Every −10 %B roughly doubles tR.",
      fig: "retention",
      rules: [
        { if: "tR ≤ ½ spec", then: "Drop %B by 10", tone: "go" },
        { if: "½ spec < tR ≤ spec", then: "Run Min %B and an intermediate %B, compare", tone: "wait" },
        { if: "tR > spec", then: "Previous %B + selectivity, or the intermediate %B", tone: "stop" },
        { if: "%B reaches Min %B, peaks missing", then: "Retention finished → selectivity", tone: "info" },
      ],
      eq: ["k = (tR − t0) / t0", "Min %B (one run) = %B − 10 × log₂(tR spec / tR)"],
      more: "Lowering %B moves all peaks later and spreads them apart, which can reveal peaks hiding under others. Min %B is the %B that puts the last peak exactly on the spec: from a straight-line fit of log k against %B once there are 4 retention runs, estimated from one run before that.",
    },
    peaks: {
      lane: "iso", title: "All peaks found?", decision: true, short: "Peaks = target?",
      key: "Efficiency can't make hidden peaks appear, so it waits until every peak is visible.",
      rules: [
        { if: "Fewer peaks than the target", then: "Rs = 0: retention or selectivity", tone: "stop" },
        { if: "Still more peaks than the target", then: "INVESTIGATE: integration or carry-over", tone: "wait" },
        { if: "Exactly the target", then: "Efficiency", tone: "go" },
      ],
      eq: [],
    },
    sel: {
      lane: "iso", title: "Selectivity (α)", short: "Temperature, then solvent, then ligand.",
      key: "Change the spacing between peaks by changing the chemistry.",
      fig: "selectivity",
      rules: [
        { if: "Temperature ladder", then: "Ambient → 40 °C → 60 °C, then Observe", tone: "go" },
        { if: "Temperatures exhausted", then: "MeOH, then MIX (isoeluotropic %B)", tone: "go" },
        { if: "Solvents exhausted", then: "New ligand, start again", tone: "wait" },
      ],
      eq: ["α = k₂ / k₁", "tR at a new temperature ≈ tR × (1 − 0.015 × ΔT)"],
      more: "Selectivity changes the spacing between peaks, and can change their order. It is what separates two compounds that co-elute. Observe steps are your judgement: compare the chromatograms. Higher temperature also shortens tR (about 1.5% per °C), which the app uses to predict the next run.",
    },
    eff: {
      lane: "iso", title: "Efficiency (N)", short: "9 cases: column and flow.",
      key: "Narrow the peaks; their positions stay. Rs grows with √N.",
      fig: "efficiency",
      rules: [
        { if: "Rs below the floor", then: "Back to selectivity", tone: "stop" },
        { if: "Floor < Rs < spec", then: "Best column and flow from your list", tone: "go" },
        { if: "Rs ≥ spec", then: "Met; optionally faster flow", tone: "go" },
      ],
      eq: ["H = (1.5·PS + 3/u + 0.15·PS²·u) / SPP", "Rs₂ = Rs₁ × √(N₂/N₁)", "Rs floor = Rs spec × √(N₁ / Nmax)"],
      more: "With the chemistry frozen (solvent, %B, pH, temperature), the levers are column length, particle size, bead (fully porous or core-shell), flow and internal diameter. The run is placed in one of 9 cases by its tR and Rs. The floor is the lowest Rs that column and flow changes can still bring to spec within the tR and BP limits, so it moves with the specs. Every column in your list with this ligand is tried at its best flow; predictions use the Awesome Calculator.",
    },
    met: {
      lane: "iso", title: "Method met", short: "Peaks, tR, Rs and BP all in spec.",
      key: "Done. Optionally raise the flow to shorten the run.",
      rules: [{ if: "Cases 3 and 6", then: "Fastest flow that keeps Rs and BP in spec", tone: "go" }],
      eq: [],
    },
    // ---------- Gradient ----------
    "gra-start": {
      lane: "gra", title: "Start: gradient method", short: "%B changes during the run.",
      key: "One number steers the spacing: the gradient steepness GS.",
      fig: "gs",
      rules: [
        { if: "Same GS", then: "Same selectivity", tone: "go" },
        { if: "Different GS", then: "Different spacing", tone: "wait" },
      ],
      eq: ["GS = Δφ × Vm / (tG × F)", "Vm = π (ID/2)² L × 0.68 / 1000"],
      more: "In a gradient %B rises during the run, after a short isocratic hold. Peaks are sharper than in isocratic. The gradient flow chart has its own dashboard, specification and history.",
    },
    scout: {
      lane: "gra", title: "Scouting gradient", short: "5–100 %B in 20 min, 1.5 mL/min.",
      key: "Where do the peaks elute? Start wide: 5 → 100 %B in 20 min.",
      fig: "scout",
      rules: [{ if: "Any new chemistry", then: "Start again from a scouting gradient", tone: "info" }],
      eq: ["%B at elution = %B ini + (tR − hold) × Δ%B / tG"],
      more: "A 2 min hold at 5 %B keeps every compound at the head of the column until the ramp starts. GS ≈ 0.054 on a 150 × 4.6 mm column at 1.5 mL/min. The scouting run is the reference for G1 ↑ and G1 ↓.",
    },
    gpeaks: {
      lane: "gra", title: "All peaks found?", decision: true, short: "Peaks = target?",
      key: "Fewer peaks: change GS. All peaks: keep GS.",
      rules: [
        { if: "Fewer peaks", then: "G1: change GS", tone: "stop" },
        { if: "All peaks", then: "G2, G3, G4: keep GS", tone: "go" },
      ],
      eq: [],
    },
    g1up: {
      lane: "gra", title: "G1 ↑ Increase GS", short: "Same window, tG × 0.5.",
      key: "Steeper gradient: half the tG, same window.", fig: "g1",
      rules: [{ if: "Fewer peaks on the scouting run", then: "tG × 0.5 (GS × 2)", tone: "go" }], eq: [],
    },
    g1down: {
      lane: "gra", title: "G1 ↓ Decrease GS", short: "Back to scouting, tG × 1.2.",
      key: "Still missing? Try shallower than the scouting run.", fig: "g1",
      rules: [{ if: "Fewer peaks after G1 ↑", then: "Scouting tG × 1.2", tone: "go" }], eq: [],
    },
    g1x: {
      lane: "gra", title: "G1 ✕ Change selectivity", short: "Temperature, then solvent, then ligand.",
      key: "GS alone can't separate them: change the chemistry.",
      fig: "selectivity",
      rules: [
        { if: "Fewer peaks after G1 ↑ and ↓", then: "40 °C → 60 °C → MeOH → MIX → ligand", tone: "stop" },
        { if: "G2 at tG 60 min, Rs still low", then: "Also comes here", tone: "wait" },
      ],
      eq: [],
    },
    g2: {
      lane: "gra", title: "G2 Keep GS, stretch", short: "Rs < spec: F × 0.8, tG ÷ 0.8.",
      key: "Same pattern, stretched: lower flow, longer tG, GS unchanged.", fig: "g2",
      rules: [
        { if: "All peaks, Rs < spec", then: "F × 0.8, tG ÷ 0.8", tone: "go" },
        { if: "tG would pass 60 min", then: "Capped at 60 min", tone: "wait" },
      ],
      eq: ["Rs₂ ≈ Rs₁ × √(F₁/F₂) (best case)"],
    },
    g3: {
      lane: "gra", title: "G3 Keep GS, shrink", short: "Trim unused %B, cut tG in proportion.",
      key: "Cut the wasted %B at both ends; GS stays, so the spacing stays.", fig: "g3",
      rules: [
        { if: "Rs ≥ spec, %B wasted", then: "%B first peak − 20 → %B last peak + 5", tone: "go" },
        { if: "Already shrunk, still too long", then: "F × x, tG ÷ x (within BP and Rs)", tone: "wait" },
      ],
      eq: ["x ≤ BP limit / BP and x ≤ (Rs / Rs spec)²"],
    },
    g4: {
      lane: "gra", title: "G4 Method met", short: "Lock it.",
      key: "All peaks, Rs ≥ spec, tR in spec, no %B wasted.",
      rules: [{ if: "F can't rise without losing Rs or BP", then: "Accept the longer run", tone: "info" }],
      eq: [],
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
    else if (/^INVESTIGATE/.test(String(o.action || ""))) node = "peaks";
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

  // Live numbers for the figures (the Rs gauge uses the current 7-peak run when there is one).
  function figContext() {
    const o = typeof window.isoCurrentOutcome === "function" ? window.isoCurrentOutcome() : null;
    const specEl = document.getElementById("spec-rs");
    const sp = specEl ? Number(specEl.value) : 1.4;
    if (o && o.efficiencyRef && typeof o.floorUsed === "number") return { live: true, rs: o.efficiencyRef.Rs, floor: o.floorUsed, spec: sp };
    return { live: false, rs: 1.2, floor: 1.0, spec: Number.isFinite(sp) && sp > 0 ? sp : 1.4 };
  }

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

  const TONE_WORD = { go: "Then", wait: "Then", stop: "Then", info: "Then" };
  function stageBody(id, opts) {
    const s = STAGES[id];
    const box = mk("div", "fc-stage-body");
    if (opts && opts.current) {
      const cur = mk("div", "fc-current");
      cur.appendChild(mk("span", "fc-here", "You are here"));
      cur.appendChild(mk("p", "fc-current-action", opts.current.action));
      if (opts.current.file) cur.appendChild(mk("p", "fc-current-file", opts.current.file));
      box.appendChild(cur);
    }
    if (s.key) box.appendChild(mk("p", "fc-key " + (s.lane === "gra" ? "gra" : "iso"), s.key));
    if (s.fig && window.guideFigures) {
      const f = window.guideFigures.get(s.fig, opts && opts.figCtx);
      if (f) box.appendChild(f);
    }
    if (s.rules && s.rules.length) {
      const rules = mk("div", "fc-rules");
      s.rules.forEach(function (r) {
        const c = mk("div", "fc-rule t-" + (r.tone || "info"));
        const iff = mk("div", "fc-rule-if");
        iff.appendChild(mk("span", "fc-rule-tag", "If"));
        iff.appendChild(document.createTextNode(r.if));
        const then = mk("div", "fc-rule-then");
        then.appendChild(mk("span", "fc-rule-tag", TONE_WORD[r.tone] || "Then"));
        then.appendChild(document.createTextNode(r.then));
        c.append(iff, then);
        rules.appendChild(c);
      });
      box.appendChild(rules);
    }
    if (s.eq && s.eq.length) {
      const eqs = mk("div", "fc-eqs");
      s.eq.forEach(function (e) { eqs.appendChild(mk("code", "fc-eq", e)); });
      box.appendChild(eqs);
    }
    if (s.more) {
      const d = mk("details", "fc-more");
      d.appendChild(mk("summary", null, "More detail"));
      d.appendChild(mk("p", null, s.more));
      box.appendChild(d);
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
    panel.appendChild(stageBody(selected, { current: cur, figCtx: figContext() }));
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
    box.appendChild(mk("p", "hint", "Click a box to see that stage. Amber = your current run."));
    const grid = mk("div", "fc-grid");
    grid.append(buildDiagram(iso, gra), buildDetail(iso, gra));
    box.appendChild(grid);
  }

  function renderStages(box, iso, gra) {
    box.replaceChildren();
    [["Isocratic", ISO_FLOW, "iso"], ["Gradient", ["gra-start", "scout", "gpeaks", "g1up", "g1down", "g1x", "g2", "g3", "g4"], "gra"]].forEach(function (grp) {
      box.appendChild(mk("h3", "fc-group-title fc-lane-head " + grp[2], grp[0]));
      const list = mk("div", "fc-stage-list");
      grp[1].forEach(function (id, i) {
        const d = mk("details", "fc-stage " + grp[2]);
        const curr = STAGES[id].lane === "iso" ? (iso && iso.node === id ? iso : null) : (gra && gra.node === id ? gra : null);
        if (curr) { d.open = true; d.classList.add("is-here"); }
        const sum = mk("summary");
        sum.appendChild(mk("span", "fc-step-no", String(i + 1)));
        const txt = mk("span", "fc-stage-text");
        txt.appendChild(mk("span", "fc-stage-title", STAGES[id].title));
        txt.appendChild(mk("span", "fc-stage-short", STAGES[id].key || STAGES[id].short));
        sum.appendChild(txt);
        if (curr) sum.appendChild(mk("span", "fc-here", "You are here"));
        d.appendChild(sum);
        d.appendChild(stageBody(id, { current: curr, figCtx: figContext() }));
        list.appendChild(d);
      });
      box.appendChild(list);
    });
  }

  function renderCases(box, iso, gra) {
    box.replaceChildren();
    box.appendChild(mk("h3", "fc-group-title", "Efficiency: the nine cases (all peaks found)"));
    const grid = mk("div", "fc-casegrid");
    grid.appendChild(mk("div", "fc-cg-corner", "last peak tR \u2193  /  Rs \u2192"));
    ["Rs below the floor", "floor < Rs < spec", "Rs \u2265 spec"].forEach(function (h, i) { grid.appendChild(mk("div", "fc-cg-colhead c" + i, h)); });
    const rows = ["tR \u226a spec (\u2264 \u00bd)", "tR < spec", "tR > spec"];
    rows.forEach(function (rh, r) {
      grid.appendChild(mk("div", "fc-cg-rowhead", rh));
      for (let c = 0; c < 3; c++) {
        const k = EFF_CASES[r * 3 + c];
        const tone = /SELECTIVITY/.test(k[3]) && !/Increase L/.test(k[3]) ? "stop" : /MET/.test(k[3]) ? "go" : "wait";
        const cell = mk("div", "fc-cg-cell t-" + tone + (iso && iso.effCase === k[0] ? " here" : ""));
        cell.appendChild(mk("span", "fc-cg-no", "Case " + k[0]));
        cell.appendChild(mk("span", "fc-cg-act", k[3]));
        if (iso && iso.effCase === k[0]) cell.appendChild(mk("span", "fc-here", "You are here"));
        grid.appendChild(cell);
      }
    });
    box.appendChild(grid);
    const lg = mk("div", "fc-cg-legend");
    [["go", "met / done"], ["wait", "change column or flow"], ["stop", "back to selectivity"]].forEach(function (l) { lg.appendChild(mk("span", "fc-cg-key t-" + l[0], l[1])); });
    box.appendChild(lg);

    box.appendChild(mk("h3", "fc-group-title", "Gradient: the cases"));
    const gl = mk("div", "fc-gcases");
    GRA_CASES.forEach(function (c) {
      const tone = c[0] === "G4" ? "go" : c[0] === "G1x" ? "stop" : c[0] === "G2" || c[0] === "G3" ? "go" : "wait";
      const card = mk("div", "fc-gcase t-" + tone + (gra && gra.caseId === c[0] ? " here" : ""));
      card.appendChild(mk("span", "fc-gcase-id", c[1]));
      const body = mk("div", "fc-gcase-body");
      const cond = mk("p", "fc-gcase-cond");
      cond.appendChild(mk("span", "fc-chip", "Peaks " + c[2]));
      cond.appendChild(mk("span", "fc-chip", "Rs " + c[3]));
      body.appendChild(cond);
      body.appendChild(mk("p", "fc-gcase-act", c[4]));
      card.appendChild(body);
      if (gra && gra.caseId === c[0]) card.appendChild(mk("span", "fc-here", "You are here"));
      gl.appendChild(card);
    });
    box.appendChild(gl);
  }

  function renderFormulas(box) {
    box.replaceChildren();
    const nav = mk("div", "fc-chipnav");
    FORMULAS.forEach(function (grp, gi) {
      const a = mk("a", "fc-chip g" + gi, grp[0]);
      a.href = "#fc-fgroup-" + gi;
      a.addEventListener("click", function (e) { e.preventDefault(); const t = document.getElementById("fc-fgroup-" + gi); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
      nav.appendChild(a);
    });
    box.appendChild(nav);
    FORMULAS.forEach(function (grp, gi) {
      const h = mk("h3", "fc-group-title fc-fhead g" + gi, grp[0]);
      h.id = "fc-fgroup-" + gi;
      box.appendChild(h);
      const cards = mk("div", "fc-fcards");
      grp[1].forEach(function (f) {
        const c = mk("div", "fc-fcard g" + gi);
        c.appendChild(mk("span", "fc-fcard-name", f[0]));
        c.appendChild(mk("code", "fc-fcard-eq", f[1]));
        if (f[2]) c.appendChild(mk("span", "fc-fcard-note", f[2]));
        cards.appendChild(c);
      });
      box.appendChild(cards);
    });
  }

  function renderGlossary(box) {
    box.replaceChildren();
    const filter = mk("input", "fc-search");
    filter.type = "search";
    filter.placeholder = "Search a term, e.g. floor";
    filter.setAttribute("aria-label", "Search the glossary");
    const grid = mk("div", "fc-gloss");
    const fill = function () {
      grid.replaceChildren();
      const q = filter.value.trim().toLowerCase();
      GLOSSARY.forEach(function (g) {
        if (q && (g[0] + " " + g[1]).toLowerCase().indexOf(q) === -1) return;
        const c = mk("div", "fc-gcard");
        c.appendChild(mk("span", "fc-gsym", g[0]));
        c.appendChild(mk("p", null, g[1]));
        grid.appendChild(c);
      });
      if (!grid.children.length) grid.appendChild(mk("p", "hint", "No term matches."));
    };
    filter.addEventListener("input", fill);
    fill();
    box.append(filter, grid);
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
