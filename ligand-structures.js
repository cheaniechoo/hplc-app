// ligand-structures.js: the bonded ligands of the Build a column tool, drawn as chemical structures.
// Everything drawn here comes from what Restek publishes on its product pages (Ultra and Pinnacle DB lines).
// Parts Restek does not publish (the polar groups, the biphenyl linker, the IBD chain length) are drawn
// dashed or dotted and labelled as such, so nothing is presented as known when it is not.

const LIGAND_INFO = {
  C18: {
    name: "Monomeric C18 (octadecylsilane, L1)",
    formula: "Surface–O–Si(CH₃)₂–(CH₂)₁₇–CH₃   (C₁₈H₃₇)",
    kind: "alkyl", n: 18, exact: true,
    note: "Restek lists the ligand as “monomeric C18”, an octadecylsilane. Monomeric means one bond from each ligand to the surface. The two methyl groups on silicon are the usual design for a monomeric silane; Restek does not state them.",
  },
  C8: {
    name: "Monomeric C8 (octylsilane, L7)",
    formula: "Surface–O–Si(CH₃)₂–(CH₂)₇–CH₃   (C₈H₁₇)",
    kind: "alkyl", n: 8, exact: true,
    note: "Restek lists the ligand as “monomeric C8”, an octylsilane. The two methyl groups on silicon are the usual design for a monomeric silane; Restek does not state them.",
  },
  PFP: {
    name: "Pentafluorophenyl propyl (L43)",
    formula: "Surface–O–Si(CH₃)₂–(CH₂)₃–C₆F₅",
    kind: "pfp", exact: true,
    note: "Restek lists the ligand as “pentafluorophenyl propyl”: a three-carbon propyl linker carrying a ring with five fluorines. The two methyl groups on silicon are the usual design for a monomeric silane; Restek does not state them.",
  },
  BiPH: {
    name: "Biphenyl (L11)",
    formula: "Surface–O–Si…–C₁₂H₉ (biphenyl)",
    kind: "biphenyl", exact: false,
    note: "Restek lists the ligand only as “unique Biphenyl” and does not say how it is attached to silicon. The two rings are drawn as named; the dashed bond stands for the attachment, which is not published.",
  },
  C18aq: {
    name: "Aqueous C18 (modified C18, L1)",
    formula: "Surface–O–Si(CH₃)₂–C₁₈H₃₇ + a polar modification",
    kind: "alkyl", n: 18, exact: false, polarNote: "Polar modification: not published, so not drawn",
    note: "Restek lists the ligand as “proprietary polar modified and functionally bonded C18” and says it is not end-capped. The C18 chain is drawn; Restek does not publish what the polar modification is or where it sits, so it is not drawn.",
  },
  IBD: {
    name: "IBD: polar-embedded alkyl (L68)",
    formula: "Surface–O–Si–alkyl chain with an embedded polar group",
    kind: "ibd", exact: false,
    note: "Restek lists the ligand as “proprietary polar functional embedded alkyl”. Restek does not publish the polar group, where it sits in the chain or the chain length. The ring marks an embedded polar group at an assumed position, and the dotted bonds mean the chain length is not published.",
  },
};

