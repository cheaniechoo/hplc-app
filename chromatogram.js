// chromatogram.js: draws a chromatogram for the loaded run.
// 1. If the LabSolutions export contains a detector trace (a section whose name
//    contains "Chromatogram"), that real trace is plotted.
// 2. Otherwise the chromatogram is rebuilt from the peak table: one peak per row,
//    placed at R.Time, with its width from the plate count and its height from
//    the Height column (or Area, or equal heights if neither is exported).
// Nothing here changes the decision logic.

function readTraceSection(lines, i) {
  const meta = {};
  let j = i + 1;
  while (j < lines.length && lines[j][0] !== "R.Time (min)" && !(lines[j][0] || "").startsWith("[")) {
    meta[lines[j][0]] = lines[j][1];
    j++;
  }
  if (j >= lines.length || lines[j][0] !== "R.Time (min)") return null;
  j++;
  const multiplier = Number(meta["Intensity Multiplier"]);
  const t = [], y = [];
  while (j < lines.length && lines[j][0]) {
    const x = Number(lines[j][0]), v = Number(lines[j][1]);
    if (!Number.isNaN(x) && !Number.isNaN(v)) { t.push(x); y.push(Number.isNaN(multiplier) || multiplier === 0 ? v : v * multiplier); }
    j++;
  }
  if (t.length <= 5) return null;
  return { t: t, y: y, units: meta["Intensity Units"] || "", title: lines[i][0].slice(1, -1) };
}

function findDetectorTrace(lines) {
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i][0] || "";
    if (name.charAt(0) !== "[" || !/chromatogram|PDA Multi/i.test(name) || /LC Status|pressure|flow|temperature/i.test(name)) continue;
    const trace = readTraceSection(lines, i);
    if (trace) return trace;
  }
  return null;
}

function findPumpTrace(lines, pump) {
  const want = "[LC Status Trace(Pump " + pump + " Pressure)]";
  const i = lines.findIndex(function (f) { return f[0] === want; });
  return i === -1 ? null : readTraceSection(lines, i);
}

function rebuildTrace(peaks) {
  const usable = peaks.filter(function (p) { return p.rTime !== null && p.rTime > 0; });
  if (usable.length === 0) return null;
  const shape = usable.map(function (p) {
    const sigma = p.plateCount && p.plateCount > 0 ? p.rTime / Math.sqrt(p.plateCount) : 0.03 * p.rTime;
    const T = p.tailing && p.tailing > 0.5 && p.tailing < 4 ? p.tailing : 1;
    let height = 1, how = "equal heights (the file has no Height or Area column)";
    if (p.height) { height = p.height; how = "heights from the file"; }
    else if (p.area) { height = p.area / (sigma * Math.sqrt(2 * Math.PI)); how = "heights worked out from the Area column"; }
    return { t: p.rTime, h: height, sl: sigma * 2 / (1 + T), sr: sigma * 2 * T / (1 + T), n: p.peakNum, how: how };
  });
  const tEnd = Math.max.apply(null, shape.map(function (s) { return s.t + 6 * s.sr; })) * 1.04;
  const tStart = 0, steps = 1200, t = [], y = [];
  for (let i = 0; i <= steps; i++) {
    const x = tStart + (tEnd - tStart) * i / steps; let v = 0;
    shape.forEach(function (s) { const sd = x < s.t ? s.sl : s.sr; v += s.h * Math.exp(-0.5 * Math.pow((x - s.t) / sd, 2)); });
    t.push(x); y.push(v);
  }
  return { t: t, y: y, units: "relative", title: "Rebuilt from the peak table", how: shape[0].how };
}

function thin(trace, max) {
  const step = Math.max(1, Math.floor(trace.t.length / max)), t = [], y = [];
  for (let i = 0; i < trace.t.length; i += step) { t.push(trace.t[i]); y.push(trace.y[i]); }
  return { t: t, y: y };
}

