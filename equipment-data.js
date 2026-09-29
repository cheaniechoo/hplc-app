// equipment-data.js: the equipment content for the "Equipment" tab.
//
// Separated from app.js and logic.js so the content can be edited without
// touching the code. Each module carries a function, the parameters it
// controls, and its position in the flow path. Each parameter carries its
// category (chemical / mechanical / both / detection), a short explanation of
// what that category means for it, the module that controls it, its usual
// range, and its effect on retention, selectivity or efficiency.
//
// The ranges below come from the Shimadzu Prominence series specification
// sheets (the modules in this lab) and from the Restek Pinnacle DB C18
// datasheet.

// Short explanations of what each category means, used by the parameter
// detail panel when a row is clicked.
const CATEGORY_EXPLANATIONS = {
  chemical:
    "A chemical parameter. It changes the interactions between the compounds and the two phases — the stationary phase and the mobile phase — and so changes which compounds are retained, and by how much.",
  mechanical:
    "A mechanical parameter. It changes how the mobile phase or the column physically behaves — the flow, the packing, the shape of the bed — rather than what the chemistry is.",
  both:
    "Both chemical and mechanical. The setting has a chemical effect (it changes the mobile phase composition) and a mechanical effect (it changes how the pump delivers that composition).",
  detection:
    "A detection setting. It does not change the separation at all — it only changes how the compounds are recorded once they leave the column.",
};

const EQUIPMENT_MODULES = [
  {
    id: "solvent",
    label: "Solvent bottles",
    shortLabel: "Solvents",
    function:
      "Hold the mobile phase components and feed them to the pump. The type of solvent and its pH are set here, before the run.",
    controls: ["Solvent type", "Solvent pH"],
    note: "Four solvent lines. The lines meet at the pump, not at the column.",
  },
  {
    id: "degasser",
    label: "Degasser",
    shortLabel: "Degasser",
    function:
      "Removes dissolved gas from the solvents before they reach the pump, so bubbles do not form in the pump heads or the detector cell.",
    controls: [],
    note: "Runs continuously. The user does not set anything on it.",
  },
  {
    id: "pump",
    label: "Pump",
    shortLabel: "Pump",
    function:
      "Draws the solvent lines, mixes them in the programmed proportion, and delivers the mobile phase at the set flow rate. Two pump heads (a dual reciprocating pump) generate the pressure that pushes the mobile phase through the column.",
    controls: ["%B", "Flow rate", "ISO / GRAD"],
    note:
      "HPLC 1, 2, 4, 5 and 6 use a quaternary low-pressure gradient pump (four lines, mixed before the pump heads). HPLC 3 uses a binary high-pressure gradient (two pumps, mixed after the pump heads).",
  },
  {
    id: "quaternary-valve",
    label: "Quaternary valve",
    shortLabel: "Quaternary valve",
    function:
      "Selects, in turn, which of the four solvent lines the pump is drawing from, so the pump can mix the four solvents in the programmed proportion. The mixing happens at low pressure, before the pump heads.",
    controls: ["%B", "ISO / GRAD"],
    note:
      "Only present on the quaternary low-pressure gradient instruments (HPLC 1, 2, 4, 5, 6). The binary high-pressure gradient on HPLC 3 has no quaternary valve; it uses two separate pumps whose outputs meet after the pump heads.",
  },
  {
    id: "injector",
    label: "Autosampler",
    shortLabel: "Autosampler",
    function:
      "Places a measured volume of sample into the moving stream without interrupting the flow. The sample is withdrawn from a vial, then injected into the mobile phase path at the set time.",
    controls: ["Injection volume", "Sample type", "Sample concentration"],
    note:
      "HPLC 1, 2 and 5 use a manual injector instead (a fixed loop volume). HPLC 3, 4 and 6 use an autosampler, which can withdraw any volume within its range.",
  },
  {
    id: "column",
    label: "Column, in the column oven",
    shortLabel: "Column + oven",
    function:
      "The column is where the separation happens: the stationary phase retains the compounds to different degrees, so they leave the column at different times. The oven holds the column at a steady, set temperature.",
    controls: [
      "Ligand",
      "Carbon load",
      "Particle size",
      "Pore size",
      "Column length",
      "Column internal diameter",
      "Temperature",
    ],
    note:
      "Back pressure is generated in the column (the pump has to push the mobile phase through the packed bed) and is measured by the pump.",
  },
  {
    id: "detector",
    label: "UV-vis detector (or PDA)",
    shortLabel: "Detector",
    function:
      "Measures the liquid leaving the column continuously and turns what it measures into an electrical signal. A PDA records a spectrum at every point in time; a UV detector records one wavelength.",
    controls: ["Wavelength"],
    note:
      "The detector does not change the separation. It only records what comes out of the column.",
  },
  {
    id: "waste",
    label: "Waste",
    shortLabel: "Waste",
    function: "Collects the liquid once it has passed the detector.",
    controls: [],
    note: "Nothing is set here.",
  },
];

