// app.js: connects the web page to logic.js.
// Reads the chosen file as text, parses it, shows what was found, and lets you
// run the decision rules once you've checked the conditions look right.

const fileInput = document.getElementById("csv-file");
const uploadStatus = document.getElementById("upload-status");
const conditionsContainer = document.getElementById("conditions-container");
const conditionsWarnings = document.getElementById("conditions-warnings");
const peaksContainer = document.getElementById("peaks-container");
const calculateBtn = document.getElementById("calculate-btn");
const resultContainer = document.getElementById("result-container");

const specPeaks = document.getElementById("spec-peaks");
const specTr = document.getElementById("spec-tr");
const specRs = document.getElementById("spec-rs");
const specRsFloor = document.getElementById("spec-rs-floor");
const specMinPercentB = document.getElementById("spec-min-percent-b");

// Holds the current run's peak summary between "file loaded" and "Calculate clicked".
let currentSummary = null;

fileInput.addEventListener("change", handleFileChosen);
calculateBtn.addEventListener("click", handleCalculate);

function handleFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".csv")) {
    showUploadStatus("That file isn't a .csv. Choose a file that ends in .csv.", true);
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
    try {
      processFileText(reader.result, file.name);
    } catch (err) {
      showUploadStatus("The file couldn't be read as a LabSolutions export. " + err.message, true);
    }
  };
  reader.onerror = function () {
    showUploadStatus("The file couldn't be read.", true);
  };
  reader.readAsText(file);
}

function processFileText(rawText, fileName) {
  const lines = splitIntoLines(rawText);

  // Prefer the name recorded inside the file; fall back to the uploaded file's
  // own name (with the .csv removed) if that's missing.
  const sampleName = findSampleName(lines);
  const nameToParse = sampleName || fileName.replace(/\.csv$/i, "");
  const usingFallbackName = !sampleName;

  const { conditions, warnings } = parseConditionsFromName(nameToParse);
  const { peaks, declaredCount } = findPeakTable(lines);
  currentSummary = summarizeRun(peaks);

  if (usingFallbackName) {
    warnings.unshift("No Sample Name was found inside the file; conditions were read from the uploaded file's name instead.");
  }
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

  showUploadStatus("Loaded \u201c" + nameToParse + "\u201d \u2014 " + peaks.length + " peak(s) found.", false);
  calculateBtn.disabled = peaks.length === 0;
  resultContainer.replaceChildren(); // clear any previous result
}

// Builds the editable conditions table. Each value can be corrected by hand,
// since the name-parsing is a best effort, not a guarantee.
function renderConditions(conditions) {
  const rows = [
    ["GR number", "grNumber"],
    ["HPLC #", "hplcNumber"],
    ["Run #", "runNumber"],
    ["Solvent", "solvent"],
    ["pH", "pH"],
    ["Mode (ISO/GRAD)", "mode"],
    ["%B", "percentB"],
    ["Flow rate", "flowRate"],
    ["Sample volume", "sampleVolume"],
    ["Sample type", "sampleType"],
    ["Sample concentration", "sampleConcentration"],
    ["Ligand", "ligand"],
    ["Column type", "columnType"],
    ["Column dimensions", "columnDimensions"],
    ["Temperature", "temperature"],
    ["Wavelength", "wavelength"],
  ];

  const table = document.createElement("table");
  const body = table.createTBody();

  for (const [label, key] of rows) {
    const tr = body.insertRow();
    const labelCell = tr.insertCell();
    labelCell.textContent = label;

    const valueCell = tr.insertCell();
    const input = document.createElement("input");
    input.type = "text";
    input.value = conditions[key];
    input.dataset.field = key;
    valueCell.appendChild(input);
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

function makeEmptyMessage(text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  return p;
}

function showUploadStatus(message, isError) {
  uploadStatus.textContent = message;
  uploadStatus.className = isError ? "error" : "";
}

// Reads the specs form into the shape logic.js expects, validating as it goes.
// Also reads the run's own %B from the (possibly hand-corrected) conditions
// table, since the decision needs to know where this run sits in the %B step-down.
function readSpecs() {
  const percentBInput = conditionsContainer.querySelector('input[data-field="percentB"]');
  const percentBValue = percentBInput ? Number(percentBInput.value) : NaN;

  return {
    targetPeaks: Number(specPeaks.value),
    tRSpec: Number(specTr.value),
    rsSpec: Number(specRs.value),
    rsFloor: Number(specRsFloor.value),
    minPercentB: Number(specMinPercentB.value),
    currentPercentB: Number.isNaN(percentBValue) ? null : percentBValue,
  };
}

function handleCalculate() {
  if (!currentSummary) return;

  const specs = readSpecs();
  if (specs.rsFloor >= specs.rsSpec) {
    renderResult({
      stage: "Error",
      message: "The Rs floor must be lower than the Rs spec — check the Specification section.",
    });
    return;
  }
  if (specs.currentPercentB === null) {
    renderResult({
      stage: "Error",
      message: "The %B field in Run conditions isn't a number — check or fix it before calculating.",
    });
    return;
  }

  const outcome = decide(currentSummary, specs);
  renderResult(outcome);
}

function renderResult(outcome) {
  const card = document.createElement("div");
  card.className = "result-card" + (outcome.pass ? " pass" : "");

  const heading = document.createElement("h3");
  heading.textContent = outcome.stage;
  card.appendChild(heading);

  const message = document.createElement("p");
  message.textContent = outcome.message;
  card.appendChild(message);

  if (outcome.outOfScopeNote) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = outcome.outOfScopeNote;
    card.appendChild(note);
  }

  if (outcome.uncertainNote) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = outcome.uncertainNote;
    card.appendChild(note);
  }

  resultContainer.replaceChildren(card);
}
