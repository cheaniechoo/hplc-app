// guide-figures.js: small drawn figures for the Flow chart guide (inline SVG, no images).
// Each function returns a <figure> element. Colours come from CSS classes in style.css.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const W = 320;
  const H = 96;
  const PAD = { l: 8, r: 8, t: 10, b: 18 };

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function svg(w, h, label) {
    const s = el("svg", { viewBox: "0 0 " + w + " " + h, class: "gf-svg", role: "img", "aria-label": label });
    s.appendChild(el("title", {}, label));
    return s;
  }
  function figure(caption, ...children) {
    const f = document.createElement("figure");
    f.className = "gf";
    children.forEach(function (c) { if (c) f.appendChild(c); });
    if (caption) { const c = document.createElement("figcaption"); c.textContent = caption; f.appendChild(c); }
    return f;
  }
  function spec() {
    const v = Number((document.getElementById("spec-tr") || {}).value);
    return Number.isFinite(v) && v > 0 ? v : 15;
  }

  // A chromatogram from Gaussian peaks: [{t, h, w}] on a 0..xmax minute axis.
  function chrom(peaks, xmax, opts) {
    const o = opts || {};
    const w = o.width || W, h = o.height || H;
    const s = svg(w, h, o.label || "Chromatogram");
    const x = function (t) { return PAD.l + (t / xmax) * (w - PAD.l - PAD.r); };
    const base = h - PAD.b;
    const y = function (v) { return base - v * (base - PAD.t); };
    s.appendChild(el("line", { x1: PAD.l, y1: base, x2: w - PAD.r, y2: base, class: "gf-axis" }));
    if (o.specLine) {
      s.appendChild(el("line", { x1: x(o.specLine), y1: PAD.t - 4, x2: x(o.specLine), y2: base, class: "gf-limit" }));
      s.appendChild(el("text", { x: x(o.specLine) - 3, y: PAD.t + 4, class: "gf-limit-text", "text-anchor": "end" }, "tR spec"));
    }
    let d = "";
    const n = 400;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * xmax;
      let v = 0;
      peaks.forEach(function (p) { v += p.h * Math.exp(-0.5 * Math.pow((t - p.t) / p.w, 2)); });
      d += (i ? "L" : "M") + x(t).toFixed(1) + " " + y(Math.min(v, 1)).toFixed(1);
    }
    s.appendChild(el("path", { d: d, class: "gf-trace" + (o.alt ? " alt" : "") }));
    if (o.label) s.appendChild(el("text", { x: PAD.l + 2, y: PAD.t + 4, class: "gf-label" }, o.label));
    (o.ticks || []).forEach(function (t) {
      s.appendChild(el("text", { x: x(t), y: h - 4, class: "gf-tick", "text-anchor": "middle" }, String(t)));
    });
    (o.marks || []).forEach(function (m) {
      s.appendChild(el("text", { x: x(m.t), y: y(m.v) - 4, class: "gf-mark", "text-anchor": "middle" }, m.text));
    });
    return s;
  }

  // A %B profile (gradient program): points [[t, %B], ...].
  function profile(lines, xmax, opts) {
    const o = opts || {};
    const w = o.width || W, h = o.height || 120;
    const s = svg(w, h, o.label || "%B profile");
    const L = 30, R = 8, T = 10, B = 20;
    const x = function (t) { return L + (t / xmax) * (w - L - R); };
    const y = function (b) { return h - B - (b / 100) * (h - T - B); };
    s.appendChild(el("line", { x1: L, y1: h - B, x2: w - R, y2: h - B, class: "gf-axis" }));
    s.appendChild(el("line", { x1: L, y1: T, x2: L, y2: h - B, class: "gf-axis" }));
    [0, 50, 100].forEach(function (b) { s.appendChild(el("text", { x: L - 4, y: y(b) + 3, class: "gf-tick", "text-anchor": "end" }, b + "%")); });
    (o.ticks || []).forEach(function (t) { s.appendChild(el("text", { x: x(t), y: h - 6, class: "gf-tick", "text-anchor": "middle" }, String(t))); });
    (o.shade || []).forEach(function (r) {
      s.appendChild(el("rect", { x: x(r[0]), y: T, width: Math.max(0, x(r[1]) - x(r[0])), height: h - T - B, class: "gf-shade" }));
    });
    lines.forEach(function (ln, i) {
      const d = ln.pts.map(function (p, j) { return (j ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1); }).join("");
      s.appendChild(el("path", { d: d, class: "gf-prof gf-c" + (ln.c !== undefined ? ln.c : i) + (ln.dash ? " dash" : "") }));
    });
    (o.peaks || []).forEach(function (t) { s.appendChild(el("line", { x1: x(t), y1: h - B, x2: x(t), y2: h - B - 10, class: "gf-peaktick" })); });
    (o.notes || []).forEach(function (n) { s.appendChild(el("text", { x: x(n.t), y: y(n.b), class: "gf-mark", "text-anchor": n.anchor || "middle" }, n.text)); });
    return s;
  }

  function legend(items) {
    const d = document.createElement("div");
    d.className = "gf-legend";
    items.forEach(function (it, i) {
      const s = document.createElement("span");
      s.className = "gf-key gf-c" + (it.c !== undefined ? it.c : i);
      s.textContent = it.text;
      d.appendChild(s);
    });
    return d;
  }

  const FIGS = {
    resolution: function () {
      const d = document.createElement("div");
      d.className = "gf-eqn";
      const part = function (txt, cls, lab) {
        const s = document.createElement("span"); s.className = "gf-term " + cls;
        const t = document.createElement("strong"); t.textContent = txt; s.appendChild(t);
        const l = document.createElement("small"); l.textContent = lab; s.appendChild(l);
        return s;
      };
      const op = function (t) { const s = document.createElement("span"); s.className = "gf-op"; s.textContent = t; return s; };
      d.append(op("Rs = ¼"), part("√N", "t-n", "efficiency · 3rd: column, flow"), op("×"), part("(α−1)/α", "t-a", "selectivity · 2nd: temp, solvent, ligand"), op("×"), part("k/(k+1)", "t-k", "retention · 1st: %B"));
      return figure("The resolution equation sets the order: retention, then selectivity, then efficiency.", d);
    },
    pressure: function () {
      const lim = Number((document.getElementById("spec-max-pressure") || {}).value) || 4000;
      const s = svg(W, 90, "Pressure trace under the limit");
      const base = 72, top = 14;
      s.appendChild(el("line", { x1: 8, y1: base, x2: W - 8, y2: base, class: "gf-axis" }));
      s.appendChild(el("line", { x1: 8, y1: top, x2: W - 8, y2: top, class: "gf-limit" }));
      s.appendChild(el("text", { x: W - 10, y: top - 3, class: "gf-limit-text", "text-anchor": "end" }, "limit " + lim + " psi → stop"));
      s.appendChild(el("path", { d: "M8 " + base + " C40 " + base + " 40 34 70 32 S 200 30 312 31", class: "gf-trace" }));
      s.appendChild(el("text", { x: 120, y: 26, class: "gf-mark" }, "highest pressure in the run"));
      return figure("Back pressure is checked first: at or over your limit, the run gets no decision.", s);
    },
    retention: function () {
      const sp = spec();
      const p50 = [{ t: 1, h: .5, w: .05 }, { t: 1.9, h: .8, w: .08 }, { t: 2.6, h: .9, w: .1 }, { t: 3.6, h: .7, w: .13 }, { t: 5.4, h: .6, w: .18 }, { t: 7.2, h: .55, w: .22 }];
      const p40 = [{ t: 1, h: .5, w: .05 }, { t: 2.8, h: .8, w: .12 }, { t: 4.2, h: .9, w: .15 }, { t: 6.0, h: .6, w: .2 }, { t: 6.9, h: .5, w: .22 }, { t: 10.8, h: .5, w: .3 }, { t: 14.4, h: .45, w: .38 }];
      const a = chrom(p50, 16, { label: "50% B: 6 peaks", specLine: sp });
      const b = chrom(p40, 16, { label: "40% B: 7 peaks, last ×2", specLine: sp, alt: true, ticks: [0, 5, 10, 15], marks: [{ t: 6.45, v: .62, text: "split" }] });
      return figure("Dropping %B by 10 roughly doubles every tR and spreads the peaks, so a hidden pair can split.", a, b);
    },
    selectivity: function () {
      const steps = document.createElement("ol");
      steps.className = "gf-ladder";
      ["Ambient", "40 °C", "60 °C", "MeOH", "MIX", "New ligand"].forEach(function (t, i) {
        const li = document.createElement("li");
        li.className = i < 3 ? "l-temp" : i < 5 ? "l-solv" : "l-lig";
        li.textContent = t;
        steps.appendChild(li);
      });
      const before = chrom([{ t: 1, h: .5, w: .05 }, { t: 3, h: .8, w: .15 }, { t: 5, h: 1, w: .3 }, { t: 8, h: .6, w: .25 }], 10, { label: "before: 2 compounds co-elute" });
      const after = chrom([{ t: 1, h: .5, w: .05 }, { t: 3.2, h: .8, w: .15 }, { t: 4.6, h: .55, w: .18 }, { t: 5.6, h: .55, w: .18 }, { t: 7.6, h: .6, w: .25 }], 10, { label: "after: spacing changed", alt: true });
      return figure("Change the chemistry in this order. Each change moves peaks relative to each other.", steps, before, after);
    },
    efficiency: function (ctx) {
      const pos = [1, 3, 4.4, 5.3, 7.5];
      const wide = chrom(pos.map(function (t, i) { return { t: t, h: .7, w: i === 0 ? .06 : .3 }; }), 9, { label: "fewer plates: wide peaks overlap" });
      const narrow = chrom(pos.map(function (t, i) { return { t: t, h: .9, w: i === 0 ? .05 : .16 }; }), 9, { label: "more plates: same positions, narrower", alt: true });
      return figure("Efficiency narrows peaks without moving them. Rs grows only with √N: double N → Rs × 1.41.", wide, narrow, gauge(ctx));
    },
    gs: function () {
      const d = document.createElement("div");
      d.className = "gf-eqn";
      const part = function (txt, cls, lab) {
        const s = document.createElement("span"); s.className = "gf-term " + cls;
        const t = document.createElement("strong"); t.textContent = txt; s.appendChild(t);
        const l = document.createElement("small"); l.textContent = lab; s.appendChild(l);
        return s;
      };
      const op = function (t) { const s = document.createElement("span"); s.className = "gf-op"; s.textContent = t; return s; };
      d.append(op("GS ="), part("Δφ × Vm", "t-a", "window × column volume"), op("÷"), part("tG × F", "t-n", "gradient time × flow"));
      return figure("Same GS = same peak spacing. Change GS to change the spacing.", d);
    },
    scout: function () {
      const p = profile([{ pts: [[0, 5], [2, 5], [22, 100], [25, 100]], c: 0 }], 25, { ticks: [0, 2, 10, 20, 22], peaks: [1, 16.6, 17.1, 17.6, 18.2, 18.8, 19.2], notes: [{ t: 1, b: 16, text: "hold", anchor: "start" }, { t: 12, b: 70, text: "5 → 100 %B in 20 min" }] });
      return figure("The scouting gradient: 2 min hold at 5 %B, then a straight ramp. Ticks: where the peaks elute.", p);
    },
    g1: function () {
      const p = profile([
        { pts: [[0, 5], [2, 5], [22, 100], [26, 100]], c: 0 },
        { pts: [[0, 5], [2, 5], [12, 100], [26, 100]], c: 1 },
        { pts: [[0, 5], [2, 5], [26, 100]], c: 2, dash: true },
      ], 26, { ticks: [0, 12, 22, 26] });
      return figure("G1 tries a steeper and then a shallower gradient to change the spacing.", p, legend([{ text: "scouting tG 20" }, { text: "G1 ↑ tG × 0.5 (steeper)" }, { text: "G1 ↓ tG × 1.2 (shallower)" }]));
    },
    g2: function () {
      const pk = [1, 15.6, 16.2, 16.6, 17.3, 18, 18.7];
      const a = chrom(pk.map(function (t, i) { return { t: t, h: .7, w: i ? .16 : .05 }; }), 26, { label: "Rs < spec" });
      const b = chrom(pk.map(function (t, i) { return { t: i ? 2 + (t - 2) * 1.25 : 1, h: .75, w: i ? .17 : .05 }; }), 26, { label: "F × 0.8, tG ÷ 0.8: same GS, stretched", alt: true, ticks: [0, 10, 20] });
      return figure("G2 keeps GS, so the pattern stays; the run is stretched and gains plates.", a, b);
    },
    g3: function () {
      const p = profile([{ pts: [[0, 5], [2, 5], [22, 100], [25, 100]], c: 0 }, { pts: [[12.3, 54], [20.3, 92]], c: 1 }], 25, {
        shade: [[2, 12.3], [20.3, 22]], peaks: [1, 16.6, 17.1, 17.6, 18.2, 18.8, 19.2], ticks: [0, 12, 20, 25],
        notes: [{ t: 7, b: 88, text: "unused" }, { t: 21.2, b: 30, text: "unused" }, { t: 12.3, b: 64, text: "54 %B", anchor: "end" }, { t: 20.3, b: 80, text: "92 %B", anchor: "start" }],
      });
      return figure("G3 trims the unused %B before the first peak (−20) and after the last (+5), and cuts tG in proportion.", p, legend([{ text: "old window" }, { text: "new window, same GS" }]));
    },
  };

  // Rs gauge: where this run's Rs sits against the floor and the spec (live when a 7-peak run is loaded).
  function gauge(ctx) {
    const box = document.createElement("div");
    box.className = "gf-gauge";
    const rs = ctx && typeof ctx.rs === "number" ? ctx.rs : 1.2;
    const floor = ctx && typeof ctx.floor === "number" ? ctx.floor : 1.0;
    const sp = ctx && typeof ctx.spec === "number" ? ctx.spec : 1.4;
    const max = Math.max(sp * 1.5, rs * 1.1, 2);
    const pct = function (v) { return Math.max(0, Math.min(100, v / max * 100)); };
    const bar = document.createElement("div");
    bar.className = "gf-bar";
    const seg = function (cls, a, b, text) {
      const s = document.createElement("span");
      s.className = "gf-seg " + cls;
      s.style.left = pct(a) + "%";
      s.style.width = (pct(b) - pct(a)) + "%";
      s.textContent = text;
      bar.appendChild(s);
    };
    seg("z-low", 0, floor, "selectivity");
    seg("z-mid", floor, sp, "efficiency");
    seg("z-ok", sp, max, "met");
    const m = document.createElement("span");
    m.className = "gf-marker";
    m.style.left = pct(rs) + "%";
    m.textContent = (ctx && ctx.live ? "this run " : "example ") + rs.toFixed(2);
    bar.appendChild(m);
    box.appendChild(bar);
    const scale = document.createElement("div");
    scale.className = "gf-scale";
    scale.innerHTML = "";
    [["floor", floor], ["spec", sp]].forEach(function (p) {
      const t = document.createElement("span");
      t.style.left = pct(p[1]) + "%";
      t.textContent = p[0] + " " + p[1].toFixed(2);
      scale.appendChild(t);
    });
    box.appendChild(scale);
    return box;
  }

  window.guideFigures = { get: function (name, ctx) { return FIGS[name] ? FIGS[name](ctx) : null; } };
})();
