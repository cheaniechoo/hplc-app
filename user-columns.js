// user-columns.js: the columns the user has, for the efficiency recommendations.
//
// Starts from the Monash column list (all tagged "in the lab"). The user can untick
// columns they don't have and add columns they could order (tagged "to order").
// The tool only recommends columns from this list, and prefers one in the lab when
// two options both put tR, back pressure and Rs in spec.
(function () {
  const KEY = "hplc-user-columns-v1";
  const LINES = ["Pinnacle DB", "Ultra", "Force", "Raptor", "Other"];

  function keyOf(c) { return [c.ligand, c.line, c.L, c.ID, c.dp].join("|"); }

  function readState() {
    try {
      const raw = localStorage.getItem(KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (s && Array.isArray(s.removed) && Array.isArray(s.added)) return s;
    } catch (err) { /* storage unavailable */ }
    return { removed: [], added: [] };
  }
  function writeState(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (err) { /* storage unavailable */ }
  }

  function monashList() {
    const mc = window.monashColumns;
    return mc ? mc.list.map(function (c) { return { ligand: c.ligand, line: c.line, L: c.L, ID: c.ID, dp: c.dp, where: "lab", monash: true }; }) : [];
  }

  // Every column the user has (Monash ones not removed, plus the added ones).
  function read() {
    const s = readState();
    const removed = new Set(s.removed);
    return monashList().filter(function (c) { return !removed.has(keyOf(c)); }).concat(s.added.map(function (c) { return Object.assign({ where: "order" }, c); }));
  }

  function reset() { writeState({ removed: [], added: [] }); }

  const listeners = [];
  function changed() { listeners.forEach(function (fn) { try { fn(); } catch (err) { /* ignore */ } }); }

  function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function render(container) {
    if (!container) return;
    const s = readState();
    const removed = new Set(s.removed);
    const all = monashList().concat(s.added.map(function (c) { return Object.assign({ where: "order" }, c); }));
    const ligands = Array.from(new Set(all.map(function (c) { return c.ligand; })));
    container.replaceChildren();

    const filterRow = mk("div", "cols-filter");
    const lab = mk("label", null, "Show ligand ");
    const sel = mk("select");
    ["All"].concat(ligands).forEach(function (l) { const o = mk("option", null, l); o.value = l; sel.appendChild(o); });
    let shown = "All";
    try { shown = sessionStorage.getItem(KEY + "-filter") || "All"; } catch (err) { shown = "All"; }
    if (["All"].concat(ligands).indexOf(shown) === -1) shown = "All";
    sel.value = shown;
    lab.appendChild(sel);
    filterRow.appendChild(lab);
    const count = mk("span", "hint", "");
    filterRow.appendChild(count);
    container.appendChild(filterRow);

    const wrap = mk("div", "cols-table-wrap");
    const table = mk("table", "cols-table");
    const head = table.createTHead().insertRow();
    ["Have it", "Ligand", "Line", "L (mm)", "ID (mm)", "PS (µm)", "Bead", "Where", ""].forEach(function (h) { head.appendChild(mk("th", null, h)); });
    const body = table.createTBody();
    const fill = function () {
      body.replaceChildren();
      let have = 0;
      all.forEach(function (c) {
        if (sel.value !== "All" && c.ligand !== sel.value) return;
        const k = keyOf(c);
        const isOn = c.where === "order" ? true : !removed.has(k);
        if (isOn) have++;
        const tr = body.insertRow();
        if (!isOn) tr.className = "col-off";
        const cb = mk("input"); cb.type = "checkbox"; cb.checked = isOn;
        cb.setAttribute("aria-label", "Have " + c.ligand + " " + c.line + " " + c.L + "x" + c.ID + "x" + c.dp);
        cb.addEventListener("change", function () {
          const st = readState();
          if (c.where === "order") {
            st.added = st.added.filter(function (a) { return keyOf(a) !== k; });
          } else if (cb.checked) {
            st.removed = st.removed.filter(function (x) { return x !== k; });
          } else if (st.removed.indexOf(k) === -1) {
            st.removed.push(k);
          }
          writeState(st);
          render(container);
          changed();
        });
        tr.insertCell().appendChild(cb);
        tr.insertCell().textContent = c.ligand;
        tr.insertCell().textContent = c.line;
        tr.insertCell().textContent = c.L;
        tr.insertCell().textContent = c.ID;
        tr.insertCell().textContent = c.dp;
        tr.insertCell().textContent = /raptor/i.test(c.line) ? "core-shell" : "fully porous";
        tr.insertCell().textContent = c.where === "order" ? "to order" : "in the lab";
        tr.insertCell();
      });
      count.textContent = " " + have + " column" + (have === 1 ? "" : "s") + " ticked" + (sel.value === "All" ? "" : " for " + sel.value) + ".";
    };
    sel.addEventListener("change", function () { try { sessionStorage.setItem(KEY + "-filter", sel.value); } catch (err) { /* ignore */ } fill(); });
    fill();
    wrap.appendChild(table);
    container.appendChild(wrap);

    // Add a column to order.
    const add = mk("details", "cols-add");
    add.appendChild(mk("summary", null, "Add a column you could order"));
    const form = mk("div", "cols-add-form");
    const field = function (label, input) { const f = mk("label", "cols-add-field", label); f.appendChild(input); form.appendChild(f); return input; };
    const ligIn = mk("select");
    ["C18", "C8", "C18aq", "BiPH", "IBD", "PFP"].forEach(function (l) { const o = mk("option", null, l); o.value = l; ligIn.appendChild(o); });
    const lineIn = mk("select");
    LINES.forEach(function (l) { const o = mk("option", null, l); o.value = l; lineIn.appendChild(o); });
    const num = function (ph) { const i = mk("input"); i.type = "number"; i.step = "any"; i.min = "0"; i.placeholder = ph; return i; };
    field("Ligand", ligIn);
    field("Line", lineIn);
    const LIn = field("L (mm)", num("150"));
    const IDIn = field("ID (mm)", num("4.6"));
    const dpIn = field("PS (µm)", num("2.7"));
    const btn = mk("button", "secondary", "Add");
    btn.type = "button";
    const msg = mk("p", "hint", "");
    btn.addEventListener("click", function () {
      const c = { ligand: ligIn.value, line: lineIn.value, L: Number(LIn.value), ID: Number(IDIn.value), dp: Number(dpIn.value), where: "order" };
      if (![c.L, c.ID, c.dp].every(function (v) { return Number.isFinite(v) && v > 0; })) { msg.textContent = "Fill in L, ID and PS with numbers."; return; }
      const st = readState();
      if (st.added.some(function (a) { return keyOf(a) === keyOf(c); })) { msg.textContent = "That column is already in the list."; return; }
      st.added.push(c);
      writeState(st);
      render(container);
      changed();
    });
    form.appendChild(btn);
    add.appendChild(form);
    add.appendChild(msg);
    container.appendChild(add);

    const resetBtn = mk("button", "secondary", "Reset to the Monash list");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", function () { reset(); render(container); changed(); });
    container.appendChild(resetBtn);
  }

  // Adds a column to the list as "to order" (used by the efficiency card's "Add to my list").
  function add(c) {
    const st = readState();
    const col = { ligand: c.ligand, line: c.line, L: Number(c.L), ID: Number(c.ID), dp: Number(c.dp), where: "order" };
    if (st.added.some(function (a) { return keyOf(a) === keyOf(col); })) return false;
    st.added.push(col); writeState(st);
    const box = document.getElementById("columns-container"); if (box) render(box);
    changed();
    return true;
  }
  window.userColumns = { read: read, render: render, reset: reset, add: add, onChange: function (fn) { listeners.push(fn); } };
})();
