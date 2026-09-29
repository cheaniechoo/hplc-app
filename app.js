// app.js: connects the web page to logic.js and equipment-data.js.
// Reads the chosen files as text, parses them, shows what was found, and lets
// you run the decision rules once you've checked the conditions look right.
//
// Also renders the Equipment tab: the instrument figure with clickable
// numbered hotspots, the nomogram converter, the parameter table (with
// clickable rows), and the responses tables.
//
// When the user changes a specification value between calculations, the
// result card carries a note saying what changed, so the user can confirm it
// was intentional.

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

const tabFlowchart = document.getElementById("tab-flowchart");
const tabEquipment = document.getElementById("tab-equipment");
const panelFlowchart = document.getElementById("panel-flowchart");
const panelEquipment = document.getElementById("panel-equipment");

function selectTab(which) {
  const flowchartActive = which === "flowchart";
  tabFlowchart.classList.toggle("active", flowchartActive);
  tabEquipment.classList.toggle("active", !flowchartActive);
  tabFlowchart.setAttribute("aria-selected", flowchartActive ? "true" : "false");
  tabEquipment.setAttribute("aria-selected", flowchartActive ? "false" : "true");
  panelFlowchart.hidden = !flowchartActive;
  panelEquipment.hidden = flowchartActive;
}

tabFlowchart.addEventListener("click", function () { selectTab("flowchart"); });
tabEquipment.addEventListener("click", function () { selectTab("equipment"); });

// ---------------------------------------------------------------------------
// Element references for the Flowchart tab
// ---------------------------------------------------------------------------

const fileInput = document.getElementById("csv-file");
const uploadStatus = document.getElementById("upload-status");
const conditionsContainer = document.getElementById("conditions-container");
const conditionsWarnings = document.getElementById("conditions-warnings");
const nameMismatchAlert = document.getElementById("name-mismatch-alert");
const peaksContainer = document.getElementById("peaks-container");
const pressureReadout = document.getElementById("pressure-readout");
const calculateBtn = document.getElementById("calculate-btn");
const resultContainer = document.getElementById("result-container");
const historyContainer = document.getElementById("history-container");
const fitContainer = document.getElementById("fit-container");
const clearHistoryBtn = document.getElementById("clear-history-btn");

const specPeaks = document.getElementById("spec-peaks");
const specTr = document.getElementById("spec-tr");
const specRs = document.getElementById("spec-rs");
const specRsFloor = document.getElementById("spec-rs-floor");
const specMinPercentB = document.getElementById("spec-min-percent-b");
const specMaxPressure = document.getElementById("spec-max-pressure");

let currentSummary = null;
let currentMaxBackPressure = null;
let currentConditions = null;
let userConfirmedEarlierTemperatures = false;
let userChoseSolventChange = false;
let showTryAnotherTemperatureMessage = false;

// The specification values used the last time Calculate ran. Used to detect a
// change between runs, so the result card can say so.
let lastSpecsUsed = null;

const HISTORY_STORAGE_KEY = "hplc-flowchart-run-history-v1";
const HISTORY_MAX_ENTRIES = 30;

fileInput.addEventListener("change", handleFilesChosen);
calculateBtn.addEventListener("click", handleCalculate);
clearHistoryBtn.addEventListener("click", handleClearHistory);

// ---------------------------------------------------------------------------
// Run history
// ---------------------------------------------------------------------------

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (e) {
      return e && typeof e.percentB === "number" && typeof e.trLastPeak === "number";
    });
  } catch (err) {
    return [];
  }
}

function writeHistory(history) {
  try {
    const trimmed = history.slice(-HISTORY_MAX_ENTRIES);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // Storage may be unavailable.
  }
}

function addRunToHistory(entry) {
  const history = readHistory();
  const alreadyPresent = history.some(function (e) {
    return e.fileName === entry.fileName && e.percentB === entry.percentB;
  });
  if (!alreadyPresent) {
    history.push(entry);
    writeHistory(history);
  }
  return readHistory();
}

function handleClearHistory() {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (err) {
    // Ignore.
  }
  userConfirmedEarlierTemperatures = false;
  userChoseSolventChange = false;
  showTryAnotherTemperatureMessage = false;
  renderHistory();
  renderFit();
}

// ---------------------------------------------------------------------------
// File handling
// ---------------------------------------------------------------------------

function handleFilesChosen(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  const nonCsv = files.filter(function (f) {
    return !f.name.toLowerCase().endsWith(".csv");
  });
  if (nonCsv.length > 0) {
    showUploadStatus(
      nonCsv.length === 1
        ? "One of the chosen files isn't a .csv. Choose files that end in .csv."
        : nonCsv.length + " of the chosen files aren't .csv. Choose files that end in .csv.",
      true
    );
    return;
  }

  const readers = files.map(function (file) {
    return readFileAsText(file);
  });

  Promise.all(readers)
    .then(function (results) {
      let lastProcessed = null;
      for (let i = 0; i < results.length; i++) {
        const file = files[i];
        const text = results[i];
        try {
          lastProcessed = processFileText(text, file.name);
        } catch (err) {
          showUploadStatus(
            "The file \u201c" + file.name + "\u201d couldn't be read as a LabSolutions export. " + err.message,
            true
          );
          return;
        }
      }
      if (results.length === 1) {
        showUploadStatus("Loaded \u201c" + stripExtension(files[0].name) + "\u201d.", false);
      } else {
        showUploadStatus(
          "Loaded " + results.length + " files. Showing \u201c" + stripExtension(files[files.length - 1].name) + "\u201d; all " + results.length + " are in the run history.",
          false
        );
      }
      if (lastProcessed) {
        calculateBtn.disabled = lastProcessed.numPeaks === 0;
      }
    })
    .catch(function (err) {
      showUploadStatus("A file couldn't be read. " + err.message, true);
    });

  event.target.value = "";
}