const EQUIPMENT_PARAMETERS = [
  {
    name: "Solvent type",
    category: "chemical",
    module: "solvent bottles",
    range: "ACN / MeOH / MIX",
    effect: "retention and selectivity",
    note: "Changing the organic modifier changes the acid/base/dipolar interactions (α, β, π*) between the compounds and both phases.",
  },
  {
    name: "Solvent pH",
    category: "chemical",
    module: "solvent bottles",
    range: "2.5 to 8 (limited by the column)",
    effect: "retention and selectivity",
    note: "Only matters if the compounds are ionisable. A neutral compound is unaffected.",
  },
  {
    name: "%B",
    category: "chemical",
    module: "pump",
    range: "0 to 100%",
    effect: "retention and selectivity",
    note: "Lower %B means more water in the mobile phase, which pushes the compounds onto the stationary phase.",
  },
  {
    name: "Flow rate",
    category: "mechanical",
    module: "pump",
    range: "0.0001 to 10 mL/min",
    effect: "efficiency",
    note: "Changes how fast the mobile phase moves, not what it is. A higher flow rate shortens the run and slightly widens the peaks.",
  },
  {
    name: "ISO / GRAD",
    category: "both",
    module: "pump",
    range: "ISO or GRAD",
    effect: "retention and selectivity",
    note: "Isocratic holds %B constant through the run; gradient changes it over time.",
  },
  {
    name: "Injection volume",
    category: "mechanical",
    module: "autosampler",
    range: "0.1 to 100 µL (autosampler); a fixed loop on a manual injector",
    effect: "none on separation",
    note: "Changes the peak height and area, not the retention or resolution.",
  },
  {
    name: "Sample type",
    category: "chemical",
    module: "autosampler",
    range: "CP (composite), BLK (blank), URA (uracil), and the individual standards",
    effect: "none on separation",
    note: "Records what was injected, not how the instrument behaves.",
  },
  {
    name: "Sample concentration",
    category: "chemical",
    module: "autosampler",
    range: "0 to 0.1 mg/mL",
    effect: "none on separation",
    note: "Changes the peak height. Overloading shifts the retention time and widens the peaks.",
  },
  {
    name: "Ligand",
    category: "chemical",
    module: "column",
    range: "C18, C8, C18aq, BiPH, IDB, PFP",
    effect: "selectivity",
    note: "The ligand is what the compounds interact with in the stationary phase. Changing it is the most disruptive selectivity change.",
  },
  {
    name: "Carbon load",
    category: "chemical",
    module: "column",
    range: "11%",
    effect: "retention and selectivity",
    note: "A higher carbon load means a more hydrophobic stationary phase.",
  },
  {
    name: "Particle size",
    category: "mechanical",
    module: "column",
    range: "5 µm",
    effect: "efficiency",
    note: "Smaller particles give more plates per metre, so narrower peaks, but higher back pressure.",
  },
  {
    name: "Pore size",
    category: "mechanical",
    module: "column",
    range: "140 Å",
    effect: "retention",
    note: "Determines which compounds can enter the pores of the bead.",
  },
  {
    name: "Column length",
    category: "mechanical",
    module: "column",
    range: "150 mm",
    effect: "efficiency",
    note: "A longer column gives more plates but a longer run and higher back pressure.",
  },
  {
    name: "Column internal diameter",
    category: "mechanical",
    module: "column",
    range: "4.6 mm",
    effect: "efficiency",
    note: "Affects the linear velocity for a given flow rate.",
  },
  {
    name: "Temperature",
    category: "chemical",
    module: "column",
    range: "4 to 85 °C (limited by the column to 80 °C)",
    effect: "retention and selectivity",
    note: "Higher temperature lowers retention and can change selectivity, but the direction of the change is not predictable in advance.",
  },
  {
    name: "Wavelength",
    category: "detection",
    module: "detector",
    range: "190 to 700 nm (UV); 190 to 800 nm (PDA)",
    effect: "none on separation",
    note: "A detection setting. Changing it changes which peaks are visible, not where they elute.",
  },
];

const EQUIPMENT_RESPONSES_READ = [
  { name: "tR (retention time)", unit: "min", note: "The time from injection to the top of the peak." },
  { name: "AUC (peak area)", unit: "mAU·min", note: "The area under the peak. An indirect measure of how much of that compound was injected." },
  { name: "Height", unit: "mAU", note: "The peak height at its apex." },
  { name: "Width at half height (w½)", unit: "min", note: "The width of the peak measured at half of its maximum height." },
  { name: "Back pressure", unit: "psi", note: "Generated in the column, measured by the pump." },
];

const EQUIPMENT_RESPONSES_CALCULATED = [
  { name: "K (retention factor)", formula: "(tR − t0) / t0", note: "How many times longer the compound spends in the stationary phase than in the mobile phase." },
  { name: "log K", formula: "log10(K)", note: "The value that gives a straight line against %B." },
  { name: "α (selectivity)", formula: "K2 / K1", note: "The ratio of two retention factors. Depends only on the spacing between two peaks, not on their width." },
  { name: "N (plate count)", formula: "5.54 × (tR / w½)²", note: "A measure of efficiency — how narrow the peak is." },
  { name: "Rs (resolution)", formula: "2(tR2 − tR1) / (wb1 + wb2)", note: "How well two neighbouring peaks are separated. The run's resolution is the Rs of the closest pair." },
  { name: "HETP", formula: "L / N", note: "Height equivalent to a theoretical plate. Smaller is better." },
];