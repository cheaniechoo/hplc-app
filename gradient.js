// gradient.js: the gradient (GRA) flow chart's decision engine. Nothing here touches the page.
//
// Gradient steepness (GS), from the gradient workshops:
//   GS = dPhi x Vm / (tG x F)       dPhi = (%B fin - %B ini)/100, Vm = pi x (ID/2)^2 x L x 0.68 / 1000 (mL)
// GS constant = selectivity constant. The cases (Flow Chart 2, gradient part):
//   G1 up   peaks < target            Increase GS: same %B window, tG x 0.5
//   G1 down peaks < target after G1up Decrease GS: back to the scouting run, tG x 1.2
//   G1 x    peaks < target after both Change selectivity: temperature, then solvent, then ligand
//   G2      peaks = target, Rs < spec Keep GS: F x 0.8 and tG / 0.8 (stop at tG max, then change selectivity)
//   G3      Rs >= spec, %B wasted     Keep GS, shrink: %B ini = %B first peak - 20, %B fin = %B last peak + 5, tG in proportion
//   G3 fast Rs >= spec, run too long  Keep GS: F x x and tG / x, with BP x x <= limit and Rs / sqrt(x) >= spec
//   G4      Rs >= spec, tR in spec    Method met
// %B at which a peak elutes (workshop: subtract the isocratic hold, add the starting %B):
//   %B(t) = %B ini + (t - hold) x (%B fin - %B ini) / tG

const GRADIENT_DEFAULTS = {
    targetPeaks: 7, rsSpec: 1.4, runTimeSpec: 15, maxPressure: 4000,
    hold: 2, tGMax: 60,
    g1UpFactor: 0.5, g1DownFactor: 1.2, g2Factor: 0.8,
    shrinkStartMargin: 20, shrinkEndMargin: 5, wastedThreshold: 3,
    firstPeakIsMarker: true,
    tempSteps: [40, 60], maxOvenTemp: 60, dwellVolume: 0,
    scouting: { bIni: 5, bFin: 100, tG: 20, F: 1.5 },
};

const GRADIENT_TEMPERATURES = ["amb", "40", "60"];
const GRADIENT_SOLVENTS = ["ACN", "MeOH", "MIX"];