function readFileAsText(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error("The file couldn't be read.")); };
    reader.readAsText(file);
  });
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

// ---------------------------------------------------------------------------
// Processing one file
// ---------------------------------------------------------------------------

function processFileText(rawText, fileName) {
  const lines = splitIntoLines(rawText);

  const nameToParse = stripExtension(fileName);
  const sampleName = findSampleName(lines);

  const { conditions, warnings } = parseConditionsFromName(nameToParse);
  const { peaks, declaredCount } = findPeakTable(lines);
  const summary = summarizeRun(peaks);
  const maxBackPressure = findMaxBackPressure(lines);

  currentSummary = summary;
  currentMaxBackPressure = maxBackPressure;
  currentConditions = conditions;
  userConfirmedEarlierTemperatures = false;
  showTryAnotherTemperatureMessage = false;

  const percentBNumber = parseFloat(conditions.percentB);
  addRunToHistory({
    fileName: nameToParse,
    percentB: Number.isFinite(percentBNumber) ? percentBNumber : null,
    trLastPeak: summary.trLastPeak,
    t0: summary.t0,
    numPeaks: summary.numPeaks,
    minResolution: summary.minResolution,
    solvent: conditions.solvent || null,
    temperature: conditions.temperature || null,
    ligand: conditions.ligand || null,
    timestamp: new Date().toISOString(),
  });
  renderHistory();
  renderFit();

  renderNameMismatchAlert(sampleName, nameToParse);
  if (declaredCount !== null && declaredCount !== peaks.length) {
    warnings.push(
      "The file says it has " + declaredCount + " peaks, but " + peaks.length + " rows were read from the peak table."
    );
  }
  if (peaks.length === 0) {
    warnings.push("No peak table was found in this file.");
  }

  renderConditions(conditions);
  renderWarnings(warnings);
  renderPeaks(peaks);
  renderPressureReadout(maxBackPressure);

  resultContainer.replaceChildren();

  return summary;
}

// ---------------------------------------------------------------------------
// Rendering: conditions, warnings, peaks, pressure, name mismatch
// ---------------------------------------------------------------------------

const CONDITION_FIELDS = [
  ["GR number", "grNumber", null],
  ["Run #", "runNumber", null],
  ["HPLC #", "hplcNumber", null],
  ["Solvent", "solvent", KNOWN_SOLVENTS],
  ["pH", "pH", null],
  ["Mode (ISO/GRAD)", "mode", KNOWN_MODES],
  ["%B", "percentB", null],
  ["Flow rate", "flowRate", null],
  ["Sample volume", "sampleVolume", null],
  ["Sample type", "sampleType", KNOWN_SAMPLE_TYPES],
  ["Sample concentration", "sampleConcentration", null],
  ["Ligand", "ligand", KNOWN_LIGAND_CODES],
  ["Column type", "columnType", KNOWN_PARTICLE_CODES],
  ["Column dimensions", "columnDimensions", null],
  ["Temperature", "temperature", null],
  ["Wavelength", "wavelength", null],
];

function renderConditions(conditions) {
  const table = document.createElement("table");
  const body = table.createTBody();

  for (const [label, key, options] of CONDITION_FIELDS) {
    const tr = body.insertRow();
    const labelCell = tr.insertCell();
    labelCell.textContent = label;

    const valueCell = tr.insertCell();
    const currentValue = conditions[key];
    let field;

    if (options) {
      field = document.createElement("select");
      const allOptions = options.includes(currentValue) || !currentValue ? options : [currentValue].concat(options);
      for (const optionValue of allOptions) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        field.appendChild(option);
      }
      field.value = currentValue;
    } else {
      field = document.createElement("input");
      field.type = "text";
      field.value = currentValue;
    }

    field.dataset.field = key;
    valueCell.appendChild(field);
  }

  conditionsContainer.replaceChildren(table);
}

function renderWarnings(warnings) {
  conditionsWarnings.replaceChildren();
  for (const message of warnings) {
    const li = document.createElement("li");
    li.textContent = message;
    conditionsWarnings.appendChild(li);
  }
}

function renderPeaks(peaks) {
  if (peaks.length === 0) {
    peaksContainer.replaceChildren(makeEmptyMessage("No peaks were found in this file."));
    return;
  }

  const columns = [
    ["Peak #", "peakNum"],
    ["R.Time (min)", "rTime"],
    ["k'", "kPrime"],
    ["Plate #", "plateCount"],
    ["Tailing", "tailing"],
    ["Resolution", "resolution"],
  ];

  const table = document.createElement("table");
  const headerRow = table.createTHead().insertRow();
  for (const [label] of columns) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  }

  const body = table.createTBody();
  for (const peak of peaks) {
    const tr = body.insertRow();
    for (const [, key] of columns) {
      const td = tr.insertCell();
      td.textContent = peak[key] === null ? "" : peak[key];
    }
  }

  peaksContainer.replaceChildren(table);
}

function renderPressureReadout(maxBackPressure) {
  if (!maxBackPressure) {
    pressureReadout.textContent = "No pump pressure trace was found in this file.";
    return;
  }
  pressureReadout.textContent =
    "Peak back pressure recorded this run: " + maxBackPressure.maxActual.toFixed(1) + " " + maxBackPressure.units + ".";
}

function makeEmptyMessage(text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  return p;
}

