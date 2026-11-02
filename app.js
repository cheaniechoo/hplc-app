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

const MAIN_TABS = {
  flowchart: ["tab-flowchart", "panel-flowchart"],
  history: ["tab-history", "panel-history"],
  equipment: ["tab-equipment", "panel-equipment"],
  naming: ["tab-naming", "panel-naming"],
};

function selectTab(which) {
  for (const key in MAIN_TABS) {
    const on = key === which;
    const tab = document.getElementById(MAIN_TABS[key][0]);
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", on ? "true" : "false");
    document.getElementById(MAIN_TABS[key][1]).hidden = !on;
  }
}
for (const key in MAIN_TABS) {
  document.getElementById(MAIN_TABS[key][0]).addEventListener("click", function () { selectTab(key); });
}

// Steps inside the Dashboard tab: Specification, Upload and conditions, Peak table, Recommendation.
const subButtons = document.querySelectorAll(".sub-button");
function showSub(name) {
  subButtons.forEach(function (b) {
    const on = b.dataset.sub === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("[data-sub-panel]").forEach(function (s) {
    s.hidden = s.dataset.subPanel !== name;
  });
}
subButtons.forEach(function (b) { b.addEventListener("click", function () { showSub(b.dataset.sub); }); });

// ---------------------------------------------------------------------------
// Element references for the Dashboard tab
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
calculateBtn.addEventListener("click", function () { handleCalculate(lastSpecsUsed && currentSummary && buildSpecChanges(lastSpecsUsed, readSpecsForDisplay()).length ? "rejudged" : null); });
clearHistoryBtn.addEventListener("click", function () {
  const n = readHistory().length;
  if (n === 0) { document.getElementById("clear-message").textContent = "There are no saved runs to clear."; return; }
  document.getElementById("clear-message").textContent = "";
  document.getElementById("clear-question").textContent = "Delete all " + n + (n === 1 ? " saved run?" : " saved runs?") + " This also resets the log K fit.";
  document.getElementById("clear-confirm").hidden = false;
  clearHistoryBtn.hidden = true;
});
document.getElementById("clear-no").addEventListener("click", function () {
  document.getElementById("clear-confirm").hidden = true;
  clearHistoryBtn.hidden = false;
});
document.getElementById("clear-yes").addEventListener("click", function () {
  const n = readHistory().length;
  handleClearHistory();
  document.getElementById("clear-confirm").hidden = true;
  clearHistoryBtn.hidden = false;
  document.getElementById("clear-message").textContent = "Cleared " + n + (n === 1 ? " run." : " runs.") + " The history is empty.";
});

// Sections inside the Run history tab: Runs and results, Clear history.
const histSubButtons = document.querySelectorAll(".hist-sub-button");
function showHistSub(name) {
  histSubButtons.forEach(function (b) {
    const on = b.dataset.histSub === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("[data-hist-panel]").forEach(function (s) { s.hidden = s.dataset.histPanel !== name; });
}
histSubButtons.forEach(function (b) { b.addEventListener("click", function () { showHistSub(b.dataset.histSub); }); });
showHistSub("runs");

// ---------------------------------------------------------------------------
// Run history
// ---------------------------------------------------------------------------


// The history is always kept in run order (GR number, then run number from the
// file name), not in the order the files were uploaded, so a run is judged with
// the runs that came before it at the bench whatever order the files arrive in.
// Files without a run number keep their upload order.
function runOrderKey(entry) {
  let c = {};
  try { c = parseConditionsFromName(entry.fileName).conditions; } catch (err) { c = {}; }
  const num = function (v, re) { const m = String(v || "").match(re); return m ? Number(m[0]) : null; };
  return { gr: num(c.grNumber, /\d+/), run: num(c.runNumber, /\d+/) };
}
function sortByRunOrder(list) {
  const keyed = list.map(function (e, i) { return { e: e, i: i, k: runOrderKey(e) }; });
  keyed.sort(function (a, b) {
    if (a.k.gr !== null && b.k.gr !== null && a.k.gr !== b.k.gr) return a.k.gr - b.k.gr;
    if (a.k.run !== null && b.k.run !== null && a.k.run !== b.k.run) return a.k.run - b.k.run;
    return a.i - b.i;
  });
  return keyed.map(function (x) { return x.e; });
}

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortByRunOrder(parsed.filter(function (e) {
      return e && typeof e.percentB === "number" && (typeof e.trLastPeak === "number" || e.numPeaks === 0);
    }));
  } catch (err) {
    return [];
  }
}

function writeHistory(history) {
  let trimmed = history.slice(-HISTORY_MAX_ENTRIES);
  // If the browser's storage is full, drop the stored chromatograms of the oldest runs first.
  for (let drop = 0; drop <= trimmed.length; drop++) {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
      return;
    } catch (err) {
      if (drop < trimmed.length) delete trimmed[drop].chrom;
    }
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
  } else if (entry.chrom) {
    // The same run loaded again: keep its decision, refresh its chromatogram and pressure.
    history.forEach(function (e) {
      if (e.fileName === entry.fileName && e.percentB === entry.percentB) { e.chrom = entry.chrom; e.maxPressure = entry.maxPressure; e.peakTimes = entry.peakTimes; }
    });
    writeHistory(history);
  }
  return readHistory();
}

// Remember the decision for the run that is currently loaded, so the history
// table can show what each run led to.
let currentRunFileName = null;
let lastRunRecord = null;
let summaryOutcome = null;
let autoCalculating = false;
function storeResultInHistory(fileName, result) {
  const history = readHistory();
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].fileName === fileName) {
      history[i].result = Object.assign({}, result, { calculatedAt: new Date().toISOString() });
      writeHistory(history);
      return;
    }
  }
}

function saveResultToHistory(outcomes) {
  if (!currentRunFileName) return;
  const main = outcomes.filter(Boolean).slice(-1)[0];
  if (!main) return;
  storeResultInHistory(currentRunFileName, {
    stage: main.stage || "", action: main.action || "", message: main.message || "",
    pass: !!main.pass, unsafe: !!main.unsafe, specs: readSpecsForDisplay(),
  });
  renderHistory();
  renderFit();
  renderAllPeaks();
}


// The %B the user picked from a list of admissible options, saved on the run's
// history entry so the choice is kept with the run.
function readChosenOption(fileName) {
  if (!fileName) return null;
  const h = readHistory();
  for (let i = h.length - 1; i >= 0; i--) if (h[i].fileName === fileName) return h[i].chosen || null;
  return null;
}
function saveChosenOption(fileName, choice) {
  if (!fileName) return;
  const h = readHistory();
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].fileName === fileName) { h[i].chosen = choice; writeHistory(h); break; }
  }
  renderHistory();
}

function handleClearHistory() {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    localStorage.removeItem(SPEC_LOG_KEY);
  } catch (err) {
    // Ignore.
  }
  userConfirmedEarlierTemperatures = false;
  userChoseSolventChange = false;
  showTryAnotherTemperatureMessage = false;
  shownChroms.clear();
  renderHistory();
  renderFit();
  renderAllPeaks();
  renderRunSummary();
}

// ---------------------------------------------------------------------------
// File handling
// ---------------------------------------------------------------------------