// Drawn in the style of the LabSolutions report: detector trace on the left axis,
// pump pressure on the right-hand psi axis, and a % axis beside it.
// LabSolutions often exports the detector signal in microabsorbance units (uAU).
// Convert those to mAU so the axis matches the report.
function normaliseSignal(trace) {
  const u = (trace.units || "").trim();
  if (u === "relative") return trace;
  let max = 0; for (let i = 0; i < trace.y.length; i++) if (trace.y[i] > max) max = trace.y[i];
  if (/^[u\u00b5\u03bc]AU$/i.test(u) || (u === "" && max > 100000)) {
    return { t: trace.t, y: trace.y.map(function (v) { return v / 1000; }), units: "mAU", title: trace.title };
  }
  return { t: trace.t, y: trace.y, units: u || "mAU", title: trace.title };
}

function axisNumber(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return Number((v / 1e6).toFixed(2)) + "M";
  if (a >= 1e4) return Number((v / 1e3).toFixed(1)) + "k";
  return String(Number(v.toFixed(2)));
}

function chromatogramSVG(trace, peaks, label, pumps, detectorName) {
  trace = normaliseSignal(trace);
  const W = 1000, H = 420, L = 78, R = 128, T = 82, B = 56, pw = W - L - R, ph = H - T - B;
  const d = thin(trace, 2000), t = d.t, y = d.y;
  const t0 = Math.min.apply(null, t), t1 = Math.max.apply(null, t);
  let ymax = Math.max.apply(null, y); if (!(ymax > 0)) ymax = 1;
  const nice = function (span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
  const ys = nice(ymax * 1.12, 4), yTop = Math.ceil(ymax * 1.08 / ys) * ys, yBot = -ys * 0.2;
  const X = function (v) { return L + (v - t0) / (t1 - t0) * pw; };
  const Y = function (v) { return T + ph - (v - yBot) / (yTop - yBot) * ph; };
  const pumpTraces = pumps.filter(Boolean);
  const pmax = pumpTraces.length ? Math.max.apply(null, pumpTraces.map(function (p) { return Math.max.apply(null, p.y); })) : 0;
  const ps = nice(Math.max(pmax, 1) * 1.1, 4), pTop = Math.max(ps * 4, Math.ceil(pmax * 1.08 / ps) * ps);
  const y0px = Y(0), pPx = function (v) { return y0px - (v / pTop) * (y0px - T); };
  const e = function (n) { return n.toFixed(1); };
  let s = '<svg viewBox="0 0 ' + W + " " + H + '" class="run-chrom" fill="#566672" role="img" aria-label="Chromatogram of ' + label + '">';
  s += '<text x="' + (L + pw / 2) + '" y="16" text-anchor="middle" font-size="15" fill="#16232e">Chromatogram</text><text x="' + (L + pw / 2) + '" y="33" text-anchor="middle" font-size="13" fill="#16232e">' + label + "</text>";
  // plot area and grid
  s += '<rect x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="#fff" stroke="#c7d0d8"/>';
  { const gx = nice(t1 - t0, 8); for (let v = Math.ceil(t0 / gx) * gx; v <= t1 + 1e-9; v += gx) s += '<line x1="' + e(X(v)) + '" y1="' + T + '" x2="' + e(X(v)) + '" y2="' + (T + ph) + '" stroke="#eef1f4"/>'; }
  // axes
  s += '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (T + ph) + '" stroke="#8896a3"/><line x1="' + L + '" y1="' + (T + ph) + '" x2="' + (L + pw) + '" y2="' + (T + ph) + '" stroke="#8896a3"/>';
  s += '<text x="' + (L - 8) + '" y="' + (T - 10) + '" text-anchor="end" font-size="12" fill="#1b5fc1" font-weight="700">' + (trace.units || "mAU") + "</text>";
  for (let v = 0; v <= yTop + 1e-9; v += ys) s += '<line x1="' + (L - 5) + '" y1="' + e(Y(v)) + '" x2="' + L + '" y2="' + e(Y(v)) + '" stroke="#8896a3"/><text x="' + (L - 8) + '" y="' + e(Y(v) + 4) + '" text-anchor="end" font-size="12">' + axisNumber(v) + "</text>";
  const xs = nice(t1 - t0, 8);
  for (let v = Math.ceil(t0 / xs) * xs; v <= t1 + 1e-9; v += xs) s += '<line x1="' + e(X(v)) + '" y1="' + (T + ph) + '" x2="' + e(X(v)) + '" y2="' + (T + ph + 6) + '" stroke="#8896a3"/><text x="' + e(X(v)) + '" y="' + (T + ph + 20) + '" text-anchor="middle" font-size="12">' + Number(v.toFixed(2)) + "</text>";
  for (let v = Math.ceil(t0 / (xs / 2)) * (xs / 2); v <= t1 + 1e-9; v += xs / 2) s += '<line x1="' + e(X(v)) + '" y1="' + (T + ph) + '" x2="' + e(X(v)) + '" y2="' + (T + ph + 3) + '" stroke="#8896a3"/>';
  s += '<text x="' + (L + pw) + '" y="' + (H - 8) + '" text-anchor="end" font-size="12">min</text>';
  // right axes: psi then %
  const xp = L + pw, xq = L + pw + 62;
  if (pumpTraces.length) {
  s += '<line x1="' + xp + '" y1="' + T + '" x2="' + xp + '" y2="' + e(y0px) + '" stroke="#8896a3"/><text x="' + (xp + 6) + '" y="' + (T - 10) + '" font-size="12" fill="#d9780f" font-weight="700">psi</text>';
  for (let v = 0; v <= pTop + 1e-9; v += ps) s += '<line x1="' + xp + '" y1="' + e(pPx(v)) + '" x2="' + (xp + 5) + '" y2="' + e(pPx(v)) + '" stroke="#8896a3"/><text x="' + (xp + 8) + '" y="' + e(pPx(v) + 4) + '" font-size="12">' + Math.round(v) + "</text>";
  }
  s += '<line x1="' + xq + '" y1="' + T + '" x2="' + xq + '" y2="' + e(y0px) + '" stroke="#8896a3"/><text x="' + (xq + 6) + '" y="' + (T - 10) + '" font-size="12">%</text>';
  for (let v = 0; v <= 100; v += 25) { const yy = y0px - (v / 100) * (y0px - T); s += '<line x1="' + xq + '" y1="' + e(yy) + '" x2="' + (xq + 5) + '" y2="' + e(yy) + '" stroke="#8896a3"/><text x="' + (xq + 8) + '" y="' + e(yy + 4) + '" font-size="12">' + v + "</text>"; }
  // legend (colour keys)
  const lg = [[detectorName, "#1b5fc1", ""]].concat(pumps[0] ? [["Pump A Pressure", "#f08a00", "6 4"]] : [], pumps[1] ? [["Pump B Pressure", "#b85c00", "6 4"]] : []);
  { const widths = lg.map(function (n) { return n[0].length * 6.6 + 48; }), total = widths.reduce(function (a, b) { return a + b; }, 0); let x = L + pw / 2 - total / 2;
    lg.forEach(function (n, i) { s += '<line x1="' + e(x) + '" y1="52" x2="' + e(x + 24) + '" y2="52" stroke="' + n[1] + '" stroke-width="2"' + (n[2] ? ' stroke-dasharray="' + n[2] + '"' : "") + '/><text x="' + e(x + 30) + '" y="56" font-size="12" fill="#16232e">' + n[0] + "</text>"; x += widths[i]; }); }
  // pressure traces (right axis)
  pumps.forEach(function (p, k) {
    if (!p) return; const q = thin(p, 1500); let dd = "";
    for (let i = 0; i < q.t.length; i++) if (q.t[i] >= t0 && q.t[i] <= t1) dd += (dd ? "L" : "M") + e(X(q.t[i])) + " " + e(pPx(q.y[i]));
    s += '<path d="' + dd + '" fill="none" stroke="' + (k ? "#b85c00" : "#f08a00") + '" stroke-width="1.6" stroke-dasharray="6 4"/>';
  });
  // detector trace
  let dd = ""; for (let i = 0; i < t.length; i++) dd += (i ? "L" : "M") + e(X(t[i])) + " " + e(Y(y[i]));
  s += '<path d="' + dd + '" fill="none" stroke="#1b5fc1" stroke-width="1.8" stroke-linejoin="round"/>';
  // peak labels: peak number and R.Time above each apex
  peaks.forEach(function (p) {
    if (p.rTime === null || p.rTime < t0 || p.rTime > t1) return;
    let k = 0, best = 1e9; for (let i = 0; i < t.length; i++) { const q = Math.abs(t[i] - p.rTime); if (q < best) { best = q; k = i; } }
    let top = y[k]; for (let i = Math.max(0, k - 6); i <= Math.min(t.length - 1, k + 6); i++) if (y[i] > top) top = y[i];
    const px = X(p.rTime), py = Math.max(T + 34, Y(top));
    s += '<line x1="' + e(px) + '" y1="' + e(py - 4) + '" x2="' + e(px) + '" y2="' + e(py - 14) + '" stroke="#a85a00"/><text x="' + e(px) + '" y="' + e(py - 28) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#a85a00">' + (p.peakNum !== null ? p.peakNum : "") + '</text><text x="' + e(px) + '" y="' + e(py - 16) + '" text-anchor="middle" font-size="11" fill="#16232e">' + p.rTime.toFixed(2) + "</text>";
  });
  return s + "</svg>";
}

function renderRunChromatogram(lines, peaks, fileName) {
  const box = document.getElementById("chromatogram-container");
  if (!box) return;
  const real = findDetectorTrace(lines);
  const trace = real || rebuildTrace(peaks);
  if (!trace) { box.innerHTML = '<p class="empty">No peaks to draw a chromatogram from.</p>'; return; }
  const pumps = [findPumpTrace(lines, "A"), findPumpTrace(lines, "B")];
  const h = document.createElement("h3"); h.textContent = "Chromatogram";
  const note = document.createElement("p"); note.className = "hint";
  const pnote = pumps[0] || pumps[1] ? " The pump pressure trace is read from the file and uses the psi axis on the right." : " No pump pressure trace was found in this file.";
  note.textContent = (real
    ? "Detector trace read from the file (" + real.title + "). The number above each peak is its peak number and its R.Time in minutes."
    : "This file has no detector trace, so the signal is rebuilt from the peak table: each peak sits at its R.Time, its width comes from the plate count and its height from " + trace.how + ". It is a reconstruction, not the raw signal.") + pnote;
  const fig = document.createElement("div"); fig.className = "run-chrom-wrap";
  fig.innerHTML = chromatogramSVG(trace, peaks, fileName, pumps, real ? real.title.replace(/^PDA Multi Chromatogram\s*/i, "PDA Multi ") : "Detector (rebuilt)");
  box.replaceChildren(h, note, fig);
}

// ---- Compact copies of a run's chromatogram, kept in the run history ----
// Keeps the lowest and highest point of each bucket, so peak tops survive the thinning.
function decimateTrace(trace, buckets) {
  const n = trace.t.length;
  if (n <= buckets * 2) return { t: trace.t.map(function (v) { return Number(v.toFixed(3)); }, 0), y: trace.y.map(function (v) { return Number(v.toPrecision(5)); }) };
  const size = n / buckets, t = [], y = [];
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size), to = Math.min(n, Math.floor((b + 1) * size));
    let lo = from, hi = from;
    for (let i = from; i < to; i++) { if (trace.y[i] < trace.y[lo]) lo = i; if (trace.y[i] > trace.y[hi]) hi = i; }
    (lo < hi ? [lo, hi] : lo > hi ? [hi, lo] : [lo]).forEach(function (i) { t.push(Number(trace.t[i].toFixed(3))); y.push(Number(trace.y[i].toPrecision(5))); });
  }
  return { t: t, y: y };
}

function buildChromData(lines, peaks) {
  const real = findDetectorTrace(lines);
  const data = {
    real: !!real,
    peaks: peaks.map(function (p) { return { peakNum: p.peakNum, rTime: p.rTime, plateCount: p.plateCount, tailing: p.tailing, height: p.height, area: p.area }; }),
    pumpA: null, pumpB: null, units: "", title: "",
  };
  if (real) { const d = decimateTrace(real, 700); data.t = d.t; data.y = d.y; data.units = real.units; data.title = real.title; }
  ["A", "B"].forEach(function (k) {
    const tr = findPumpTrace(lines, k);
    if (tr) { const d = decimateTrace(tr, 200); data["pump" + k] = { t: d.t, y: d.y, units: tr.units }; }
  });
  return data;
}

function chromatogramSVGFromData(data, label) {
  const trace = data.real ? { t: data.t, y: data.y, units: data.units, title: data.title } : rebuildTrace(data.peaks);
  if (!trace) return "";
  const name = data.real ? data.title.replace(/^PDA Multi Chromatogram\s*/i, "PDA Multi ") : "Detector (rebuilt)";
  return chromatogramSVG(trace, data.peaks, label, [data.pumpA, data.pumpB], name);
}