function renderNameMismatchAlert(sampleName, fileNameNoExt) {
  if (!sampleName || sampleName === fileNameNoExt) {
    nameMismatchAlert.hidden = true;
    nameMismatchAlert.replaceChildren();
    return;
  }

  nameMismatchAlert.hidden = false;
  nameMismatchAlert.replaceChildren();

  const headline = document.createElement("span");
  headline.textContent =
    "This file's name doesn't match the Sample Name recorded inside it. Please confirm the CSV actually belongs to the run its file name describes before trusting this result.";
  nameMismatchAlert.appendChild(headline);

  const detail = document.createElement("span");
  detail.className = "detail";
  detail.textContent = "File name: \u201c" + fileNameNoExt + "\u201d — Sample Name inside file: \u201c" + sampleName + "\u201d.";
  nameMismatchAlert.appendChild(detail);
}

function showUploadStatus(message, isError) {
  uploadStatus.textContent = message;
  uploadStatus.className = isError ? "error" : "";
}

// ---------------------------------------------------------------------------
// Rendering: the run history and the log K fit
// ---------------------------------------------------------------------------

function renderHistory() {
  const history = readHistory();
  if (history.length === 0) {
    historyContainer.replaceChildren(makeEmptyMessage("No runs in the history yet."));
    return;
  }

  const columns = [
    ["File", "fileName"],
    ["%B", "percentB"],
    ["Solvent", "solvent"],
    ["Temp", "temperature"],
    ["t0 (min)", "t0"],
    ["tR last (min)", "trLastPeak"],
    ["Peaks", "numPeaks"],
    ["Rs", "minResolution"],
  ];

  const table = document.createElement("table");
  const headerRow = table.createTHead().insertRow();
  for (const [label] of columns) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  }

  const body = table.createTBody();
  for (const entry of history) {
    const tr = body.insertRow();
    for (const [, key] of columns) {
      const td = tr.insertCell();
      const value = entry[key];
      if (value === null || value === undefined || value === "") {
        td.textContent = "";
      } else if (typeof value === "number") {
        td.textContent = Number.isInteger(value) ? String(value) : value.toFixed(2);
      } else {
        td.textContent = String(value);
      }
    }
  }

  historyContainer.replaceChildren(table);
}

function renderFit() {
  const history = readHistory();
  const specs = readSpecsForDisplay();
  const result = computeMinPercentB(history, specs.tRSpec);
  fitContainer.replaceChildren();

  if (!result.sufficientData) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = result.reason || "Not enough runs to fit the log K line yet.";
    fitContainer.appendChild(p);
    return;
  }

  const fit = result.fit;

  const card = document.createElement("div");
  card.className = "fit-card";

  const heading = document.createElement("h3");
  heading.textContent = "Log K vs %B fit";
  card.appendChild(heading);

  const eq = document.createElement("p");
  eq.textContent = "Fitted line: " + fit.equation;
  card.appendChild(eq);

  const r2 = document.createElement("p");
  r2.textContent =
    "R\u00b2 = " +
    fit.rSquared.toFixed(4) +
    (fit.droppedPoint
      ? " (a point at " + fit.droppedPoint.percentB + "% B was dropped to improve the fit; R\u00b2 before dropping was " + fit.firstFitRSquared.toFixed(4) + ")"
      : "");
  card.appendChild(r2);

  const t0 = document.createElement("p");
  t0.textContent = "Average t0 across the runs: " + fit.averageT0.toFixed(3) + " min.";
  card.appendChild(t0);

  if (fit.excluded && fit.excluded.length > 0) {
    const ex = document.createElement("p");
    ex.className = "note";
    ex.textContent =
      "Excluded from the fit: " +
      fit.excluded.map(function (e) { return e.percentB + "% B"; }).join(", ") +
      ". " +
      fit.excluded[0].reason;
    card.appendChild(ex);
  }

  const derived = document.createElement("p");
  derived.className = "derived";
  derived.textContent =
    "Derived minimum %B (tR last peak on spec at " +
    result.tRSpec +
    " min): " +
    result.roundedMinPercentB.toFixed(1) +
    "% B.";
  card.appendChild(derived);

  const working = document.createElement("p");
  working.className = "note";
  working.textContent =
    "Working: t0 = " +
    result.averageT0.toFixed(3) +
    " min, target K = " +
    result.targetK.toFixed(3) +
    ", target log K = " +
    result.targetLogK.toFixed(4) +
    ", %B = (log K \u2212 intercept) / slope = " +
    result.roundedMinPercentB.toFixed(1) +
    ".";
  card.appendChild(working);

  fitContainer.appendChild(card);
}

function readSpecsForDisplay() {
  return {
    targetPeaks: Number(specPeaks.value),
    tRSpec: Number(specTr.value),
    rsSpec: Number(specRs.value),
    rsFloor: Number(specRsFloor.value),
    minPercentBOverride: specMinPercentB.value === "" ? null : Number(specMinPercentB.value),
    maxPressure: Number(specMaxPressure.value),
  };
}

// ---------------------------------------------------------------------------
// Detecting a change to the specification
// ---------------------------------------------------------------------------

// Compares two sets of spec values and returns a sentence describing the
// change, or null if nothing meaningful changed. `before` is the spec that was
// in force the last time Calculate ran; `after` is the current spec.
function buildSpecChangeNote(before, after) {
  if (!before) return null;

  const fields = [
    { key: "targetPeaks", label: "target peaks", format: function (v) { return String(v); } },
    { key: "tRSpec", label: "tR spec", format: function (v) { return v + " min"; } },
    { key: "rsSpec", label: "Rs spec", format: function (v) { return String(v); } },
    { key: "rsFloor", label: "Rs floor", format: function (v) { return String(v); } },
    { key: "maxPressure", label: "max pressure", format: function (v) { return v + " psi"; } },
    { key: "minPercentBOverride", label: "min %B override", format: function (v) { return v === null ? "none" : v + "%"; } },
  ];

  const changes = [];
  for (const field of fields) {
    const b = before[field.key];
    const a = after[field.key];
    if (b !== a) {
      changes.push(
        field.label + ": " + field.format(b) + " \u2192 " + field.format(a)
      );
    }
  }

  if (changes.length === 0) return null;

  return "The specification has changed since the last calculation (" + changes.join("; ") + "). The recommendation below uses the new specification.";
}