function handleFilesChosen(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  const unsupported = files.filter(function (f) {
    return !isCsvFile(f) && !isExcelFile(f);
  });
  if (unsupported.length > 0) {
    showUploadStatus(
      unsupported.length === 1
        ? "One of the chosen files isn't a .csv or Excel file. Choose files that end in .csv, .xlsx or .xls."
        : unsupported.length + " of the chosen files aren't .csv or Excel files. Choose files that end in .csv, .xlsx or .xls.",
      true
    );
    return;
  }

  // Load runs in run-number order (the second field of the file name) so the history reads like the bench work.
  const runNo = function (f) { const n = parseConditionsFromName(stripExtension(f.name)).conditions.runNumber; return n !== "" && Number.isFinite(Number(n)) ? Number(n) : null; };
  if (files.every(function (f) { return runNo(f) !== null; })) {
    files.sort(function (a, b) { return runNo(a) - runNo(b); });
  }

  const readers = files.map(function (file) {
    return isExcelFile(file) ? readExcelAsText(file) : readFileAsText(file);
  });

  Promise.all(readers)
    .then(function (results) {
      let lastProcessed = null;
      const loadedRuns = [];
      for (let i = 0; i < results.length; i++) {
        const file = files[i];
        const text = results[i];
        try {
          lastProcessed = processFileText(text, file.name);
          loadedRuns.push(lastRunRecord);
        } catch (err) {
          showUploadStatus(
            "The file \u201c" + file.name + "\u201d couldn't be read as a LabSolutions export. " + err.message,
            true
          );
          return;
        }
      }
      let statusText = "";
      if (results.length === 1) {
        statusText = "Loaded \u201c" + stripExtension(files[0].name) + "\u201d.";
        showUploadStatus(statusText, false);
      } else {
        statusText = "Loaded " + results.length + " files. Showing \u201c" + stripExtension(files[files.length - 1].name) + "\u201d; all " + results.length + " are in the run history with their results.";
        showUploadStatus(statusText, false);
      }
      if (lastProcessed) {
        calculateBtn.disabled = false;
        // Decide every run in the history again (new files can change the earlier runs' context), then show the last one loaded.
        autoCalculateRuns(runRecordsFromHistory());
        {
          autoCalculating = true;
          try { handleCalculate(); } finally { autoCalculating = false; }
        }
        showSub("result");
        const shown = readHistory().filter(function (e) { return e.fileName === currentRunFileName; })[0];
        if (shown && shown.result) {
          showUploadStatus(statusText + " Decision for the shown run: " + shown.result.stage + (shown.result.action ? " \u2013 " + shown.result.action.replace(/\.$/, "") : "") + ". The chromatogram is in step 3.", false);
        }
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

function isCsvFile(file) {
  return /\.csv$/i.test(file.name);
}

function isExcelFile(file) {
  return /\.(xlsx|xls)$/i.test(file.name);
}

// The spreadsheet library is large, so it's only loaded the first time an Excel file is chosen.
let sheetJsLoading = null;
function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!sheetJsLoading) {
    sheetJsLoading = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "vendor/xlsx.full.min.js";
      script.onload = function () { resolve(window.XLSX); };
      script.onerror = function () {
        sheetJsLoading = null;
        reject(new Error("The Excel reader couldn't be loaded. Check your internet connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return sheetJsLoading;
}

function readExcelAsText(file) {
  return loadSheetJs().then(function (XLSX) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const workbook = XLSX.read(new Uint8Array(reader.result), { type: "array" });
          resolve(workbookToText(XLSX, workbook));
        } catch (err) {
          reject(new Error("“" + file.name + "” couldn't be opened as an Excel file. " + err.message));
        }
      };
      reader.onerror = function () { reject(new Error("The file couldn't be read.")); };
      reader.readAsArrayBuffer(file);
    });
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

  currentRunFileName = nameToParse;
  const percentBNumber = parseFloat(conditions.percentB);
  addRunToHistory({
    fileName: nameToParse,
    percentB: Number.isFinite(percentBNumber) ? percentBNumber : null,
    trLastPeak: summary.trLastPeak,
    t0: summary.t0,
    numPeaks: summary.numPeaks,
    peakTimes: peaks.map(function (pk) { return pk.rTime; }).filter(function (v) { return typeof v === "number"; }),
    minResolution: summary.minResolution,
    solvent: conditions.solvent || null,
    temperature: conditions.temperature || null,
    ligand: conditions.ligand || null,
    maxPressure: maxBackPressure && Number.isFinite(maxBackPressure.maxActual) ? maxBackPressure.maxActual : null,
    timestamp: new Date().toISOString(),
    chrom: buildChromData(lines, peaks),
  });
  renderHistory();
  renderFit();
  renderAllPeaks();

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
  {
    const mc = window.monashColumns;
    const size = mc ? mc.size(conditions.columnDimensions) : null;
    if (mc && size && conditions.ligand && mc.knownLigand(conditions.ligand) && mc.find(conditions.ligand, size).length === 0) {
      warnings.push("No " + conditions.ligand + " column of " + size.L + " \u00d7 " + size.ID + " mm, " + size.dp + " \u00b5m is in the Monash column list. Check the ligand and column size in the file name.");
    }
  }
  chosenLigandColumn = null;
  renderWarnings(warnings);
  renderPeaks(peaks);
  renderPressureReadout(maxBackPressure);
  renderRunChromatogram(lines, peaks, nameToParse);
  lastRunRecord = { fileName: nameToParse, summary: summary, maxBackPressure: maxBackPressure, conditions: conditions };

  resultContainer.replaceChildren();
  summaryOutcome = null;
  renderRunSummary();

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


// Show or hide whole column groups of the run history table (kept in this browser only).
const COL_GROUPS_KEY = "hplc-history-column-groups-v1";
const colGroups = { cond: false, resp: true, dec: true };
try { Object.assign(colGroups, JSON.parse(localStorage.getItem(COL_GROUPS_KEY) || "{}")); } catch (err) { /* use defaults */ }
function applyColGroups() {
  const box = document.getElementById("history-container");
  if (box) Object.keys(colGroups).forEach(function (g) { box.classList.toggle("hide-" + g, !colGroups[g]); });
  document.querySelectorAll(".col-group-btn").forEach(function (b) { b.setAttribute("aria-pressed", colGroups[b.dataset.group] ? "true" : "false"); });
}
document.querySelectorAll(".col-group-btn").forEach(function (b) {
  b.addEventListener("click", function () {
    colGroups[b.dataset.group] = !colGroups[b.dataset.group];
    try { localStorage.setItem(COL_GROUPS_KEY, JSON.stringify(colGroups)); } catch (err) { /* ignore */ }
    applyColGroups();
  });
});
applyColGroups();


// Colour class for a decision, so the stage can be read at a glance in the history.
function stageClass(result) {
  if (!result) return "st-none";
  const st = String(result.stage || "");
  if (result.unsafe) return "st-unsafe";
  if (result.pass) return "st-pass";
  if (/->/.test(st)) return "st-handoff";
  if (/^Selectivity/i.test(st)) return "st-sel";
  if (/^Retention/i.test(st)) return "st-ret";
  if (/^(Error|No result|No peaks|Could not)/i.test(st)) return "st-err";
  return "st-none";
}

function renderHistory() {
  const history = readHistory();
  if (history.length === 0) {
    historyContainer.replaceChildren(makeEmptyMessage("No runs in the history yet."));
    updateHistoryExtras(history);
    return;
  }

  const specLog = readSpecLog();
  const specsNow = readSpecsForDisplay();
  const targetNow = specsNow ? specsNow.targetPeaks : null;
  const fmtNum = function (v, d) { return typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : ""; };
  const parsedFor = function (entry) {
    let c = {};
    try { c = parseConditionsFromName(entry.fileName).conditions; } catch (err) { c = {}; }
    const dims = String(c.columnDimensions || "").split("x");
    let facts = null;
    try {
      const lig = c.ligand ? normaliseLigand(c.ligand) : null;
      const bead = String(c.columnType || "").trim().charAt(0).toUpperCase();
      facts = (lig && window.columnFacts) ? window.columnFacts(lig, bead) : null;
    } catch (err) { facts = null; }
    return { c: c, L: dims[0] || "", ID: dims[1] || "", dp: dims[2] || "", facts: facts };
  };
  // [label, key, group, text(entry, parsed)] - the layout follows the course template, so efficiency and gradient columns can be added to a group later.
  const columns = [
    ["Run", "run", "run"],
    ["Ligand", "ligand", "cond"],
    ["Bead type", "bead", "cond"],
    ["Core-shell", "coreshell", "cond"],
    ["Pore size (\u00c5)", "pore", "cond"],
    ["C load (%)", "cload", "cond"],
    ["Length (mm)", "L", "cond"],
    ["\u00d8 (mm)", "ID", "cond"],
    ["PS (\u00b5m)", "dp", "cond"],
    ["Solvent", "solvent", "cond"],
    ["%B", "percentB", "cond"],
    ["Flow (mL/min)", "flow", "cond"],
    ["Sample conc.", "conc", "cond"],
    ["Temp (\u00b0C)", "temp", "cond"],
    ["Wavelength (nm)", "wl", "cond"],
    ["# Peaks", "numPeaks", "resp first"],
    ["Run time (tR last, min)", "trLastPeak", "resp"],
    ["Resolution (Rmin)", "rs", "resp"],
    ["Back-pressure (psi)", "bp", "resp"],
    ["Result", "result", "dec first"],
    ["Chromatogram", "chrom", "dec"],
  ];
  const groups = [["", "run", 1], ["Run conditions", "cond", 14], ["Responses", "resp first", 4], ["Decision", "dec first", 2]];

  const table = document.createElement("table");
  table.className = "hist-table";
  const head = table.createTHead();
  const groupRow = head.insertRow();
  groupRow.className = "hist-group-row";
  for (const [label, cls, span] of groups) {
    const th = document.createElement("th");
    th.colSpan = span; th.textContent = label; th.className = "grp-" + cls.replace(" ", "-") + " g-" + cls.split(" ")[0];
    groupRow.appendChild(th);
  }
  const headerRow = head.insertRow();
  for (const [label, , grp] of columns) {
    const th = document.createElement("th");
    th.textContent = label;
    th.className = (grp.indexOf("first") !== -1 ? "grp-start " : "") + "g-" + grp.split(" ")[0];
    headerRow.appendChild(th);
  }

  const body = table.createTBody();
  for (const entry of history) {
    const tr = body.insertRow();
    tr.className = "hist-row " + stageClass(entry.result);
    const pr = parsedFor(entry);
    for (const [, key, grp] of columns) {
      const td = tr.insertCell();
      if (grp.indexOf("first") !== -1) td.classList.add("grp-start");
      td.classList.add("g-" + grp.split(" ")[0]);
      const value = entry[key];
      if (specsNow) {
        let ok = null;
        if (key === "numPeaks" && typeof entry.numPeaks === "number" && targetNow !== null) ok = entry.numPeaks === targetNow;
        else if (key === "trLastPeak" && typeof entry.trLastPeak === "number" && Number.isFinite(specsNow.tRSpec)) ok = entry.trLastPeak <= specsNow.tRSpec;
        else if (key === "rs") { const rr = displayResolution({ numPeaks: entry.numPeaks, minResolution: entry.minResolution }, targetNow); if (rr.shown !== null && Number.isFinite(specsNow.rsSpec)) ok = rr.shown >= specsNow.rsSpec; }
        else if (key === "bp" && typeof entry.maxPressure === "number" && Number.isFinite(specsNow.maxPressure)) ok = entry.maxPressure < specsNow.maxPressure;
        if (ok !== null) td.classList.add(ok ? "spec-ok" : "spec-bad");
      }
      const plain = function (t) { td.textContent = t === null || t === undefined ? "" : String(t); };
      if (key === "run") {
        const n = String(pr.c.runNumber || "").replace(/^0+(?=\d)/, "");
        const strong = document.createElement("strong");
        strong.textContent = n ? "R" + n.padStart(2, "0") : "";
        td.appendChild(strong);
        const small = document.createElement("small");
        small.className = "hist-file";
        small.textContent = entry.fileName;
        td.appendChild(small);
        td.classList.add("hist-run");
        continue;
      }
      if (key === "ligand") { plain(pr.c.ligand || entry.ligand || ""); continue; }
      if (key === "bead") { plain(pr.facts ? (pr.facts.core === "shell" ? "Core-shell silica" : "Fully porous silica") : ""); continue; }
      if (key === "coreshell") { plain(pr.facts ? (pr.facts.core === "shell" ? "Yes" : "No") : ""); continue; }
      if (key === "pore") { plain(pr.facts ? pr.facts.pore : ""); continue; }
      if (key === "cload") { plain(pr.facts ? pr.facts.load : ""); continue; }
      if (key === "L") { plain(pr.L); continue; }
      if (key === "ID") { plain(pr.ID); continue; }
      if (key === "dp") { plain(pr.dp); continue; }
      if (key === "solvent") { plain(entry.solvent || pr.c.solvent || ""); continue; }
      if (key === "percentB") { plain(typeof entry.percentB === "number" ? entry.percentB : ""); continue; }
      if (key === "flow") { plain(pr.c.flowRate || ""); continue; }
      if (key === "conc") { plain(pr.c.sampleConcentration || ""); continue; }
      if (key === "temp") { plain(String(entry.temperature || pr.c.temperature || "").replace(/^T(?=\d)/i, "")); continue; }
      if (key === "wl") { plain(pr.c.wavelength || ""); continue; }
      if (key === "trLastPeak") { plain(fmtNum(entry.trLastPeak, 2)); continue; }
      if (key === "bp") { plain(typeof entry.maxPressure === "number" ? Math.round(entry.maxPressure) : ""); continue; }
      if (key === "rs") {
        const r = displayResolution({ numPeaks: entry.numPeaks, minResolution: entry.minResolution }, targetNow);
        if (r.shown === null) { plain(""); continue; }
        const strong = document.createElement("strong");
        strong.textContent = r.shown.toFixed(2);
        td.appendChild(strong);
        if (r.forcedZero) {
          const note = document.createElement("small");
          note.className = "hist-rs-note";
          note.textContent = r.calculated !== null ? "co-eluting; calculated " + r.calculated.toFixed(2) : "co-eluting";
          td.appendChild(note);
        }
        continue;
      }
      if (key === "chrom") {
        if (!entry.chrom) { td.textContent = "Not stored"; td.className = "hist-pending"; td.title = "Load this file again to store its chromatogram."; continue; }
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "secondary chrom-toggle"; btn.dataset.file = entry.fileName;
        const open = shownChroms.has(entry.fileName);
        btn.textContent = open ? "Hide" : "Show";
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.addEventListener("click", function () {
          if (shownChroms.has(entry.fileName)) shownChroms.delete(entry.fileName); else shownChroms.add(entry.fileName);
          renderHistory();
        });
        td.appendChild(btn);
        continue;
      }
      if (key === "result") {
        if (!value) {
          td.textContent = "Not calculated yet";
          td.className = "hist-pending";
        } else {
          td.className = "hist-result grp-start g-dec " + stageClass(value) + (value.pass ? " pass" : "") + (value.unsafe ? " unsafe" : "");
          if (value.specs) td.title = "Judged under: " + specSummary(value.specs);
          const strong = document.createElement("strong");
          strong.className = "stage-chip";
          strong.textContent = value.stage;
          td.appendChild(strong);
          if (value.action) {
            const a = document.createElement("div");
            a.className = "hist-action";
            a.textContent = value.action;
            td.appendChild(a);
          }
          if (entry.chosen && typeof entry.chosen.percentB === "number") {
            const c = document.createElement("div");
            c.className = "hist-chosen";
            c.textContent = "You chose: " + entry.chosen.percentB.toFixed(1) + "% B";
            td.appendChild(c);
          }
          if (value.message) {
            const d = document.createElement("details");
            const sm = document.createElement("summary");
            sm.textContent = "Why";
            const p = document.createElement("p");
            p.textContent = value.message;
            d.append(sm, p);
            td.appendChild(d);
          }
        }
        continue;
      }
      if (value === null || value === undefined || value === "") {
        td.textContent = "";
      } else if (typeof value === "number") {
        td.textContent = Number.isInteger(value) ? String(value) : value.toFixed(2);
      } else {
        td.textContent = String(value);
      }
    }

    // A second row holding the chromatogram, shown when "Show" is pressed.
    if (entry.chrom && shownChroms.has(entry.fileName)) {
      const extra = body.insertRow();
      extra.className = "hist-chrom-row";
      const cell = extra.insertCell();
      cell.colSpan = columns.length;
      const wrap = document.createElement("div");
      wrap.className = "run-chrom-wrap";
      wrap.innerHTML = chromatogramSVGFromData(entry.chrom, entry.fileName);
      const cap = document.createElement("p");
      cap.className = "hint";
      cap.textContent = entry.chrom.real
        ? "Detector trace saved from the file."
        : "Rebuilt from the peak table (the file had no detector trace).";
      cell.append(wrap, cap);
    }

    // Specification changes logged after this run.
    for (const ev of specLog) {
      if (ev.afterRun !== entry.fileName) continue;
      const evRow = body.insertRow();
      evRow.className = "hist-spec-row";
      const evCell = evRow.insertCell();
      evCell.colSpan = columns.length;
      const box = document.createElement("div");
      box.className = "hist-spec-event";
      const t = document.createElement("strong");
      t.textContent = "Specification changed: " + (ev.changes || []).join("; ");
      box.appendChild(t);
      const how = document.createElement("div");
      how.textContent = ev.choice === "rejudged" ? "Moved on by re-judging this run under the new specification."
        : ev.choice === "kept" ? "Moved on by keeping the old decision. The new specification applies from the next run."
        : "The new specification was applied when the next run was uploaded.";
      box.appendChild(how);
      if (ev.before || ev.after) {
        const ba = document.createElement("div");
        ba.className = "hist-spec-ba";
        ba.textContent = (ev.before ? "Before: " + ev.before : "") + (ev.before && ev.after ? "  \u2192  " : "") + (ev.after ? "After: " + ev.after : "");
        box.appendChild(ba);
      }
      evCell.appendChild(box);
    }
  }

  historyContainer.replaceChildren(table);
  updateHistoryExtras(history);
}

const shownChroms = new Set();

// The count on the Clear history section and the "Show all chromatograms" button.
function updateHistoryExtras(history) {
  const count = document.getElementById("history-count");
  if (count) count.textContent = history.length === 0 ? "There are no saved runs." : history.length + (history.length === 1 ? " run is" : " runs are") + " saved in this browser.";
  const all = document.getElementById("toggle-all-chroms");
  if (!all) return;
  const withChrom = history.filter(function (e) { return e.chrom; });
  all.hidden = withChrom.length === 0;
  const everyOpen = withChrom.length > 0 && withChrom.every(function (e) { return shownChroms.has(e.fileName); });
  all.textContent = everyOpen ? "Hide all chromatograms" : "Show all chromatograms";
  all.onclick = function () {
    if (everyOpen) shownChroms.clear(); else withChrom.forEach(function (e) { shownChroms.add(e.fileName); });
    renderHistory();
  };
}


// The all-peaks graph: one log K line per peak, with the suggested intermediate %B.
const allPeaksContainer = document.getElementById("allpeaks-container");
function renderAllPeaks() {
  if (!allPeaksContainer) return;
  allPeaksContainer.replaceChildren();
  const add = function (parent, tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  const card = add(allPeaksContainer, "div", "fit-card allpeaks-card");
  add(card, "h3", null, "All peaks: log K vs %B");
  add(card, "p", "hint", "One line per peak. Where two lines cross, those peaks co-elute. Where the closest pair of lines is furthest apart, the peaks separate best, and that %B is the suggested intermediate %B.");
  const specs = readSpecsForDisplay();
  const history = readHistory();
  const minRes = computeMinPercentB(history, specs.tRSpec);
  const res = buildAllPeaksFit(history, specs.targetPeaks, specs.tRSpec, minRes.sufficientData ? minRes.minPercentB : null);
  if (!res.ok) { add(card, "p", "empty", res.reason); return; }

  if (res.suggestion) {
    const call = add(card, "div", "minb-callout inter-callout");
    add(call, "span", "minb-label", "Suggested intermediate %B");
    add(call, "span", "minb-value", res.suggestion.percentB.toFixed(1) + "%");
    add(call, "span", "minb-sub", "the closest pair (peaks " + res.suggestion.pair[0] + " and " + res.suggestion.pair[1] + ") is furthest apart here: \u03b1 = " + res.suggestion.alpha.toFixed(2) + ", last peak expected near " + res.suggestion.lastTr.toFixed(1) + " min");
  } else {
    add(card, "p", "fit-warn", "No %B in the range of your runs keeps the last peak inside the tR spec, so no intermediate %B is suggested.");
  }
  const chart = add(card, "div", "logk-wrap");
  chart.innerHTML = allPeaksChartSVG(res, minRes.sufficientData ? minRes.minPercentB : null);

  add(card, "p", "note", "Drawn from " + res.runs.length + " run(s) where all " + specs.targetPeaks + " peaks were found, at " + res.runs.map(function (r) { return r.percentB; }).join(", ") + "% B. Peaks are matched between runs by elution order, so check that no two peaks swapped order. t0 is the average of " + res.t0Runs + " run(s): " + res.t0.toFixed(3) + " min." + (res.skipped.length ? " Peak " + res.skipped.join(", ") + " left out (retention time at or below t0)." : ""));

  const table = add(card, "table", "allpeaks-table");
  const hr = table.createTHead().insertRow();
  ["Peak", "Line", "R\u00b2"].concat(res.suggestion ? ["log K at " + res.suggestion.percentB.toFixed(1) + "% B"] : []).forEach(function (t) { add(hr, "th", null, t); });
  const tb = table.createTBody();
  res.lines.forEach(function (l) {
    const tr = tb.insertRow();
    const c0 = tr.insertCell(); c0.textContent = "Peak " + l.peak;
    tr.insertCell().textContent = "log K = " + l.slope.toFixed(4) + " \u00d7 %B " + (l.intercept < 0 ? "\u2212 " : "+ ") + Math.abs(l.intercept).toFixed(4);
    tr.insertCell().textContent = l.rSquared.toFixed(3);
    if (res.suggestion) tr.insertCell().textContent = (l.slope * res.suggestion.percentB + l.intercept).toFixed(3);
  });
}

function renderFit() {
  const history = readHistory();
  const specs = readSpecsForDisplay();
  const result = computeMinPercentB(history, specs.tRSpec);
  fitContainer.replaceChildren();

  const add = function (parent, tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    parent.appendChild(el);
    return el;
  };

  if (!result.sufficientData) {
    const wrap = document.createElement("div");
    add(wrap, "p", "empty", result.reason || "Not enough runs to fit the log K line yet.");
    if (result.frozen) add(wrap, "p", "note", "Retention was closed at \u201c" + result.frozenAtFile + "\u201d (" + result.frozenAtStage + "), so later runs are not added to the fit.");
    fitContainer.appendChild(wrap);
    return;
  }

  const fit = result.fit;
  const card = document.createElement("div");
  card.className = "fit-card";
  add(card, "h3", null, "Log K vs %B fit");

  const call = add(card, "div", "minb-callout" + (result.frozen ? " frozen" : ""));
  add(call, "span", "minb-label", "Calculated minimum %B");
  add(call, "span", "minb-value", result.roundedMinPercentB.toFixed(1) + "%");
  add(call, "span", "minb-sub", "the %B at which the last peak's tR meets your " + result.tRSpec + " min spec" + (result.frozen ? " (locked: retention is finished)" : ""));

  if (result.frozen) {
    add(card, "p", "fit-frozen", "Retention is finished (decision \u201c" + result.frozenAtStage + "\u201d at " + result.frozenAtFile + "). The minimum %B is no longer recalculated, so runs loaded after that point do not change it. It was fitted from the " + result.runsInScope + " run(s) up to there.");
  } else {
    add(card, "p", "hint", "The minimum %B is recalculated with every retention run. It stops once retention is exhausted or the selectivity stage starts.");
  }

  const chart = add(card, "div", "logk-wrap");
  chart.innerHTML = logKChartSVG(result);

  add(card, "p", null, "Fitted line: " + fit.equation);
  add(card, "p", fit.belowThreshold ? "fit-warn" : null,
    "R\u00b2 = " + fit.rSquared.toFixed(4) + " using " + fit.pointsUsed.length + " of " + fit.allPoints.length + " runs." +
    (fit.excluded.length ? " R\u00b2 with every run was " + fit.firstFitRSquared.toFixed(4) + "." : "") +
    (fit.belowThreshold ? " This is still below 0.99 and no more points can be dropped (at least 4 are kept), so treat the minimum %B with care." : ""));
  add(card, "p", null, "Average t0 across these runs: " + fit.averageT0.toFixed(3) + " min.");

  if (fit.excluded.length > 0) {
    const ul = add(card, "ul", "note fit-excluded");
    fit.excluded.forEach(function (x) { add(ul, "li", null, x.reason); });
  }

  add(card, "p", "derived", "Derived minimum %B (tR last peak on spec at " + result.tRSpec + " min): " + result.roundedMinPercentB.toFixed(1) + "% B.");
  add(card, "p", "note",
    "Working: t0 = " + result.averageT0.toFixed(3) + " min, target K = " + result.targetK.toFixed(3) +
    ", target log K = " + result.targetLogK.toFixed(4) + ", %B = (log K \u2212 intercept) / slope = " +
    result.roundedMinPercentB.toFixed(1) + ".");
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
function buildSpecChanges(before, after) {
  if (!before) return [];
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
    const a2 = after[field.key];
    if (b !== a2) changes.push(field.label + ": " + field.format(b) + " \u2192 " + field.format(a2));
  }
  return changes;
}

function buildSpecChangeNote(before, after) {
  const changes = buildSpecChanges(before, after);
  if (changes.length === 0) return null;
  return "The specification has changed since the last calculation (" + changes.join("; ") + "). The recommendation below uses the new specification.";
}

// ---------------------------------------------------------------------------
// Logging specification changes, and letting the user choose how to move on
// ---------------------------------------------------------------------------
const SPEC_LOG_KEY = "hplc-flowchart-spec-log-v1";
function readSpecLog() {
  try { const p = JSON.parse(localStorage.getItem(SPEC_LOG_KEY) || "[]"); return Array.isArray(p) ? p : []; } catch (err) { return []; }
}
function addSpecEvent(ev) {
  try { const l = readSpecLog(); l.push(ev); localStorage.setItem(SPEC_LOG_KEY, JSON.stringify(l.slice(-50))); } catch (err) { /* ignore */ }
}
function summariseResult(r) {
  return r ? (r.stage || "") + (r.action ? ": " + String(r.action).replace(/\.$/, "") : "") : "";
}
function specSummary(s) {
  if (!s) return "";
  return s.targetPeaks + " peaks, tR \u2264 " + s.tRSpec + " min, Rs \u2265 " + s.rsSpec + ", max " + s.maxPressure + " psi";
}
function currentStoredResult() {
  const e = readHistory().filter(function (x) { return x.fileName === currentRunFileName; })[0];
  return e && e.result ? e.result : null;
}

function updateSpecBanner() {
  let el = document.getElementById("spec-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "spec-banner";
    el.className = "spec-banner";
    el.setAttribute("role", "status");
    const bar = document.querySelector("#panel-flowchart .sub-bar");
    if (bar) bar.insertAdjacentElement("afterend", el); else return;
  }
  if (!lastSpecsUsed || !currentSummary) { el.hidden = true; return; }
  const changes = buildSpecChanges(lastSpecsUsed, readSpecsForDisplay());
  if (changes.length === 0) { el.hidden = true; return; }
  el.hidden = false;
  el.replaceChildren();
  const mk = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  el.appendChild(mk("strong", "spec-banner-title", "Specification changed: " + changes.join("; ")));
  el.appendChild(mk("p", "spec-banner-text", "This changes the aim of the experiment. How do you want to move on?"));
  const row = mk("div", "spec-banner-actions");
  const b1 = mk("button", "spec-banner-btn primary", "Re-judge this run under the new specification");
  b1.type = "button";
  b1.addEventListener("click", function () { handleCalculate("rejudged"); });
  const b2 = mk("button", "spec-banner-btn", "Keep the old decision, apply the new spec from the next run");
  b2.type = "button";
  b2.addEventListener("click", function () {
    const now = readSpecsForDisplay();
    addSpecEvent({ timestamp: new Date().toISOString(), afterRun: currentRunFileName, changes: changes, choice: "kept", before: summariseResult(currentStoredResult()), after: "" });
    lastSpecsUsed = { targetPeaks: now.targetPeaks, tRSpec: now.tRSpec, rsSpec: now.rsSpec, rsFloor: now.rsFloor, maxPressure: now.maxPressure, minPercentBOverride: now.minPercentBOverride };
    updateSpecBanner();
    renderHistory();
  });
  row.append(b1, b2);
  el.appendChild(row);
}

// ---------------------------------------------------------------------------
// Calculate
// ---------------------------------------------------------------------------

function readSpecs(runConditions) {
  // With `runConditions`, the current %B, solvent and ligand come from that run's
  // own file name (used when calculating every uploaded run automatically).
  // Without it, they come from the editable fields on the page.
  let percentBValue, solventValue, ligandValue;
  if (runConditions) {
    percentBValue = runConditions.percentB === "" ? NaN : Number(runConditions.percentB);
    solventValue = runConditions.solvent;
    ligandValue = runConditions.ligand;
  } else {
    const percentBInput = conditionsContainer.querySelector('[data-field="percentB"]');
    percentBValue = percentBInput ? Number(percentBInput.value) : NaN;
    const solventInput = conditionsContainer.querySelector('[data-field="solvent"]');
    solventValue = solventInput ? solventInput.value : null;
    const ligandInput = conditionsContainer.querySelector('[data-field="ligand"]');
    ligandValue = ligandInput ? ligandInput.value : null;
  }

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
      note: (derived.frozen ? "Retention is finished, so the minimum %B is no longer recalculated and stays at the value from the retention runs. " : "") +
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

// Works out the list of result cards for one run. It changes nothing on the page.
function computeOutcomes(run, specs, history, flags, specChangeNote) {
  const pressureOutcome = checkBackPressure(run.maxBackPressure, specs.maxPressure);
  {
    const mc = window.monashColumns;
    const size = mc && run.conditions ? mc.size(run.conditions.columnDimensions) : null;
    const limit = size ? mc.maxPsi(size.dp) : null;
    if (limit !== null && Number.isFinite(specs.maxPressure) && specs.maxPressure > limit) {
      pressureOutcome.columnNote = "Your specification (" + specs.maxPressure + " psi) is higher than this column can handle (" + limit + " psi for " + size.dp + " \u00b5m particles). The tool still checks against your specification.";
    }
  }
  // Back pressure is the first check, for safety: an unsafe run stops here and gets no further decision.
  if (pressureOutcome.unsafe) {
    if (specChangeNote) pressureOutcome.specChangeNote = specChangeNote;
    return [pressureOutcome];
  }

  if (specs.rsFloor >= specs.rsSpec) {
    return [pressureOutcome, {
      stage: "Error",
      action: "Fix the Specification section.",
      message: "The Rs floor must be lower than the Rs spec.",
      specChangeNote: specChangeNote,
    }];
  }
  if (specs.currentPercentB === null) {
    return [pressureOutcome, {
      stage: "Error",
      action: "Fix the %B field in Run conditions.",
      message: "The %B field in Run conditions isn't a number.",
      specChangeNote: specChangeNote,
    }];
  }

  const minChoice = resolveMinPercentB(specs, history);
  const specsForDecision = Object.assign({}, specs, { minPercentB: minChoice.minPercentB });

  let intermediateFromGraph = null;
  try {
    const ap = buildAllPeaksFit(history, specs.targetPeaks, specs.tRSpec, minChoice.minPercentB);
    if (ap.ok && ap.suggestion) intermediateFromGraph = ap.suggestion.percentB;
  } catch (err) { intermediateFromGraph = null; }

  const outcome = decide(run.summary, specsForDecision, history, {
    intermediatePercentB: intermediateFromGraph,
    currentConditions: run.conditions,
    userConfirmedEarlierTemperatures: flags.userConfirmedEarlierTemperatures,
    userChoseSolventChange: flags.userChoseSolventChange,
  });

  if (outcome && typeof outcome === "object") {
    outcome.minPercentBNote = minChoice.note;
    outcome.specChangeNote = specChangeNote;
    // Put the concrete next step in the headline, not "move on to the Selectivity stage".
    const sel = outcome.selectivity;
    if (sel && typeof sel.action === "string" && sel.action && sel.step !== "complete" && sel.step !== "efficiency" && /(move on to|return to) the Selectivity stage\.?$/i.test(outcome.action || "")) {
      const tempMatch = String(sel.action).match(/^Change the temperature to (\d+) deg C and run again( on \w+)?\.?$/i);
      let lead = String(outcome.action).replace(/\s*(move on to|return to) the Selectivity stage\.?$/i, "").replace(/,\s*then$/i, "").trim();
      outcome.stageAction = outcome.action;
      if (tempMatch && typeof outcome.previousPercentB === "number") {
        outcome.action = "Run " + outcome.previousPercentB + "% B at " + tempMatch[1] + " \u00b0C" + (tempMatch[2] || "") + ".";
      } else if (tempMatch && lead) {
        outcome.action = "Reset %B, then run at " + tempMatch[1] + " \u00b0C" + (tempMatch[2] || "") + ".";
      } else {
        const lower = sel.action.charAt(0).toLowerCase() + sel.action.slice(1);
        outcome.action = lead ? lead.replace(/[.,]$/, "") + ", then " + lower : sel.action;
      }
      outcome.selectivityInHeadline = true;
    }
  }
  return [pressureOutcome, outcome];
}

function handleCalculate(choice) {
  if (!currentSummary) return;
  const how = typeof choice === "string" ? choice : null;
  const resultBefore = currentStoredResult();

  const specs = readSpecs();
  // The current run is judged with the runs up to and including itself, in run order.
  const allHistory = readHistory();
  const atNow = allHistory.findIndex(function (e) { return e.fileName === currentRunFileName; });
  const history = atNow === -1 ? allHistory : allHistory.slice(0, atNow + 1);

  // Work out whether the specification changed since the last calculation. The
  // note is created before `lastSpecsUsed` is updated, so it compares against
  // the previous run and not the current one.
  const specChangeNote = buildSpecChangeNote(lastSpecsUsed, specs);
  const specChangesList = buildSpecChanges(lastSpecsUsed, specs);
  lastSpecsUsed = {
    targetPeaks: specs.targetPeaks,
    tRSpec: specs.tRSpec,
    rsSpec: specs.rsSpec,
    rsFloor: specs.rsFloor,
    maxPressure: specs.maxPressure,
    minPercentBOverride: specs.minPercentBOverride,
  };

  const run = { summary: currentSummary, maxBackPressure: currentMaxBackPressure, conditions: currentConditions };
  const flags = { userConfirmedEarlierTemperatures: userConfirmedEarlierTemperatures, userChoseSolventChange: userChoseSolventChange };
  const outcomes = computeOutcomes(run, specs, history, flags, specChangeNote);
  if (specChangesList.length > 0) {
    const mainOutcome = outcomes.filter(Boolean).slice(-1)[0];
    addSpecEvent({
      timestamp: new Date().toISOString(),
      afterRun: currentRunFileName,
      changes: specChangesList,
      choice: how || "new-run",
      before: how ? summariseResult(resultBefore) : "",
      after: how ? summariseResult(mainOutcome) : "",
    });
  }
  renderResults(outcomes, { stay: autoCalculating });
  updateSpecBanner();
}


// Rebuilds a run record for every run in the history, in run order.
function runRecordsFromHistory() {
  return readHistory().map(function (e) {
    let conditions = {};
    try { conditions = parseConditionsFromName(e.fileName).conditions; } catch (err) { conditions = {}; }
    return {
      fileName: e.fileName,
      summary: { numPeaks: e.numPeaks, trLastPeak: e.trLastPeak, minResolution: e.minResolution, t0: e.t0 },
      maxBackPressure: typeof e.maxPressure === "number" ? { maxActual: e.maxPressure, units: "psi" } : null,
      conditions: conditions,
    };
  });
}

// Calculates the decision for every run that was just loaded, so the run
// history shows a result for each one without the user pressing Calculate.
function autoCalculateRuns(runs) {
  const flags = { userConfirmedEarlierTemperatures: false, userChoseSolventChange: false };
  for (const run of runs) {
    // Each run is judged with the history up to and including itself, as it would have been at the bench.
    const fullHistory = readHistory();
    const at = fullHistory.findIndex(function (e) { return e.fileName === run.fileName; });
    const history = at === -1 ? fullHistory : fullHistory.slice(0, at + 1);
    let result;
    if (!run.summary) {
      result = { stage: "No result", action: "", message: "No peak table was found in this file, so no decision could be made.", pass: false, unsafe: false };
    } else {
      try {
        const specs = readSpecs(run.conditions);
        const outcomes = computeOutcomes(run, specs, history, flags, null);
        const main = outcomes.filter(Boolean).slice(-1)[0];
        result = { stage: main.stage || "", action: main.action || "", message: main.message || "", pass: !!main.pass, unsafe: !!main.unsafe, specs: readSpecsForDisplay() };
      } catch (err) {
        result = { stage: "Could not calculate", action: "", message: err.message, pass: false, unsafe: false };
      }
    }
    storeResultInHistory(run.fileName, result);
  }
  renderHistory();
  renderFit();
  renderAllPeaks();
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

// Friendly step list: the step to do now, then the steps that may follow.
function shortPathLabel(step) {
  let t = String(step).replace(/\s+at\s+the\s+isoeluotropic.*$/i, "").replace(/,\s*at\s+ambient.*$/i, "");
  if (/^Observe/i.test(t)) return "Observe: compare the 40 and 60 \u00b0C runs";
  if (/^Change the temperature to (\d+)/i.test(t)) return t.replace(/ deg C/i, " \u00b0C").replace(/^Change/, "Change");
  if (/^solvent 2 \(MeOH\)/i.test(t)) return "Switch to MeOH";
  if (/^solvent 2/i.test(t)) return "Switch to the second solvent";
  if (/^MeOH\b/i.test(t)) return "Switch to MeOH";
  if (/^mix/i.test(t)) return "Switch to the mixed solvent";
  if (/^ligand change/i.test(t)) return "Change the ligand";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function buildStepper(nowText, steps, title) {
  const wrap = document.createElement("div");
  wrap.className = "stepper";
  const h = document.createElement("p");
  h.className = "stepper-title";
  h.textContent = title || "Your next steps";
  wrap.appendChild(h);
  const ol = document.createElement("ol");
  ol.className = "stepper-list";
  const items = [];
  if (nowText) items.push({ text: nowText, now: true });
  for (const st of steps || []) items.push({ text: shortPathLabel(st), now: false });
  items.forEach(function (it, i) {
    const li = document.createElement("li");
    li.className = "stepper-item" + (it.now ? " now" : "");
    const num = document.createElement("span");
    num.className = "stepper-num";
    num.textContent = String(i + 1);
    const body = document.createElement("span");
    body.className = "stepper-text";
    body.textContent = it.text;
    li.appendChild(num);
    li.appendChild(body);
    if (it.now) {
      const tag = document.createElement("span");
      tag.className = "stepper-tag";
      tag.textContent = "Do this now";
      li.appendChild(tag);
    } else if (i === 1 && nowText) {
      const tag = document.createElement("span");
      tag.className = "stepper-tag later";
      tag.textContent = "Then, if needed";
      li.appendChild(tag);
    }
    ol.appendChild(li);
  });
  wrap.appendChild(ol);
  return wrap;
}

function buildMonashColumnsBlock() {
  const mc = window.monashColumns;
  if (!mc || !currentConditions) return null;
  const size = mc.size(currentConditions.columnDimensions);
  const mk = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const wrap = mk("div", "mc-block");
  wrap.appendChild(mk("h4", null, "Columns available at Monash"));
  wrap.appendChild(mk("p", "note", size ? "Pick one to set up the next run. Same size as the current column (" + size.L + " \u00d7 " + size.ID + " mm, " + size.dp + " \u00b5m) first." : "The column size could not be read from the file name."));
  const pick = function (c, btn) {
    chosenLigandColumn = { ligand: c.ligand, line: c.line, L: c.L, ID: c.ID, dp: c.dp };
    wrap.querySelectorAll(".mc-chip").forEach(function (b) { b.classList.remove("on"); });
    btn.classList.add("on");
    refreshNextRunCard();
  };
  for (const lig of mc.ligands) {
    if (mc.sameLigand(lig, currentConditions.ligand)) continue;
    const all = mc.list.filter(function (c) { return mc.sameLigand(c.ligand, lig); });
    if (all.length === 0) continue;
    const row = mk("div", "mc-row");
    row.appendChild(mk("strong", "mc-lig", lig));
    const chips = mk("div", "mc-chips");
    const same = size ? all.filter(function (c) { return c.L === size.L && c.ID === size.ID && c.dp === size.dp; }) : [];
    const addChip = function (c, isSame) {
      const b = mk("button", "mc-chip" + (isSame ? " same" : ""), c.line + (isSame ? "" : " \u00b7 " + c.L + "\u00d7" + c.ID + "\u00d7" + c.dp) + (c.n > 1 ? " (" + c.n + ")" : ""));
      b.type = "button";
      b.addEventListener("click", function () { pick(c, b); });
      chips.appendChild(b);
    };
    same.forEach(function (c) { addChip(c, true); });
    if (same.length === 0) chips.appendChild(mk("span", "mc-none", "none at this size"));
    const others = all.filter(function (c) { return same.indexOf(c) === -1; });
    if (others.length) {
      const det = mk("details", "mc-more");
      det.appendChild(mk("summary", null, "Other sizes (" + others.length + ")"));
      const oc = mk("div", "mc-chips");
      others.forEach(function (c) {
        const b = mk("button", "mc-chip", c.line + " \u00b7 " + c.L + "\u00d7" + c.ID + "\u00d7" + c.dp + (c.n > 1 ? " (" + c.n + ")" : ""));
        b.type = "button";
        b.addEventListener("click", function () { pick(c, b); });
        oc.appendChild(b);
      });
      det.appendChild(oc);
      row.append(chips, det);
    } else row.appendChild(chips);
    wrap.appendChild(row);
  }
  wrap.appendChild(mk("p", "note", "From the lab's column list dated Feb 2023. Check the shelf before you plan around a column."));
  return wrap;
}

function buildSelectivityCard(selectivity, skipAction) {
  const card = document.createElement("div");
  card.className = "result-card selectivity-card";

  const heading = document.createElement("h3");
  heading.textContent = skipAction ? "Selectivity: the path from here" : "Selectivity — next step";
  card.appendChild(heading);

  if (selectivity.action && !skipAction) {
    const actionBlock = document.createElement("p");
    actionBlock.className = "card-action";
    actionBlock.textContent = selectivity.action;
    card.appendChild(actionBlock);
  }

  const more = document.createElement("details");
  more.className = "more-details";
  const moreSum = document.createElement("summary");
  moreSum.textContent = "Why, and details";
  more.appendChild(moreSum);
  const message = document.createElement("p");
  message.textContent = selectivity.message;
  more.appendChild(message);

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
    more.appendChild(reasoning);
  }

  if (Array.isArray(selectivity.remainingPath) && selectivity.remainingPath.length > 0) {
    const nowText = shortPathLabel(selectivity.action || "").replace(/\.$/, "");
    card.appendChild(buildStepper(nowText, selectivity.remainingPath, "Next steps, in order"));
  }

  if (selectivity.step === "ligand") {
    const mcBlock = buildMonashColumnsBlock();
    if (mcBlock) card.appendChild(mcBlock);
  }

  const predictionBlock = buildTemperaturePredictionBlock(selectivity.temperaturePrediction);
  if (predictionBlock) more.appendChild(predictionBlock);

  const whereBlock = buildWhereToChangeBlock(selectivity.message);
  if (whereBlock) more.appendChild(whereBlock);
  card.appendChild(more);

  return card;
}

function buildOtherOptionsCard(selectivity) {
  const card = document.createElement("div");
  card.className = "result-card other-options-card";
  const mk = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  card.appendChild(mk("h3", null, "Or try selectivity first"));
  card.appendChild(mk("p", "oo-lead", "The flowchart sends this run to efficiency because only the run time is over. Selectivity options are still open on this ligand if you would rather try them first."));

  // The next step in one line; any further sentences go in the details.
  const stripped = String(selectivity.message || "").replace(/^Next selectivity step:\s*/i, "").trim();
  const firstEnd = stripped.search(/\.(\s|$)/);
  const headline = firstEnd === -1 ? stripped : stripped.slice(0, firstEnd + 1);
  const rest = firstEnd === -1 ? "" : stripped.slice(firstEnd + 1).trim();
  const next = mk("div", "oo-next");
  next.appendChild(mk("span", "oo-label", "Next selectivity step"));
  next.appendChild(mk("strong", "oo-headline", headline.charAt(0).toUpperCase() + headline.slice(1)));
  card.appendChild(next);

  // What to expect, as short chips.
  const pred = selectivity.temperaturePrediction;
  if (pred) {
    const chips = mk("div", "oo-chips");
    if (typeof pred.predictedTr === "number") chips.appendChild(mk("span", "oo-chip", "Last peak expected near " + pred.predictedTr.toFixed(1) + " min"));
    chips.appendChild(mk("span", "oo-chip", "Resolution: run it to find out"));
    if (pred.observations && pred.observations.length) {
      chips.appendChild(mk("span", "oo-chip", "Seen so far: " + pred.observations.map(function (o) { return o.temperatureC + " \u00b0C \u2192 Rs " + o.resolution.toFixed(2); }).join(", ")));
    }
    card.appendChild(chips);
  }

  if (Array.isArray(selectivity.remainingPath) && selectivity.remainingPath.length > 0) {
    card.appendChild(buildStepper(null, selectivity.remainingPath, "Then, if needed"));
  }

  // Everything else stays one click away.
  const more = mk("details", "more-details");
  more.appendChild(mk("summary", null, "Why, and details"));
  if (rest) more.appendChild(mk("p", null, rest));
  if (selectivity.reasoning) more.appendChild(mk("p", "note", selectivity.reasoning));
  const predictionBlock = buildTemperaturePredictionBlock(selectivity.temperaturePrediction);
  if (predictionBlock) more.appendChild(predictionBlock);
  const whereBlock = buildWhereToChangeBlock(selectivity.message);
  if (whereBlock) more.appendChild(whereBlock);
  card.appendChild(more);

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

  const more = document.createElement("details");
  more.className = "more-details";
  const moreSum = document.createElement("summary");
  moreSum.textContent = "Why, and details";
  more.appendChild(moreSum);

  const message = document.createElement("p");
  message.textContent = outcome.message;
  more.appendChild(message);

  // If the specification has changed since the last calculation, show that
  // before the rest of the reasoning, so the user notices it.
  if (outcome.columnNote) {
    const colNote = document.createElement("p");
    colNote.className = "spec-change-note";
    colNote.textContent = outcome.columnNote;
    card.appendChild(colNote);
  }
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
    optionsTable.className = "options-table";
    const hasGrounds = outcome.options.some(function (o) { return o.grounds; });
    const header = optionsTable.createTHead().insertRow();
    ["Option", "%B", "Expected tR last peak (min)"].concat(hasGrounds ? ["Why choose it"] : []).concat([""]).forEach(function (label) {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    });
    const body = optionsTable.createTBody();
    const savedChoice = readChosenOption(currentRunFileName);
    const chosenLine = document.createElement("p");
    chosenLine.className = "next-run-line";
    const setChosenLine = function (choice) {
      chosenLine.textContent = choice ? "Next run: " + choice.percentB.toFixed(1) + "% B (" + choice.label + ")" : "";
      chosenLine.hidden = !choice;
    };
    const rowButtons = [];
    for (const option of outcome.options) {
      const tr = body.insertRow();
      if (option.primary) tr.className = "primary-option";

      const labelCell = tr.insertCell();
      labelCell.textContent = option.label || "";
      if (option.primary) {
        const badge = document.createElement("span");
        badge.className = "primary-badge";
        badge.textContent = "primary";
        labelCell.appendChild(badge);
      }

      const percentCell = tr.insertCell();
      percentCell.textContent = typeof option.percentB === "number" ? option.percentB.toFixed(1) : "";

      const trCell = tr.insertCell();
      const predicted = readPredictedTr(option, fallbackTr, fallbackPercentB);
      trCell.textContent = typeof predicted === "number" && Number.isFinite(predicted) ? predicted.toFixed(2) : "";

      if (hasGrounds) {
        const whyCell = tr.insertCell();
        whyCell.className = "grounds-cell";
        whyCell.textContent = option.grounds || "";
      }

      const pickCell = tr.insertCell();
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = option.primary ? "" : "secondary";
      pick.textContent = "Use this";
      pick.addEventListener("click", function () {
        const choice = { percentB: option.percentB, label: option.label || "", predictedTr: typeof predicted === "number" ? predicted : null };
        saveChosenOption(currentRunFileName, choice);
        renderRunSummary();
        setChosenLine(choice);
        refreshNextRunCard();
        rowButtons.forEach(function (b) { b.btn.textContent = "Use this"; b.row.classList.remove("chosen-option"); });
        pick.textContent = "Chosen";
        tr.classList.add("chosen-option");
      });
      rowButtons.push({ btn: pick, row: tr, option: option });
      pickCell.appendChild(pick);
      if (savedChoice && savedChoice.percentB === option.percentB) {
        pick.textContent = "Chosen";
        tr.classList.add("chosen-option");
      }
    }
    setChosenLine(savedChoice && outcome.options.some(function (o) { return o.percentB === savedChoice.percentB; }) ? savedChoice : null);
    card.appendChild(optionsTable);
    card.appendChild(chosenLine);

    const note = document.createElement("p");
    note.className = "note";
    note.textContent =
      "Estimate only: each 10-point %B decrement roughly doubles the last peak's tR.";
    card.appendChild(note);
  }

  if (outcome.minPercentBNote && outcome.stage === "Retention") {
    const minNote = document.createElement("p");
    minNote.className = "note";
    minNote.textContent = outcome.minPercentBNote;
    more.appendChild(minNote);
  }

  if (outcome.reason) {
    const reasonNote = document.createElement("p");
    reasonNote.className = "note";
    reasonNote.textContent = outcome.reason;
    more.appendChild(reasonNote);
  }

  if (outcome.outOfScopeNote) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = outcome.outOfScopeNote;
    more.appendChild(note);
  }

  const whereBlock = buildWhereToChangeBlock(outcome.message);
  if (whereBlock) more.appendChild(whereBlock);
  card.appendChild(more);

  return card;
}

// ---------------------------------------------------------------------------
// Complete conditions for the next run (laid out like the lab report)
// ---------------------------------------------------------------------------
function nextRunChanges(outcome) {
  const ch = {};
  if (!outcome || outcome.unsafe || outcome.stage === "Error" || outcome.stage === "No peaks") return null;
  const act = String(outcome.action || "");
  const sel = outcome.selectivity;
  const chosen = readChosenOption(currentRunFileName);
  if (Array.isArray(outcome.options) && outcome.options.length) {
    const pick = chosen && typeof chosen.percentB === "number" ? chosen.percentB : (outcome.options.find(function (o) { return o.primary; }) || outcome.options[0]).percentB;
    if (typeof pick === "number") ch.percentB = String(pick);
  }
  let m = act.match(/(?:Drop to|Run)\s+([\d.]+)\s*% B/i);
  if (m && ch.percentB === undefined) ch.percentB = m[1];
  if (outcome.selectivityInHeadline && sel) {
    if (sel.step === "temperature-40" || sel.step === "temperature-60") ch.temperature = sel.value;
    if (sel.step === "solvent-meoh") { ch.solvent = "MeOH"; if (typeof sel.percentB === "number") ch.percentB = String(sel.percentB); }
    if (sel.step === "solvent-mix") { ch.solvent = "MIX"; }
    if (sel.step === "ligand") {
      if (chosenLigandColumn) {
        ch.ligand = chosenLigandColumn.ligand;
        ch.line = chosenLigandColumn.line;
        ch.columnDimensions = chosenLigandColumn.L + "x" + chosenLigandColumn.ID + "x" + chosenLigandColumn.dp;
        ch.temperature = "amb";
      } else {
        ch.ligand = "your choice";
      }
    }
  }
  if (/^Switch to/i.test(act) === false && !sel && Object.keys(ch).length === 0) return null;
  return Object.keys(ch).length ? ch : null;
}

function nextRunFileName(ch) {
  const name = currentRunFileName;
  if (!name) return "";
  const t = name.split("-");
  const modeIndex = t.findIndex(function (x) { return /^(ISO|GRAD)$/i.test(x); });
  if (modeIndex === -1) return "";
  const dimIndex = t.findIndex(function (x, i) { return i > modeIndex && /^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/i.test(x); });
  const runTok = t[1] || "";
  if (/^\d+$/.test(runTok)) t[1] = String(Number(runTok) + 1).padStart(runTok.length, "0");
  if (ch.solvent !== undefined && modeIndex >= 4) t[3] = ch.solvent;
  if (ch.percentB !== undefined) {
    for (let i = modeIndex + 1; i < (dimIndex === -1 ? t.length : dimIndex); i++) {
      if (/^\d+(\.\d+)?$/.test(t[i])) { t[i] = ch.percentB; break; }
    }
  }
  if (ch.temperature !== undefined && dimIndex !== -1 && t[dimIndex + 1] !== undefined) t[dimIndex + 1] = ch.temperature;
  if (ch.ligand && ch.ligand !== "your choice" && dimIndex !== -1 && currentConditions && currentConditions.ligand) {
    const old = String(currentConditions.ligand).toLowerCase();
    const letter = window.monashColumns ? window.monashColumns.letter(ch.line) : "";
    for (let i = modeIndex + 1; i < dimIndex; i++) {
      if (t[i].toLowerCase().indexOf(old) === 0 && !/^\d/.test(t[i])) {
        if (t[i].length > old.length) { t[i] = ch.ligand + letter; }
        else { t[i] = ch.ligand; if (t[i + 1] !== undefined && i + 1 < dimIndex && !/^\d/.test(t[i + 1])) t[i + 1] = letter || t[i + 1]; }
        break;
      }
    }
  }
  if (ch.columnDimensions !== undefined && dimIndex !== -1) t[dimIndex] = ch.columnDimensions;
  return t.join("-");
}

function buildNextRunConditionsCard(outcome) {
  const ch = nextRunChanges(outcome);
  if (!ch || !currentConditions) return null;
  const c = currentConditions;
  const mk = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const dims = String(c.columnDimensions || "").split("x");
  let facts = null;
  try {
    const lig = c.ligand ? normaliseLigand(c.ligand) : null;
    const bead = String(c.columnType || "").trim().charAt(0).toUpperCase();
    facts = (lig && window.columnFacts) ? window.columnFacts(lig, bead) : null;
  } catch (err) { facts = null; }
  const dimsUse = ch.columnDimensions !== undefined ? String(ch.columnDimensions).split("x") : dims;
  const dimsText = dimsUse.length === 3 ? dimsUse[0] + " \u00d7 " + dimsUse[1] + " mm, " + dimsUse[2] + " \u00b5m particles" : (c.columnDimensions || "");
  let monashText = "";
  {
    const mc = window.monashColumns;
    const lig = ch.ligand !== undefined && ch.ligand !== "your choice" ? ch.ligand : c.ligand;
    const sz = mc ? mc.size(ch.columnDimensions !== undefined ? ch.columnDimensions : c.columnDimensions) : null;
    if (mc && lig && sz && mc.knownLigand(lig) && !(ch.ligand === "your choice")) {
      const found = mc.find(lig, sz);
      monashText = found.length ? "Yes (" + Array.from(new Set(found.map(function (x) { return x.line; }))).join(", ") + ")" : "Not in the Monash list";
    }
  }
  const tempText = function (t) { return t === "amb" || t === "" || t === undefined ? "ambient" : t + " \u00b0C"; };
  const val = function (key, fallback) { return ch[key] !== undefined ? ch[key] : fallback; };
  const rows = [
    ["Column", [
      ["Ligand", ch.ligand !== undefined ? ch.ligand + (ch.line ? " (" + ch.line + ")" : "") : (c.ligand || ""), "ligand"],
      ["Dimensions", dimsText, ch.columnDimensions !== undefined ? "columnDimensions" : null],
      ["Pore size / carbon load", ch.line ? "" : (facts ? facts.pore + " \u00c5, " + facts.load + (typeof facts.load === "number" ? "%" : "") : ""), null],
      ["At Monash", monashText, null],
      ["Temperature", ch.temperature !== undefined ? tempText(ch.temperature) : tempText(c.temperature), "temperature"],
    ]],
    ["Mobile phase", [
      ["Solvent B", val("solvent", c.solvent || ""), "solvent"],
      ["%B", ch.percentB !== undefined ? ch.percentB + "%" : (c.percentB ? c.percentB + "%" : ""), "percentB"],
      ["pH", c.pH || "", null],
      ["Mode", c.mode === "GRAD" ? "Gradient" : (c.mode ? "Isocratic" : ""), null],
      ["Flow rate", c.flowRate ? c.flowRate + " mL/min" : "", null],
    ]],
    ["Sample and detection", [
      ["Sample", c.sampleType || "", null],
      ["Concentration", c.sampleConcentration ? c.sampleConcentration + " mg/mL" : "", null],
      ["Injection volume", c.sampleVolume ? String(c.sampleVolume).replace(/[a-z]+$/i, "") + " \u00b5L" : "", null],
      ["Wavelength", c.wavelength ? c.wavelength + " nm" : "", null],
      ["HPLC", c.hplcNumber ? "HPLC " + c.hplcNumber : "", null],
    ]],
  ];

  const card = mk("div", "result-card nextrun-card");
  card.appendChild(mk("h3", null, "Conditions for the next run"));
  card.appendChild(mk("p", "note", "Everything not marked \u201cchanges\u201d stays as in this run."));
  const lines = [];
  for (const [title, items] of rows) {
    const grp = mk("div", "nr-group");
    grp.appendChild(mk("h4", null, title));
    const dl = mk("dl", "nr-list");
    for (const [label, value, key] of items) {
      if (value === "" || value === undefined) continue;
      const changed = key && ch[key] !== undefined;
      const dt = mk("dt", null, label);
      const dd = mk("dd", changed ? "nr-changed" : null);
      dd.appendChild(document.createTextNode(String(value)));
      if (changed) dd.appendChild(mk("span", "nr-chip", "changes"));
      dl.append(dt, dd);
      lines.push(label + ": " + value);
    }
    grp.appendChild(dl);
    card.appendChild(grp);
  }
  const fileName = nextRunFileName(ch);
  if (fileName) {
    const box = mk("div", "nr-filename");
    const addName = function (label, text) {
      box.appendChild(mk("span", "nr-fn-label", label));
      const row = mk("div", "nr-fn-row");
      row.appendChild(mk("code", "nr-fn", text));
      const copy = mk("button", "secondary nr-copy", "Copy");
      copy.type = "button";
      copy.addEventListener("click", function () {
        const done = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
      });
      row.appendChild(copy);
      box.appendChild(row);
    };
    addName("Data file name for the next run", fileName);
    const vol = String(c.sampleVolume || "").replace(/[a-z]+$/i, "");
    const methodName = [c.mode || "ISO", ch.percentB !== undefined ? ch.percentB : c.percentB, c.flowRate, vol ? vol + "u" : "", ch.temperature !== undefined ? ch.temperature : c.temperature, c.wavelength].filter(function (x) { return x !== "" && x !== undefined && x !== null; }).join("-") + ".lcm";
    addName("Method file name for the next run", methodName);
    if (ch.ligand !== undefined) box.appendChild(mk("span", "note", "The ligand part of the names changes with the column you choose."));
    card.appendChild(box);
  }
  return card;
}
let lastRenderedOutcomes = null;
let chosenLigandColumn = null;
function refreshNextRunCard() {
  const old = resultContainer.querySelector(".nextrun-card");
  if (!old || !lastRenderedOutcomes) return;
  const main = lastRenderedOutcomes.filter(Boolean).slice(-1)[0];
  const fresh = buildNextRunConditionsCard(main);
  if (fresh) old.replaceWith(fresh);
}

function renderResults(outcomes, options) {
  const cards = [];

  lastRenderedOutcomes = outcomes;
  for (const outcome of outcomes) {
    cards.push(buildResultCard(outcome));
    if (outcome && outcome === outcomes.filter(Boolean).slice(-1)[0]) {
      const nextCard = buildNextRunConditionsCard(outcome);
      if (nextCard) cards.push(nextCard);
    }

    if (outcome && outcome.selectivity) {
      cards.push(buildSelectivityCard(outcome.selectivity, outcome.selectivityInHeadline === true));
    }

    if (outcome && outcome.selectivityStillOpen) {
      cards.push(buildOtherOptionsCard(outcome.selectivityStillOpen));
    }
  }

  resultContainer.replaceChildren(...cards);
  summaryOutcome = outcomes.filter(Boolean).slice(-1)[0] || null;
  saveResultToHistory(outcomes);
  renderRunSummary();
  if (!(options && options.stay)) showSub("result");
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

  if (window.innerWidth <= 900) detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  if (typeof addHowItWorks === "function") addHowItWorks(detail, moduleId);

  if (window.innerWidth <= 900) detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
renderAllPeaks();
renderEquipment();
wireInstrumentHotspots();
selectTab("flowchart");
showSub("spec");


// ---------------------------------------------------------------------------
// The "Current run" panel on the right of the Dashboard
// ---------------------------------------------------------------------------

function renderRunSummary() {
  const box = document.getElementById("run-summary");
  if (!box) return;
  box.replaceChildren();

  const title = document.createElement("h2");
  title.textContent = "Current run";
  box.appendChild(title);

  if (!currentSummary) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Load a file in step 2 and its decision, spec checks and conditions appear here.";
    box.appendChild(p);
    return;
  }

  const name = document.createElement("p");
  name.className = "rs-file";
  name.textContent = currentRunFileName || "";
  box.appendChild(name);

  // Decision
  const dec = document.createElement("div");
  dec.className = "rs-decision" + (summaryOutcome && summaryOutcome.pass ? " pass" : "") + (summaryOutcome && summaryOutcome.unsafe ? " unsafe" : "");
  const dl = document.createElement("span");
  dl.className = "rs-label";
  dl.textContent = "Decision";
  dec.appendChild(dl);
  if (summaryOutcome) {
    const st = document.createElement("strong");
    st.textContent = summaryOutcome.stage;
    dec.appendChild(st);
    if (summaryOutcome.action) {
      const ac = document.createElement("p");
      ac.textContent = summaryOutcome.action;
      dec.appendChild(ac);
    }
    const chosenNow = readChosenOption(currentRunFileName);
    if (chosenNow && Array.isArray(summaryOutcome.options) && summaryOutcome.options.some(function (o) { return o.percentB === chosenNow.percentB; })) {
      const cn = document.createElement("p");
      cn.className = "rs-chosen";
      cn.textContent = "You chose " + chosenNow.percentB.toFixed(1) + "% B";
      dec.appendChild(cn);
    }
    const open = document.createElement("button");
    open.type = "button";
    open.className = "secondary";
    open.textContent = "Open the recommendation";
    open.addEventListener("click", function () { showSub("result"); });
    dec.appendChild(open);
  } else {
    const ac = document.createElement("p");
    ac.textContent = "Not calculated yet. Press Calculate in step 2.";
    dec.appendChild(ac);
  }
  box.appendChild(dec);

  // Minimum %B
  {
    const spec0 = readSpecsForDisplay();
    let value = null, sub = "";
    if (spec0.minPercentBOverride !== null && Number.isFinite(spec0.minPercentBOverride)) { value = spec0.minPercentBOverride; sub = "your override from the Specification"; }
    else { const d = computeMinPercentB(readHistory(), spec0.tRSpec); if (d.sufficientData) { value = d.roundedMinPercentB; sub = d.frozen ? "calculated and locked: retention is finished" : "calculated from the log K fit"; } }
    const mb = document.createElement("div");
    mb.className = "rs-minb";
    const l1 = document.createElement("span"); l1.className = "rs-label"; l1.textContent = "Minimum %B";
    const v1 = document.createElement("strong"); v1.textContent = value === null ? "Not enough runs yet" : value.toFixed(1) + "%";
    mb.append(l1, v1);
    if (sub) { const s1 = document.createElement("small"); s1.textContent = sub; mb.appendChild(s1); }
    box.appendChild(mb);
  }

  // Checks against the specification
  const specs = readSpecsForDisplay();
  const sm = currentSummary;
  const fmt = function (v, d) { return v === null || v === undefined || !Number.isFinite(v) ? "n/a" : Number(v).toFixed(d); };
  const rsd = displayResolution(sm, specs.targetPeaks);
  const checks = [
    ["Last peak tR", fmt(sm.trLastPeak, 2) + " min", "spec " + specs.tRSpec + " min or less", sm.trLastPeak !== null && sm.trLastPeak <= specs.tRSpec],
    ["Peaks found", String(sm.numPeaks), "target " + specs.targetPeaks, sm.numPeaks >= specs.targetPeaks],
    ["Worst Rs", rsd.shown === null ? "n/a" : fmt(rsd.shown, 2), "spec " + specs.rsSpec + " or more" + (rsd.forcedZero ? " (peaks co-eluting" + (rsd.calculated !== null ? "; calculated " + fmt(rsd.calculated, 2) : "") + ")" : ""), rsd.shown !== null && rsd.shown >= specs.rsSpec],
  ];
  if (currentMaxBackPressure) {
    const p = currentMaxBackPressure.maxActual;
    checks.push(["Peak pressure", fmt(p, 0) + " " + (currentMaxBackPressure.units || "psi"), "max " + specs.maxPressure + " psi", p <= specs.maxPressure]);
  }
  const list = document.createElement("ul");
  list.className = "rs-checks";
  checks.forEach(function (c) {
    const li = document.createElement("li");
    li.className = c[3] ? "ok" : "bad";
    const mark = document.createElement("span");
    mark.className = "rs-mark";
    mark.textContent = c[3] ? "\u2713" : "\u2717";
    mark.setAttribute("aria-label", c[3] ? "meets spec" : "does not meet spec");
    const body = document.createElement("span");
    const lab = document.createElement("span");
    lab.className = "rs-label";
    lab.textContent = c[0];
    const val = document.createElement("strong");
    val.textContent = c[1];
    const sp = document.createElement("small");
    sp.textContent = c[2];
    body.append(lab, val, sp);
    li.append(mark, body);
    list.appendChild(li);
  });
  const ch = document.createElement("h3");
  ch.textContent = "Against your specification";
  box.append(ch, list);

  // Conditions read from the file name
  const c = currentConditions || {};
  const rows = [["%B", c.percentB], ["Solvent", c.solvent], ["Temperature", c.temperature], ["Flow rate", c.flowRate], ["Ligand", c.ligand], ["Column", c.columnDimensions]].filter(function (r) { return r[1]; });
  if (rows.length) {
    const ch2 = document.createElement("h3");
    ch2.textContent = "Conditions read from the name";
    const dl2 = document.createElement("dl");
    dl2.className = "rs-cond";
    rows.forEach(function (r) {
      const dt = document.createElement("dt"); dt.textContent = r[0];
      const dd = document.createElement("dd"); dd.textContent = r[1];
      dl2.append(dt, dd);
    });
    box.append(ch2, dl2);
  }

  // Position in the history
  const history = readHistory();
  const idx = history.findIndex(function (e) { return e.fileName === currentRunFileName; });
  if (idx !== -1) {
    const pos = document.createElement("p");
    pos.className = "hint rs-pos";
    pos.textContent = "Run " + (idx + 1) + " of " + history.length + " in the history. ";
    const a = document.createElement("a");
    a.href = "#"; a.textContent = "Open run history";
    a.addEventListener("click", function (e) { e.preventDefault(); document.getElementById("tab-history").click(); });
    pos.appendChild(a);
    box.appendChild(pos);
  }
}

[specPeaks, specTr, specRs, specMaxPressure].forEach(function (el) { if (el) el.addEventListener("input", renderRunSummary); });
[specPeaks, specTr, specRs, specRsFloor, specMinPercentB, specMaxPressure].forEach(function (el) { if (el) el.addEventListener("input", updateSpecBanner); });
renderRunSummary();


// Naming guide: the coloured example names and the decoder for a pasted name.
(function () {
  const input = document.getElementById("nm-input");
  const out = document.getElementById("nm-output");
  if (!input || !out) return;
  const CATS = {
    id: "Run identity", mp: "Mobile phase", sample: "Sample and injection", col: "Column", cond: "Oven and detector",
  };
  const DATA = [
    ["GR09", "Group", "Your lab group number.", "id"],
    ["05", "Run number", "Runs are numbered in the order they were made. The tool uses this to put runs in order.", "id"],
    ["3", "HPLC number", "Which instrument, 1 to 6.", "id"],
    ["ACN", "Solvent B", "ACN, MeOH or MIX (the mixed solvent).", "mp"],
    ["3", "pH", "pH of the aqueous solvent.", "mp"],
    ["ISO", "Mode", "ISO is isocratic (constant %B). GRAD is gradient.", "mp"],
    ["90", "%B", "Percentage of solvent B in the mobile phase.", "mp"],
    ["1.5", "Flow rate", "In mL/min.", "mp"],
    ["20", "Injection volume", "In \u00b5L.", "sample"],
    ["CP", "Sample", "CP is the composite, BLK a blank, URA uracil, or the name of a single standard.", "sample"],
    ["0.1", "Concentration", "In mg/mL.", "sample"],
    ["C18aqP", "Ligand and bead code", "The ligand (C18aq) then a letter for the column line: P, U, F or R (the Restek Pinnacle DB, Ultra, Force and Raptor lines).", "col"],
    ["150x4.6x5", "Column size", "Length (mm) \u00d7 internal diameter (mm) \u00d7 particle size (\u00b5m).", "col"],
    ["amb", "Temperature", "amb is ambient, otherwise in \u00b0C (for example 40 or 60).", "cond"],
    ["254", "Wavelength", "In nm.", "cond"],
  ];
  const METHOD = [
    ["ISO", "Mode", "ISO is isocratic (constant %B). GRAD is gradient.", "mp"],
    ["100", "%B", "Percentage of solvent B in the mobile phase.", "mp"],
    ["1.5", "Flow rate", "In mL/min.", "mp"],
    ["20u", "Injection volume", "In \u00b5L, with a \u201cu\u201d after the number.", "sample"],
    ["amb", "Temperature", "amb is ambient, otherwise in \u00b0C.", "cond"],
    ["254", "Wavelength", "In nm.", "cond"],
  ];
  const mk = function (tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const key = document.getElementById("nm-key");
  for (const c in CATS) { const s = mk("span", "nm-key-item cat-" + c); s.appendChild(mk("i", "nm-dot")); s.appendChild(document.createTextNode(CATS[c])); key.appendChild(s); }

  function renderName(el, parts, ext, detailEl) {
    el.replaceChildren();
    parts.forEach(function (p, i) {
      const seg = mk("button", "nm-seg cat-" + p[3]);
      seg.type = "button";
      seg.appendChild(mk("span", "nm-seg-tok", p[0]));
      seg.appendChild(mk("span", "nm-seg-lab", p[1]));
      const show = function () {
        el.querySelectorAll(".nm-seg").forEach(function (s) { s.classList.remove("on"); });
        seg.classList.add("on");
        if (detailEl) {
          detailEl.replaceChildren();
          detailEl.className = "nm-detail cat-" + p[3];
          detailEl.appendChild(mk("strong", null, p[0] + " \u2013 " + p[1]));
          detailEl.appendChild(mk("span", null, p[2]));
        }
      };
      seg.addEventListener("mouseenter", show);
      seg.addEventListener("focus", show);
      seg.addEventListener("click", show);
      el.appendChild(seg);
      if (i < parts.length - 1) el.appendChild(mk("span", "nm-dash", "-"));
    });
    if (ext) el.appendChild(mk("span", "nm-ext", ext));
  }
  renderName(document.getElementById("nm-data"), DATA, "", document.getElementById("nm-data-detail"));
  const mEl = document.getElementById("nm-method");
  const mDetail = mk("div", "nm-detail", "Hover over, or tap, a part of the name.");
  mEl.insertAdjacentElement("afterend", mDetail);
  renderName(mEl, METHOD, ".lcm", mDetail);

  const labels = [["grNumber", "Group", "id"], ["runNumber", "Run number", "id"], ["hplcNumber", "HPLC number", "id"], ["solvent", "Solvent B", "mp"], ["pH", "pH", "mp"], ["mode", "Mode", "mp"], ["percentB", "%B", "mp"], ["flowRate", "Flow rate (mL/min)", "mp"], ["sampleVolume", "Injection volume (\u00b5L)", "sample"], ["sampleType", "Sample", "sample"], ["sampleConcentration", "Concentration (mg/mL)", "sample"], ["ligand", "Ligand", "col"], ["columnType", "Bead code", "col"], ["columnDimensions", "Column (L \u00d7 ID \u00d7 dp)", "col"], ["temperature", "Temperature", "cond"], ["wavelength", "Wavelength (nm)", "cond"]];
  input.addEventListener("input", function () {
    const name = input.value.trim().replace(/\.(csv|xlsx|xls|pdf|lcd|lcm)$/i, "");
    out.replaceChildren();
    if (!name) return;
    const res = parseConditionsFromName(name);
    const grid = mk("div", "nm-grid");
    for (const [k2, label, cat] of labels) {
      const v = res.conditions[k2];
      if (v === "" || v === undefined) continue;
      const cell = mk("div", "nm-cell cat-" + cat);
      cell.appendChild(mk("span", "nm-cell-lab", label));
      cell.appendChild(mk("strong", "nm-cell-val", String(v)));
      grid.appendChild(cell);
    }
    out.appendChild(grid);
    for (const w of res.warnings) out.appendChild(mk("p", "note", w));
  });
})();
