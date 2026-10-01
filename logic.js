// logic.js: parsing the exported file, and running the retention / selectivity rules.
//
// Nothing in this file touches the web page (no document., no innerHTML). It only
// takes text or data in and returns plain objects.
// ============================================================================
// PART 1: reading the LabSolutions export
// ============================================================================
function splitIntoLines(rawText) {
    return rawText.split(/\r?\n/).map(function (line) {
        const fields = line.split(",");
        while (fields.length > 0 && fields[fields.length - 1] === "") {
            fields.pop();
        }
        return fields;
    });
}
function findSampleName(lines) {
    for (const fields of lines) {
        if (fields[0] === "Sample Name" && fields.length > 1) {
            return fields[1].trim();
        }
    }
    return "";
}
function findPeakTable(lines) {
    const sectionStart = lines.findIndex(function (fields) {
        return fields[0] && fields[0].indexOf("[Peak Table") === 0;
    });
    if (sectionStart === -1) {
        return { peaks: [], declaredCount: null };
    }
    let declaredCount = null;
    const countRow = lines[sectionStart + 1];
    if (countRow && countRow[0] === "# of Peaks") {
        declaredCount = Number(countRow[1]);
    }
    const headerRow = lines[sectionStart + 2] || [];
    const columnIndex = {
        peakNum: headerRow.indexOf("Peak#"),
        rTime: headerRow.indexOf("R.Time"),
        kPrime: headerRow.indexOf("k'"),
        plateCount: headerRow.indexOf("Plate #"),
        tailing: headerRow.indexOf("Tailing"),
        resolution: headerRow.indexOf("Resolution"),
    };
    const peaks = [];
    let rowIndex = sectionStart + 3;
    while (rowIndex < lines.length) {
        const row = lines[rowIndex];
        if (!row[0]) break;
        peaks.push({
            peakNum: readNumber(row, columnIndex.peakNum),
            rTime: readNumber(row, columnIndex.rTime),
            kPrime: readNumber(row, columnIndex.kPrime),
            plateCount: readNumber(row, columnIndex.plateCount),
            tailing: readNumber(row, columnIndex.tailing),
            resolution: readNumber(row, columnIndex.resolution),
        });
        rowIndex++;
    }
    return { peaks: peaks, declaredCount: declaredCount };
}
function readNumber(row, index) {
    if (index === -1 || index >= row.length) return null;
    const value = Number(row[index]);
    return Number.isNaN(value) ? null : value;
}
function summarizeRun(peaks) {
    if (peaks.length === 0) {
        return { numPeaks: 0, trLastPeak: null, minResolution: null, t0: null };
    }
    const lastPeak = peaks[peaks.length - 1];
    const firstPeak = peaks[0];
    const resolutions = peaks
        .slice(1)
        .map(function (p) { return p.resolution; })
        .filter(function (r) { return r !== null; });
    return {
        numPeaks: peaks.length,
        trLastPeak: lastPeak.rTime,
        minResolution: resolutions.length > 0 ? Math.min.apply(null, resolutions) : null,
        t0: firstPeak.rTime,
    };
}
function findPeakPressureTrace(lines, sectionName) {
    const sectionStart = lines.findIndex(function (fields) {
        return fields[0] === "[" + sectionName + "]";
    });
    if (sectionStart === -1) return null;
    const meta = {};
    let i = sectionStart + 1;
    while (i < lines.length && lines[i][0] !== "R.Time (min)") {
        meta[lines[i][0]] = lines[i][1];
        i++;
    }
    i++;
    const multiplier = Number(meta["Intensity Multiplier"]);
    let maxRaw = null;
    while (i < lines.length && lines[i][0]) {
        const raw = Number(lines[i][1]);
        if (!Number.isNaN(raw) && (maxRaw === null || raw > maxRaw)) {
            maxRaw = raw;
        }
        i++;
    }
    if (maxRaw === null) return null;
    return {
        units: meta["Intensity Units"] || "",
        maxActual: Number.isNaN(multiplier) ? maxRaw : maxRaw * multiplier,
    };
}
function findMaxBackPressure(lines) {
    const pumpA = findPeakPressureTrace(lines, "LC Status Trace(Pump A Pressure)");
    const pumpB = findPeakPressureTrace(lines, "LC Status Trace(Pump B Pressure)");
    const readings = [pumpA, pumpB].filter(function (r) { return r !== null; });
    if (readings.length === 0) return null;
    return {
        maxActual: Math.max.apply(null, readings.map(function (r) { return r.maxActual; })),
        units: readings[0].units,
    };
}
// ============================================================================
// PART 2: reading conditions from the name
// ============================================================================
function parseConditionsFromName(name) {
    const warnings = [];
    const tokens = name.split("-").map(function (t) { return t.trim(); });
    const conditions = {
        grNumber: "", runNumber: "", hplcNumber: "", solvent: "", pH: "", mode: "",
        percentB: "", flowRate: "", sampleVolume: "", sampleType: "", sampleConcentration: "",
        ligand: "", columnType: "", columnDimensions: "", temperature: "", wavelength: "",
    };
    const modeIndex = tokens.findIndex(function (t) {
        return /^(ISO|GRAD)$/i.test(t);
    });
    if (modeIndex === -1) {
        warnings.push("Could not find ISO or GRAD in the name, so the fields around it could not be located.");
        return { conditions: conditions, warnings: warnings };
    }
    const before = tokens.slice(0, modeIndex);
    if (before.length !== 5) {
        warnings.push(
            "Expected 5 fields before ISO/GRAD (GR number, Run #, HPLC #, solvent, pH) but found " +
            before.length + ". Check these fields carefully."
        );
    }
    conditions.grNumber = before[0] || "";
    conditions.runNumber = before[1] || "";
    conditions.hplcNumber = before[2] || "";
    conditions.solvent = before[3] || "";
    conditions.pH = before[4] || "";
    conditions.mode = tokens[modeIndex].toUpperCase();
    const hplcNum = Number(conditions.hplcNumber);
    if (conditions.hplcNumber && (Number.isNaN(hplcNum) || hplcNum < 1 || hplcNum > 6)) {
        warnings.push("HPLC # (" + conditions.hplcNumber + ") is outside the expected range of 1-6 - double check the field order for this name.");
    }
    const after = tokens.slice(modeIndex + 1);
    const dimensionsPattern = /^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/i;
    const plainNumberPattern = /^\d+(\.\d+)?$/;
    const numberWithLetterSuffix = /^\d+(\.\d+)?[a-z]+$/i;
    const dimensionsIndex = after.findIndex(function (t) {
        return dimensionsPattern.test(t);
    });
    if (dimensionsIndex === -1) {
        warnings.push("Could not find a column-dimensions field (like 150x4.6x5) after ISO/GRAD.");
    } else {
        conditions.columnDimensions = after[dimensionsIndex];
        conditions.temperature = after[dimensionsIndex + 1] || "";
        conditions.wavelength = after[dimensionsIndex + 2] || "";
    }
    const middle = dimensionsIndex === -1 ? after : after.slice(0, dimensionsIndex);
    const numberTokens = [];
    let volumeToken = null;
    const wordTokens = [];
    for (const token of middle) {
        if (plainNumberPattern.test(token)) {
            numberTokens.push(token);
        } else if (numberWithLetterSuffix.test(token)) {
            volumeToken = token;
        } else if (token !== "") {
            wordTokens.push(token);
        }
    }
    conditions.percentB = numberTokens[0] || "";
    conditions.flowRate = numberTokens[1] || "";
    if (volumeToken) {
        conditions.sampleVolume = volumeToken;
        conditions.sampleConcentration = numberTokens[2] || "";
    } else {
        conditions.sampleVolume = numberTokens[2] || "";
        conditions.sampleConcentration = numberTokens[3] || "";
    }
    conditions.sampleType = wordTokens[0] || "";
    const ligandTokens = wordTokens.slice(1);
    if (ligandTokens.length >= 2) {
        conditions.ligand = ligandTokens[0];
        conditions.columnType = ligandTokens.slice(1).join(" ");
    } else if (ligandTokens.length === 1) {
        const split = splitLigandAndParticleCode(ligandTokens[0]);
        conditions.ligand = split.ligand;
        conditions.columnType = split.columnType;
        if (!split.matched) {
            warnings.push("Ligand code " + ligandTokens[0] + " was not recognised - check it and the particle/column-type code manually.");
        }
    }
    if (!conditions.percentB) warnings.push("Could not identify %B.");
    if (!conditions.sampleType) warnings.push("Could not identify sample type.");
    if (!conditions.ligand) warnings.push("Could not identify the ligand.");
    return { conditions: conditions, warnings: warnings };
}
const KNOWN_SOLVENTS = ["ACN", "MeOH", "MIX"];
const KNOWN_MODES = ["ISO", "GRAD"];
const KNOWN_SAMPLE_TYPES = ["CP", "BLK"];
const KNOWN_LIGAND_CODES = ["C18aq", "C18n", "C18o", "C18", "C8", "BiPH", "IDB", "PFP"];
const KNOWN_PARTICLE_CODES = ["P", "U", "F", "R"];
function splitLigandAndParticleCode(token) {
    const upperToken = token.toUpperCase();
    for (const code of KNOWN_LIGAND_CODES) {
        if (upperToken.indexOf(code.toUpperCase()) === 0) {
            const ligandPart = token.slice(0, code.length);
            const rest = token.slice(code.length);
            if (rest === "" || KNOWN_PARTICLE_CODES.indexOf(rest.toUpperCase()) !== -1) {
                return { ligand: ligandPart, columnType: rest, matched: true };
            }
        }
    }
    return { ligand: token, columnType: "", matched: false };
}
// ============================================================================
// PART 3: the log K vs %B fit, and the derived Min %B
// ============================================================================
const LOGK_EXCLUDED_PERCENT_B = 90;
const LOGK_R2_IMPROVEMENT_THRESHOLD = 0.99;
const LOGK_MIN_POINTS = 4;
function entryToLogKPoint(entry, averageT0) {
    if (entry.percentB === null || entry.trLastPeak === null) return null;
    if (averageT0 === null || averageT0 <= 0) return null;
    const k = (entry.trLastPeak - averageT0) / averageT0;
    if (k <= 0) return null;
    return {
        percentB: entry.percentB,
        trLastPeak: entry.trLastPeak,
        k: k,
        logK: Math.log10(k),
    };
}
function fitLine(points) {
    if (points.length < 2) return null;
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (const p of points) {
        sumX += p.percentB;
        sumY += p.logK;
        sumXY += p.percentB * p.logK;
        sumXX += p.percentB * p.percentB;
        sumYY += p.logK * p.logK;
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    const sxx = sumXX - n * meanX * meanX;
    const syy = sumYY - n * meanY * meanY;
    const sxy = sumXY - n * meanX * meanY;
    if (sxx === 0) return null;
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    const rSquared = (syy === 0) ? 1 : (sxy * sxy) / (sxx * syy);
    return {
        slope: slope,
        intercept: intercept,
        rSquared: rSquared,
        points: points.slice(),
    };
}
function fitLogKvsPercentB(history) {
    const t0Values = history
        .map(function (e) { return e.t0; })
        .filter(function (v) { return typeof v === "number" && v > 0; });
    const averageT0 = t0Values.length
        ? t0Values.reduce(function (a, b) { return a + b; }, 0) / t0Values.length
        : null;
    if (averageT0 === null) {
        return {
            sufficientData: false,
            reason: "No run in the history has a usable t0 (the first peak's retention time), so the log K fit cannot be made.",
        };
    }
    const candidates = [];
    const excluded = [];
    for (const entry of history) {
        if (entry.percentB === LOGK_EXCLUDED_PERCENT_B) {
            excluded.push({
                percentB: entry.percentB,
                reason: "90% B is always excluded: at 90% B the peaks are not separated, so the last peak's tR is estimated rather than measured.",
            });
            continue;
        }
        const point = entryToLogKPoint(entry, averageT0);
        if (point) candidates.push(point);
    }
    if (candidates.length < LOGK_MIN_POINTS) {
        return {
            sufficientData: false,
            averageT0: averageT0,
            pointsUsed: candidates,
            excluded: excluded,
            reason: "Only " + candidates.length + " run(s) with a usable log K point. At least " + LOGK_MIN_POINTS + " are needed to fit the line.",
        };
    }
    const firstFit = fitLine(candidates);
    let droppedPoint = null;
    let finalFit = firstFit;
    if (firstFit && firstFit.rSquared < LOGK_R2_IMPROVEMENT_THRESHOLD && candidates.length > LOGK_MIN_POINTS) {
        let bestDrop = null;
        let bestR2 = firstFit.rSquared;
        for (let i = 0; i < candidates.length; i++) {
            const subset = candidates.slice(0, i).concat(candidates.slice(i + 1));
            const trial = fitLine(subset);
            if (trial && trial.rSquared > bestR2) {
                bestR2 = trial.rSquared;
                bestDrop = { index: i, fit: trial, point: candidates[i] };
            }
        }
        if (bestDrop) {
            droppedPoint = bestDrop.point;
            finalFit = bestDrop.fit;
        }
    }
    return {
        sufficientData: true,
        averageT0: averageT0,
        pointsUsed: finalFit.points,
        excluded: excluded,
        droppedPoint: droppedPoint,
        slope: finalFit.slope,
        intercept: finalFit.intercept,
        rSquared: finalFit.rSquared,
        firstFitRSquared: firstFit.rSquared,
        equation: "log K = " + finalFit.slope.toFixed(5) + " x %B + " + finalFit.intercept.toFixed(5),
    };
}
function computeMinPercentB(history, tRSpec) {
    const fit = fitLogKvsPercentB(history);
    if (!fit.sufficientData) {
        return { sufficientData: false, fit: fit, reason: fit.reason };
    }
    if (!tRSpec || tRSpec <= 0) {
        return { sufficientData: false, fit: fit, reason: "The tR spec is not set, so the min %B cannot be computed." };
    }
    const t0 = fit.averageT0;
    const targetK = (tRSpec - t0) / t0;
    if (targetK <= 0) {
        return { sufficientData: false, fit: fit, reason: "The tR spec is at or below t0, so no positive K can put the last peak on spec." };
    }
    const targetLogK = Math.log10(targetK);
    if (fit.slope === 0) {
        return { sufficientData: false, fit: fit, reason: "The fitted line has zero slope, so the min %B cannot be solved." };
    }
    const minPercentB = (targetLogK - fit.intercept) / fit.slope;
    return {
        sufficientData: true,
        fit: fit,
        averageT0: t0,
        tRSpec: tRSpec,
        targetK: targetK,
        targetLogK: targetLogK,
        minPercentB: minPercentB,
        roundedMinPercentB: roundPercentB(minPercentB),
    };
}
// ============================================================================
// PART 3b: temperature-based tR prediction, and resolution observations
// ============================================================================
const AMBIENT_TEMPERATURE_C = 25;
const TR_TEMPERATURE_COEFFICIENT = 0.015;
function temperatureToNumber(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    const t = String(raw).trim().toUpperCase();
    if (t === "AMB" || t === "AMBIENT") return AMBIENT_TEMPERATURE_C;
    const m = t.match(/^T?(\d+(?:\.\d+)?)$/);
    if (m) return Number(m[1]);
    return null;
}
function predictTrAtTemperature(currentTr, currentTemperatureRaw, targetTemperatureRaw) {
    const currentT = temperatureToNumber(currentTemperatureRaw);
    const targetT = temperatureToNumber(targetTemperatureRaw);
    if (currentTr === null || currentT === null || targetT === null) return null;
    const delta = targetT - currentT;
    const factor = 1 - TR_TEMPERATURE_COEFFICIENT * delta;
    if (factor <= 0) return null;
    return currentTr * factor;
}
function observedResolutionsForSolvent(history, ligand, solvent) {
    const targetSolvent = normaliseSolvent(solvent);
    const targetLigand = normaliseLigand(ligand);
    if (!targetSolvent) return [];
    const observations = [];
    for (const entry of history || []) {
        if (!entry) continue;
        if (normaliseSolvent(entry.solvent) !== targetSolvent) continue;
        if (targetLigand && normaliseLigand(entry.ligand) !== targetLigand) continue;
        const tC = temperatureToNumber(entry.temperature);
        if (tC === null) continue;
        if (typeof entry.minResolution !== "number") continue;
        observations.push({
            temperatureC: tC,
            temperatureRaw: entry.temperature,
            resolution: entry.minResolution,
            fileName: entry.fileName,
        });
    }
    const byTemperature = new Map();
    for (const obs of observations) {
        byTemperature.set(obs.temperatureC, obs);
    }
    const deduped = Array.from(byTemperature.values());
    deduped.sort(function (a, b) { return a.temperatureC - b.temperatureC; });
    return deduped;
}
function buildTemperaturePrediction(currentTr, currentTemperatureRaw, targetTemperatureRaw, history, ligand, solvent) {
    const predictedTr = predictTrAtTemperature(currentTr, currentTemperatureRaw, targetTemperatureRaw);
    const observations = observedResolutionsForSolvent(history, ligand, solvent);
    const currentT = temperatureToNumber(currentTemperatureRaw);
    const targetT = temperatureToNumber(targetTemperatureRaw);
    let trend = null;
    if (observations.length >= 2) {
        const first = observations[0];
        const last = observations[observations.length - 1];
        const delta = last.resolution - first.resolution;
        if (Math.abs(delta) < 0.05) {
            trend = "flat";
        } else if (delta > 0) {
            trend = "improving";
        } else {
            trend = "worsening";
        }
    }
    return {
        predictedTr: predictedTr,
        currentTemperatureC: currentT,
        targetTemperatureC: targetT,
        observations: observations,
        trend: trend,
    };
}
// ============================================================================
// PART 4: the solvent nomogram
// ============================================================================
const NOMOGRAM_ACN_MEOH_THF = [
    { acn: 0, meoh: 0, thf: 0 },
    { acn: 10, meoh: 14.5, thf: 7.3 },
    { acn: 20, meoh: 27.6, thf: 14.8 },
    { acn: 30, meoh: 39.0, thf: 22.5 },
    { acn: 37, meoh: 46.7, thf: 27.8 },
    { acn: 38.5, meoh: 48.4, thf: 28.9 },
    { acn: 40, meoh: 50.0, thf: 30.0 },
    { acn: 50, meoh: 60.0, thf: 37.3 },
    { acn: 60, meoh: 70.0, thf: 44.7 },
    { acn: 70, meoh: 78.4, thf: 51.9 },
    { acn: 80, meoh: 85.7, thf: 58.8 },
    { acn: 90, meoh: 92.8, thf: 65.5 },
    { acn: 100, meoh: 100.0, thf: 72.1 },
];
function convertFromAcn(acnPercentB, targetSolvent) {
    const solventKey = targetSolvent === "MeOH" ? "meoh" : (targetSolvent === "THF" ? "thf" : null);
    if (solventKey === null) {
        return { percentB: null, capped: false, note: "No nomogram conversion for this solvent." };
    }
    const table = NOMOGRAM_ACN_MEOH_THF;
    const value = Number(acnPercentB);
    if (!Number.isFinite(value)) {
        return { percentB: null, capped: false, note: "The %B isn't a number." };
    }
    if (value < 0 || value > 100) {
        return { percentB: null, capped: false, note: "The %B must be between 0 and 100." };
    }
    for (const row of table) {
        if (value === row.acn) {
            return { percentB: row[solventKey], capped: false, note: null };
        }
    }
    for (let i = 1; i < table.length; i++) {
        const lo = table[i - 1];
        const hi = table[i];
        if (value > lo.acn && value < hi.acn) {
            const t = (value - lo.acn) / (hi.acn - lo.acn);
            const interpolated = lo[solventKey] + t * (hi[solventKey] - lo[solventKey]);
            return { percentB: roundPercentB(interpolated), capped: false, note: null };
        }
    }
    return { percentB: null, capped: false, note: "The %B is outside the nomogram's range." };
}
function convertToAcn(percentB, sourceSolvent) {
    const solventKey = sourceSolvent === "MeOH" ? "meoh" : (sourceSolvent === "THF" ? "thf" : null);
    if (solventKey === null) {
        return { percentB: null, capped: false, note: "No nomogram conversion from this solvent." };
    }
    const table = NOMOGRAM_ACN_MEOH_THF;
    const value = Number(percentB);
    if (!Number.isFinite(value)) {
        return { percentB: null, capped: false, note: "The %B isn't a number." };
    }
    if (value < 0 || value > 100) {
        return { percentB: null, capped: false, note: "The %B must be between 0 and 100." };
    }
    let bestAcn = null;
    for (const row of table) {
        if (row[solventKey] === value) {
            if (bestAcn === null || row.acn < bestAcn) {
                bestAcn = row.acn;
            }
        }
    }
    if (bestAcn !== null) {
        return { percentB: bestAcn, capped: false, note: null };
    }
    for (let i = 1; i < table.length; i++) {
        const lo = table[i - 1];
        const hi = table[i];
        if (value > lo[solventKey] && value < hi[solventKey]) {
            const t = (value - lo[solventKey]) / (hi[solventKey] - lo[solventKey]);
            const interpolated = lo.acn + t * (hi.acn - lo.acn);
            return { percentB: roundPercentB(interpolated), capped: false, note: null };
        }
    }
    return { percentB: null, capped: false, note: "The %B is outside the nomogram's range." };
}
function convertBetweenSolvents(percentB, fromSolvent, toSolvent) {
    if (fromSolvent === toSolvent) {
        return { percentB: Number(percentB), capped: false, note: null };
    }
    if (fromSolvent === "ACN") {
        return convertFromAcn(percentB, toSolvent);
    }
    if (toSolvent === "ACN") {
        return convertToAcn(percentB, fromSolvent);
    }
    const viaAcn = convertToAcn(percentB, fromSolvent);
    if (viaAcn.percentB === null) {
        return viaAcn;
    }
    const toTarget = convertFromAcn(viaAcn.percentB, toSolvent);
    if (toTarget.percentB === null) {
        return toTarget;
    }
    const notes = [viaAcn.note, toTarget.note].filter(function (n) { return !!n; });
    return {
        percentB: toTarget.percentB,
        capped: viaAcn.capped || toTarget.capped,
        note: notes.length > 0 ? notes.join(" ") : null,
    };
}
// ============================================================================
// PART 5: the retention / selectivity decision rules
// ============================================================================
const OUT_OF_SCOPE_NOTE = "This is an efficiency adjustment, which is outside what this app currently covers.";
function checkBackPressure(maxBackPressure, pressureLimit) {
    if (maxBackPressure === null) {
        return {
            stage: "Safety check",
            pass: null,
            action: "Back pressure could not be checked.",
            message: "No pump pressure trace was found in this file, so back pressure couldn't be checked.",
        };
    }
    if (maxBackPressure.maxActual >= pressureLimit) {
        return {
            stage: "Safety check",
            pass: false,
            unsafe: true,
            action: "Stop. Do not act on this run's results until the pressure issue is addressed.",
            message: "Peak back pressure was " + maxBackPressure.maxActual.toFixed(1) + " " + maxBackPressure.units + ", at or above the system limit of " + pressureLimit + " " + maxBackPressure.units + ".",
        };
    }
    return {
        stage: "Safety check",
        pass: true,
        action: "Safe to proceed.",
        message: "Peak back pressure was " + maxBackPressure.maxActual.toFixed(1) + " " + maxBackPressure.units + ", within the system limit of " + pressureLimit + " " + maxBackPressure.units + ".",
    };
}
function classifyRetentionTime(trLastPeak, tRSpec) {
    if (trLastPeak <= tRSpec / 2) return "<<";
    if (trLastPeak < tRSpec) return "<";
    if (trLastPeak > tRSpec) return ">";
    return "<";
}
function classifyResolution(minResolution, rsFloor, rsSpec) {
    if (minResolution < rsFloor) return "<<";
    if (minResolution < rsSpec) return "floor-spec";
    return ">";
}
function roundPercentB(value) {
    return Math.round(value * 10) / 10;
}
function predictTrAtPercentB(currentTr, currentPercentB, targetPercentB) {
    if (currentTr === null || currentTr === undefined) return null;
    if (currentPercentB === null || currentPercentB === undefined) return null;
    if (targetPercentB === null || targetPercentB === undefined) return null;
    const tr = Number(currentTr);
    const from = Number(currentPercentB);
    const to = Number(targetPercentB);
    if (!Number.isFinite(tr) || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    if (tr <= 0) return null;
    const steps = (from - to) / 10;
    return tr * Math.pow(2, steps);
}
function buildOption(currentTr, currentPercentB, targetPercentB, label) {
    const percentB = roundPercentB(targetPercentB);
    const predictedTr = predictTrAtPercentB(currentTr, currentPercentB, percentB);
    return {
        label: label || (percentB + "% B"),
        percentB: percentB,
        predictedTr: predictedTr,
        predictedTR: predictedTr,
    };
}
function centralCheck(trClass, rClass) {
    const table = {
        "<<": {
            "<<": {
                action: "Increase column length (L).",
                message: "If back pressure becomes an issue, decrease flow rate (F), OR decrease particle size (PS), OR switch to superficially porous particles (SPP).",
                stageName: "Efficiency",
                reason: "Resolution is far below its floor and the run time is well inside spec. Increasing the column length adds plates and narrows the peaks, which is what efficiency is for. The flow-rate and particle-size alternatives are fallbacks if back pressure becomes a problem.",
                outOfScope: true,
            },
            "floor-spec": {
                action: "Increase column length (L), OR decrease flow rate (F), OR decrease particle size (PS), OR switch to superficially porous particles (SPP).",
                message: "Once resolution is acceptable, increase flow rate to shorten the run.",
                stageName: "Efficiency",
                reason: "Resolution is below spec, so the peaks need to be narrower. All of these options change the plate height (HETP).",
                outOfScope: true,
            },
            ">": {
                action: "Increase flow rate to shorten the run.",
                message: "Resolution is at or above spec and the run time is well inside spec.",
                stageName: "Complete",
                reason: "Peak count and resolution are on spec, and the run time is under spec. The method already works; increasing the flow rate would only make it faster.",
                outOfScope: false,
                pass: true,
            },
        },
        "<": {
            "<<": {
                action: "Return to the Selectivity stage.",
                message: "Resolution is below its floor.",
                stageName: "Selectivity",
                reason: "Selectivity changes the spacing between peaks, which is what is missing here.",
                outOfScope: false,
                gotoSelectivity: true,
            },
            "floor-spec": {
                action: "Decrease flow rate (F), OR decrease particle size (PS), OR switch to superficially porous particles (SPP).",
                message: "Once resolution is acceptable, increase flow rate to shorten the run.",
                stageName: "Efficiency",
                reason: "Resolution is below spec, so the peaks need to be narrower. These options change the plate height (HETP).",
                outOfScope: true,
            },
            ">": {
                action: "Increase flow rate to shorten the run.",
                message: "Resolution is at or above spec and the run time is under spec.",
                stageName: "Complete",
                reason: "Peak count and resolution are on spec, and the run time is under spec. The method already works; increasing the flow rate would only make it faster.",
                outOfScope: false,
                pass: true,
            },
        },
        ">": {
            "<<": {
                action: "Return to the Selectivity stage.",
                message: "Resolution is below its floor.",
                stageName: "Selectivity",
                reason: "The peaks are not overlapping because they are too wide - they are overlapping because the spacing between them is wrong. Efficiency changes only the peak width, so it cannot help until the spacing is fixed.",
                outOfScope: false,
                gotoSelectivity: true,
            },
            "floor-spec": {
                action: "Decrease particle size (PS), OR switch to superficially porous particles (SPP).",
                message: "Once resolution is acceptable, increase flow rate to shorten the run.",
                stageName: "Efficiency",
                reason: "Resolution is below spec and the run is over spec. Decreasing the particle size narrows the peaks; increasing the flow rate shortens the run. Both belong to the efficiency family.",
                outOfScope: true,
            },
            ">": {
                action: "Increase flow rate to shorten the run.",
                message: "Resolution is on spec, but the run time is over the tR spec.",
                stageName: "Efficiency",
                reason: "Increasing the flow rate shortens the run without changing the peak spacing, which is what the efficiency family is for.",
                outOfScope: true,
            },
        },
    };
    return table[trClass][rClass];
}
// ============================================================================
// PART 6: the selectivity state machine
// ============================================================================
function normaliseSolvent(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toUpperCase();
    if (s === "ACN") return "ACN";
    if (s === "MOH" || s === "MEOH") return "MeOH";
    if (s === "MIX") return "MIX";
    return null;
}
function normaliseTemperature(raw) {
    if (!raw) return null;
    const t = String(raw).trim().toUpperCase();
    if (t === "AMB" || t === "AMBIENT") return "amb";
    const m = t.match(/^T?(\d+(?:\.\d+)?)$/);
    if (m) return m[1];
    return t;
}
function normaliseLigand(raw) {
    if (!raw) return null;
    return String(raw).trim();
}
const TEMPERATURE_LADDER = ["amb", "40", "60"];
const SOLVENT_TEMPERATURES_LABEL = "ambient (25 deg C), 40 deg C, and 60 deg C";
function temperatureFromConditions(conditions) {
    if (!conditions) return null;
    return normaliseTemperature(conditions.temperature);
}
function ladderStepsImpliedBy(temperature) {
    if (temperature === null) return [];
    const index = TEMPERATURE_LADDER.indexOf(temperature);
    if (index === -1) {
        return TEMPERATURE_LADDER.slice();
    }
    return TEMPERATURE_LADDER.slice(0, index);
}
function isAtOrBeyondTopOfLadder(temperature) {
    if (temperature === null) return false;
    const index = TEMPERATURE_LADDER.indexOf(temperature);
    if (index === -1) return true;
    return index >= TEMPERATURE_LADDER.length - 1;
}
function buildSolventRemainingPath(currentSolvent) {
    const steps = [
        "Observe (compare 40 and 60, pick another if worthwhile)",
    ];
    if (currentSolvent === "ACN") {
        steps.push("solvent 2 (MeOH) at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL);
        steps.push("mix at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL);
    } else if (currentSolvent === "MeOH") {
        steps.push("mix at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL);
    }
    steps.push("ligand change");
    return steps;
}
function nextSelectivityStep(history, summary, specs, reason, options) {
    const opts = options || {};
    const conditions = opts.currentConditions || null;
    const userConfirmedEarlierTemperatures = opts.userConfirmedEarlierTemperatures === true;
    const userChoseSolventChange = opts.userChoseSolventChange === true;
    const currentTr = summary ? summary.trLastPeak : null;
    const entries = (history || []).filter(function (e) {
        return e && normaliseSolvent(e.solvent);
    });
    let currentSolvent = null;
    let currentLigand = null;
    for (let i = entries.length - 1; i >= 0; i--) {
        if (!currentSolvent && normaliseSolvent(entries[i].solvent)) {
            currentSolvent = normaliseSolvent(entries[i].solvent);
        }
        if (!currentLigand && normaliseLigand(entries[i].ligand)) {
            currentLigand = normaliseLigand(entries[i].ligand);
        }
        if (currentSolvent && currentLigand) break;
    }
    if (!currentSolvent && specs && specs.currentSolvent) {
        currentSolvent = normaliseSolvent(specs.currentSolvent);
    }
    if (!currentLigand && specs && specs.currentLigand) {
        currentLigand = normaliseLigand(specs.currentLigand);
    }
    let currentTemperature = null;
    const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
    if (lastEntry) {
        currentTemperature = normaliseTemperature(lastEntry.temperature);
    }
    if (!currentTemperature && conditions) {
        currentTemperature = normaliseTemperature(conditions.temperature);
    }
    const temperaturesTried = new Set();
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        const eLigand = normaliseLigand(e.ligand);
        if (currentLigand && (!eLigand || eLigand !== currentLigand)) break;
        const eTemp = normaliseTemperature(e.temperature);
        if (eTemp) temperaturesTried.add(eTemp);
    }
    const historyHasTemperatures = temperaturesTried.size > 0;
    let needsConfirmation = false;
    if (!historyHasTemperatures && conditions) {
        const temp = temperatureFromConditions(conditions);
        const implied = ladderStepsImpliedBy(temp);
        for (const step of implied) {
            temperaturesTried.add(step);
        }
        if (temp) temperaturesTried.add(temp);
        if (isAtOrBeyondTopOfLadder(temp) && !userConfirmedEarlierTemperatures) {
            needsConfirmation = true;
        }
    }
    const numPeaks = summary ? summary.numPeaks : (lastEntry ? lastEntry.numPeaks : null);
    const targetPeaks = specs ? specs.targetPeaks : null;
    const peakCountShort = numPeaks !== null && targetPeaks !== null && numPeaks < targetPeaks;
    const needsSelectivity = reason === "resolution" || peakCountShort;
    if (!needsSelectivity) {
        return {
            step: "complete",
            parameter: "complete",
            action: "Selectivity is done.",
            message: "The peak count has reached the target and resolution is on spec.",
            reasoning: null,
            remainingPath: [],
        };
    }
    const onCurrentSolvent = currentSolvent !== null;
    if (onCurrentSolvent) {
        const hasTried40 = temperaturesTried.has("40");
        const hasTriedAnyNonAmbient = Array.from(temperaturesTried).some(function (t) {
            return t !== "amb";
        });
        const hasLowTemperature = hasTried40 || hasTriedAnyNonAmbient;
        if (!hasLowTemperature) {
            const prediction = buildTemperaturePrediction(currentTr, currentTemperature, "40", history, currentLigand, currentSolvent);
            return {
                step: "temperature-40",
                parameter: "temperature",
                value: "40",
                action: "Change the temperature to 40 deg C and run again on " + currentSolvent + ".",
                message: "Next selectivity step: change the temperature to 40 deg C and run again on " + currentSolvent + ".",
                reasoning: "Temperature is the first selectivity parameter on the flowchart. It changes retention and selectivity through the chemical interaction between the compounds and the stationary phase, and it is the fastest parameter to change (only the oven is involved).",
                temperaturePrediction: prediction,
                remainingPath: buildSolventRemainingPath(currentSolvent),
            };
        }
        if (needsConfirmation) {
            return {
                step: "temperature-confirm",
                parameter: "temperature",
                value: null,
                needsConfirmation: true,
                action: "Confirm whether 40 deg C has also been tried.",
                message: "The file name says this run was at 60 deg C, which is the top of the temperature ladder. If 40 deg C has also been tried on " + currentSolvent + ", the temperature ladder is exhausted and the next step is the solvent change. If not, the next step is 40 deg C.",
                reasoning: "The tool cannot read the run history, so it cannot tell from the file name alone whether the intermediate temperature was run. Please confirm.",
                remainingPath: [],
            };
        }
        if (!temperaturesTried.has("60")) {
            const prediction = buildTemperaturePrediction(currentTr, currentTemperature, "60", history, currentLigand, currentSolvent);
            return {
                step: "temperature-60",
                parameter: "temperature",
                value: "60",
                action: "Change the temperature to 60 deg C and run again.",
                message: "40 deg C is recorded on " + currentSolvent + ". Next selectivity step: change the temperature to 60 deg C and run again.",
                reasoning: "60 deg C is the second temperature on the flowchart. Running at two temperatures lets the user see whether the separation responds to temperature at all, which the Observe step then interprets.",
                temperaturePrediction: prediction,
                remainingPath: buildSolventRemainingPath(currentSolvent),
            };
        }
        const otherTemperature = Array.from(temperaturesTried).find(function (t) {
            return t !== "40" && t !== "60" && t !== "amb";
        });
        if (!otherTemperature && !userChoseSolventChange) {
            return {
                step: "temperature-observe",
                parameter: "temperature",
                value: null,
                canMoveToSolvent: true,
                action: "Observe: compare the 40 and 60 deg C chromatograms.",
                message: "40 deg C and 60 deg C are both recorded on " + currentSolvent + ". This is the Observe step: compare the 40 and 60 deg C chromatograms, and if another temperature is worth trying, pick one and run it. If not, move on to the solvent change.",
                reasoning: "The flowchart marks this step as a human judgement call. The tool does not choose the next temperature; it surfaces the observation so the user decides whether another temperature is worth the run, or whether the solvent change should come next.",
                remainingPath: buildSolventRemainingPath(currentSolvent),
            };
        }
    }
    if (currentSolvent === "ACN") {
        const currentPercentBFromEntry = lastEntry && typeof lastEntry.percentB === "number" ? lastEntry.percentB : null;
        const currentPercentBFromConditions = conditions && typeof conditions.percentB === "string" ? Number(conditions.percentB) : null;
        const percentBForConversion = currentPercentBFromEntry !== null ? currentPercentBFromEntry : (Number.isFinite(currentPercentBFromConditions) ? currentPercentBFromConditions : null);
        const converted = percentBForConversion !== null ? convertFromAcn(percentBForConversion, "MeOH") : null;
        return {
            step: "solvent-meoh",
            parameter: "solvent",
            value: "MeOH",
            percentB: converted && converted.percentB !== null ? converted.percentB : null,
            temperatures: ["amb", "40", "60"],
            action: converted && converted.percentB !== null ? "Switch to MeOH at " + converted.percentB + "% B, at " + SOLVENT_TEMPERATURES_LABEL + "." : "Switch to MeOH at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL + ".",
            message: converted && converted.percentB !== null ? "Temperature is exhausted on ACN. Next selectivity step: switch to MeOH at " + converted.percentB + "% B (isoeluotropic with " + percentBForConversion + "% ACN), at " + SOLVENT_TEMPERATURES_LABEL + "." : "Temperature is exhausted on ACN. Next selectivity step: switch to MeOH at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL + ". The %B could not be converted automatically - check the nomogram.",
            reasoning: "The solvent type is the second selectivity parameter on the flowchart, because changing the organic modifier changes the acid/base/dipolar interactions (alpha, beta, pi*) between the compounds and both phases. The %B is converted through the nomogram so the solvent strength (and therefore the retention time) is preserved while the chemistry changes.",
            remainingPath: [
                "MeOH at " + SOLVENT_TEMPERATURES_LABEL,
                "mix at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL,
                "ligand change",
            ],
        };
    }
    if (currentSolvent === "MeOH") {
        const currentPercentBFromEntry = lastEntry && typeof lastEntry.percentB === "number" ? lastEntry.percentB : null;
        const currentPercentBFromConditions = conditions && typeof conditions.percentB === "string" ? Number(conditions.percentB) : null;
        const percentBForConversion = currentPercentBFromEntry !== null ? currentPercentBFromEntry : (Number.isFinite(currentPercentBFromConditions) ? currentPercentBFromConditions : null);
        return {
            step: "solvent-mix",
            parameter: "mix",
            value: "MIX",
            percentB: percentBForConversion,
            temperatures: ["amb", "40", "60"],
            action: "Switch to the mixed solvent at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL + ".",
            message: "Temperature and MeOH are exhausted. Next selectivity step: switch to the mixed solvent at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL + ".",
            reasoning: "The mixed solvent is the third selectivity parameter on the flowchart. It is tried after the pure solvents because it can produce a different pattern of acid/base/dipolar interactions than either pure solvent alone.",
            remainingPath: [
                "mix at " + SOLVENT_TEMPERATURES_LABEL,
                "ligand change",
            ],
        };
    }
    if (currentSolvent === "MIX") {
        return {
            step: "ligand",
            parameter: "ligand",
            value: null,
            action: "Change the stationary phase ligand, then start the temperature ladder again on the new ligand.",
            message: "Temperature, solvent and mix are all exhausted on the current ligand. Next selectivity step: change the stationary phase ligand, then start the temperature ladder again on the new ligand.",
            reasoning: "The ligand is changed last among the selectivity parameters, because it is the most disruptive change: the whole chromatography starts again on the new column. When the ligand changes, every other selectivity parameter can be revisited on the new chemistry.",
            remainingPath: [
                "temperature ladder on the new ligand (ambient, 40 deg C, 60 deg C, Observe)",
                "solvent 2 at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL,
                "mix at the isoeluotropic %B, at " + SOLVENT_TEMPERATURES_LABEL,
            ],
        };
    }
    return {
        step: "efficiency",
        parameter: "efficiency",
        value: null,
        action: "Selectivity is exhausted. Move to efficiency.",
        message: "Every selectivity parameter has been tried. The flowchart identifies efficiency as the next parameter family, but it is outside what this app currently covers.",
        reasoning: "Selectivity changes the spacing between peaks; efficiency changes their width. If two compounds co-elute, no amount of efficiency will separate them, so efficiency is only worth trying once the selectivity parameters have been exhausted.",
        remainingPath: [],
    };
}
function selectivityOptionsStillOpen(history, summary, specs, conditions) {
    const next = nextSelectivityStep(history, summary, specs, "resolution", { currentConditions: conditions });
    if (!next || next.step === "complete" || next.step === "efficiency" || next.step === "ligand") {
        return null;
    }
    if (next.step === "temperature-confirm") {
        return null;
    }
    return next;
}
// ============================================================================
// PART 7: the main entry point
// ============================================================================
function decide(summary, specs, history, options) {
    const opts = options || {};
    const conditions = opts.currentConditions || null;
    const userChoseSolventChange = opts.userChoseSolventChange === true;
    if (summary.numPeaks === null || summary.numPeaks === 0) {
        return {
            stage: "Error",
            action: "No recommendation can be made.",
            message: "No peaks were found in this file's peak table.",
        };
    }
    if (summary.numPeaks < specs.targetPeaks) {
        const currentPercentB = specs.currentPercentB;
        const currentTr = summary.trLastPeak;
        const atMinimum = currentPercentB === null || currentPercentB <= specs.minPercentB;
        if (currentTr === null) {
            if (atMinimum) {
                return {
                    stage: "Retention -> Selectivity",
                    pass: false,
                    action: "Move on to the Selectivity stage.",
                    message: "Found " + summary.numPeaks + " of the required " + specs.targetPeaks + " peaks, but the last peak has no retention time to test against spec. %B is at its minimum (" + specs.minPercentB + "%).",
                    selectivity: nextSelectivityStep(history, summary, specs, "peak-count", {
                        currentConditions: conditions,
                        userConfirmedEarlierTemperatures: opts.userConfirmedEarlierTemperatures,
                        userChoseSolventChange: userChoseSolventChange,
                    }),
                };
            }
            const nextPercentB = roundPercentB(currentPercentB - 10);
            return {
                stage: "Retention",
                pass: false,
                action: "Drop to " + nextPercentB + "% B and run again.",
                message: "Found " + summary.numPeaks + " of the required " + specs.targetPeaks + " peaks at " + currentPercentB + "% B. The last peak has no retention time to test against spec, so the simplest next step is a 10-point %B decrement.",
            };
        }
        const trClass = classifyRetentionTime(currentTr, specs.tRSpec);
        if (trClass === ">") {
            return {
                stage: "Retention -> Selectivity",
                pass: false,
                action: "Return %B to its previous value, then move on to the Selectivity stage.",
                message: "Found " + summary.numPeaks + " of the required " + specs.targetPeaks + " peaks, but the last peak's tR (" + currentTr.toFixed(2) + " min) is already over the tR spec of " + specs.tRSpec + " min. Decrementing %B further would only push tR higher." + (currentPercentB !== null ? " The current %B is " + currentPercentB + "%." : ""),
                selectivity: nextSelectivityStep(history, summary, specs, "peak-count", {
                    currentConditions: conditions,
                    userConfirmedEarlierTemperatures: opts.userConfirmedEarlierTemperatures,
                    userChoseSolventChange: userChoseSolventChange,
                }),
            };
        }
        if (atMinimum) {
            return {
                stage: "Retention -> Selectivity",
                pass: false,
                action: "Move on to the Selectivity stage.",
                message: "Found " + summary.numPeaks + " of the required " + specs.targetPeaks + " peaks, and %B is already at its minimum (" + specs.minPercentB + "%). Retention is exhausted.",
                selectivity: nextSelectivityStep(history, summary, specs, "peak-count", {
                    currentConditions: conditions,
                    userConfirmedEarlierTemperatures: opts.userConfirmedEarlierTemperatures,
                    userChoseSolventChange: userChoseSolventChange,
                }),
            };
        }
        if (trClass === "<") {
            const intermediatePercentB = (currentPercentB + specs.minPercentB) / 2;
            const optionsList = [
                buildOption(currentTr, currentPercentB, specs.minPercentB, "Min %B (" + specs.minPercentB + "%)"),
                buildOption(currentTr, currentPercentB, intermediatePercentB, "Intermediate %B (" + roundPercentB(intermediatePercentB) + "%)"),
            ];
            let message = "Found " + summary.numPeaks + " of the required " + specs.targetPeaks + " peaks, and the last peak's tR (" + currentTr.toFixed(2) + " min) is approaching the tR spec of " + specs.tRSpec + " min. A further 10-point decrement would overshoot spec, so run both of these and compare:";
            for (const option of optionsList) {
                message += "\n - " + option.label + " - expect the last peak near " + (option.predictedTr === null ? "n/a" : option.predictedTr.toFixed(2) + " min") + ".";
            }
            return {
                stage: "Retention",
                pass: false,
                action: "Run Min %B and Intermediate %B, then compare.",
                message: message,
                options: optionsList,
            };
        }
        const nextPercentB = roundPercentB(currentPercentB - 10);
        const nextPredictedTr = currentTr * 2;
        return {
            stage: "Retention",
            pass: false,
            action: "Drop to " + nextPercentB + "% B and run again.",
            message: "Found " + summary.numPeaks + " of the required " + specs.targetPeaks + " peaks at " + currentPercentB + "% B. Still in the Retention stage. The last peak's tR is " + currentTr.toFixed(2) + " min against a spec of " + specs.tRSpec + " min. Expect the last peak near " + nextPredictedTr.toFixed(2) + " min.",
        };
    }
    if (summary.numPeaks > specs.targetPeaks) {
        return {
            stage: "Selectivity",
            pass: false,
            action: "Check the peak integration and, if the extra peaks are real, purge the system.",
            message: "Found " + summary.numPeaks + " peaks, more than the required " + specs.targetPeaks + ". Before going further, check two things. (1) Have you removed the integration artefacts? LabSolutions can pick up small, irrelevant blips as peaks if the integration settings are too sensitive. Open the chromatogram, adjust the peak-integrity or slope settings so those blips are not counted, and re-export the CSV. (2) If the extra peaks are real, they suggest carry-over from a previous run: the column, the injector, or the sample loop still has material from the last injection. Purge the pump, the injector and the column before running the next sample. Once the peak count matches the target, run again.",
        };
    }
    if (summary.trLastPeak === null || summary.minResolution === null) {
        return {
            stage: "Error",
            action: "No recommendation can be made.",
            message: "The peak table doesn't have both a retention time and a resolution value to check against spec.",
        };
    }
    const trClass = classifyRetentionTime(summary.trLastPeak, specs.tRSpec);
    const rClass = classifyResolution(summary.minResolution, specs.rsFloor, specs.rsSpec);
    const outcome = centralCheck(trClass, rClass);
    const result = {
        stage: outcome.stageName || "Central check",
        pass: !!outcome.pass,
        action: outcome.action || null,
        message: outcome.message,
        reason: outcome.reason || null,
        outOfScopeNote: outcome.outOfScope ? OUT_OF_SCOPE_NOTE : null,
        trClass: trClass,
        rClass: rClass,
    };
    if (outcome.gotoSelectivity) {
        result.selectivity = nextSelectivityStep(history, summary, specs, "resolution", {
            currentConditions: conditions,
            userConfirmedEarlierTemperatures: opts.userConfirmedEarlierTemperatures,
            userChoseSolventChange: userChoseSolventChange,
        });
    }
    if (result.stage === "Efficiency") {
        const stillOpen = selectivityOptionsStillOpen(history, summary, specs, conditions);
        if (stillOpen) {
            result.selectivityStillOpen = stillOpen;
        }
    }
    return result;
}