// efficiency.js: the efficiency (N) part of the flow chart.
//
// Works out the Rs floor and predicts tR, back pressure and Rs for any column and
// flow rate, using the equations of the course's Awesome (Rainbow) Calculator
// (2026 CYCLE 3 EFFICIENCY 3 ED, version 260914). Nothing here touches the page.
//
// Reference run (run 1) = the 7-peak run just loaded. Every prediction is made by
// proportion from it, exactly as the calculator does:
//   t0_2 = t0_1 x F1/F2 x ID2^2/ID1^2 x L2/L1      (tR scales the same way)
//   BP_2 = BP_1 x (L2 x F2)/(L1 x F1) x ((PS1 x ID1)/(PS2 x ID2))^2
//   u    = L / t0                                    (mm/s, t0 in s)
//   HETP = (A x PS + B/u + C x PS^2 x u) / SPP       (um)  A = 1.5, B = 3, C = 0.15
//   N    = L x 1000 / HETP
//   Rs_2 = Rs_1 x sqrt(N_2 / N_1)
// The Rs floor (the lowest Rs that column and flow changes can still bring to
// spec within the tR and BP limits):
//   HR       = sqrt((BPspec/BP1) x (tRspec/tR1))      headroom
//   Nmax     = 1000 x L1 x HR / (PS1 x (A + 2 sqrt(B x C)))
//   floor    = Rsspec x sqrt(N1 / Nmax)               fully porous
//   floorSPP = Rsspec x sqrt(N1 / (1.5 x Nmax))       with a core-shell (SPP) bead

const VD_A = 1.5;
const VD_B = 3;
const VD_C = 0.15;
const SPP_FACTOR = 1.5;