// Draws one ligand in local coordinates: the surface oxygen is at (0,0) and the ligand points along +x.
// o.B = bond length in px, o.labels = write atom labels, o.color = line colour.
function ligandLocal(id, o) {
  const info = LIGAND_INFO[id], B = o.B, dx = B * 0.866, dy = B * 0.5, col = o.color || "#d32f2f", lw = o.lw || 2;
  const P = function (k) { return [k * dx, (k % 2) * dy]; };
  const f = function (v) { return Number(v.toFixed(2)); };
  const ink = "#16232e", polar = "#6a3d8a";
  let s = "";
  const line = function (a, b, extra) { return '<line x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" stroke="' + col + '" stroke-width="' + lw + '" stroke-linecap="round"' + (extra || "") + "/>"; };
  const text = function (x, y, t, size, fill, anchor) { return '<text x="' + f(x) + '" y="' + f(y) + '" font-size="' + size + '" text-anchor="' + (anchor || "middle") + '" fill="' + (fill || ink) + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + t + "</text>"; };
  const dash = ' stroke-dasharray="' + f(B * 0.22) + " " + f(B * 0.2) + '"', dot = ' stroke-dasharray="' + f(lw * 0.1) + " " + f(lw * 1.8) + '"';
  const ring = function (cx, cy, withF) {
    let r = "";
    const V = [0, 1, 2, 3, 4, 5].map(function (j) { const a = (180 - 60 * j) * Math.PI / 180; return [cx + B * Math.cos(a), cy - B * Math.sin(a), Math.cos(a), -Math.sin(a)]; });
    for (let j = 0; j < 6; j++) {
      const a = V[j], b = V[(j + 1) % 6]; r += line(a, b);
      if (j % 2 === 0) { // inner line for the double bond
        const k = 0.16, ax = a[0] + (cx - a[0]) * k * 1.9, ay = a[1] + (cy - a[1]) * k * 1.9, bx = b[0] + (cx - b[0]) * k * 1.9, by = b[1] + (cy - b[1]) * k * 1.9;
        r += line([ax + (b[0] - a[0]) * 0.12, ay + (b[1] - a[1]) * 0.12], [bx - (b[0] - a[0]) * 0.12, by - (b[1] - a[1]) * 0.12], "");
      }
    }
    if (withF) for (let j = 1; j < 6; j++) {
      const v = V[j], e = [v[0] + v[2] * B * 0.6, v[1] + v[3] * B * 0.6];
      r += line(v, e);
      r += o.labels ? text(v[0] + v[2] * B * 1.0, v[1] + v[3] * B * 1.0 + B * 0.2, "F", B * 0.62, "#1f7a6d") : '<circle cx="' + f(e[0]) + '" cy="' + f(e[1]) + '" r="' + f(B * 0.3) + '" fill="#2a9d8f"/>';
    }
    return { svg: r, V: V };
  };

  // surface oxygen and silicon with two methyls
  const O = P(0), Si = P(1);
  s += line(O, Si);
  [-1, 1].forEach(function (sgn) {
    const e = [Si[0] + sgn * B * 0.42, Si[1] + B * 0.8];
    s += line(Si, e);
    if (o.labels) s += text(e[0], e[1] + B * 0.62, "CH₃", B * 0.5, ink);
  });
  if (o.labels) {
    s += text(O[0], O[1] + B * 0.28, "O", B * 0.62, "#b00020");
    s += text(Si[0], Si[1] + B * 0.28, "Si", B * 0.62, ink);
  } else {
    s += '<circle cx="' + f(Si[0]) + '" cy="' + f(Si[1]) + '" r="' + f(B * 0.4) + '" fill="#16232e"/>';
  }

  if (info.kind === "alkyl") {
    for (let k = 1; k <= info.n; k++) s += line(P(k), P(k + 1));
    if (o.labels) { const e = P(info.n + 1); s += text(e[0] + B * 0.15, e[1] - B * 0.5, "CH₃", B * 0.5, ink, "start"); }
  } else if (info.kind === "pfp") {
    for (let k = 1; k <= 4; k++) s += line(P(k), P(k + 1));
    const ipso = P(5), r = ring(ipso[0] + B, ipso[1], true); s += r.svg;
    if (o.labels) s += text(P(3)[0], P(3)[1] - B * 0.6, "propyl", B * 0.5, "#566672");
  } else if (info.kind === "biphenyl") {
    s += line(P(1), P(2), dash);
    const ipso = P(2), r1 = ring(ipso[0] + B, ipso[1], false); s += r1.svg;
    const x2 = ipso[0] + 3 * B; s += line([ipso[0] + 2 * B, ipso[1]], [x2, ipso[1]]);
    s += ring(x2 + B, ipso[1], false).svg;
  } else if (info.kind === "ibd") {
    for (let k = 1; k <= 3; k++) s += line(P(k), P(k + 1));
    const c = P(4);
    for (let k = 4; k <= 6; k++) s += line(P(k), P(k + 1));
    for (let k = 7; k <= 10; k++) s += line(P(k), P(k + 1), dot);
    // embedded polar group at an assumed position (drawn as a ring on the chain)
    s += '<circle cx="' + f(P(4)[0]) + '" cy="' + f(P(4)[1]) + '" r="' + f(B * 0.78) + '" fill="#f1e8f7" fill-opacity="0.7" stroke="' + polar + '" stroke-width="' + f(lw * 0.8) + '"' + dash + "/>";
    if (o.labels) s += text(c[0], c[1] - B * 1.25, "embedded polar group", B * 0.5, polar);
  }
  return s;
}

// A larger drawing for the Ligand step and the report, with the silica surface on the left.
function ligandStructureSVG(id) {
  const info = LIGAND_INFO[id], B = 24;
  let s = '<svg viewBox="0 0 700 210" class="lig-structure" role="img" aria-label="Chemical structure of the ' + info.name + ' ligand bonded to the silica surface">';
  s += '<rect x="6" y="30" width="62" height="150" rx="8" fill="#b9c8e6" stroke="#8fa3cc"/><text x="37" y="108" text-anchor="middle" font-size="12" fill="#16232e" transform="rotate(-90 37 108)">silica surface</text>';
  s += '<g transform="translate(72 112)">' + ligandLocal(id, { B: B, labels: true, color: "#16232e", lw: 2 }) + "</g>";
  return s + "</svg>";
}

// Small upright drawing for the option buttons: surface at the bottom, ligand rising from it.
function ligandThumbSVG(id) {
  const info = LIGAND_INFO[id], B = info.kind === "alkyl" ? 3.4 : 4.6;
  return '<svg viewBox="0 0 130 90" class="lig" role="img" aria-label="' + info.name + '"><rect x="6" y="78" width="118" height="8" class="silica"/><g transform="translate(60 80) rotate(-90)">' + ligandLocal(id, { B: B, labels: false, color: "#d32f2f", lw: 1.4 }) + "</g></svg>";
}

// Card with the structure, its name, formula and what Restek does and does not publish.
function ligandCard(id, restekUrl, restekName) {
  const info = LIGAND_INFO[id], card = document.createElement("div");
  card.className = "lig-card";
  const h = document.createElement("h4"); h.textContent = "Chemical structure: " + info.name; card.appendChild(h);
  const fig = document.createElement("div"); fig.className = "lig-fig"; fig.innerHTML = ligandStructureSVG(id); card.appendChild(fig);
  const fm = document.createElement("p"); fm.className = "lig-formula"; fm.textContent = info.formula; card.appendChild(fm);
  const tag = document.createElement("p"); tag.className = "lig-status " + (info.exact ? "exact" : "partial");
  tag.textContent = info.exact ? "Structure fully defined by the name Restek gives it." : "Partly proprietary: parts of this structure are not published.";
  card.appendChild(tag);
  const n = document.createElement("p"); n.className = "note"; n.textContent = info.note; card.appendChild(n);
  if (restekUrl) {
    const p = document.createElement("p"); p.className = "note"; p.append("Source: ");
    const a = document.createElement("a"); a.href = restekUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Restek " + (restekName || "product page");
    p.appendChild(a); p.append(". The drawing is a bond-line sketch, not to scale."); card.appendChild(p);
  }
  return card;
}