// ---------------------------------------------------------------------------
// Calculate
// ---------------------------------------------------------------------------

function readSpecs() {
  const percentBInput = conditionsContainer.querySelector('[data-field="percentB"]');
  const percentBValue = percentBInput ? Number(percentBInput.value) : NaN;

  const solventInput = conditionsContainer.querySelector('[data-field="solvent"]');
  const solventValue = solventInput ? solventInput.value : null;

  const ligandInput = conditionsContainer.querySelector('[data-field="ligand"]');
  const ligandValue = ligandInput ? ligandInput.value : null;

  const overrideRaw = specMinPercentB.value;
  const override = overrideRaw === "" ? null : Number(overrideRaw);

  return {
    targetPeaks: Number(specPeaks.value),
    tRSpec: Number(specTr.value),
    rsSpec: Number(specRs.value),
    rsFloor: Number(specRsFloor.value),
    minPercentBOverride: Number.isFinite(override) ? override : null,
    currentPercentB: Number.isNaN(percentBValue) ? null : percentBValue,
    currentSolvent: solventValue,
    currentLigand: ligandValue,
    maxPressure: Number(specMaxPressure.value),
  };
}

function resolveMinPercentB(specs, history) {
  if (specs.minPercentBOverride !== null) {
    return {
      minPercentB: specs.minPercentBOverride,
      source: "override",
      note: "Using the minimum %B you typed in the Specification section (" + specs.minPercentBOverride + "%).",
    };
  }

  const derived = computeMinPercentB(history, specs.tRSpec);
  if (derived.sufficientData) {
    return {
      minPercentB: derived.roundedMinPercentB,
      source: "derived",
      note:
        "Minimum %B derived from the log K vs %B fit across " +
        derived.fit.pointsUsed.length +
        " run(s): " +
        derived.roundedMinPercentB.toFixed(1) +
        "%. R\u00b2 = " +
        derived.fit.rSquared.toFixed(4) +
        ".",
      derived: derived,
    };
  }

  return {
    minPercentB: 5,
    source: "default",
    note:
      "Minimum %B could not be derived from the run history (" +
      (derived.reason || "not enough usable runs") +
      "). Falling back to 5% so a decision can still be made — set an override in the Specification section, or load more runs.",
  };
}

function handleCalculate() {
  if (!currentSummary) return;

  const specs = readSpecs();
  const history = readHistory();

  // Work out whether the specification changed since the last calculation. The
  // note is created before `lastSpecsUsed` is updated, so it compares against
  // the previous run and not the current one.
  const specChangeNote = buildSpecChangeNote(lastSpecsUsed, specs);
  lastSpecsUsed = {
    targetPeaks: specs.targetPeaks,
    tRSpec: specs.tRSpec,
    rsSpec: specs.rsSpec,
    rsFloor: specs.rsFloor,
    maxPressure: specs.maxPressure,
    minPercentBOverride: specs.minPercentBOverride,
  };

  const pressureOutcome = checkBackPressure(currentMaxBackPressure, specs.maxPressure);
  if (pressureOutcome.unsafe) {
    if (specChangeNote) pressureOutcome.specChangeNote = specChangeNote;
    renderResults([pressureOutcome]);
    return;
  }

  if (specs.rsFloor >= specs.rsSpec) {
    renderResults([pressureOutcome, {
      stage: "Error",
      action: "Fix the Specification section.",
      message: "The Rs floor must be lower than the Rs spec.",
      specChangeNote: specChangeNote,
    }]);
    return;
  }
  if (specs.currentPercentB === null) {
    renderResults([pressureOutcome, {
      stage: "Error",
      action: "Fix the %B field in Run conditions.",
      message: "The %B field in Run conditions isn't a number.",
      specChangeNote: specChangeNote,
    }]);
    return;
  }

  const minChoice = resolveMinPercentB(specs, history);
  const specsForDecision = Object.assign({}, specs, { minPercentB: minChoice.minPercentB });

  const outcome = decide(currentSummary, specsForDecision, history, {
    currentConditions: currentConditions,
    userConfirmedEarlierTemperatures: userConfirmedEarlierTemperatures,
    userChoseSolventChange: userChoseSolventChange,
  });

  if (outcome && typeof outcome === "object") {
    outcome.minPercentBNote = minChoice.note;
    outcome.specChangeNote = specChangeNote;
  }

  renderResults([pressureOutcome, outcome]);
}

function handleConfirmEarlierTemperatures(answer) {
  userConfirmedEarlierTemperatures = answer === true;
  handleCalculate();
}

function handleChooseSolventChange() {
  userChoseSolventChange = true;
  handleCalculate();
}

function handleTryAnotherTemperature() {
  showTryAnotherTemperatureMessage = true;
  handleCalculate();
}

// ---------------------------------------------------------------------------
// The "Where to make the change" block
// ---------------------------------------------------------------------------

