// logic.js: parsing the exported file, and running the retention / selectivity rules.
//
// Nothing in this file touches the web page (no document., no innerHTML). It only
// takes text or data in and returns plain objects. That makes it possible to test
// each function on its own, separately from the page.

// ============================================================================
// PART 1: reading the LabSolutions export
// ============================================================================

// The file is not an ordinary spreadsheet-style CSV. It's a long export with
// bracketed sections like [Sample Information] and [Peak Table(PDA-Ch1)], most
// lines padded with trailing commas. So instead of Papa Parse (which expects one
// consistent table), we read it as plain text, line by line.

// Splits the raw file text into lines, and turns each line into an array of
// its comma-separated fields (undoing the padding by trimming trailing empties).
function splitIntoLines(rawText) {
  return rawText.split(/\r?\n/).map(function (line) {
    const fields = line.split(",");
    while (fields.length > 0 && fields[fields.length - 1] === "") {
      fields.pop();
    }
    return fields;
  });
}

// Finds the "Sample Name" row inside [Sample Information] and returns its value,
// or "" if it isn't found. This is the name the instrument itself recorded for the
// run, which is why we prefer it over the uploaded file's name (a file can be
// renamed; the recording inside it can't).
function findSampleName(lines) {
  for (const fields of lines) {
    if (fields[0] === "Sample Name" && fields.length > 1) {
      return fields[1].trim();
    }
  }
  return "";
}

