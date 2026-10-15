// monash-columns.js: the columns available at Monash University, from the lab's
// "List of columns" spreadsheet (dated 7 Feb 2023). Each row is
// [ligand, column line, length mm, internal diameter mm, particle size um, how many are listed].
// Columns marked broken in the sheet are left out, and so is the one the sheet flags as a C8
// listed on the C18 sheet. The sheet is a snapshot: check the shelf before relying on it.
const MONASH_COLUMNS = [
  ["BiPH", "Force", 150, 4.6, 5, 1],
  ["BiPH", "Pinnacle DB", 150, 4.6, 5, 1],
  ["BiPH", "Pinnacle DB", 100, 4.6, 5, 1],
  ["BiPH", "Raptor", 150, 4.6, 5, 1],
  ["BiPH", "Ultra", 150, 4.6, 5, 1],
  ["C18", "C18 Luna", 150, 4.6, 5, 1],
  ["C18", "Force", 150, 3, 3, 1],
  ["C18", "Force", 150, 3, 5, 1],
  ["C18", "Force", 150, 4.6, 3, 1],
  ["C18", "Force", 150, 4.6, 5, 1],
  ["C18", "Force", 100, 4.6, 3, 1],
  ["C18", "Force", 100, 4.6, 5, 1],
  ["C18", "Force", 30, 2.1, 1.8, 1],
  ["C18", "Pinnacle DB", 250, 4.6, 5, 2],
  ["C18", "Pinnacle DB", 150, 4.6, 5, 9],
  ["C18", "Pinnacle DB", 100, 2.1, 1.9, 3],
  ["C18", "Pinnacle DB", 100, 2.1, 3, 1],
  ["C18", "Pinnacle DB", 100, 3.2, 3, 1],
  ["C18", "Pinnacle DB", 100, 3.2, 5, 1],
  ["C18", "Pinnacle DB", 100, 4.6, 3, 1],
  ["C18", "Pinnacle DB", 100, 4.6, 5, 2],
  ["C18", "Pinnacle DB", 50, 2.1, 1.9, 2],
  ["C18", "Pinnacle DB", 30, 2.1, 1.9, 3],
  ["C18", "Pursuit", 150, 4.6, 3, 1],
  ["C18", "Pursuit", 150, 4.6, 5, 2],
  ["C18", "Raptor", 150, 4.6, 2.7, 1],
  ["C18", "Raptor", 150, 4.6, 5, 1],
  ["C18", "Raptor", 100, 4.6, 2.7, 1],
  ["C18", "Raptor", 100, 4.6, 5, 1],
  ["C18", "Raptor", 50, 4.6, 5, 1],
  ["C18", "Raptor", 30, 2.1, 1.8, 1],
  ["C18", "Ultra", 150, 3.2, 3, 1],
  ["C18", "Ultra", 150, 3.2, 5, 1],
  ["C18", "Ultra", 150, 4.6, 3, 1],
  ["C18", "Ultra", 150, 4.6, 5, 1],
  ["C18", "Ultra", 100, 3, 3, 1],
  ["C18", "Ultra", 100, 3, 5, 1],
  ["C18", "Ultra", 100, 3.2, 3, 1],
  ["C18", "Ultra", 100, 4.6, 3, 1],
  ["C18", "Ultra", 100, 4.6, 5, 1],
  ["C18aq", "Pinnacle DB", 150, 4.6, 5, 1],
  ["C18aq", "Pinnacle DB", 100, 4.6, 5, 1],
  ["C18aq", "Ultra", 150, 4.6, 3, 1],
  ["C18aq", "Ultra", 150, 4.6, 5, 1],
  ["C8", "Pinnacle DB", 150, 4.6, 5, 3],
  ["C8", "Pursuit", 250, 4.6, 5, 1],
  ["C8", "Pursuit", 150, 4.6, 3, 1],
  ["C8", "Pursuit", 150, 4.6, 5, 1],
  ["C8", "Ultra", 150, 4.6, 5, 1],
  ["IBD", "Pinnacle DB", 100, 2.1, 1.9, 1],
  ["IBD", "Pinnacle DB", 30, 2.1, 1.9, 1],
  ["IBD", "Ultra", 150, 4.6, 3, 1],
  ["IBD", "Ultra", 150, 4.6, 5, 1],
  ["IBD", "Ultra", 100, 4.6, 3, 1],
  ["PFP", "Force", 150, 4.6, 5, 1],
  ["PFP", "Force", 100, 4.6, 5, 1],
  ["PFP", "Pinnacle DB", 150, 4.6, 3, 1],
  ["PFP", "Pinnacle DB", 150, 4.6, 5, 1],
  ["PFP", "Pinnacle DB", 100, 4.6, 3, 1],
  ["PFP", "Pinnacle DB", 100, 4.6, 5, 1],
  ["PFP", "Pinnacle DB", 50, 4.6, 3, 1],
  ["PFP", "Pinnacle DB", 50, 4.6, 5, 1],
  ["PFP", "Raptor", 150, 4.6, 5, 1],
  ["PFP", "Raptor", 100, 4.6, 2.7, 1],
  ["PFP", "Ultra", 150, 4.6, 5, 1],
];

// Pressure limits by particle size, in psi (the "Minimum and Maximum Pressure" sheet).
const COLUMN_MAX_PSI = { "1.8": 12000, "1.9": 12000, "2.7": 8700, "3": 8700, "5": 5800 };
const LIGAND_ORDER = ["C18", "C8", "C18aq", "BiPH", "IBD", "PFP"];
const LINE_LETTER = { "Pinnacle DB": "P", "Ultra": "U", "Force": "F", "Raptor": "R" };

window.monashColumns = {
  list: MONASH_COLUMNS.map(function (r) { return { ligand: r[0], line: r[1], L: r[2], ID: r[3], dp: r[4], n: r[5] }; }),
  ligands: LIGAND_ORDER,
  letter: function (line) { return LINE_LETTER[line] || ""; },
  maxPsi: function (dp) { const v = COLUMN_MAX_PSI[String(Number(dp))]; return v === undefined ? null : v; },
  // Parse "150x4.6x5" into numbers.
  size: function (dims) {
    const p = String(dims || "").split("x").map(Number);
    return p.length === 3 && p.every(Number.isFinite) ? { L: p[0], ID: p[1], dp: p[2] } : null;
  },
  sameLigand: function (a, b) { return String(a || "").toLowerCase() === String(b || "").toLowerCase(); },
  // Columns of one ligand at one size.
  find: function (ligand, size) {
    const self = window.monashColumns;
    return self.list.filter(function (c) { return self.sameLigand(c.ligand, ligand) && size && c.L === size.L && c.ID === size.ID && c.dp === size.dp; });
  },
  knownLigand: function (ligand) { return window.monashColumns.ligands.some(function (l) { return window.monashColumns.sameLigand(l, ligand); }); },
};