function effNum(v) {
    const n = typeof v === "number" ? v : parseFloat(String(v === undefined || v === null ? "" : v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
}

// Raptor columns are the core-shell (superficially porous) line.
function isCoreShell(lineOrCode) {
    const s = String(lineOrCode || "").trim();
    return /^r$/i.test(s) || /raptor|^rap$/i.test(s);
}

function lineFromCode(code) {
    const c = String(code || "").trim().toUpperCase();
    if (c === "P") return "Pinnacle DB";
    if (c === "U") return "Ultra";
    if (c === "F") return "Force";
    if (c === "R" || c === "RAP") return "Raptor";
    return c ? c : "";
}

// Ligand names as the column list writes them.
function canonicalLigand(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "";
    if (s === "c18aq" || s === "cp18aq") return "C18aq";
    if (s === "c18" || s === "c18n" || s === "c18o") return "C18";
    if (s === "c8") return "C8";
    if (s === "bip" || s === "biph" || s === "biphenyl") return "BiPH";
    if (s === "ibd" || s === "ibdu") return "IBD";
    if (s === "pfp" || s === "pfpp") return "PFP";
    return String(raw).trim();
}

function plateHeight(dp, u, spp) {
    return (VD_A * dp + VD_B / u + VD_C * dp * dp * u) / (spp || 1);
}

// Build the reference run from what the file gives. Returns { ok, ref } or { ok:false, missing:[...] }.
function buildEfficiencyReference(conditions, summary, maxBackPressure) {
    const c = conditions || {};
    const dims = String(c.columnDimensions || "").split("x").map(Number);
    const missing = [];
    const L = dims.length === 3 && Number.isFinite(dims[0]) ? dims[0] : null;
    const ID = dims.length === 3 && Number.isFinite(dims[1]) ? dims[1] : null;
    const dp = dims.length === 3 && Number.isFinite(dims[2]) ? dims[2] : null;
    const F = effNum(c.flowRate);
    const t0 = summary && typeof summary.t0 === "number" ? summary.t0 : null;
    const tR = summary && typeof summary.trLastPeak === "number" ? summary.trLastPeak : null;
    const Rs = summary && typeof summary.minResolution === "number" ? summary.minResolution : null;
    const BP = maxBackPressure && Number.isFinite(maxBackPressure.maxActual) ? maxBackPressure.maxActual : null;
    if (L === null || ID === null || dp === null) missing.push("column dimensions (like 150x4.6x5) in the file name");
    if (F === null || F <= 0) missing.push("flow rate in the file name");
    if (t0 === null || t0 <= 0) missing.push("t0 (the first peak, uracil)");
    if (tR === null) missing.push("tR of the last peak");
    if (Rs === null) missing.push("resolution");
    if (missing.length) return { ok: false, missing: missing };
    const spp = isCoreShell(c.columnType) ? SPP_FACTOR : 1;
    const u1 = L / (t0 * 60);
    const N1 = L * 1000 / plateHeight(dp, u1, spp);
    return {
        ok: true,
        ref: {
            ligand: canonicalLigand(c.ligand), line: lineFromCode(c.columnType),
            L: L, ID: ID, dp: dp, spp: spp, F: F, t0: t0, tR: tR, Rs: Rs, BP: BP, u: u1, N: N1,
        },
    };
}

// Predicted responses for column `col` ({L, ID, dp, spp}) at flow F.
function predictRun(ref, col, F) {
    const geo = (col.ID * col.ID) / (ref.ID * ref.ID) * (col.L / ref.L);
    const t0 = ref.t0 * (ref.F / F) * geo;
    const tR = ref.tR * (ref.F / F) * geo;
    const BP = ref.BP === null ? null : ref.BP * ((col.L * F) / (ref.L * ref.F)) * Math.pow((ref.dp * ref.ID) / (col.dp * col.ID), 2);
    const u = col.L / (t0 * 60);
    const H = plateHeight(col.dp, u, col.spp);
    const N = col.L * 1000 / H;
    const Rs = ref.Rs * Math.sqrt(N / ref.N);
    return { F: F, t0: t0, tR: tR, BP: BP, u: u, H: H, N: N, Rs: Rs, solvent: tR * F };
}

// Lowest flow that keeps the last peak at or under the tR spec.
function flowForTrSpec(ref, col, tRSpec) {
    return ref.F * (ref.tR / tRSpec) * (col.ID * col.ID) / (ref.ID * ref.ID) * (col.L / ref.L);
}
// Highest flow that keeps back pressure at or under the limit.
function flowForBpSpec(ref, col, bpSpec) {
    if (ref.BP === null) return Infinity;
    return (bpSpec * ref.L * ref.F) / (ref.BP * col.L * Math.pow((ref.dp * ref.ID) / (col.dp * col.ID), 2));
}
// Flow at the Van Deemter optimum velocity on this column (best N).
function flowAtOptimum(ref, col) {
    const uOpt = Math.sqrt(VD_B / VD_C) / col.dp;
    const uAtF1 = predictRun(ref, col, 1).u;
    return uOpt / uAtF1;
}

function rsFloors(ref, specs) {
    const bpRatio = ref.BP === null ? 1 : specs.maxPressure / ref.BP;
    const HR = Math.sqrt(bpRatio * (specs.tRSpec / ref.tR));
    const nMax = 1000 * ref.L * HR / (ref.dp * (VD_A + 2 * Math.sqrt(VD_B * VD_C)));
    const nMaxSpp = nMax * SPP_FACTOR;
    const fpp = specs.rsSpec * Math.sqrt(ref.N / nMax);
    const spp = specs.rsSpec * Math.sqrt(ref.N / nMaxSpp);
    // The column that reaches Nmax (calculator rows 115-118).
    const VF = HR * ref.tR / specs.tRSpec;
    const psOpt = ref.dp * Math.sqrt(Math.sqrt(VD_B / VD_C) / (ref.dp * ref.u * VF));
    const lOpt = ref.L * HR * psOpt / ref.dp;
    const fOpt = ref.F * (lOpt / ref.L) * ref.tR / specs.tRSpec;
    let verdict;
    if (ref.Rs >= fpp) verdict = "OK, reachable with a fully porous column";
    else if (ref.Rs >= spp) verdict = "Needs an SPP (core-shell) bead, out of reach with fully porous";
    else verdict = "Impossible by column geometry: change selectivity";
    return {
        headroom: HR, nMax: nMax, nMaxSpp: nMaxSpp, fpp: fpp, spp: spp, verdict: verdict,
        bpKnown: ref.BP !== null,
        optimum: { ps: psOpt, L: lOpt, F: fOpt },
    };
}

// The nine-case table (Flow Chart 2, efficiency rows).
const EFFICIENCY_CASES = {
    "<<|<<": { n: 1, label: "tR << spec, Rs below the floor", table: "Increase L (watch BP)", levers: ["L+"], goal: "rs" },
    "<<|floor-spec": { n: 2, label: "tR << spec, floor < Rs < spec", table: "Increase L (BP) OR decrease F OR decrease PS (BP) OR SPP", levers: ["L+", "PS-", "SPP"], goal: "rs" },
    "<<|>": { n: 3, label: "tR << spec, Rs > spec", table: "MET. Optionally increase F to shorten the run", levers: [], goal: "speed", met: true },
    "<|<<": { n: 4, label: "tR < spec, Rs below the floor", table: "SELECTIVITY", selectivity: true },
    "<|floor-spec": { n: 5, label: "tR < spec, floor < Rs < spec", table: "Decrease F OR decrease PS (BP) OR SPP", levers: ["PS-", "SPP"], goal: "rs" },
    "<|>": { n: 6, label: "tR < spec, Rs > spec", table: "MET. Optionally increase F to shorten the run", levers: [], goal: "speed", met: true },
    ">|<<": { n: 7, label: "tR > spec, Rs below the floor", table: "SELECTIVITY", selectivity: true },
    ">|floor-spec": { n: 8, label: "tR > spec, floor < Rs < spec", table: "Decrease PS (BP), then increase F to shorten the run", levers: ["PS-", "SPP"], goal: "rs" },
    ">|>": { n: 9, label: "tR > spec, Rs > spec", table: "Increase F to shorten the run", levers: [], goal: "trspec" },
};

function columnKey(col) {
    return [canonicalLigand(col.ligand), col.line || "", col.L, col.ID, col.dp].join("|");
}

// Which levers a column change uses, compared with the reference column.
function leversUsed(ref, col) {
    const out = [];
    if (col.L > ref.L) out.push("L+");
    if (col.L < ref.L) out.push("L-");
    if (col.dp < ref.dp) out.push("PS-");
    if (col.dp > ref.dp) out.push("PS+");
    if (col.spp > ref.spp) out.push("SPP");
    if (col.spp < ref.spp) out.push("FPP");
    return out;
}

const LEVER_WORDS = {
    "L+": "longer column", "L-": "shorter column", "PS-": "smaller particles", "PS+": "larger particles",
    "SPP": "core-shell (SPP) bead", "FPP": "fully porous bead",
};

function round2(x) { return Math.round(x * 100) / 100; }

// Best flow on one column for the given goal. Returns a candidate or null when no flow fits.
function bestFlowFor(ref, col, specs, goal) {
    const fMin = flowForTrSpec(ref, col, specs.tRSpec);
    const fMax = flowForBpSpec(ref, col, specs.maxPressure);
    const lo = Math.ceil(fMin * 100 - 1e-9) / 100;
    const hi = Math.floor(fMax * 100 + 1e-9) / 100;
    if (!(lo <= hi)) return { feasibleFlow: false, fMin: fMin, fMax: fMax };
    let F;
    if (goal === "speed") {
        // Fastest flow that keeps Rs at spec and BP in limit.
        const ok = function (f) { return predictRun(ref, col, f).Rs >= specs.rsSpec; };
        if (ok(hi)) F = hi;
        else if (!ok(lo)) F = lo;
        else {
            let a = lo, b = hi;
            for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (ok(m)) a = m; else b = m; }
            F = Math.floor(a * 100 + 1e-9) / 100;
            if (F < lo) F = lo;
        }
    } else if (goal === "trspec") {
        F = lo;
    } else {
        // Most resolution: as close to the Van Deemter optimum as the limits allow.
        const fOpt = flowAtOptimum(ref, col);
        F = Math.min(Math.max(round2(fOpt), lo), hi);
    }
    return Object.assign({ feasibleFlow: true, fMin: fMin, fMax: fMax }, predictRun(ref, col, F));
}

// Columns to consider: the user's list for this ligand, plus the current column.
function candidateColumns(ref, userColumns) {
    const list = [];
    const seen = new Set();
    const current = { ligand: ref.ligand, line: ref.line, L: ref.L, ID: ref.ID, dp: ref.dp, spp: ref.spp, inLab: true, current: true };
    list.push(current);
    seen.add(columnKey(current));
    for (const c of (userColumns || [])) {
        if (canonicalLigand(c.ligand) !== canonicalLigand(ref.ligand)) continue;
        const col = { ligand: canonicalLigand(c.ligand), line: c.line || "", L: Number(c.L), ID: Number(c.ID), dp: Number(c.dp), spp: isCoreShell(c.line) ? SPP_FACTOR : 1, inLab: c.where !== "order", current: false };
        if (![col.L, col.ID, col.dp].every(Number.isFinite)) continue;
        const k = columnKey(col);
        if (seen.has(k)) continue;
        if (col.L === ref.L && col.ID === ref.ID && col.dp === ref.dp && col.spp === ref.spp) {
            // Same geometry and bead as the current column (another serial number or line): skip.
            continue;
        }
        seen.add(k);
        list.push(col);
    }
    return list;
}

function describeColumn(col) {
    return (col.ligand ? col.ligand + " " : "") + (col.line ? col.line + " " : "") + col.L + " × " + col.ID + " mm, " + col.dp + " µm" + (col.spp > 1 ? " core-shell" : "");
}

function rankRs(a, b) {
    if (a.meetsAll !== b.meetsAll) return a.meetsAll ? -1 : 1;
    if (a.col.inLab !== b.col.inLab) return a.col.inLab ? -1 : 1;
    if (a.levers.length !== b.levers.length) return a.levers.length - b.levers.length;
    const aId = a.col.ID === a.refID, bId = b.col.ID === b.refID;
    if (aId !== bId) return aId ? -1 : 1;
    if (Math.abs(a.pred.tR - b.pred.tR) > 0.05) return a.pred.tR - b.pred.tR;
    return b.pred.Rs - a.pred.Rs;
}
function rankSpeed(a, b) {
    if (a.meetsAll !== b.meetsAll) return a.meetsAll ? -1 : 1;
    if (a.col.inLab !== b.col.inLab) return a.col.inLab ? -1 : 1;
    if (Math.abs(a.pred.tR - b.pred.tR) > 0.05) return a.pred.tR - b.pred.tR;
    return a.levers.length - b.levers.length;
}

// The efficiency decision for one 7-peak run.
//   trClass: "<<" | "<" | ">"     rClass: "<<" | "floor-spec" | ">"
function recommendEfficiency(ref, specs, trClass, rClass, userColumns) {
    const key = trClass + "|" + rClass;
    const kase = EFFICIENCY_CASES[key];
    const out = { caseKey: key, caseNumber: kase.n, caseLabel: kase.label, tableAction: kase.table, met: !!kase.met };
    if (kase.selectivity) { out.selectivity = true; return out; }

    const cols = candidateColumns(ref, userColumns);
    const evaluated = [];
    for (const col of cols) {
        const goal = kase.goal;
        const pred = bestFlowFor(ref, col, specs, goal);
        if (!pred.feasibleFlow) {
            evaluated.push({ col: col, levers: leversUsed(ref, col), feasibleFlow: false, pred: null, meetsAll: false, refID: ref.ID });
            continue;
        }
        const meetsAll = pred.tR <= specs.tRSpec + 1e-9 && (pred.BP === null || pred.BP <= specs.maxPressure + 1e-9) && pred.Rs >= specs.rsSpec - 1e-9;
        evaluated.push({ col: col, levers: leversUsed(ref, col), feasibleFlow: true, pred: pred, meetsAll: meetsAll, refID: ref.ID });
    }
    const allowed = function (e) {
        if (kase.goal === "speed" || kase.goal === "trspec") return e.col.current;
        return e.levers.every(function (l) { return kase.levers.indexOf(l) !== -1; });
    };
    const runnable = evaluated.filter(function (e) { return e.feasibleFlow; });
    const sorter = kase.goal === "speed" ? rankSpeed : rankRs;
    const inCase = runnable.filter(allowed).sort(sorter);
    const others = runnable.filter(function (e) { return !allowed(e) && e.meetsAll; }).sort(sorter);

    let best = inCase.find(function (e) { return e.meetsAll; }) || null;
    out.reachesSpec = !!best;
    if (!best && inCase.length) best = inCase.slice().sort(function (a, b) { return b.pred.Rs - a.pred.Rs; })[0];
    out.best = best ? decorate(ref, best, specs) : null;
    out.inCase = inCase.filter(function (e) { return e !== best; }).map(function (e) { return decorate(ref, e, specs); });
    out.others = others.map(function (e) { return decorate(ref, e, specs); });
    out.columnsChecked = cols.length;
    // Rows 1 and 2 below the floor: when no column and flow put all three in spec, the run goes to selectivity.
    if (key === "<<|<<" && !out.reachesSpec) out.selectivity = true;
    return out;
}

function decorate(ref, e, specs) {
    const p = e.pred;
    const changes = [];
    const col = e.col;
    if (col.L !== ref.L) changes.push("L " + ref.L + " → " + col.L + " mm");
    if (col.ID !== ref.ID) changes.push("ID " + ref.ID + " → " + col.ID + " mm");
    if (col.dp !== ref.dp) changes.push("PS " + ref.dp + " → " + col.dp + " µm");
    if (col.spp !== ref.spp) changes.push(col.spp > ref.spp ? "fully porous → core-shell" : "core-shell → fully porous");
    if (Math.abs(p.F - ref.F) >= 0.005) changes.push("F " + ref.F + " → " + p.F.toFixed(2) + " mL/min");
    return {
        column: col, description: describeColumn(col), current: !!col.current, inLab: col.inLab,
        levers: e.levers, leverWords: e.levers.map(function (l) { return LEVER_WORDS[l]; }),
        F: p.F, tR: p.tR, BP: p.BP, Rs: p.Rs, N: p.N, t0: p.t0, solvent: p.solvent,
        meetsAll: e.meetsAll, changes: changes,
        tROk: p.tR <= specs.tRSpec + 1e-9, bpOk: p.BP === null ? null : p.BP <= specs.maxPressure + 1e-9, rsOk: p.Rs >= specs.rsSpec - 1e-9,
    };
}

// One line for the headline, e.g. "Switch to C18 Pinnacle DB 150 x 4.6 mm, 3 um at 1.27 mL/min".
function efficiencyActionText(eff, ref) {
    if (!eff || !eff.best) return null;
    const b = eff.best;
    if (eff.met) {
        if (Math.abs(b.F - ref.F) < 0.005) return "Method met. Keep the current conditions.";
        return "Method met. Optionally raise F to " + b.F.toFixed(2) + " mL/min to shorten the run.";
    }
    if (b.current) {
        const dir = b.F > ref.F ? "Increase" : "Decrease";
        return dir + " F to " + b.F.toFixed(2) + " mL/min on the current column.";
    }
    return "Switch to " + b.description + " at " + b.F.toFixed(2) + " mL/min.";
}

function predictionText(p) {
    return "tR " + p.tR.toFixed(1) + " min, BP " + (p.BP === null ? "unknown" : Math.round(p.BP) + " psi") + ", Rs " + p.Rs.toFixed(2);
}

if (typeof window !== "undefined") {
    window.hplcEfficiency = {
        buildReference: buildEfficiencyReference, predictRun: predictRun, rsFloors: rsFloors,
        recommend: recommendEfficiency, actionText: efficiencyActionText, predictionText: predictionText,
        isCoreShell: isCoreShell, canonicalLigand: canonicalLigand, cases: EFFICIENCY_CASES,
        SPP_FACTOR: SPP_FACTOR,
    };
}
if (typeof module !== "undefined") {
    module.exports = { buildEfficiencyReference, predictRun, rsFloors, recommendEfficiency, efficiencyActionText, predictionText, isCoreShell, canonicalLigand, EFFICIENCY_CASES, flowForTrSpec, flowForBpSpec };
}