const PARAMETER_ALIASES = {
  "%B": ["%B", "% B", "percent B", "percentage of organic"],
  "Flow rate": ["flow rate", "flow"],
  "Temperature": ["temperature", "temp"],
  "Particle size": ["particle size", "particle"],
  "Column length": ["column length"],
  "Ligand": ["ligand", "stationary phase"],
  "Solvent type": ["solvent type", "solvent"],
  "Solvent pH": ["solvent pH", "pH"],
  "Injection volume": ["injection volume"],
  "Sample concentration": ["sample concentration"],
  "ISO / GRAD": ["ISO", "GRAD", "isocratic", "gradient"],
  "Carbon load": ["carbon load"],
  "Pore size": ["pore size"],
  "Column internal diameter": ["column internal diameter", "internal diameter"],
  "Wavelength": ["wavelength"],
};

const PARAMETERS_REQUIRING_A_COLUMN_CHANGE = [
  "Particle size",
  "Column length",
  "Column internal diameter",
  "Pore size",
  "Carbon load",
  "Ligand",
];

function findParametersMentionedIn(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  const found = [];
  for (const parameter of EQUIPMENT_PARAMETERS) {
    const aliases = PARAMETER_ALIASES[parameter.name] || [parameter.name];
    const mentioned = aliases.some(function (alias) {
      return lower.indexOf(alias.toLowerCase()) !== -1;
    });
    if (mentioned) found.push(parameter);
  }
  return found;
}

function buildWhereToChangeBlock(outcomesText) {
  const params = findParametersMentionedIn(outcomesText);
  if (params.length === 0) return null;

  const block = document.createElement("div");
  block.className = "where-to-change";

  const heading = document.createElement("p");
  heading.className = "where-heading";
  heading.textContent = "Where to make the change";
  block.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "where-list";

  for (const param of params) {
    const li = document.createElement("li");

    const line = document.createElement("span");
    if (param.name === "Solvent type") {
      line.textContent =
        "Solvent type — set by the solvent bottles. The solvent's identity and pH are entered there before the run.";
    } else {
      line.textContent =
        param.name +
        " — controlled by the " +
        param.module +
        " (admissible range: " +
        param.range +
        ").";
    }
    li.appendChild(line);

    if (PARAMETERS_REQUIRING_A_COLUMN_CHANGE.indexOf(param.name) !== -1) {
      const note = document.createElement("span");
      note.className = "where-note";
      note.textContent = " Changing this means fitting a different column; it is not a mid-session setting.";
      li.appendChild(note);
    }

    list.appendChild(li);
  }

  block.appendChild(list);
  return block;
}

// ---------------------------------------------------------------------------
// The "What to expect" block for temperature recommendations
// ---------------------------------------------------------------------------

function buildTemperaturePredictionBlock(prediction) {
  if (!prediction) return null;

  const block = document.createElement("div");
  block.className = "prediction-block";

  const heading = document.createElement("p");
  heading.className = "prediction-heading";
  heading.textContent = "What to expect";
  block.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "prediction-list";

  if (typeof prediction.predictedTr === "number") {
    const li = document.createElement("li");
    const tempLabel =
      (typeof prediction.targetTemperatureC === "number" ? prediction.targetTemperatureC + " °C" : "the new temperature");
    li.textContent =
      "Expected tR of the last peak at " + tempLabel + ": " + prediction.predictedTr.toFixed(2) +
      " min (from the 1.5% per °C rule of thumb, relative to the current run's tR).";
    list.appendChild(li);
  }

  const noResLi = document.createElement("li");
  noResLi.textContent =
    "Resolution at the new temperature cannot be predicted in advance — run it and compare the chromatogram.";
  list.appendChild(noResLi);

  if (prediction.observations && prediction.observations.length > 0) {
    const obsLi = document.createElement("li");
    const pairs = prediction.observations.map(function (o) {
      return o.temperatureC + " °C → " + o.resolution.toFixed(2);
    });
    let text = "Observed resolution on this solvent so far: " + pairs.join(", ") + ".";
    if (prediction.trend === "improving") {
      text += " The trend so far is improving, but the resolution at the new temperature can still go either way.";
    } else if (prediction.trend === "worsening") {
      text += " The trend so far is worsening, but the resolution at the new temperature can still go either way.";
    } else if (prediction.trend === "flat") {
      text += " The trend so far is flat.";
    }
    obsLi.textContent = text;
    list.appendChild(obsLi);
  }

  block.appendChild(list);
  return block;
}

// ---------------------------------------------------------------------------
// Rendering: result cards
// ---------------------------------------------------------------------------

function readPredictedTr(option, currentTr, currentPercentB) {
  if (option && typeof option.predictedTr === "number") return option.predictedTr;
  if (option && typeof option.predictedTR === "number") return option.predictedTR;
  if (!option) return null;
  if (typeof option.percentB !== "number") return null;
  if (typeof currentTr !== "number" || typeof currentPercentB !== "number") return null;
  const steps = (currentPercentB - option.percentB) / 10;
  return currentTr * Math.pow(2, steps);
}

function buildConfirmationControls() {
  const controls = document.createElement("div");
  controls.className = "confirm-controls";

  const question = document.createElement("p");
  question.className = "confirm-question";
  question.textContent = "Has 40 °C also been tried on this solvent?";
  controls.appendChild(question);

  const buttons = document.createElement("div");
  buttons.className = "confirm-buttons";

  const yesBtn = document.createElement("button");
  yesBtn.type = "button";
  yesBtn.className = "confirm-yes";
  yesBtn.textContent = "Yes, 40 °C was tried";
  yesBtn.addEventListener("click", function () {
    handleConfirmEarlierTemperatures(true);
  });
  buttons.appendChild(yesBtn);

  const noBtn = document.createElement("button");
  noBtn.type = "button";
  noBtn.className = "confirm-no secondary";
  noBtn.textContent = "No, 40 °C has not been tried";
  noBtn.addEventListener("click", function () {
    handleConfirmEarlierTemperatures(false);
  });
  buttons.appendChild(noBtn);

  controls.appendChild(buttons);
  return controls;
}