function gNum(v) {
    const n = typeof v === "number" ? v : parseFloat(String(v === undefined || v === null ? "" : v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
}
function gRound(x, d) { const m = Math.pow(10, d); return Math.round(x * m) / m; }

function gradientVm(columnDimensions) {
    const p = String(columnDimensions || "").split("x").map(Number);
    if (p.length !== 3 || !p.every(Number.isFinite)) return null;
    return Math.PI * Math.pow(p[1] / 2, 2) * p[0] * 0.68 / 1000;
}

function gradientSteepness(bIni, bFin, tG, F, Vm) {
    if (![bIni, bFin, tG, F, Vm].every(function (v) { return typeof v === "number" && Number.isFinite(v); })) return null;
    if (tG <= 0 || F <= 0) return null;
    return ((bFin - bIni) / 100) * Vm / (tG * F);
}

// Parse a gradient file name, e.g. GR03-41-3-ACN-3-GRA-5-100-20-1.5-20u-CP-0.1-C18-P-150x4.6x5-amb-254.
// After GRA come %B ini, %B fin, tG (may be written "20min") and F; the rest is as in an isocratic name.
function parseGradientName(name) {
    const tokens = String(name || "").split("-").map(function (t) { return t.trim(); });
    const modeIndex = tokens.findIndex(function (t) { return /^GRA(D)?$/i.test(t); });
    const warnings = [];
    const gradient = { bIni: null, bFin: null, tG: null, F: null };
    if (modeIndex === -1) {
        warnings.push("This file name has no GRA field, so it doesn't look like a gradient run. Check the gradient conditions below.");
        let base = { conditions: {}, warnings: [] };
        try { base = parseConditionsFromName(name); } catch (err) { /* keep empty */ }
        return { conditions: base.conditions || {}, gradient: gradient, warnings: warnings.concat(base.warnings || []) };
    }
    const after = tokens.slice(modeIndex + 1);
    const isNum = function (t) { return /^\d+(\.\d+)?(min)?$/i.test(t); };
    const nums = [];
    let k = 0;
    while (k < after.length && nums.length < 4 && isNum(after[k])) { nums.push(parseFloat(after[k])); k++; }
    if (nums.length < 4) warnings.push("Expected four numbers after GRA (%B ini, %B fin, tG, flow rate) but found " + nums.length + ". Check the gradient conditions below.");
    gradient.bIni = nums.length > 0 ? nums[0] : null;
    gradient.bFin = nums.length > 1 ? nums[1] : null;
    gradient.tG = nums.length > 2 ? nums[2] : null;
    gradient.F = nums.length > 3 ? nums[3] : null;
    // Reuse the isocratic parser for everything else by rebuilding an isocratic-shaped name.
    const isoTokens = tokens.slice(0, modeIndex).concat(["GRAD", "0", gradient.F === null ? "0" : String(gradient.F)]).concat(after.slice(k));
    let base = { conditions: {}, warnings: [] };
    try { base = parseConditionsFromName(isoTokens.join("-")); } catch (err) { /* keep empty */ }
    const conditions = Object.assign({}, base.conditions, { mode: "GRA", percentB: "" });
    const baseWarnings = (base.warnings || []).filter(function (w) { return !/%B/.test(w); });
    return { conditions: conditions, gradient: gradient, warnings: warnings.concat(baseWarnings) };
}

// ---------------------------------------------------------------------------
// Reading the gradient conditions from inside the file (when the file itself has no useful name).
// Sources, in order: the name fields LabSolutions writes (Sample Name, Data File, Method File,
// Original Data File, Sample ID) parsed like a file name; then a gradient time program; then
// the %B trace (B.Conc) recorded during the run.
// ---------------------------------------------------------------------------
const NAME_FIELD_PATTERNS = [/^sample name$/i, /^data file( name)?$/i, /^method file( name)?$/i, /^original data file( name)?$/i, /^sample id$/i, /^data name$/i];

function baseName(v) {
    return String(v || "").trim().replace(/^.*[\\/]/, "").replace(/\.(lcd|lcm|csv|txt|xlsx?|pdf)$/i, "");
}

function gradientNamesInFile(lines) {
    const out = [];
    for (const f of lines) {
        if (!f || f.length < 2) continue;
        const key = String(f[0] || "").trim();
        if (!NAME_FIELD_PATTERNS.some(function (re) { return re.test(key); })) continue;
        const value = baseName(f[1]);
        if (value) out.push({ field: key, value: value });
    }
    return out;
}

// %B program from a list of [time, %B] points: hold, start %B, end %B and tG.
function rampFromPoints(points) {
    const pts = points.filter(function (p) { return Number.isFinite(p[0]) && Number.isFinite(p[1]); }).sort(function (a, b) { return a[0] - b[0]; });
    if (pts.length < 2) return null;
    const first = pts.slice(0, Math.min(5, pts.length)).map(function (p) { return p[1]; }).sort(function (a, b) { return a - b; });
    const bIni = first[Math.floor(first.length / 2)];
    const bFin = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
    if (!(bFin - bIni >= 2)) return null;
    const startPt = pts.find(function (p) { return p[1] > bIni + 0.5; });
    const endPt = pts.find(function (p) { return p[1] >= bFin - 0.5; });
    if (!startPt || !endPt) return null;
    // The ramp starts at the last point still at %B ini before the rise.
    const startIdx = pts.indexOf(startPt);
    const start = startIdx > 0 ? pts[startIdx - 1][0] : startPt[0];
    const tG = endPt[0] - start;
    if (!(tG > 0)) return null;
    return { bIni: gRound(bIni, 1), bFin: gRound(bFin, 1), tG: gRound(tG, 2), hold: gRound(start, 2) };
}

// A time program table: a header row with Time, Command (or Action/Event) and Value columns,
// rows whose command mentions B concentration.
function gradientFromTimeProgram(lines) {
    for (let i = 0; i < lines.length; i++) {
        const h = (lines[i] || []).map(function (c) { return String(c || "").trim().toLowerCase(); });
        const ti = h.findIndex(function (c) { return /^time/.test(c); });
        const ci = h.findIndex(function (c) { return /command|action|event/.test(c); });
        const vi = h.findIndex(function (c) { return /^value/.test(c); });
        if (ti === -1 || ci === -1 || vi === -1) continue;
        const pts = [];
        for (let j = i + 1; j < lines.length; j++) {
            const r = lines[j] || [];
            if (!r.length || r.every(function (c) { return String(c || "").trim() === ""; })) break;
            if (/b\.?\s*conc|conc\.?\s*b/i.test(String(r[ci] || ""))) pts.push([Number(r[ti]), Number(r[vi])]);
        }
        if (pts.length) {
            if (!pts.some(function (p) { return p[0] === 0; })) {
                // %B before the first command is the starting %B (the hold).
                pts.unshift([0, pts[0][1]]);
            }
            const ramp = rampFromPoints(pts);
            if (ramp) return ramp;
        }
    }
    return null;
}

// The %B trace recorded during the run, e.g. [LC Status Trace(B.Conc)].
function gradientFromTrace(lines) {
    const start = lines.findIndex(function (f) { return /^\[.*b\.?\s*conc/i.test(String((f || [])[0] || "")); });
    if (start === -1) return null;
    let mult = 1;
    let i = start + 1;
    while (i < lines.length && String((lines[i] || [])[0] || "") !== "R.Time (min)") {
        if (/intensity multiplier/i.test(String(lines[i][0] || ""))) { const m = Number(lines[i][1]); if (Number.isFinite(m) && m > 0) mult = m; }
        if (/^\[/.test(String(lines[i][0] || ""))) return null;
        i++;
    }
    i++;
    const pts = [];
    while (i < lines.length && lines[i] && String(lines[i][0] || "") !== "" && !/^\[/.test(String(lines[i][0]))) {
        pts.push([Number(lines[i][0]), Number(lines[i][1]) * mult]);
        i++;
    }
    return rampFromPoints(pts);
}

function flowFromFile(lines) {
    for (const f of lines) {
        if (!f || f.length < 2) continue;
        if (/^(total )?flow( rate)?(\s*\(ml\/min\))?$/i.test(String(f[0] || "").trim())) {
            const v = parseFloat(f[1]);
            if (Number.isFinite(v) && v > 0) return v;
        }
    }
    return null;
}

// Fill in a gradient run's conditions from inside the file. `parsed` is what the file name gave.
// Returns { parsed, sources: [text], warnings: [text], nameUsed }.
function gradientConditionsFromFile(lines, fileNameParsed) {
    const parsed = { conditions: Object.assign({}, fileNameParsed.conditions), gradient: Object.assign({}, fileNameParsed.gradient), warnings: [] };
    const sources = [];
    const warnings = [];
    let nameUsed = null;
    const complete = function (g) { return g.bIni !== null && g.bFin !== null && g.tG !== null && g.F !== null; };
    const hasName = !!parsed.conditions.columnDimensions && complete(parsed.gradient);
    if (!hasName) {
        for (const n of gradientNamesInFile(lines)) {
            const p = parseGradientName(n.value);
            const usable = !!p.conditions.columnDimensions || p.gradient.bIni !== null;
            if (!usable || !/GRA/i.test(n.value)) continue;
            nameUsed = n;
            ["bIni", "bFin", "tG", "F"].forEach(function (k) { if (parsed.gradient[k] === null && p.gradient[k] !== null) parsed.gradient[k] = p.gradient[k]; });
            Object.keys(p.conditions).forEach(function (k) { if (!parsed.conditions[k] && p.conditions[k]) parsed.conditions[k] = p.conditions[k]; });
            sources.push("the " + n.field + " inside the file (" + n.value + ")");
            break;
        }
    }
    // The %B program actually run: time program, then the %B trace. Used to fill gaps and to cross-check.
    const prog = gradientFromTimeProgram(lines);
    const trace = prog ? null : gradientFromTrace(lines);
    const ramp = prog || trace;
    let hold = null;
    if (ramp) {
        const what = prog ? "the gradient time program in the file" : "the %B trace recorded in the file";
        const filled = [];
        ["bIni", "bFin", "tG"].forEach(function (k) {
            if (parsed.gradient[k] === null) { parsed.gradient[k] = ramp[k]; filled.push(k); }
            else if (Math.abs(parsed.gradient[k] - ramp[k]) > (k === "tG" ? 0.5 : 1)) {
                warnings.push("The name says " + ({ bIni: "%B ini", bFin: "%B fin", tG: "tG" })[k] + " = " + parsed.gradient[k] + ", but " + what + " shows " + ramp[k] + ". Check which is right; the name is used.");
            }
        });
        hold = ramp.hold;
        if (filled.length) sources.push(what + " (" + filled.map(function (k) { return ({ bIni: "%B ini", bFin: "%B fin", tG: "tG" })[k]; }).join(", ") + ")");
    }
    if (parsed.gradient.F === null) {
        const f = flowFromFile(lines);
        if (f !== null) { parsed.gradient.F = f; sources.push("the flow rate field in the file"); }
    }
    return { parsed: parsed, sources: sources, warnings: warnings, nameUsed: nameUsed, hold: hold };
}

// %B in the column when a peak elutes.
// Delay before the gradient reaches the column: the isocratic hold plus the dwell time
// (dwell volume / flow). Dwell volume defaults to 0 so the answer key is unchanged.
function gradientDelay(run, specs) {
    const dwell = Number(specs.dwellVolume) > 0 && Number(run.F) > 0 ? Number(specs.dwellVolume) / Number(run.F) : 0;
    return specs.hold + dwell;
}
function percentBAt(t, run, specs) {
    const slope = (run.bFin - run.bIni) / run.tG;
    const b = run.bIni + (t - gradientDelay(run, specs)) * slope;
    return Math.min(Math.max(b, run.bIni), run.bFin);
}
// Time at which the gradient reaches a given %B.
function timeAtPercentB(b, run, specs) {
    const slope = (run.bFin - run.bIni) / run.tG;
    return gradientDelay(run, specs) + (b - run.bIni) / slope;
}

function normTemp(t) {
    const s = String(t || "").trim().toUpperCase();
    if (!s || s === "AMB" || s === "AMBIENT") return "amb";
    const m = s.match(/^T?(\d+)/);
    return m ? m[1] : s.toLowerCase();
}
function normSolvent(s) {
    const u = String(s || "").trim().toUpperCase();
    if (u === "MEOH" || u === "MOH") return "MeOH";
    if (u === "MIX") return "MIX";
    if (u === "ACN") return "ACN";
    return String(s || "").trim();
}
function chemistryKey(run) {
    return [normSolvent(run.solvent), normTemp(run.temperature), String(run.ligand || "").toLowerCase(), String(run.columnDimensions || "").toLowerCase()].join("|");
}

// Order runs by run number (then upload order), so a run gets the same decision whatever order the files came in.
function sortGradientRuns(runs) {
    return runs.slice().map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
        const na = Number(a.r.runNumber), nb = Number(b.r.runNumber);
        const fa = Number.isFinite(na), fb = Number.isFinite(nb);
        if (fa && fb && na !== nb) return na - nb;
        return a.i - b.i;
    }).map(function (x) { return x.r; });
}

// The next selectivity change after G1 fails: temperature ladder, then solvent, then ligand.
function nextGradientSelectivity(run, history, specs) {
    const steps = specs && Array.isArray(specs.tempSteps) && specs.tempSteps.length ? specs.tempSteps : [40, 60];
    const maxOven = specs && Number(specs.maxOvenTemp) > 0 ? Number(specs.maxOvenTemp) : Infinity;
    const GRADIENT_TEMPERATURES = ["amb"].concat(steps.filter(function (t) { return t <= maxOven; }).map(String));
    const tried = new Set(history.map(function (h) { return normSolvent(h.solvent) + "|" + normTemp(h.temperature) + "|" + String(h.ligand || "").toLowerCase(); }));
    const lig = String(run.ligand || "").toLowerCase();
    const solv = normSolvent(run.solvent);
    const temp = normTemp(run.temperature);
    const ti = GRADIENT_TEMPERATURES.indexOf(temp);
    for (let i = (ti === -1 ? 0 : ti + 1); i < GRADIENT_TEMPERATURES.length; i++) {
        const t = GRADIENT_TEMPERATURES[i];
        if (!tried.has(solv + "|" + t + "|" + lig)) return { kind: "temperature", temperature: t, solvent: solv, text: "Change the temperature to " + t + " °C" };
    }
    for (const s of GRADIENT_SOLVENTS) {
        if (s === solv) continue;
        if (!Array.from(tried).some(function (k) { return k.indexOf(s + "|") === 0 && k.slice(-lig.length - 1) === "|" + lig; })) {
            return { kind: "solvent", temperature: "amb", solvent: s, text: "Change solvent B to " + s + " (back to ambient)" };
        }
    }
    return { kind: "ligand", text: "Change the ligand (stationary phase): temperature and solvent changes have not given the target peaks on this column" };
}

// Decide the next gradient run.
//   run: { fileName, runNumber, solvent, temperature, ligand, columnDimensions, bIni, bFin, tG, F, hold,
//          numPeaks, peakTimes[], minResolution, trLastPeak, maxPressure }
//   history: every gradient run loaded (any order); only runs up to and including this one are used.
function decideGradient(run, history, specsIn) {
    const specs = Object.assign({}, GRADIENT_DEFAULTS, specsIn || {});
    if (run && typeof run.hold === "number" && run.hold >= 0) specs.hold = run.hold;
    const out = { run: run };
    const Vm = gradientVm(run.columnDimensions);
    const missing = [];
    if (run.bIni === null || run.bFin === null) missing.push("%B ini and %B fin");
    if (run.tG === null) missing.push("tG");
    if (run.F === null) missing.push("flow rate");
    if (Vm === null) missing.push("column dimensions");
    if (missing.length) {
        return Object.assign(out, { caseId: "error", stage: "Check the conditions", action: "Fill in " + missing.join(", ") + " for this run.", message: "GS needs %B ini, %B fin, tG, flow rate and the column dimensions." });
    }
    const GS = gradientSteepness(run.bIni, run.bFin, run.tG, run.F, Vm);
    out.Vm = Vm;
    out.GS = GS;

    // Safety first.
    if (typeof run.maxPressure === "number" && run.maxPressure >= specs.maxPressure) {
        return Object.assign(out, { caseId: "unsafe", unsafe: true, stage: "Safety check", action: "Stop. Back pressure reached " + Math.round(run.maxPressure) + " psi, at or above the limit of " + specs.maxPressure + " psi.", message: "In gradient the pressure peaks mid-gradient (more so with methanol). Do not act on this run until the pressure issue is fixed." });
    }

    const ordered = sortGradientRuns(history.some(function (h) { return h.fileName === run.fileName; }) ? history : history.concat([run]));
    const upTo = ordered.slice(0, ordered.findIndex(function (h) { return h.fileName === run.fileName; }) + 1);
    const series = upTo.filter(function (h) { return chemistryKey(h) === chemistryKey(run); });
    const scout = series[0] || run;
    const scoutVm = gradientVm(scout.columnDimensions) || Vm;
    const GS0 = gradientSteepness(scout.bIni, scout.bFin, scout.tG, scout.F, scoutVm);
    out.reference = { fileName: scout.fileName, GS: GS0 };

    const next = function (bIni, bFin, tG, F, extra) {
        const n = Object.assign({ bIni: gRound(bIni, 1), bFin: gRound(bFin, 1), tG: gRound(tG, 2), F: gRound(F, 2), solvent: run.solvent, temperature: run.temperature, ligand: run.ligand, columnDimensions: run.columnDimensions }, extra || {});
        n.GS = gradientSteepness(n.bIni, n.bFin, n.tG, n.F, gradientVm(n.columnDimensions) || Vm);
        return n;
    };

    const peaks = run.numPeaks;
    if (peaks === null || peaks === undefined || peaks === 0) {
        return Object.assign(out, { caseId: "error", stage: "No peaks", action: "Check the injection and detector, then repeat this run.", message: "No peak table was found in this file." });
    }
    if (peaks > specs.targetPeaks) {
        return Object.assign(out, { caseId: "more", caseLabel: "INVESTIGATE", investigate: true, stage: "INVESTIGATE", action: "INVESTIGATE: " + peaks + " peaks after removing the small ones, more than the target of " + specs.targetPeaks + ". Check the integration and, if the extra peaks are real, purge the system.", message: "Found " + peaks + " peaks, more than the target of " + specs.targetPeaks + ", even after peaks under the height threshold were removed. Check the integration (raise the height threshold if the extra peaks are noise) or purge for carry-over, before deciding." });
    }

    if (peaks < specs.targetPeaks) {
        const ratio = GS0 ? GS / GS0 : 1;
        const isFirst = series.length <= 1 || run.fileName === scout.fileName;
        if (isFirst || (ratio > 0.95 && ratio < 1.25)) {
            const n = next(run.bIni, run.bFin, run.tG * specs.g1UpFactor, run.F);
            return Object.assign(out, {
                caseId: "G1up", caseLabel: "G1 ↑", stage: "G1 ↑ Increase GS",
                action: "Increase GS: same %B window, tG × " + specs.g1UpFactor + " → " + n.bIni + "–" + n.bFin + " %B in " + n.tG + " min at " + n.F + " mL/min.",
                message: "Found " + peaks + " of " + specs.targetPeaks + " peaks. Some compounds co-elute, so the spacing must change: change GS. A shorter tG raises GS (GS " + GS.toFixed(3) + " → " + n.GS.toFixed(3) + ").",
                next: n,
            });
        }
        if (ratio >= 1.25) {
            const n = next(scout.bIni, scout.bFin, scout.tG * specs.g1DownFactor, scout.F);
            return Object.assign(out, {
                caseId: "G1down", caseLabel: "G1 ↓", stage: "G1 ↓ Decrease GS",
                action: "Decrease GS: back to the scouting run, tG × " + specs.g1DownFactor + " → " + n.bIni + "–" + n.bFin + " %B in " + n.tG + " min at " + n.F + " mL/min.",
                message: "Raising GS (G1 ↑) still gave " + peaks + " of " + specs.targetPeaks + " peaks. Go the other way: from the scouting run (" + scout.fileName + "), lower GS with a longer tG (GS " + GS0.toFixed(3) + " → " + n.GS.toFixed(3) + ").",
                next: n,
            });
        }
        const sel = nextGradientSelectivity(run, upTo, specs);
        const sc = specs.scouting;
        const n = sel.kind === "ligand" ? null : next(sc.bIni, sc.bFin, sc.tG, sc.F, { temperature: sel.temperature, solvent: sel.solvent });
        return Object.assign(out, {
            caseId: "G1x", caseLabel: "G1 ✕", stage: "G1 ✕ Change selectivity",
            action: sel.kind === "ligand" ? "Change the ligand, then start again with a scouting gradient." : sel.text + ", then start again with a scouting gradient: " + n.bIni + "–" + n.bFin + " %B in " + n.tG + " min at " + n.F + " mL/min.",
            message: "Both raising GS (G1 ↑) and lowering it (G1 ↓) left " + peaks + " of " + specs.targetPeaks + " peaks. GS alone cannot separate them, so change the chemistry. Each new condition runs the cases again from a scouting gradient (G1 ↑, G1 ↓, G2, G3, G4).",
            selectivity: sel, next: n,
        });
    }

    // Exactly the target number of peaks.
    const rs = run.minResolution;
    if (typeof rs === "number" && rs < specs.rsSpec) {
        // G2: keep GS, stretch.
        const atMax = run.tG >= specs.tGMax - 1e-6;
        if (atMax) {
            const sel = nextGradientSelectivity(run, upTo, specs);
            const sc = specs.scouting;
            const n = sel.kind === "ligand" ? null : next(sc.bIni, sc.bFin, sc.tG, sc.F, { temperature: sel.temperature, solvent: sel.solvent });
            return Object.assign(out, {
                caseId: "G2stop", caseLabel: "G2 (limit)", stage: "G2 exhausted: change selectivity",
                action: (sel.kind === "ligand" ? "Change the ligand" : sel.text) + ", then start again with a scouting gradient.",
                message: "tG is already at the " + specs.tGMax + " min limit and Rs is " + rs.toFixed(2) + " < " + specs.rsSpec + ". Keeping GS only buys efficiency (Rs grows with √N), so G2 has done what it can. A GS change (tG or F first, Δφ last) or a chemistry change is needed to improve the spacing.",
                selectivity: sel, next: n,
            });
        }
        let tGn = run.tG / specs.g2Factor;
        let Fn = run.F * specs.g2Factor;
        let jumped = false;
        if (tGn > specs.tGMax) { tGn = specs.tGMax; Fn = run.F * run.tG / specs.tGMax; jumped = true; }
        const n = next(run.bIni, run.bFin, tGn, Fn);
        // Best case Rs at constant GS: Rs grows as 1/sqrt(F) (lecturer's forum answer).
        const rsBest = rs * Math.sqrt(run.F / n.F);
        let fitted = null;
        const g2Runs = series.filter(function (h) { return h.numPeaks === specs.targetPeaks && typeof h.minResolution === "number" && Math.abs((gradientSteepness(h.bIni, h.bFin, h.tG, h.F, gradientVm(h.columnDimensions) || Vm) || 0) / GS - 1) < 0.03; });
        if (g2Runs.length >= 2) {
            const a0 = g2Runs[0], a1 = g2Runs[g2Runs.length - 1];
            if (a0.F !== a1.F && a0.minResolution > 0 && a1.minResolution > 0) {
                const a = Math.log(a1.minResolution / a0.minResolution) / Math.log(a0.F / a1.F);
                if (Number.isFinite(a)) fitted = { a: a, rs: a1.minResolution * Math.pow(a1.F / n.F, a) };
            }
        }
        n.predictedRs = fitted ? fitted.rs : rsBest;
        return Object.assign(out, {
            caseId: "G2", caseLabel: "G2", stage: "G2 Keep GS, stretch",
            action: "Keep GS: F × " + specs.g2Factor + " and tG ÷ " + specs.g2Factor + " → " + n.bIni + "–" + n.bFin + " %B in " + n.tG + " min at " + n.F + " mL/min." + (jumped ? " (tG capped at " + specs.tGMax + " min.)" : ""),
            message: "All " + specs.targetPeaks + " peaks are there but Rs is " + rs.toFixed(2) + " < " + specs.rsSpec + ". Keep GS (" + GS.toFixed(3) + ") so the spacing stays, and stretch the chromatogram: lower F, longer tG. Predicted Rs about " + n.predictedRs.toFixed(2) + (fitted ? " (fitted to your G2 runs, exponent " + fitted.a.toFixed(2) + ")." : " at best (Rs ∝ 1/√F).") + (rsBest < specs.rsSpec && !jumped ? " Even the best case at tG " + specs.tGMax + " min would give Rs " + (rs * Math.sqrt(run.tG / specs.tGMax)).toFixed(2) + "." : ""),
            next: n,
        });
    }

    // Rs at or above spec.
    const times = (run.peakTimes || []).filter(function (t) { return typeof t === "number"; });
    const first = specs.firstPeakIsMarker && times.length > 1 ? times[1] : times[0];
    const last = times[times.length - 1];
    const bFirst = percentBAt(first, run, specs);
    const bLast = percentBAt(last, run, specs);
    const newIni = Math.max(run.bIni, Math.floor(bFirst - specs.shrinkStartMargin));
    const newFin = Math.min(run.bFin, Math.ceil(bLast + specs.shrinkEndMargin));
    // Shrink once: a run whose window is already narrower than its series' scouting run is not trimmed
    // again (the lecturer's forum answer: keep the G3 margins, they protect the selectivity).
    const alreadyShrunk = run.fileName !== scout.fileName && (run.bIni > scout.bIni || run.bFin < scout.bFin);
    const wasted = !alreadyShrunk && ((newIni - run.bIni) >= specs.wastedThreshold || (run.bFin - newFin) >= specs.wastedThreshold);
    out.elution = { first: first, last: last, bFirst: bFirst, bLast: bLast };
    if (wasted && newFin > newIni) {
        const tGn = run.tG * (newFin - newIni) / (run.bFin - run.bIni);
        const n = next(newIni, newFin, tGn, run.F);
        const runEnd = specs.hold + tGn;
        return Object.assign(out, {
            caseId: "G3", caseLabel: "G3", stage: "G3 Keep GS, shrink",
            action: "Keep GS, shrink the window: " + n.bIni + "–" + n.bFin + " %B in " + n.tG + " min at " + n.F + " mL/min.",
            message: "All peaks resolved (Rs " + rs.toFixed(2) + " ≥ " + specs.rsSpec + "), but part of the %B window is unused. The first peak" + (specs.firstPeakIsMarker ? " after uracil" : "") + " elutes at " + first.toFixed(2) + " min = " + bFirst.toFixed(1) + " %B and the last at " + last.toFixed(2) + " min = " + bLast.toFixed(1) + " %B (" + specs.hold + " min hold subtracted). New window: " + bFirst.toFixed(1) + " − " + specs.shrinkStartMargin + " and " + bLast.toFixed(1) + " + " + specs.shrinkEndMargin + ", tG cut in proportion so GS stays " + GS.toFixed(3) + ". Gradient ends about " + runEnd.toFixed(1) + " min.",
            next: n,
        });
    }
    if (typeof run.trLastPeak === "number" && run.trLastPeak > specs.runTimeSpec) {
        // Already shrunk but still long: raise F by x and divide tG by x (GS kept), within BP and Rs limits.
        const need = (run.trLastPeak - specs.hold) / Math.max(specs.runTimeSpec - specs.hold, 0.1);
        const bpLim = typeof run.maxPressure === "number" && run.maxPressure > 0 ? specs.maxPressure / run.maxPressure : Infinity;
        const rsLim = Math.pow(rs / specs.rsSpec, 2);
        const x = Math.min(need, bpLim, rsLim);
        if (x > 1.02) {
            const n = next(run.bIni, run.bFin, run.tG / x, run.F * x);
            n.predictedRs = rs / Math.sqrt(x);
            n.predictedBP = typeof run.maxPressure === "number" ? run.maxPressure * x : null;
            return Object.assign(out, {
                caseId: "G3fast", caseLabel: "G3 (faster)", stage: "G3 Keep GS, faster",
                action: "Keep GS, run faster: F × " + x.toFixed(2) + " and tG ÷ " + x.toFixed(2) + " → " + n.bIni + "–" + n.bFin + " %B in " + n.tG + " min at " + n.F + " mL/min.",
                message: "The window is already shrunk but the last peak (" + run.trLastPeak.toFixed(2) + " min) is over the run-time spec of " + specs.runTimeSpec + " min. x is limited by back pressure (BP × x ≤ " + specs.maxPressure + " psi, x ≤ " + (bpLim === Infinity ? "n/a" : bpLim.toFixed(2)) + ") and by Rs (Rs ÷ √x ≥ " + specs.rsSpec + ", x ≤ " + rsLim.toFixed(2) + "). Predicted Rs " + n.predictedRs.toFixed(2) + (n.predictedBP ? ", BP about " + Math.round(n.predictedBP) + " psi." : "."),
                next: n,
            });
        }
        return Object.assign(out, {
            caseId: "G4", caseLabel: "G4", stage: "G4 Method met (longer run accepted)", pass: true,
            action: "Method met: lock it. The run is longer than the spec, but F can't be raised without losing Rs or exceeding back pressure.",
            message: "Rs " + rs.toFixed(2) + " ≥ " + specs.rsSpec + " with all peaks. In gradient the run time is set by the window, which is already shrunk. If you needed to lower F to reach Rs, there is little room to raise it again: accept the longer run.",
        });
    }
    return Object.assign(out, {
        caseId: "G4", caseLabel: "G4", stage: "G4 Method met", pass: true,
        action: "Method met: lock it. " + run.bIni + "–" + run.bFin + " %B in " + run.tG + " min at " + run.F + " mL/min.",
        message: "All " + specs.targetPeaks + " peaks, Rs " + rs.toFixed(2) + " ≥ " + specs.rsSpec + ", last peak at " + (typeof run.trLastPeak === "number" ? run.trLastPeak.toFixed(2) : "?") + " min within the run-time spec of " + specs.runTimeSpec + " min, and no %B wasted.",
    });
}

if (typeof window !== "undefined") {
    window.hplcGradient = { fromFile: gradientConditionsFromFile, decide: decideGradient, parseName: parseGradientName, GS: gradientSteepness, Vm: gradientVm, defaults: GRADIENT_DEFAULTS, percentBAt: percentBAt, sort: sortGradientRuns };
}
if (typeof module !== "undefined") {
    module.exports = { gradientConditionsFromFile, rampFromPoints, decideGradient, parseGradientName, gradientSteepness, gradientVm, GRADIENT_DEFAULTS, percentBAt, sortGradientRuns };
}
