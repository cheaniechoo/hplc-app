// logk-chart.js: draws the log K vs %B graph for the fit card on the Run history tab.
// Blue dots are the runs used in the fit, red crosses are runs left out to keep R^2 at 0.99 or above,
// the line is the fit, the dashed line is the target log K for your tR spec, and the orange marker
// is the minimum %B where the fit meets that target.

function logKChartSVG(result) {
  const fit = result.fit, W = 760, H = 380, L = 64, R = 28, T = 56, B = 54, pw = W - L - R, ph = H - T - B;
  const all = fit.allPoints || fit.pointsUsed;
  const minB = result.minPercentB;
  const x0 = Math.min(0, Math.floor(minB / 5) * 5 - 5), x1 = Math.max(100, Math.ceil(minB / 5) * 5 + 5);
  const ys = all.map(function (p) { return p.logK; }).concat([result.targetLogK, fit.slope * x0 + fit.intercept, fit.slope * x1 + fit.intercept]);
  let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  const pad = (y1 - y0) * 0.1 || 0.1; y0 -= pad; y1 += pad;
  const X = function (v) { return L + (v - x0) / (x1 - x0) * pw; };
  const Y = function (v) { return T + ph - (v - y0) / (y1 - y0) * ph; };
  const e = function (n) { return n.toFixed(1); };
  const nice = function (span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
  let s = '<svg viewBox="0 0 ' + W + " " + H + '" class="logk-chart" fill="#566672" role="img" aria-label="Graph of log K against percent B with the fitted line and the minimum percent B">';
  s += '<rect x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="#fff" stroke="#c7d0d8"/>';
  const xs = nice(x1 - x0, 10);
  for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) s += '<line x1="' + e(X(v)) + '" y1="' + T + '" x2="' + e(X(v)) + '" y2="' + (T + ph) + '" stroke="#eef1f4"/><text x="' + e(X(v)) + '" y="' + (T + ph + 18) + '" text-anchor="middle" font-size="12">' + v + "</text>";
  const ysn = nice(y1 - y0, 6);
  for (let v = Math.ceil(y0 / ysn) * ysn; v <= y1 + 1e-9; v += ysn) s += '<line x1="' + L + '" y1="' + e(Y(v)) + '" x2="' + (L + pw) + '" y2="' + e(Y(v)) + '" stroke="#eef1f4"/><text x="' + (L - 8) + '" y="' + e(Y(v) + 4) + '" text-anchor="end" font-size="12">' + Number(v.toFixed(2)) + "</text>";
  s += '<text x="' + (L + pw / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="13" fill="#16232e">%B</text>';
  s += '<text x="16" y="' + (T + ph / 2) + '" text-anchor="middle" font-size="13" fill="#16232e" transform="rotate(-90 16 ' + (T + ph / 2) + ')">log K</text>';
  // target line and the minimum %B marker
  s += '<line x1="' + L + '" y1="' + e(Y(result.targetLogK)) + '" x2="' + (L + pw) + '" y2="' + e(Y(result.targetLogK)) + '" stroke="#6a3d8a" stroke-width="1.5" stroke-dasharray="6 4"/>';
  s += '<line x1="' + e(X(minB)) + '" y1="' + T + '" x2="' + e(X(minB)) + '" y2="' + (T + ph) + '" stroke="#f08a00" stroke-width="2" stroke-dasharray="3 3"/>';
  // fitted line
  s += '<line x1="' + e(X(x0)) + '" y1="' + e(Y(fit.slope * x0 + fit.intercept)) + '" x2="' + e(X(x1)) + '" y2="' + e(Y(fit.slope * x1 + fit.intercept)) + '" stroke="#1b5fc1" stroke-width="2"/>';
  s += '<circle cx="' + e(X(minB)) + '" cy="' + e(Y(result.targetLogK)) + '" r="8" fill="#f08a00" stroke="#fff" stroke-width="2.5"/>';
  const label = "min %B = " + result.roundedMinPercentB.toFixed(1) + "%", bw = label.length * 7.4 + 16;
  const bx = Math.min(Math.max(X(minB) - bw / 2, L + 4), L + pw - bw - 4), by = Math.max(T + 6, Y(result.targetLogK) - 40);
  s += '<rect x="' + e(bx) + '" y="' + e(by) + '" width="' + e(bw) + '" height="24" rx="12" fill="#f08a00"/>';
  s += '<text x="' + e(bx + bw / 2) + '" y="' + e(by + 16) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">' + label + "</text>";
  // points
  const usedSet = new Set(fit.pointsUsed);
  all.forEach(function (p) {
    const used = usedSet.has(p), cx = e(X(p.percentB)), cy = e(Y(p.logK));
    const tip = "<title>" + (p.fileName || "") + ": " + p.percentB + "% B, tR " + p.trLastPeak + " min, log K " + p.logK.toFixed(3) + (used ? "" : " (left out of the fit)") + "</title>";
    if (used) s += '<circle cx="' + cx + '" cy="' + cy + '" r="5.5" fill="#1b5fc1" stroke="#fff" stroke-width="1.5">' + tip + "</circle>";
    else s += '<g stroke="#c0392b" stroke-width="2.4" stroke-linecap="round">' + tip + '<line x1="' + (cx - 5.5) + '" y1="' + (cy - 5.5) + '" x2="' + (+cx + 5.5) + '" y2="' + (+cy + 5.5) + '"/><line x1="' + (cx - 5.5) + '" y1="' + (+cy + 5.5) + '" x2="' + (+cx + 5.5) + '" y2="' + (cy - 5.5) + '"/></g>';
  });
  // legend
  const items = [["circle", "#1b5fc1", "Used in the fit"], ["cross", "#c0392b", "Left out (R² below 0.99)"], ["line", "#1b5fc1", "Fitted line"], ["dash", "#6a3d8a", "Target log K (tR spec)"]];
  let x = L; items.forEach(function (it) {
    const y = 28;
    if (it[0] === "circle") s += '<circle cx="' + (x + 6) + '" cy="' + y + '" r="5" fill="' + it[1] + '"/>';
    else if (it[0] === "cross") s += '<g stroke="' + it[1] + '" stroke-width="2.2"><line x1="' + (x + 1) + '" y1="' + (y - 5) + '" x2="' + (x + 11) + '" y2="' + (y + 5) + '"/><line x1="' + (x + 1) + '" y1="' + (y + 5) + '" x2="' + (x + 11) + '" y2="' + (y - 5) + '"/></g>';
    else s += '<line x1="' + x + '" y1="' + y + '" x2="' + (x + 14) + '" y2="' + y + '" stroke="' + it[1] + '" stroke-width="2"' + (it[0] === "dash" ? ' stroke-dasharray="4 3"' : "") + "/>";
    s += '<text x="' + (x + 20) + '" y="' + (y + 4) + '" font-size="12" fill="#16232e">' + it[2] + "</text>";
    x += 26 + it[2].length * 6.4 + 18;
  });
  return s + "</svg>";
}

// All-peaks graph: one line per peak (log K against %B), the suggested intermediate %B in green,
// and the minimum %B in orange when it is known. Colours are the Okabe-Ito set, which stays distinguishable for colour-blind readers.
const PEAK_COLOURS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#5c5c5c", "#8E44AD"];
function allPeaksChartSVG(res, minPercentB) {
  const W = 760, H = 400, L = 64, R = 56, T = 56, B = 54, pw = W - L - R, ph = H - T - B;
  const bs = res.runs.map(function (r) { return r.percentB; });
  let x0 = Math.floor((Math.min.apply(null, bs.concat(res.suggestion ? [res.suggestion.percentB] : [])) - 10) / 5) * 5;
  let x1 = Math.ceil((Math.max.apply(null, bs) + 10) / 5) * 5;
  x0 = Math.max(0, x0); x1 = Math.min(100, x1);
  const at = function (l, x) { return l.slope * x + l.intercept; };
  const ys = [];
  res.lines.forEach(function (l) { ys.push(at(l, x0), at(l, x1)); l.points.forEach(function (p) { ys.push(p.logK); }); });
  let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  const pad = (y1 - y0) * 0.08 || 0.1; y0 -= pad; y1 += pad;
  const X = function (v) { return L + (v - x0) / (x1 - x0) * pw; };
  const Y = function (v) { return T + ph - (v - y0) / (y1 - y0) * ph; };
  const e = function (n) { return n.toFixed(1); };
  const nice = function (span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
  let s = '<svg viewBox="0 0 ' + W + " " + H + '" class="logk-chart" fill="#566672" role="img" aria-label="Graph of log K against percent B for every peak, with the suggested intermediate percent B">';
  s += '<rect x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="#fff" stroke="#c7d0d8"/>';
  const xs = nice(x1 - x0, 8);
  for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) s += '<line x1="' + e(X(v)) + '" y1="' + T + '" x2="' + e(X(v)) + '" y2="' + (T + ph) + '" stroke="#eef1f4"/><text x="' + e(X(v)) + '" y="' + (T + ph + 18) + '" text-anchor="middle" font-size="12">' + v + "</text>";
  const ysn = nice(y1 - y0, 6);
  for (let v = Math.ceil(y0 / ysn) * ysn; v <= y1 + 1e-9; v += ysn) s += '<line x1="' + L + '" y1="' + e(Y(v)) + '" x2="' + (L + pw) + '" y2="' + e(Y(v)) + '" stroke="#eef1f4"/><text x="' + (L - 8) + '" y="' + e(Y(v) + 4) + '" text-anchor="end" font-size="12">' + Number(v.toFixed(2)) + "</text>";
  s += '<text x="' + (L + pw / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="13" fill="#16232e">%B</text>';
  s += '<text x="16" y="' + (T + ph / 2) + '" text-anchor="middle" font-size="13" fill="#16232e" transform="rotate(-90 16 ' + (T + ph / 2) + ')">log K</text>';
  if (typeof minPercentB === "number" && minPercentB >= x0 && minPercentB <= x1) {
    s += '<line x1="' + e(X(minPercentB)) + '" y1="' + T + '" x2="' + e(X(minPercentB)) + '" y2="' + (T + ph) + '" stroke="#f08a00" stroke-width="2" stroke-dasharray="3 3"><title>Minimum %B</title></line>';
  }
  res.lines.forEach(function (l, i) {
    const c = PEAK_COLOURS[(l.peak - 1) % PEAK_COLOURS.length];
    s += '<line x1="' + e(X(x0)) + '" y1="' + e(Y(at(l, x0))) + '" x2="' + e(X(x1)) + '" y2="' + e(Y(at(l, x1))) + '" stroke="' + c + '" stroke-width="2"/>';
    l.points.forEach(function (p) {
      s += '<circle cx="' + e(X(p.percentB)) + '" cy="' + e(Y(p.logK)) + '" r="4.5" fill="' + c + '" stroke="#fff" stroke-width="1.2"><title>Peak ' + l.peak + ", " + p.percentB + "% B, log K " + p.logK.toFixed(3) + "</title></circle>";
    });
    s += '<text x="' + (L + pw + 6) + '" y="' + e(Y(at(l, x1)) + 4) + '" font-size="12" font-weight="700" fill="' + c + '">P' + l.peak + "</text>";
  });
  if (res.suggestion) {
    const sx = X(res.suggestion.percentB);
    s += '<line x1="' + e(sx) + '" y1="' + T + '" x2="' + e(sx) + '" y2="' + (T + ph) + '" stroke="#1d6b3a" stroke-width="2.5" stroke-dasharray="6 4"/>';
    const label = "intermediate %B = " + res.suggestion.percentB.toFixed(1) + "%", bw = label.length * 7 + 16;
    const bx = Math.min(Math.max(sx - bw / 2, L + 4), L + pw - bw - 4);
    s += '<rect x="' + e(bx) + '" y="' + (T + 6) + '" width="' + e(bw) + '" height="24" rx="12" fill="#1d6b3a"/><text x="' + e(bx + bw / 2) + '" y="' + (T + 22) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">' + label + "</text>";
  }
  // legend
  let x = L;
  res.lines.forEach(function (l) {
    const c = PEAK_COLOURS[(l.peak - 1) % PEAK_COLOURS.length];
    s += '<line x1="' + x + '" y1="28" x2="' + (x + 16) + '" y2="28" stroke="' + c + '" stroke-width="2.5"/><text x="' + (x + 21) + '" y="32" font-size="12" fill="#16232e">Peak ' + l.peak + "</text>";
    x += 70;
  });
  if (typeof minPercentB === "number" && minPercentB >= x0 && minPercentB <= x1) {
    s += '<line x1="' + x + '" y1="28" x2="' + (x + 16) + '" y2="28" stroke="#f08a00" stroke-width="2" stroke-dasharray="3 3"/><text x="' + (x + 21) + '" y="32" font-size="12" fill="#16232e">Min %B</text>';
  }
  return s + "</svg>";
}