function buildObserveControls() {
  const controls = document.createElement("div");
  controls.className = "confirm-controls";

  const question = document.createElement("p");
  question.className = "confirm-question";
  question.textContent = "Is another temperature worth trying, or is the temperature ladder done?";
  controls.appendChild(question);

  const buttons = document.createElement("div");
  buttons.className = "confirm-buttons";

  const tryTempBtn = document.createElement("button");
  tryTempBtn.type = "button";
  tryTempBtn.className = "confirm-yes secondary";
  tryTempBtn.textContent = "Try another temperature";
  tryTempBtn.addEventListener("click", function () {
    handleTryAnotherTemperature();
  });
  buttons.appendChild(tryTempBtn);

  const solventBtn = document.createElement("button");
  solventBtn.type = "button";
  solventBtn.className = "confirm-yes";
  solventBtn.textContent = "Move on to the solvent change";
  solventBtn.addEventListener("click", function () {
    handleChooseSolventChange();
  });
  buttons.appendChild(solventBtn);

  controls.appendChild(buttons);
  return controls;
}

function buildTryAnotherTemperatureMessage() {
  const block = document.createElement("div");
  block.className = "confirm-controls";

  const message = document.createElement("p");
  message.className = "confirm-question";
  message.textContent =
    "Run a temperature between 25 and 60 °C other than 40 or 60, then load the resulting file and click Calculate.";
  block.appendChild(message);

  return block;
}