// Finds the [Peak Table(...)] section and reads its rows into a list of objects.
// Works out each column's position from the header row instead of assuming a
// fixed column order, so it still works if the export adds or reorders columns.
function findPeakTable(lines) {
  const sectionStart = lines.findIndex(function (fields) {
    return fields[0] && fields[0].indexOf("[Peak Table") === 0;
  });
  if (sectionStart === -1) {
    return { peaks: [], declaredCount: null };
  }

  // The row right after the section header is "# of Peaks,N"
  let declaredCount = null;
  const countRow = lines[sectionStart + 1];
  if (countRow && countRow[0] === "# of Peaks") {
    declaredCount = Number(countRow[1]);
  }

  // The row after that is the column header row, e.g. "Peak#,R.Time,...,Resolution,..."
  const headerRow = lines[sectionStart + 2] || [];
  const columnIndex = {
    peakNum: headerRow.indexOf("Peak#"),
    rTime: headerRow.indexOf("R.Time"),
    kPrime: headerRow.indexOf("k'"),
    plateCount: headerRow.indexOf("Plate #"),
    tailing: headerRow.indexOf("Tailing"),
    resolution: headerRow.indexOf("Resolution"),
  };

  // Data rows follow until a blank line (an empty first field) or the file ends.
  const peaks = [];
  let rowIndex = sectionStart + 3;
  while (rowIndex < lines.length) {
    const row = lines[rowIndex];
    if (!row[0]) break; // blank line = end of this section
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

// Reads row[index] as a number, or null if that column wasn't found or is empty.
function readNumber(row, index) {
  if (index === -1 || index >= row.length) return null;
  const value = Number(row[index]);
  return Number.isNaN(value) ? null : value;
}

// Turns a peak list into the three numbers the flowchart actually checks.
// The first peak has no resolution (resolution is always between a peak and the
// one before it), so it's excluded when looking for the smallest value.
function summarizeRun(peaks) {
  if (peaks.length === 0) {
    return { numPeaks: 0, trLastPeak: null, minResolution: null };
  }
  const lastPeak = peaks[peaks.length - 1];
  const resolutions = peaks
    .slice(1) // skip the first peak
    .map(function (p) { return p.resolution; })
    .filter(function (r) { return r !== null; });

  return {
    numPeaks: peaks.length,
    trLastPeak: lastPeak.rTime,
    minResolution: resolutions.length > 0 ? Math.min.apply(null, resolutions) : null,
  };
}

// ============================================================================
// PART 2: reading the run's conditions from its name
// ============================================================================
//
// The name (either the instrument's own "Sample Name" or, as a fallback, the
// uploaded file's name) packs in the run's conditions, dash-separated:
//   GRxx - HPLC# - Run# - Solvent - pH - ISO/GRAD - %B - Flow rate -
//   Sample volume - Sample type - Sample concentration - Ligand -
//   Column type - Column dimensions - Temperature - Wavelength
//
// Two real examples showed that not every field is always present (one file had
// no separate "column type" value). So rather than assuming a fixed position for
// every field, this looks for the ISO/GRAD marker first, since that one is always
// spelled the same way, and reads fixed positions relative to it. Fields after
// that marker are found by matching what they look like (a number, a dimensions
// pattern like "150x4.6x5", and so on), so a missing field doesn't shift every
// field that comes after it.
//
// Anything this can't find is left blank and listed in `warnings`, so the page
// can show you what to check or fill in by hand.

function parseConditionsFromName(name) {
  const warnings = [];
  const tokens = name.split("-").map(function (t) { return t.trim(); });

  const conditions = {
    grNumber: "",
    hplcNumber: "",
    runNumber: "",
    solvent: "",
    pH: "",
    mode: "", // ISO or GRAD
    percentB: "",
    flowRate: "",
    sampleVolume: "",
    sampleType: "",
    sampleConcentration: "",
    ligand: "",
    columnType: "",
    columnDimensions: "",
    temperature: "",
    wavelength: "",
  };

  const modeIndex = tokens.findIndex(function (t) {
    return /^(ISO|GRAD)$/i.test(t);
  });

  if (modeIndex === -1) {
    warnings.push('Could not find "ISO" or "GRAD" in the name, so the fields around it could not be located.');
    return { conditions: conditions, warnings: warnings };
  }

  // Fields before the mode marker: both example names had exactly the same five
  // fields here (GRxx, HPLC#, Run#, solvent, pH), in this order.
  const before = tokens.slice(0, modeIndex);
  if (before.length !== 5) {
    warnings.push(
      "Expected 5 fields before ISO/GRAD (GR number, HPLC #, Run #, solvent, pH) but found " +
        before.length +
        ". Check these fields carefully."
    );
  }
  conditions.grNumber = before[0] || "";
  conditions.hplcNumber = before[1] || "";
  conditions.runNumber = before[2] || "";
  conditions.solvent = before[3] || "";
  conditions.pH = before[4] || "";
  conditions.mode = tokens[modeIndex].toUpperCase();

  // Fields after the mode marker: matched by pattern, since their exact
  // positions can shift when a field is missing.
  const after = tokens.slice(modeIndex + 1);
  const dimensionsPattern = /^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/i;
  const plainNumberPattern = /^\d+(\.\d+)?$/;
  const numberWithLetterSuffix = /^\d+(\.\d+)?[a-z]+$/i;

  const dimensionsIndex = after.findIndex(function (t) {
    return dimensionsPattern.test(t);
  });

  if (dimensionsIndex === -1) {
    warnings.push('Could not find a column-dimensions field (like "150x4.6x5") after ISO/GRAD.');
  } else {
    conditions.columnDimensions = after[dimensionsIndex];
    // Whatever sits right after dimensions is temperature, and after that, wavelength.
    conditions.temperature = after[dimensionsIndex + 1] || "";
    conditions.wavelength = after[dimensionsIndex + 2] || "";
  }

  // Between the mode marker and the dimensions field: %B, flow rate, sample
  // volume, sample type, sample concentration, ligand, column type, in that
  // order, but not every one is guaranteed to be present.
  const middle = dimensionsIndex === -1 ? after : after.slice(0, dimensionsIndex);
  const numberTokens = []; // plain numbers, in order encountered: %B, flow rate, concentration
  let volumeToken = null; // number with a letter suffix, e.g. "20u"
  const wordTokens = []; // alphabetic-ish tokens: sample type, ligand, column type

  for (const token of middle) {
    if (plainNumberPattern.test(token)) {
      numberTokens.push(token);
    } else if (numberWithLetterSuffix.test(token)) {
      volumeToken = token;
    } else if (token !== "") {
      wordTokens.push(token);
    }
  }

  // The first two plain numbers after the mode marker are always %B and flow
  // rate. What comes after that depends on whether the sample volume carries a
  // letter suffix (like "20u"): if it does, it was already pulled out
  // separately above, and the next plain number is the concentration. If it
  // doesn't, the sample volume itself is a plain number, so the one after *that*
  // is the concentration.
  conditions.percentB = numberTokens[0] || "";
  conditions.flowRate = numberTokens[1] || "";
  if (volumeToken) {
    conditions.sampleVolume = volumeToken;
    conditions.sampleConcentration = numberTokens[2] || "";
  } else {
    conditions.sampleVolume = numberTokens[2] || "";
    conditions.sampleConcentration = numberTokens[3] || "";
  }

  // Word tokens: first is sample type (e.g. CP, BLK), then ligand, then
  // whatever's left is treated as column type.
  conditions.sampleType = wordTokens[0] || "";
  conditions.ligand = wordTokens[1] || "";
  conditions.columnType = wordTokens.slice(2).join(" ") || "";

  if (!conditions.percentB) warnings.push("Could not identify %B.");
  if (!conditions.sampleType) warnings.push("Could not identify sample type.");
  if (!conditions.ligand) warnings.push("Could not identify the ligand.");
  if (!conditions.columnType) {
    warnings.push("Could not identify a separate column type — it may not be present in this name.");
  }

  return { conditions: conditions, warnings: warnings };
}

// ============================================================================
// PART 3: the retention / selectivity decision rules
// ============================================================================
//
// This only covers the Retention (K) and Selectivity stages of the flowchart,
// plus the central check that follows them. Outcomes from the central check that
// belong to the Efficiency stage (changing column length, flow rate, particle
// size) are reported as out of scope rather than acted on.
//
// Three branches of the central check (where tR is ABOVE spec) had no visible
// arrows in the flowchart, so their actions below are a best guess and are
// marked isUncertain: true. Confirm these against the flowchart before relying
// on them.

const OUT_OF_SCOPE_NOTE = "This is an efficiency adjustment, which is outside what this app currently covers.";

// Classifies tR against its spec into "<<", "<", or ">", the same three bands
// the flowchart uses. "<<" means dropping %B by another 10 points would still
// land at or under the spec (since a 10-point drop doubles tR, that's only
// possible if the current tR is at most half the spec).
function classifyRetentionTime(trLastPeak, tRSpec) {
  if (trLastPeak <= tRSpec / 2) return "<<";
  if (trLastPeak < tRSpec) return "<";
  if (trLastPeak > tRSpec) return ">";
  return "<"; // exactly on spec: treat as meeting it
}

// Classifies resolution against its floor and spec into "<<", "floor-spec", or ">".
function classifyResolution(minResolution, rsFloor, rsSpec) {
  if (minResolution < rsFloor) return "<<";
  if (minResolution < rsSpec) return "floor-spec";
  return ">";
}

// The central check: given where tR and resolution sit relative to spec,
// what should happen next. This is a direct translation of the flowchart's
// right-hand outcome table.
function centralCheck(trClass, rClass) {
  const table = {
    "<<": {
      "<<": { message: "Increase column length (L).", isUncertain: false, outOfScope: true },
      "floor-spec": { message: "Increase column length (L), OR decrease flow rate (F), OR decrease particle size (PS), OR switch to superficially porous particles (SPP).", isUncertain: false, outOfScope: true },
      ">": { message: "Meets spec. Increase flow rate to shorten the run.", isUncertain: false, outOfScope: false, pass: true },
    },
    "<": {
      "<<": { message: "Return to the Selectivity stage.", isUncertain: false, outOfScope: false, gotoSelectivity: true },
      "floor-spec": { message: "Decrease flow rate (F), OR decrease particle size (PS), OR switch to superficially porous particles (SPP).", isUncertain: false, outOfScope: true },
      ">": { message: "Meets spec. Increase flow rate to shorten the run.", isUncertain: false, outOfScope: false, pass: true },
    },
    ">": {
      "<<": { message: "Return to the Selectivity stage.", isUncertain: true, outOfScope: false, gotoSelectivity: true },
      "floor-spec": { message: "Decrease particle size (PS), OR switch to superficially porous particles (SPP), AND increase flow rate to shorten the run.", isUncertain: true, outOfScope: true },
      ">": { message: "Increase flow rate to shorten the run.", isUncertain: true, outOfScope: true },
    },
  };
  return table[trClass][rClass];
}

// The main entry point: given the run's peak summary, its parsed conditions,
// and the specification, returns a recommendation.
function decide(summary, specs) {
  if (summary.numPeaks === null || summary.numPeaks === 0) {
    return {
      stage: "Error",
      message: "No peaks were found in this file's peak table, so no recommendation can be made.",
    };
  }

  // Fewer peaks than required: stay in the Retention stage and keep stepping
  // %B down by 10 until either enough peaks appear or %B hits its minimum.
  // Only once %B is exhausted does the flow move on to Selectivity.
  if (summary.numPeaks < specs.targetPeaks) {
    const currentPercentB = specs.currentPercentB;
    const atMinimum = currentPercentB === null || currentPercentB <= specs.minPercentB;

    if (!atMinimum) {
      const nextPercentB = currentPercentB - 10;
      const predictedTr = summary.trLastPeak === null ? null : summary.trLastPeak * 2;
      let message =
        "Found " +
        summary.numPeaks +
        " of the required " +
        specs.targetPeaks +
        " peaks at " +
        currentPercentB +
        "% B. Still in the Retention stage: drop to " +
        nextPercentB +
        "% B and run again.";
      if (predictedTr !== null) {
        message +=
          " Dropping %B by 10 roughly doubles the last peak's tR, so expect it to land near " +
          predictedTr.toFixed(2) +
          " min" +
          (predictedTr > specs.tRSpec
            ? " — that's over the tR spec of " + specs.tRSpec + " min, so it's your call whether continuing is still worthwhile."
            : ".");
      }
      return { stage: "Retention", pass: false, message: message };
    }

    // %B has hit its minimum and there still aren't enough peaks.
    return {
      stage: "Retention \u2192 Selectivity",
      pass: false,
      message:
        "Found " +
        summary.numPeaks +
        " of the required " +
        specs.targetPeaks +
        " peaks, and %B is already at its minimum (" +
        specs.minPercentB +
        "%). Retention is exhausted \u2014 move on to the Selectivity stage (temperature, then solvent, then mix, then ligand).",
    };
  }

  if (summary.numPeaks > specs.targetPeaks) {
    return {
      stage: "Selectivity",
      pass: false,
      message:
        "Found " +
        summary.numPeaks +
        " peaks, more than the required " +
        specs.targetPeaks +
        ". Double check the peak table and specification — the flowchart assumes the peak count matches the target before moving on.",
    };
  }

  // Peak count matches: run the central check on tR and resolution.
  if (summary.trLastPeak === null || summary.minResolution === null) {
    return {
      stage: "Error",
      message: "The peak table doesn't have both a retention time and a resolution value to check against spec.",
    };
  }

  const trClass = classifyRetentionTime(summary.trLastPeak, specs.tRSpec);
  const rClass = classifyResolution(summary.minResolution, specs.rsFloor, specs.rsSpec);
  const outcome = centralCheck(trClass, rClass);

  return {
    stage: "Central check",
    pass: !!outcome.pass,
    message: outcome.message,
    outOfScopeNote: outcome.outOfScope ? OUT_OF_SCOPE_NOTE : null,
    uncertainNote: outcome.isUncertain
      ? "The flowchart didn't show a clear arrow for this exact combination (tR > spec). This recommendation is a best guess — check it against your flowchart."
      : null,
    trClass: trClass,
    rClass: rClass,
  };
}
