// module-howto.js: the "See how this works" section that opens under a module
// on the Equipment tab. Edit the text here, and list your videos in HOWTO_VIDEOS.
//
// To add a video: put the file in the "videos" folder next to index.html and add a line
// below, for example:
//   pump: [{ src: "videos/pump.mp4", title: "Inside a pump head" }],
// A module with no video listed simply shows no video.
const HOWTO_VIDEOS = {
  solvent: [],
  degasser: [{ src: "videos/degasser.mp4", title: "What the degasser does" }],
  "quaternary-valve": [],
  pump: [
    { src: "videos/pump-path.mp4", title: "The path through the pump: bottle, degasser, pump heads, then column or waste" },
    { src: "videos/pump-head.mp4", title: "Inside a pump head: the piston and the check valves" },
  ],
  injector: [{ src: "videos/injector.mp4", title: "The injector: load and inject" }],
  column: [],
  detector: [],
  waste: [],
};

// Steps come from the course toolkit and lab slides. Steps marked general: are
// standard HPLC background that is not on the slides.
const HOWTO_STEPS = {
  solvent: [
    ["Each bottle has its own line", "A filter on the end of the line sits in the liquid. Up to four bottles can feed one pump."],
    ["The pump pulls, nothing pushes", "Solvent is drawn up the line by the pump. It goes through the degasser first, then into the pump."],
    ["Type and pH are decided here", "The solvent type and its pH belong to what is in the bottle, so you choose them before the run. The proportion of each bottle (%B) is set in the software."],
  ],
  degasser: [
    ["Solvent passes through on its way to the pump", "Every line goes through the degasser between the bottle and the pump inlet."],
    ["It removes dissolved gas", "Gas that comes out of solution forms bubbles in the pump and detector."],
    ["Why it matters", "Bubbles make the pump unstable and the baseline noisy. If bubbles do get into the system, purging removes them."],
    ["Nothing to set", "It runs continuously."],
  ],
  pump: [
    ["A cam pushes a piston", "The cam is fixed off-centre, so when it turns it pushes the piston in and pulls it back out. The piston is sapphire with a gold seal."],
    ["Pull stroke: low pressure", "The inlet check valve opens and the outlet one closes. Solvent is pulled in from the bottle."],
    ["Push stroke: high pressure", "The inlet check valve closes and the outlet one opens. Solvent is pushed out towards the column, or to waste when you purge. Each check valve is a ruby ball on a sapphire seat."],
    ["Two pump heads share the work", "While one head pushes, the other refills, so the flow out is continuous and even."],
    ["Where the solvents are mixed", "Quaternary pump (HPLC 1, 2, 4, 5, 6): the quaternary valve mixes at low pressure before the pump heads. Binary pump (HPLC 3): two pumps each deliver one solvent and the two meet in a mixer after the pump heads."],
    ["Flow is set, pressure is built", "You set the flow rate. The back pressure is built by the column and is not something you set. The pressure limit you enter only tells the pump when to stop."],
    ["Purging", "Open the drain valve to purge. Close it again before you inject, or there is no pressure in the column."],
  ],
  "quaternary-valve": [
    ["Four lines meet at the valve", "One line from each bottle."],
    ["It opens one line at a time", "The valve switches between the lines in turn, giving each its share of the time."],
    ["The share decides the mixture", "A larger share of time for a bottle means a larger proportion of that solvent, which is what %B sets."],
    ["The mixing is at low pressure", "It happens before the pump heads, so one pump can deliver a mixture of up to four solvents. HPLC 3 has no quaternary valve."],
  ],
  injector: [
    ["Load position", "On the manual injector (HPLC 1, 2, 5) the lever is in LOAD. Mobile phase goes straight from the pump to the column. You fill the sample loop with the syringe and any excess goes to waste."],
    ["Turn to inject", "Turning the lever to INJECT turns the rotor. The loop is now in the mobile phase path, entering on port 6 and leaving on port 5 in the lab diagram."],
    ["The flow carries the sample to the column", "The mobile phase sweeps the loop contents onto the column without stopping the flow."],
    ["The loop sets the volume", "A manual injector has a fixed loop. An autosampler (HPLC 3, 4, 6) does the same load and inject cycle automatically and can withdraw any volume in its range from a vial."],
    ["Cleaning", "Sample can be left in the back of the stator channel between ports 1 and 6. To purge the injector, put it in LOAD with the pump off and flush it with methanol."],
  ],
  column: [
    ["Fit it in the right direction", "The arrow on the label shows the flow direction."],
    ["Separation happens on the beads", "The column is packed with silica beads carrying a ligand. A compound that interacts more with the ligand than with the mobile phase leaves later. That is retention (K)."],
    ["Mechanical properties", "Length, internal diameter, particle size and pore size describe the shape of the packed bed."],
    ["Chemical properties", "The ligand, end-capping and carbon load describe the chemistry the compounds meet."],
    ["The column builds the back pressure", "Pushing the mobile phase through the packed bed takes pressure. Smaller beads and a longer column raise it."],
    ["The oven holds the temperature", "The column sits in the oven, which keeps it at a steady set temperature."],
  ],
  detector: [
    ["The liquid flows through a small cell", "Everything leaving the column passes through it, continuously."],
    ["Light is passed through it (general)", "Compounds that absorb light at the wavelength you chose reduce the light reaching the sensor."],
    ["That becomes the chromatogram", "The change is turned into an electrical signal. Plotted against time it is the trace in mAU that you read the peaks from."],
    ["UV or PDA", "A UV detector (usually on HPLC 1, 2, 5) records one wavelength. A PDA (HPLC 3, 6) records every wavelength at once."],
    ["It does not change the separation", "It only records what has already come out of the column."],
  ],
  waste: [
    ["Liquid that has passed the detector goes to waste", "It is not reused."],
    ["The injector and pump also send liquid here", "Excess sample from loading and the liquid from purging both go to waste."],
    ["Nothing is set here", "Check the bottle is not full before a long run."],
  ],
};

// Called from showModuleDetail() in app.js after the module panel has been built.
function addHowItWorks(detail, moduleId) {
  const steps = HOWTO_STEPS[moduleId];
  if (!steps) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "howto-toggle secondary";
  button.setAttribute("aria-expanded", "false");
  button.textContent = "See how this works";

  const panel = document.createElement("div");
  panel.className = "howto";
  panel.hidden = true;

  const list = document.createElement("ol");
  list.className = "howto-steps";
  for (const [title, text] of steps) {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = title;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(" " + text));
    list.appendChild(li);
  }
  // The video comes first, then the written steps.

  const videos = HOWTO_VIDEOS[moduleId] || [];
  for (const v of videos) {
    const figure = document.createElement("figure");
    figure.className = "howto-video";
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.src = v.src;
    video.setAttribute("playsinline", "");
    const fallback = document.createElement("p");
    fallback.className = "note";
    fallback.hidden = true;
    fallback.textContent = "The video “" + v.title + "” could not be loaded. Check that " + v.src + " is in the videos folder.";
    video.addEventListener("error", function () { video.hidden = true; fallback.hidden = false; });
    figure.appendChild(video);
    if (v.title) {
      const cap = document.createElement("figcaption");
      cap.textContent = v.title;
      figure.appendChild(cap);
    }
    figure.appendChild(fallback);
    panel.appendChild(figure);
  }
  panel.appendChild(list);

  button.addEventListener("click", function () {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.textContent = open ? "Hide how this works" : "See how this works";
    if (!open) {
      panel.querySelectorAll("video").forEach(function (v) { v.pause(); });
    }
  });

  detail.appendChild(button);
  detail.appendChild(panel);
}