function buildSelectivityCard(selectivity) {
  const card = document.createElement("div");
  card.className = "result-card selectivity-card";

  const heading = document.createElement("h3");
  heading.textContent = "Selectivity — next step";
  card.appendChild(heading);

  if (selectivity.action) {
    const actionBlock = document.createElement("p");
    actionBlock.className = "card-action";
    actionBlock.textContent = selectivity.action;
    card.appendChild(actionBlock);
  }

  const message = document.createElement("p");
  message.textContent = selectivity.message;
  card.appendChild(message);

  if (selectivity.needsConfirmation) {
    card.appendChild(buildConfirmationControls());
  }

  if (selectivity.canMoveToSolvent) {
    card.appendChild(buildObserveControls());
    if (showTryAnotherTemperatureMessage) {
      card.appendChild(buildTryAnotherTemperatureMessage());
    }
  }

  if (typeof selectivity.percentB === "number" || Array.isArray(selectivity.temperatures)) {
    const table = document.createElement("table");
    const header = table.createTHead().insertRow();
    ["Parameter", "Value"].forEach(function (label) {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    });
    const body = table.createTBody();
    if (typeof selectivity.percentB === "number") {
      const tr = body.insertRow();
      tr.insertCell().textContent = "%B";
      tr.insertCell().textContent = selectivity.percentB.toFixed(1) + "%";
    }
    if (Array.isArray(selectivity.temperatures) && selectivity.temperatures.length > 0) {
      const tr = body.insertRow();
      tr.insertCell().textContent = "Temperature";
      tr.insertCell().textContent = selectivity.temperatures.map(function (t) {
        return t === "amb" ? "ambient" : t + " °C";
      }).join(", ");
    }
    card.appendChild(table);
  }

  if (selectivity.reasoning) {
    const reasoning = document.createElement("p");
    reasoning.className = "note";
    reasoning.textContent = selectivity.reasoning;
    card.appendChild(reasoning);
  }

  if (Array.isArray(selectivity.remainingPath) && selectivity.remainingPath.length > 0) {
    const pathHeading = document.createElement("p");
    pathHeading.className = "path-heading";
    pathHeading.textContent = "Remaining path after this step:";
    card.appendChild(pathHeading);

    const list = document.createElement("ol");
    list.className = "remaining-path";
    for (const step of selectivity.remainingPath) {
      const li = document.createElement("li");
      li.textContent = step;
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  const predictionBlock = buildTemperaturePredictionBlock(selectivity.temperaturePrediction);
  if (predictionBlock) card.appendChild(predictionBlock);

  const whereBlock = buildWhereToChangeBlock(selectivity.message);
  if (whereBlock) card.appendChild(whereBlock);

  return card;
}

function buildOtherOptionsCard(selectivity) {
  const card = document.createElement("div");
  card.className = "result-card other-options-card";

  const heading = document.createElement("h3");
  heading.textContent = "Other options still open";
  card.appendChild(heading);

  const intro = document.createElement("p");
  intro.textContent =
    "The flowchart sends this run to efficiency, because the peak count and resolution are at spec and only the run time is over. But the selectivity parameters on the current ligand are not exhausted yet. If you would rather try those first, the next steps are:";
  card.appendChild(intro);

  const message = document.createElement("p");
  message.textContent = selectivity.message;
  card.appendChild(message);

  if (selectivity.reasoning) {
    const reasoning = document.createElement("p");
    reasoning.className = "note";
    reasoning.textContent = selectivity.reasoning;
    card.appendChild(reasoning);
  }

  if (Array.isArray(selectivity.remainingPath) && selectivity.remainingPath.length > 0) {
    const pathHeading = document.createElement("p");
    pathHeading.className = "path-heading";
    pathHeading.textContent = "Remaining path after this step:";
    card.appendChild(pathHeading);

    const list = document.createElement("ol");
    list.className = "remaining-path";
    for (const step of selectivity.remainingPath) {
      const li = document.createElement("li");
      li.textContent = step;
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  const predictionBlock = buildTemperaturePredictionBlock(selectivity.temperaturePrediction);
  if (predictionBlock) card.appendChild(predictionBlock);

  const whereBlock = buildWhereToChangeBlock(selectivity.message);
  if (whereBlock) card.appendChild(whereBlock);

  return card;
}

function buildResultCard(outcome) {
  const card = document.createElement("div");
  card.className = "result-card" + (outcome.pass ? " pass" : "") + (outcome.unsafe ? " unsafe" : "");

  const heading = document.createElement("h3");
  heading.textContent = outcome.stage;
  card.appendChild(heading);

  if (outcome.action) {
    const actionBlock = document.createElement("p");
    actionBlock.className = "card-action";
    actionBlock.textContent = outcome.action;
    card.appendChild(actionBlock);
  }

  const message = document.createElement("p");
  message.textContent = outcome.message;
  card.appendChild(message);

  // If the specification has changed since the last calculation, show that
  // before the rest of the reasoning, so the user notices it.
  if (outcome.specChangeNote) {
    const specNote = document.createElement("p");
    specNote.className = "spec-change-note";
    specNote.textContent = outcome.specChangeNote;
    card.appendChild(specNote);
  }

  if (Array.isArray(outcome.options) && outcome.options.length > 0) {
    const fallbackTr = currentSummary ? currentSummary.trLastPeak : null;
    const percentBInput = conditionsContainer.querySelector('[data-field="percentB"]');
    const fallbackPercentB = percentBInput ? Number(percentBInput.value) : null;

    const optionsTable = document.createElement("table");
    const header = optionsTable.createTHead().insertRow();
    ["Option", "%B", "Expected tR last peak (min)"].forEach(function (label) {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    });
    const body = optionsTable.createTBody();
    for (const option of outcome.options) {
      const tr = body.insertRow();

      const labelCell = tr.insertCell();
      labelCell.textContent = option.label || "";

      const percentCell = tr.insertCell();
      percentCell.textContent = typeof option.percentB === "number" ? option.percentB.toFixed(1) : "";

      const trCell = tr.insertCell();
      const predicted = readPredictedTr(option, fallbackTr, fallbackPercentB);
      trCell.textContent = typeof predicted === "number" && Number.isFinite(predicted) ? predicted.toFixed(2) : "";
    }
    card.appendChild(optionsTable);

    const note = document.createElement("p");
    note.className = "note";
    note.textContent =
      "The expected tR is an estimate from the flowchart's rule of thumb: a 10-point %B decrement roughly doubles the last peak's tR. Treat it as a guide, not a measurement.";
    card.appendChild(note);
  }

  if (outcome.minPercentBNote && outcome.stage === "Retention") {
    const minNote = document.createElement("p");
    minNote.className = "note";
    minNote.textContent = outcome.minPercentBNote;
    card.appendChild(minNote);
  }

  if (outcome.reason) {
    const reasonNote = document.createElement("p");
    reasonNote.className = "note";
    reasonNote.textContent = outcome.reason;
    card.appendChild(reasonNote);
  }

  if (outcome.outOfScopeNote) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = outcome.outOfScopeNote;
    card.appendChild(note);
  }

  const whereBlock = buildWhereToChangeBlock(outcome.message);
  if (whereBlock) card.appendChild(whereBlock);

  return card;
}

function renderResults(outcomes) {
  const cards = [];

  for (const outcome of outcomes) {
    cards.push(buildResultCard(outcome));

    if (outcome && outcome.selectivity) {
      cards.push(buildSelectivityCard(outcome.selectivity));
    }

    if (outcome && outcome.selectivityStillOpen) {
      cards.push(buildOtherOptionsCard(outcome.selectivityStillOpen));
    }
  }

  resultContainer.replaceChildren(...cards);
}

// ---------------------------------------------------------------------------
// Rendering: the Equipment tab
// ---------------------------------------------------------------------------

function categoryClass(category) {
  if (category === "chemical") return "chemical";
  if (category === "mechanical") return "mechanical";
  if (category === "both") return "both";
  if (category === "detection") return "detection";
  return "";
}

function buildParametersTable() {
  const table = document.createElement("table");
  const header = table.createTHead().insertRow();
  ["Parameter", "Category", "Controlled by", "Usual range", "Effect"].forEach(function (label) {
    const th = document.createElement("th");
    th.textContent = label;
    header.appendChild(th);
  });

  const body = table.createTBody();
  for (const p of EQUIPMENT_PARAMETERS) {
    const tr = body.insertRow();
    tr.className = "parameter-row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", "Show details for the " + p.name + " parameter");
    tr.dataset.parameterName = p.name;

    tr.addEventListener("click", function () {
      showParameterDetail(p.name);
    });
    tr.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showParameterDetail(p.name);
      }
    });

    const nameCell = tr.insertCell();
    nameCell.textContent = p.name;
    if (p.note) {
      const note = document.createElement("span");
      note.className = "row-note";
      note.textContent = p.note;
      nameCell.appendChild(note);
    }

    const catCell = tr.insertCell();
    const catTag = document.createElement("span");
    catTag.className = "category-tag " + categoryClass(p.category);
    catTag.textContent = p.category;
    catCell.appendChild(catTag);

    const modCell = tr.insertCell();
    modCell.textContent = p.module;

    const rangeCell = tr.insertCell();
    rangeCell.textContent = p.range;

    const effectCell = tr.insertCell();
    effectCell.textContent = p.effect;
  }

  return table;
}

