// awesome-calc.js: the course's "Awesome Rainbow Calculator" (efficiency, isocratic) as a tab.
// Every formula follows the spreadsheet (sheet "AWESOME CALC (2)"); the row numbers in the
// comments are the spreadsheet rows, so a result can be checked against it cell by cell.
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const panel = $("panel-calc");
  if (!panel) return;
  const STORE = "hplc-awesome-calc-v1";

  // The calculator's own worked example (the values in the course spreadsheet).
  const EXAMPLE = {
    tRmax: 15, BPmax: 4000, RsSpec: 1.39, A: 1.5, B: 3, C: 0.15, sppBest: 1.5,
    spp1: 1, L1: 150, ID1: 4.6, PS1: 5, F1: 1.5, Vinj1: 20, Hz1: 1.56, t01: 1.15, tR1: 20.03, Ntab: 4392, BP1: 2600, Rs1: 2.17,
    scenario: "custom",
    custom: { spp: 1, L: 150, ID: 4.6, PS: 5, F: 2.05 },
    L: { L: 250, F: 1.5 }, PS: { PS: 3, F: 1.5 }, SPP: { spp: 1.5, F: 1.5 }, ID: { ID: 3, F: 1.5 },
  };
  let st = load();

  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.L1) return Object.assign(JSON.parse(JSON.stringify(EXAMPLE)), s); } catch (e) { /* storage unavailable */ }
    return JSON.parse(JSON.stringify(EXAMPLE));
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* ignore */ } }

  // ---------- the maths ----------
  function base() {
    const s = st;
    const V = 3.14 * Math.pow(s.ID1 / 2, 2) * s.L1 / 1000 * 0.68;           // row 24
    const Vreal = s.F1 * s.t01;                                             // row 39
    const Vgeom = Math.PI * Math.pow(s.ID1 / 2, 2) * s.L1 / 1000;           // row 40
    const eps = Vreal / Vgeom;                                              // row 41
    const k = 4000 / (60 * Math.PI * eps);                                  // row 42
    const u1 = (s.L1 / s.t01) / 60;                                         // row 46
    const H1 = (s.A * s.PS1 + s.B / u1 + s.C * s.PS1 * s.PS1 * u1) / s.spp1; // row 67
    const N1 = s.L1 * 1000 / H1;                                            // row 63
    return { V: V, eps: eps, k: k, u1: u1, H1: H1, N1: N1 };
  }

  // One column of the calculator for a column {spp, L, ID, PS} run at flow F.
  function column(b, c, F) {
    const s = st;
    if (!(F > 0)) return null;
    const out = { spp: c.spp, L: c.L, ID: c.ID, PS: c.PS, F: F };
    out.V = 3.14 * Math.pow(c.ID / 2, 2) * c.L / 1000 * 0.68;
    out.teq = out.V / F * 10;
    out.Vinj = s.Vinj1 * Math.pow(c.ID / s.ID1, 2) * Math.sqrt((c.L * c.PS) / (s.L1 * s.PS1));
    out.Hz = s.Hz1 / Math.sqrt((c.L * Math.pow(c.PS, 3)) / (s.L1 * Math.pow(s.PS1, 3)));
    out.t0 = s.t01 * (s.F1 / F) * (c.ID * c.ID / (s.ID1 * s.ID1)) * (c.L / s.L1);
    out.u = (c.L / out.t0) / 60;
    out.uOpt = Math.sqrt(s.B / (s.C * c.PS * c.PS));
    out.FOpt = out.uOpt * c.ID * c.ID / b.k;
    out.tR = s.tR1 * (s.F1 / F) * (c.ID * c.ID / (s.ID1 * s.ID1)) * (c.L / s.L1);
    out.BP = s.BP1 * ((c.L * F) / (s.L1 * s.F1)) * Math.pow((s.PS1 * s.ID1) / (c.PS * c.ID), 2);
    out.binding = out.BP > s.BPmax ? "BP exceeded" : out.tR > s.tRmax ? "tR exceeded" : "within both";
    out.verdict = out.BP > s.BPmax ? "WILL NOT RUN" : out.tR > s.tRmax ? "tR over by " + (out.tR - s.tRmax).toFixed(1) + " min" : "OK";
    out.H = (s.A * c.PS + s.B / out.u + s.C * c.PS * c.PS * out.u) / c.spp; // row 98
    out.N = c.L * 1000 / out.H;                                            // row 100
    out.Rs = s.Rs1 * Math.sqrt(out.N / b.N1);                               // row 102
    out.rsOk = out.Rs >= s.RsSpec;
    out.solvent = out.tR * F;
    out.timeSaved = s.tR1 - out.tR;
    out.solventSaved = s.tR1 * s.F1 - out.solvent;
    return out;
  }
  function fForTr(c) { const s = st; return (s.F1 * s.tR1 * (c.ID * c.ID / (s.ID1 * s.ID1)) * (c.L / s.L1)) / s.tRmax; }
  function fForBp(c) { const s = st; return (s.BPmax * s.L1 * s.F1) / (s.BP1 * c.L * Math.pow((s.PS1 * s.ID1) / (c.PS * c.ID), 2)); }

  // The column a scenario tries, its starting flow and the user's flow.
  function scenarioSpec(key) {
    const s = st, cur = { spp: s.spp1, L: s.L1, ID: s.ID1, PS: s.PS1 };
    if (key === "custom") {
      const c = { spp: s.custom.spp, L: s.custom.L, ID: s.custom.ID, PS: s.custom.PS };
      return { col: c, start: s.F1 * (c.ID * c.ID / (s.ID1 * s.ID1)) * (s.PS1 / c.PS), startLabel: "Same reduced velocity", userF: s.custom.F };
    }
    if (key === "L") return { col: Object.assign({}, cur, { L: s.L.L }), start: s.F1, startLabel: "Same F", userF: s.L.F };
    if (key === "PS") return { col: Object.assign({}, cur, { PS: s.PS.PS }), start: s.F1, startLabel: "Same F", userF: s.PS.F };
    if (key === "SPP") return { col: Object.assign({}, cur, { spp: s.SPP.spp }), start: s.F1, startLabel: "Same F", userF: s.SPP.F };
    const c = Object.assign({}, cur, { ID: s.ID.ID });
    return { col: c, start: s.F1 * (c.ID * c.ID / (s.ID1 * s.ID1)), startLabel: "Same linear velocity", userF: s.ID.F };
  }
  function scenario(b, key) {
    const sp = scenarioSpec(key);
    const fT = fForTr(sp.col), fB = fForBp(sp.col);
    const decisionF = fB >= fT ? fT : null; // DECISION: F = min(F for tR, F for BP) — the slowest flow that meets tR
    return {
      spec: sp,
      cols: [
        { head: sp.startLabel, sub: "", r: column(b, sp.col, sp.start) },
        { head: "Exact F for tR at spec", sub: "", r: column(b, sp.col, fT) },
        { head: "Exact F for BP at spec", sub: "", r: column(b, sp.col, fB) },
        { head: "Decision", sub: "F for tR, if BP allows", r: decisionF ? column(b, sp.col, decisionF) : null, decision: true },
        { head: "Your F", sub: "", r: column(b, sp.col, sp.userF), user: true },
      ],
    };
  }
  function floors(b) {
    const s = st;
    const HR = Math.sqrt((s.BPmax / s.BP1) * (s.tRmax / s.tR1));                          // row 106
    const nMax = 1000 * s.L1 * HR / (s.PS1 * (s.A + 2 * Math.sqrt(s.B * s.C)));           // row 108
    const nMaxSpp = nMax * s.sppBest;                                                     // row 109
    const fpp = s.RsSpec * Math.sqrt(b.N1 / nMax), spp = s.RsSpec * Math.sqrt(b.N1 / nMaxSpp);
    const verdict = s.Rs1 >= fpp ? "OK, reachable with a fully porous column" : s.Rs1 >= spp ? "Needs an SPP bead, out of reach fully porous" : "IMPOSSIBLE by column geometry, must change selectivity";
    const VF = HR * s.tR1 / s.tRmax;                                                      // row 115
    const psOpt = s.PS1 * Math.sqrt(Math.sqrt(s.B / s.C) / (s.PS1 * b.u1 * VF));          // row 116
    const lOpt = s.L1 * HR * (psOpt / s.PS1);                                             // row 117
    const fOpt = s.F1 * (lOpt / s.L1) * (s.tR1 / s.tRmax);                                // row 118
    const uOpt = b.u1 * (fOpt / s.F1);
    const hMin = psOpt * (s.A + 2 * Math.sqrt(s.B * s.C)) / s.sppBest;                    // row 121
    return {
      HR: HR, nMax: nMax, nMaxSpp: nMaxSpp, fpp: fpp, spp: spp, verdict: verdict,
      LPSmax: (s.L1 * 1000 / s.PS1) * HR, LPSnow: s.L1 * 1000 / s.PS1,
      VF: VF, psOpt: psOpt, lOpt: lOpt, fOpt: fOpt, uOpt: uOpt, hMin: hMin, nOpt: lOpt * 1000 / hMin,
      bpOpt: s.BP1 * ((lOpt * fOpt) / (s.L1 * s.F1)) * Math.pow((s.PS1 * s.ID1) / (psOpt * s.ID1), 2),
      tROpt: s.tR1 * (s.F1 / fOpt) * (lOpt / s.L1),
    };
  }

  // ---------- rendering ----------
  const f = function (v, d) { return typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "–"; };
  const el = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const SCEN = [["custom", "Your column"], ["L", "Change L"], ["PS", "Change PS"], ["SPP", "Change bead to SPP"], ["ID", "Change ID"]];

  function stat(label, value, cls, hint) {
    const d = el("div", "ac-stat" + (cls ? " " + cls : ""));
    d.appendChild(el("span", "ac-stat-label", label));
    d.appendChild(el("strong", null, value));
    if (hint) d.appendChild(el("span", "ac-stat-hint", hint));
    return d;
  }

  function render() {
    const s = st;
    const b = base();
    // Current run
    const cur = $("ac-current-out");
    cur.replaceChildren();
    const Wb = s.tR1 * Math.sqrt(16 / s.Ntab), Wh = s.tR1 / Math.sqrt(s.Ntab / 5.54);
    const Nreq = s.Ntab * Math.pow(s.RsSpec / s.Rs1, 2);
    const curOk = s.BP1 > s.BPmax ? "bad" : s.tR1 > s.tRmax ? "warn" : "ok";
    cur.appendChild(stat("Verdict", s.BP1 > s.BPmax ? "WILL NOT RUN" : s.tR1 > s.tRmax ? "tR over by " + (s.tR1 - s.tRmax).toFixed(1) + " min" : "OK", curOk));
    cur.appendChild(stat("Rs decision", s.Rs1 >= s.RsSpec ? "OK" : "Rs TOO LOW", s.Rs1 >= s.RsSpec ? "ok" : "bad", "Rs " + s.Rs1 + " vs spec " + s.RsSpec));
    cur.appendChild(stat("Required gain in Rs", f(s.RsSpec - s.Rs1, 2), null, "Rs spec − Rs1"));
    cur.appendChild(stat("Required # plates", f(Nreq, 0), null, "N1 × (Rs spec/Rs1)²"));
    cur.appendChild(stat("Required HETP₂", f(s.L1 * 1000 / Nreq, 2) + " µm"));
    cur.appendChild(stat("N calc (Van Deemter)", f(b.N1, 0), null, "used for Rs₂ and the floor"));
    cur.appendChild(stat("HETP calc", f(b.H1, 2) + " µm", null, "table: " + f(s.L1 / s.Ntab * 1000, 2) + " µm"));
    cur.appendChild(stat("Wb / W½ last peak", f(Wb, 2) + " / " + f(Wh, 2) + " min"));
    cur.appendChild(stat("Linear velocity µ", f(b.u1, 2) + " mm/s", null, "porosity ε " + f(b.eps, 2)));
    cur.appendChild(stat("Solvent per run", f(s.tR1 * s.F1, 2) + " mL"));

    // Floor
    const fl = floors(b);
    const fo = $("ac-floor-out");
    fo.replaceChildren();
    const g1 = el("div", "ac-stats");
    g1.appendChild(stat("Headroom HR", f(fl.HR, 2), null, "max increase in L/PS"));
    g1.appendChild(stat("N max, fully porous", f(fl.nMax, 0)));
    g1.appendChild(stat("N max, SPP bead", f(fl.nMaxSpp, 0)));
    g1.appendChild(stat("Rs floor, fully porous", f(fl.fpp, 2), s.Rs1 >= fl.fpp ? "ok" : "bad"));
    g1.appendChild(stat("Rs floor, SPP bead", f(fl.spp, 2), s.Rs1 >= fl.spp ? "ok" : "bad"));
    g1.appendChild(stat("Max L/PS affordable", f(fl.LPSmax, 0), null, "now " + f(fl.LPSnow, 0)));
    fo.appendChild(g1);
    fo.appendChild(el("p", "ac-verdict " + (s.Rs1 >= fl.fpp ? "ok" : s.Rs1 >= fl.spp ? "warn" : "bad"), "Verdict at current Rs1 (" + s.Rs1 + "): " + fl.verdict));
    fo.appendChild(el("h4", null, "The column that reaches Nmax"));
    const g2 = el("div", "ac-stats");
    g2.appendChild(stat("Optimal particle size", f(fl.psOpt, 2) + " µm"));
    g2.appendChild(stat("Optimal column length", f(fl.lOpt, 0) + " mm"));
    g2.appendChild(stat("Optimal flow rate", f(fl.fOpt, 3) + " mL/min"));
    g2.appendChild(stat("Optimal linear velocity", f(fl.uOpt, 3) + " mm/s", null, "VF " + f(fl.VF, 3)));
    g2.appendChild(stat("HETP at the optimum", f(fl.hMin, 2) + " µm"));
    g2.appendChild(stat("Checks: N / BP / tR", f(fl.nOpt, 0) + " / " + f(fl.bpOpt, 0) + " / " + f(fl.tROpt, 2)));
    fo.appendChild(g2);

    // Scenario tabs + inputs
    const tabs = $("ac-scen-tabs");
    tabs.replaceChildren();
    SCEN.forEach(function (sc) {
      const btn = el("button", "ac-scen-btn" + (s.scenario === sc[0] ? " on" : ""), sc[1]);
      btn.type = "button";
      btn.setAttribute("aria-pressed", s.scenario === sc[0] ? "true" : "false");
      btn.addEventListener("click", function () { st.scenario = sc[0]; save(); render(); });
      tabs.appendChild(btn);
    });
    renderScenarioInputs();
    renderScenarioTable(b);
    renderRainbow(b);
  }

  function numInput(label, value, step, onChange, opts) {
    const w = el("label", "ac-field");
    w.appendChild(el("span", null, label));
    let inp;
    if (opts) {
      inp = el("select");
      opts.forEach(function (o) { const op = el("option", null, o[1]); op.value = String(o[0]); if (Number(o[0]) === Number(value)) op.selected = true; inp.appendChild(op); });
    } else {
      inp = el("input"); inp.type = "number"; inp.step = step || "any"; inp.value = value;
    }
    inp.addEventListener("change", function () { const v = parseFloat(inp.value); if (Number.isFinite(v) && v > 0) { onChange(v); save(); render(); } });
    w.appendChild(inp);
    return w;
  }
  const SPP_OPTS = [[1, "1.0 fully porous"], [1.5, "1.5 core-shell (SPP)"]];

  function renderScenarioInputs() {
    const box = $("ac-scen-inputs");
    box.replaceChildren();
    const s = st, k = s.scenario;
    const row = el("div", "ac-input-row");
    if (k === "custom") {
      row.appendChild(numInput("SPP factor", s.custom.spp, null, function (v) { s.custom.spp = v; }, SPP_OPTS));
      row.appendChild(numInput("Column length (mm)", s.custom.L, "1", function (v) { s.custom.L = v; }));
      row.appendChild(numInput("Column I.D. (mm)", s.custom.ID, "0.1", function (v) { s.custom.ID = v; }));
      row.appendChild(numInput("Particle size (µm)", s.custom.PS, "0.1", function (v) { s.custom.PS = v; }));
      row.appendChild(numInput("Your flow rate (mL/min)", s.custom.F, "0.01", function (v) { s.custom.F = v; }));
    } else if (k === "L") {
      row.appendChild(numInput("New column length (mm)", s.L.L, "1", function (v) { s.L.L = v; }));
      row.appendChild(numInput("Your flow rate (mL/min)", s.L.F, "0.01", function (v) { s.L.F = v; }));
    } else if (k === "PS") {
      row.appendChild(numInput("New particle size (µm)", s.PS.PS, "0.1", function (v) { s.PS.PS = v; }));
      row.appendChild(numInput("Your flow rate (mL/min)", s.PS.F, "0.01", function (v) { s.PS.F = v; }));
    } else if (k === "SPP") {
      row.appendChild(numInput("SPP factor", s.SPP.spp, null, function (v) { s.SPP.spp = v; }, SPP_OPTS));
      row.appendChild(numInput("Your flow rate (mL/min)", s.SPP.F, "0.01", function (v) { s.SPP.F = v; }));
    } else {
      row.appendChild(numInput("New column I.D. (mm)", s.ID.ID, "0.1", function (v) { s.ID.ID = v; }));
      row.appendChild(numInput("Your flow rate (mL/min)", s.ID.F, "0.01", function (v) { s.ID.F = v; }));
    }
    box.appendChild(row);
    const hints = {
      custom: "Change any of the column's dimensions. The first column keeps the same reduced velocity (F scaled by ID² and 1/PS).",
      L: "Only the length changes. Longer = more plates, but tR and BP rise in proportion.",
      PS: "Only the particle size changes. Smaller = lower HETP, BP rises with 1/PS².",
      SPP: "Same geometry, core-shell bead: N × 1.5 at the same tR and BP.",
      ID: "Only the internal diameter changes, mainly to save solvent. The first column keeps the same linear velocity.",
    };
    box.appendChild(el("p", "hint", hints[k]));
  }

  // Rows of the comparison table: [label, value(r), class(r)]
  function rows() {
    const s = st;
    return [
      ["group", "Column"],
      ["SPP factor", function (r) { return f(r.spp, 1); }],
      ["Length (mm)", function (r) { return f(r.L, 0); }],
      ["I.D. (mm)", function (r) { return f(r.ID, 1); }],
      ["Particle size (µm)", function (r) { return f(r.PS, 1); }],
      ["Column volume (mL)", function (r) { return f(r.V, 2); }],
      ["group", "Flow"],
      ["Flow rate (mL/min)", function (r) { return f(r.F, 2); }, function () { return "ac-key"; }],
      ["t0 (min)", function (r) { return f(r.t0, 2); }],
      ["Linear velocity µ (mm/s)", function (r) { return f(r.u, 2); }],
      ["F opt (mL/min)", function (r) { return f(r.FOpt, 2); }],
      ["Equilibration time (min)", function (r) { return f(r.teq, 2); }],
      ["Injection volume (µL)", function (r) { return f(r.Vinj, 2); }],
      ["Data collection rate (Hz)", function (r) { return f(r.Hz, 2); }],
      ["group", "Run time and pressure"],
      ["tR last peak (min)", function (r) { return f(r.tR, 2); }, function (r) { return r.tR > s.tRmax + 1e-9 ? "ac-bad" : "ac-good"; }],
      ["Back pressure (psi)", function (r) { return f(r.BP, 0); }, function (r) { return r.BP > s.BPmax + 1e-9 ? "ac-bad" : "ac-good"; }],
      ["Binding constraint", function (r) { return r.binding; }],
      ["VERDICT", function (r) { return r.verdict; }, function (r) { return r.verdict === "OK" ? "ac-pill ok" : r.verdict === "WILL NOT RUN" ? "ac-pill bad" : "ac-pill warn"; }],
      ["group", "Resolution"],
      ["HETP₂ with the change (µm)", function (r) { return f(r.H, 2); }],
      ["New N₂", function (r) { return f(r.N, 0); }],
      ["New Rs₂", function (r) { return f(r.Rs, 2); }, function (r) { return r.rsOk ? "ac-good" : "ac-bad"; }],
      ["Rs DECISION", function (r) { return r.rsOk ? "OK" : "Rs TOO LOW"; }, function (r) { return "ac-pill " + (r.rsOk ? "ok" : "bad"); }],
      ["group", "Savings"],
      ["Solvent consumption (mL)", function (r) { return f(r.solvent, 2); }],
      ["Time saved (min)", function (r) { return f(r.timeSaved, 1); }],
      ["Solvent saved (mL)", function (r) { return f(r.solventSaved, 1); }],
    ];
  }

  function renderScenarioTable(b) {
    const s = st;
    const sc = scenario(b, s.scenario);
    const curCol = { head: "Current method", r: column(b, { spp: s.spp1, L: s.L1, ID: s.ID1, PS: s.PS1 }, s.F1), current: true };
    const cols = [curCol].concat(sc.cols);
    const table = el("table", "ac-table");
    const hr = table.createTHead().insertRow();
    hr.appendChild(el("th", null, ""));
    cols.forEach(function (c) {
      const th = el("th", c.current ? "ac-col-cur" : c.decision ? "ac-col-dec" : c.user ? "ac-col-user" : "");
      th.appendChild(el("span", null, c.head));
      if (c.sub) th.appendChild(el("small", null, c.sub));
      hr.appendChild(th);
    });
    const body = table.createTBody();
    rows().forEach(function (row) {
      const tr = body.insertRow();
      if (row[0] === "group") { const td = tr.insertCell(); td.colSpan = cols.length + 1; td.className = "ac-group"; td.textContent = row[1]; return; }
      tr.appendChild(el("th", null, row[0]));
      cols.forEach(function (c) {
        const td = tr.insertCell();
        if (c.current) td.classList.add("ac-col-cur");
        if (c.decision) td.classList.add("ac-col-dec");
        if (c.user) td.classList.add("ac-col-user");
        if (!c.r) { td.textContent = row[0] === "VERDICT" ? "NO FEASIBLE FLOW" : ""; if (row[0] === "VERDICT") td.className += " ac-pill bad"; return; }
        if (c.current && /Rs₂|Rs DECISION|HETP₂|New N₂|saved/.test(row[0])) {
          if (row[0] === "New Rs₂") td.textContent = f(s.Rs1, 2);
          else if (row[0] === "New N₂") td.textContent = f(s.Ntab, 0) + " (table)";
          else if (row[0] === "Rs DECISION") { td.textContent = s.Rs1 >= s.RsSpec ? "OK" : "Rs TOO LOW"; td.className += " ac-pill " + (s.Rs1 >= s.RsSpec ? "ok" : "bad"); }
          else if (row[0] === "HETP₂ with the change (µm)") td.textContent = f(s.L1 / s.Ntab * 1000, 2) + " (table)";
          else td.textContent = "";
          return;
        }
        if (c.current && row[0] === "Back pressure (psi)") { td.textContent = f(s.BP1, 0); if (s.BP1 > s.BPmax) td.classList.add("ac-bad"); return; }
        const span = el("span", null, row[1](c.r));
        if (row[2]) span.className = row[2](c.r);
        td.appendChild(span);
      });
    });
    const wrap = $("ac-table-wrap");
    wrap.replaceChildren(table);
    const dec = sc.cols[3].r;
    const sum = $("ac-scen-summary");
    sum.className = "ac-summary " + (dec ? (dec.rsOk ? "ok" : "bad") : "bad");
    sum.textContent = dec
      ? "Decision: run at " + f(dec.F, 2) + " mL/min → tR " + f(dec.tR, 2) + " min, BP " + f(dec.BP, 0) + " psi, Rs " + f(dec.Rs, 2) + " (" + (dec.rsOk ? "meets the Rs spec" : "Rs TOO LOW") + ")."
      : "No feasible flow: the flow needed to keep tR at spec takes the back pressure over the limit.";
  }

  function renderRainbow(b) {
    const s = st;
    const t = el("table", "ac-rainbow");
    const h = t.createTHead().insertRow();
    ["Change", "Column tried", "Decision F (mL/min)", "tR (min)", "BP (psi)", "Rs₂", "Verdict"].forEach(function (x) { h.appendChild(el("th", null, x)); });
    const body = t.createTBody();
    SCEN.forEach(function (sc) {
      const r = scenario(b, sc[0]);
      const d = r.cols[3].r, c = r.spec.col;
      const tr = body.insertRow();
      tr.className = "ac-rb-" + sc[0];
      const name = tr.insertCell();
      const btn = el("button", "link-button", sc[1]); btn.type = "button";
      btn.addEventListener("click", function () { st.scenario = sc[0]; save(); render(); const tw = $("ac-scen-tabs"); if (tw) tw.scrollIntoView({ behavior: "smooth", block: "start" }); });
      name.appendChild(btn);
      tr.insertCell().textContent = (c.spp > 1 ? "SPP " : "") + c.L + " × " + c.ID + " mm, " + c.PS + " µm";
      if (!d) { const td = tr.insertCell(); td.colSpan = 5; td.className = "ac-pill-cell"; td.appendChild(el("span", "ac-pill bad", "NO FEASIBLE FLOW (BP over the limit at the tR flow)")); return; }
      tr.insertCell().textContent = f(d.F, 2);
      tr.insertCell().textContent = f(d.tR, 2);
      tr.insertCell().textContent = f(d.BP, 0);
      const rs = tr.insertCell(); rs.appendChild(el("span", d.rsOk ? "ac-good" : "ac-bad", f(d.Rs, 2)));
      const v = tr.insertCell(); v.appendChild(el("span", "ac-pill " + (d.rsOk ? "ok" : "bad"), d.rsOk ? "OK" : "Rs TOO LOW"));
    });
    $("ac-rainbow-wrap").replaceChildren(t);
  }

  // ---------- inputs ----------
  const FIELDS = [
    ["ac-trmax", "tRmax"], ["ac-bpmax", "BPmax"], ["ac-rsspec", "RsSpec"],
    ["ac-vda", "A"], ["ac-vdb", "B"], ["ac-vdc", "C"], ["ac-sppbest", "sppBest"],
    ["ac-spp1", "spp1"], ["ac-l1", "L1"], ["ac-id1", "ID1"], ["ac-ps1", "PS1"], ["ac-f1", "F1"],
    ["ac-vinj1", "Vinj1"], ["ac-hz1", "Hz1"], ["ac-t01", "t01"], ["ac-tr1", "tR1"], ["ac-n1", "Ntab"], ["ac-bp1", "BP1"], ["ac-rs1", "Rs1"],
  ];
  function writeInputs() { FIELDS.forEach(function (x) { const e = $(x[0]); if (e) e.value = st[x[1]]; }); }
  FIELDS.forEach(function (x) {
    const e = $(x[0]);
    if (!e) return;
    e.addEventListener("change", function () {
      const v = parseFloat(e.value);
      if (Number.isFinite(v) && v > 0) { st[x[1]] = v; save(); render(); }
      else e.value = st[x[1]];
    });
  });

  function status(t) { const s = $("ac-status"); if (s) s.textContent = t; }

  // Fill from the run shown on the isocratic dashboard.
  function fillFromRun() {
    try {
      if (typeof currentSummary === "undefined" || !currentSummary || !currentConditions) { status("Load a run on the isocratic dashboard first."); return; }
      const c = currentConditions;
      const dims = String(c.columnDimensions || "").split("x").map(Number);
      if (dims.length === 3 && dims.every(Number.isFinite)) { st.L1 = dims[0]; st.ID1 = dims[1]; st.PS1 = dims[2]; }
      const F = parseFloat(c.flowRate); if (F > 0) st.F1 = F;
      const vinj = parseFloat(String(c.sampleVolume || "").replace(/[^\d.]/g, "")); if (vinj > 0) st.Vinj1 = vinj;
      st.spp1 = (typeof isCoreShell === "function" && isCoreShell(c.columnType)) ? 1.5 : 1;
      if (currentSummary.t0 > 0) st.t01 = currentSummary.t0;
      if (currentSummary.trLastPeak > 0) st.tR1 = currentSummary.trLastPeak;
      if (currentSummary.minResolution > 0) st.Rs1 = currentSummary.minResolution;
      if (currentMaxBackPressure && currentMaxBackPressure.maxActual > 0) st.BP1 = Math.round(currentMaxBackPressure.maxActual);
      const e = readHistory().filter(function (h) { return h.fileName === currentRunFileName; })[0];
      if (e && Array.isArray(e.rawPeaks)) {
        const kept = filterSmallPeaks(e.rawPeaks, readMinArea()).kept;
        const last = kept[kept.length - 1];
        if (last && last.plateCount > 0) st.Ntab = last.plateCount;
      }
      const sp = readSpecs();
      if (sp) { if (sp.tRSpec > 0) st.tRmax = sp.tRSpec; if (sp.maxPressure > 0) st.BPmax = sp.maxPressure; if (sp.rsSpec > 0) st.RsSpec = sp.rsSpec; }
      ["custom", "L", "PS", "SPP", "ID"].forEach(function (k) { st[k].F = st.F1; });
      st.custom = { spp: st.spp1, L: st.L1, ID: st.ID1, PS: st.PS1, F: st.F1 };
      save(); writeInputs(); render();
      status("Filled from " + currentRunFileName + ".");
    } catch (err) { status("Couldn't read the current run: " + err.message); }
  }
  const fillBtn = $("ac-fill"); if (fillBtn) fillBtn.addEventListener("click", fillFromRun);
  const exBtn = $("ac-example"); if (exBtn) exBtn.addEventListener("click", function () { st = JSON.parse(JSON.stringify(EXAMPLE)); save(); writeInputs(); render(); status("The course spreadsheet's example is loaded."); });
  // Open the calculator on a column and flow chosen on the efficiency card.
  function openWith(c) {
    fillFromRun();
    st.scenario = "custom";
    st.custom = { spp: c.spp > 1 ? 1.5 : 1, L: c.L, ID: c.ID, PS: c.PS, F: Math.round(c.F * 100) / 100 };
    save(); writeInputs(); render();
    status("Filled from the current run, with " + (c.spp > 1 ? "core-shell " : "") + c.L + " × " + c.ID + " mm, " + c.PS + " µm at " + st.custom.F + " mL/min under \u201cYour column\u201d.");
    const t = document.getElementById("tab-calc"); if (t) t.click();
    const tabs = $("ac-scen-tabs"); if (tabs) setTimeout(function () { tabs.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  }
  window.awesomeCalc = { openWith: openWith, fillFromRun: fillFromRun, state: function () { return st; }, compute: function () { const b = base(); return { base: b, floors: floors(b), scenario: scenario(b, st.scenario) }; } };

  writeInputs();
  render();
})();