function showParameterDetail(parameterName) {
  const detail = document.getElementById("parameter-detail");
  const parameter = EQUIPMENT_PARAMETERS.find(function (p) { return p.name === parameterName; });

  if (!parameter) {
    detail.hidden = true;
    detail.replaceChildren();
    return;
  }

  const module = EQUIPMENT_MODULES.find(function (m) { return m.id === parameter.module; });
  const categoryExplanation = CATEGORY_EXPLANATIONS[parameter.category] || "";

  detail.hidden = false;
  detail.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = parameter.name;
  detail.appendChild(heading);

  const category = document.createElement("p");
  const categoryTag = document.createElement("span");
  categoryTag.className = "category-tag " + categoryClass(parameter.category);
  categoryTag.textContent = parameter.category;
  category.appendChild(categoryTag);
  category.appendChild(document.createTextNode("  " + categoryExplanation));
  detail.appendChild(category);

  const moduleLine = document.createElement("p");
  moduleLine.textContent =
    "Controlled by the " + parameter.module +
    (module && module.function ? " — " + module.function : "") + ".";
  detail.appendChild(moduleLine);

  const range = document.createElement("p");
  range.textContent = "Usual operating range: " + parameter.range + ".";
  detail.appendChild(range);

  const effect = document.createElement("p");
  effect.textContent = "Effect: changes " + parameter.effect + ".";
  detail.appendChild(effect);

  if (parameter.note) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = parameter.note;
    detail.appendChild(note);
  }

  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildResponsesTable(responses) {
  const table = document.createElement("table");
  const header = table.createTHead().insertRow();
  ["Response", "Unit or formula", "Note"].forEach(function (label) {
    const th = document.createElement("th");
    th.textContent = label;
    header.appendChild(th);
  });

  const body = table.createTBody();
  for (const r of responses) {
    const tr = body.insertRow();
    tr.insertCell().textContent = r.name;
    tr.insertCell().textContent = r.unit || r.formula || "";
    tr.insertCell().textContent = r.note || "";
  }

  return table;
}

function wireInstrumentHotspots() {
  const overlay = document.getElementById("instrument-overlay");
  if (!overlay) return;

  const hotspots = overlay.querySelectorAll(".hotspot");
  hotspots.forEach(function (g) {
    g.addEventListener("click", function () {
      showModuleDetail(g.getAttribute("data-module"));
    });
    g.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showModuleDetail(g.getAttribute("data-module"));
      }
    });
  });
}

function renderEquipment() {
  const paramsContainer = document.getElementById("parameters-container");
  const responsesReadContainer = document.getElementById("responses-read-container");
  const responsesCalcContainer = document.getElementById("responses-calculated-container");

  paramsContainer.replaceChildren(buildParametersTable());
  responsesReadContainer.replaceChildren(buildResponsesTable(EQUIPMENT_RESPONSES_READ));
  responsesCalcContainer.replaceChildren(buildResponsesTable(EQUIPMENT_RESPONSES_CALCULATED));
}

function showModuleDetail(moduleId) {
  const detail = document.getElementById("module-detail");
  const module = EQUIPMENT_MODULES.find(function (m) { return m.id === moduleId; });

  if (!module) {
    detail.hidden = true;
    detail.replaceChildren();
    return;
  }

  detail.hidden = false;
  detail.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = module.label;
  detail.appendChild(heading);

  const fn = document.createElement("p");
  fn.textContent = module.function;
  detail.appendChild(fn);

  if (module.controls && module.controls.length > 0) {
    const controlsHeading = document.createElement("p");
    controlsHeading.className = "controls-heading";
    controlsHeading.textContent = "Parameters it controls:";
    detail.appendChild(controlsHeading);

    const list = document.createElement("ul");
    list.className = "controls-list";
    for (const name of module.controls) {
      const li = document.createElement("li");
      const param = EQUIPMENT_PARAMETERS.find(function (p) { return p.name === name; });
      if (param) {
        li.textContent = name + " — " + param.range + " (" + param.category + ")";
      } else {
        li.textContent = name;
      }
      list.appendChild(li);
    }
    detail.appendChild(list);
  } else {
    const none = document.createElement("p");
    none.className = "note";
    none.textContent = "This module has no parameters the user sets.";
    detail.appendChild(none);
  }

  if (module.note) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = module.note;
    detail.appendChild(note);
  }

  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------------------------------------------------------------------------
// The nomogram converter
// ---------------------------------------------------------------------------

function runConversion() {
  const fromSolvent = document.getElementById("convert-from-solvent").value;
  const toSolvent = document.getElementById("convert-to-solvent").value;
  const rawPercentB = document.getElementById("convert-percent-b").value;
  const percentB = Number(rawPercentB);
  const resultBox = document.getElementById("convert-result");

  resultBox.replaceChildren();

  if (!Number.isFinite(percentB)) {
    resultBox.className = "convert-result error";
    resultBox.textContent = "Enter a %B value first.";
    return;
  }

  if (fromSolvent === toSolvent) {
    resultBox.className = "convert-result";
    resultBox.textContent = "Same solvent on both sides: " + percentB.toFixed(1) + "% B.";
    return;
  }

  const conversion = convertBetweenSolvents(percentB, fromSolvent, toSolvent);

  if (!conversion || conversion.percentB === null) {
    resultBox.className = "convert-result error";
    resultBox.textContent =
      conversion && conversion.note
        ? conversion.note
        : "That conversion could not be made.";
    return;
  }

  resultBox.className = "convert-result";

  const headline = document.createElement("p");
  headline.className = "convert-headline";
  headline.textContent =
    percentB.toFixed(1) + "% B on " + fromSolvent +
    " is isoeluotropic with " + conversion.percentB.toFixed(1) + "% B on " + toSolvent + ".";
  resultBox.appendChild(headline);

  if (conversion.note) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = conversion.note;
    resultBox.appendChild(note);
  }
}

document.getElementById("convert-btn").addEventListener("click", runConversion);
document.getElementById("convert-percent-b").addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    runConversion();
  }
});

// ---------------------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------------------

renderHistory();
renderFit();
renderEquipment();
wireInstrumentHotspots();
selectTab("flowchart");