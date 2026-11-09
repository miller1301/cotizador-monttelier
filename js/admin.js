/**
 * Admin panel. Edits a working copy of the configuration; nothing changes in
 * the calculator until "Guardar cambios" validates and stores the copy.
 * Also handles JSON export/import and restoring the defaults.
 */
(function (C) {
  "use strict";

  var f = C.format;
  var dom = C.dom;
  var el = dom.el;
  var storage = C.storage;

  var state = { original: null, working: null, dirty: false, matrixIndex: 0, grid: null };
  var nodes = {};
  var fieldCounter = 0;

  function config() {
    return C.app.getConfig();
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function startEditing() {
    state.original = storage.clone(config());
    state.working = storage.clone(config());
    state.grid = null;
    setDirty(false);
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    nodes.save.disabled = !dirty;
    nodes.discard.disabled = !dirty;
    nodes.status.textContent = dirty ? "Tienes cambios sin guardar" : "Sin cambios pendientes";
    nodes.status.classList.toggle("is-dirty", dirty);
    if (nodes.exportButton) nodes.exportButton.disabled = dirty;
    if (nodes.exportNote) nodes.exportNote.hidden = !dirty;
  }

  function markDirty() {
    setDirty(JSON.stringify(state.working) !== JSON.stringify(state.original));
  }

  function showErrors(errors, title) {
    var box = nodes.errors;
    box.textContent = "";
    if (!errors.length) {
      box.hidden = true;
      return;
    }
    box.appendChild(el("p", { class: "admin-errors__title", text: title || "Corrige estos datos antes de guardar:" }));
    box.appendChild(el("ul", null, errors.map(function (message) { return el("li", { text: message }); })));
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Field builders ----------

  function field(labelText, control, hint) {
    if (!control.id) control.id = "adm-field-" + (++fieldCounter);
    return el("div", { class: "field" }, [
      el("label", { class: "label", for: control.id, text: labelText }),
      control,
      hint ? el("p", { class: "note", text: hint }) : null
    ]);
  }

  function setValidity(input, valid) {
    input.classList.toggle("is-invalid", !valid);
    if (valid) input.removeAttribute("aria-invalid");
    else input.setAttribute("aria-invalid", "true");
  }

  /** Amount in pesos. options: allowEmpty, placeholder, ariaLabel. */
  function moneyInput(get, set, options) {
    options = options || {};
    var input = el("input", {
      class: "input input--money", type: "text", inputmode: "numeric", autocomplete: "off",
      placeholder: options.placeholder || "0", "aria-label": options.ariaLabel
    });
    input.value = isNumber(get()) ? f.amount(get()) : "";
    input.addEventListener("input", function () {
      var value = f.parseMoney(input.value);
      var valid = value === null ? !!options.allowEmpty : !isNaN(value);
      setValidity(input, valid);
      set(valid ? value : NaN);
      markDirty();
    });
    input.addEventListener("blur", function () {
      if (isNumber(get())) input.value = f.amount(get());
    });
    return input;
  }

  /** Decimal number (measures, percentages). options: allowZero, max. */
  function decimalInput(get, set, options) {
    options = options || {};
    var input = el("input", { class: "input", type: "text", inputmode: "decimal", autocomplete: "off" });
    input.value = isNumber(get()) ? String(get()).replace(".", ",") : "";
    input.addEventListener("input", function () {
      var value = f.parseDecimal(input.value);
      var valid = value !== null && !isNaN(value) && (options.allowZero ? value >= 0 : value > 0) &&
        (options.max === undefined || value <= options.max);
      setValidity(input, valid);
      set(valid ? value : NaN);
      markDirty();
    });
    return input;
  }

  /** Whole number. options: min, max. */
  function integerInput(get, set, options) {
    options = options || {};
    var input = el("input", { class: "input", type: "text", inputmode: "numeric", autocomplete: "off" });
    input.value = isNumber(get()) ? String(get()) : "";
    input.addEventListener("input", function () {
      var value = f.parseInteger(input.value);
      var valid = value !== null && !isNaN(value) && value >= (options.min || 0) &&
        (options.max === undefined || value <= options.max);
      setValidity(input, valid);
      set(valid ? value : NaN);
      markDirty();
    });
    return input;
  }

  /** Text. options: required, ariaLabel, placeholder, onChange. */
  function textInput(get, set, options) {
    options = options || {};
    var input = el("input", {
      class: "input", type: "text", autocomplete: "off",
      "aria-label": options.ariaLabel, placeholder: options.placeholder
    });
    input.value = get() || "";
    input.addEventListener("input", function () {
      setValidity(input, !options.required || input.value.trim().length > 0);
      set(input.value);
      markDirty();
      if (options.onChange) options.onChange(input.value);
    });
    return input;
  }

  function textArea(get, set, rows) {
    var area = el("textarea", { class: "input textarea", rows: rows || 3 });
    area.value = get() || "";
    area.addEventListener("input", function () {
      set(area.value);
      markDirty();
    });
    return area;
  }

  function checkbox(labelText, get, set) {
    var input = el("input", { type: "checkbox" });
    input.checked = !!get();
    input.addEventListener("change", function () {
      set(input.checked);
      markDirty();
    });
    return el("label", { class: "check" }, [input, el("span", { text: labelText })]);
  }

  function row(children) {
    return el("div", { class: "field-row" }, children);
  }

  function section(title, description, content, open) {
    return el("details", { class: "card admin-section", open: open }, [
      el("summary", { class: "card-title admin-section__title", text: title }),
      el("div", { class: "admin-section__body" },
        [description ? el("p", { class: "note admin-section__intro", text: description }) : null].concat(content))
    ]);
  }

  // ---------- Price matrices (Excel-like grid) ----------

  function parseCell(text) {
    var value = f.parseMoney(text);
    if (value === null) return null;
    if (isNaN(value) || f.hasCents(text) || !storage.isMatrixPrice(value)) return NaN;
    return value;
  }

  function buildGrid(matrix, original) {
    var columns = matrix.widths.length;
    var table = el("table", { class: "grid" });
    var head = el("tr", null, [el("th", { class: "grid__corner", scope: "col", text: "Proy. \\ Ancho" })]);
    matrix.widths.forEach(function (width) {
      head.appendChild(el("th", { scope: "col", text: f.measure(width) }));
    });
    table.appendChild(el("thead", null, head));
    var body = el("tbody");
    matrix.projections.forEach(function (projection, r) {
      var tr = el("tr", null, [el("th", { scope: "row", text: f.measure(projection) })]);
      matrix.widths.forEach(function (width, c) {
        var input = el("input", {
          class: "grid__cell", type: "text", inputmode: "numeric", autocomplete: "off", spellcheck: "false",
          "aria-label": "Ancho " + f.measure(width) + " m, proyección " + f.measure(projection) + " m",
          dataset: { r: String(r), c: String(c) }
        });
        var value = matrix.prices[r][c];
        input.value = isNumber(value) ? f.amount(value) : "";
        tr.appendChild(el("td", null, input));
      });
      body.appendChild(tr);
    });
    table.appendChild(body);

    var cells = dom.$all(".grid__cell", table);

    function cellAt(r, c) {
      if (r < 0 || c < 0 || r >= matrix.projections.length || c >= columns) return null;
      return cells[r * columns + c];
    }

    function position(input) {
      return { r: Number(input.dataset.r), c: Number(input.dataset.c) };
    }

    function paint(input, typing) {
      var p = position(input);
      var value = matrix.prices[p.r][p.c];
      var before = original && original.prices[p.r] ? original.prices[p.r][p.c] : undefined;
      input.classList.toggle("is-cat2",
        C.pricing.motorCategory(matrix, matrix.widths[p.c], matrix.projections[p.r]) === 2);
      input.classList.toggle("is-changed", value !== before);
      input.classList.toggle("is-empty", value === null);
      if (!typing) setValidity(input, value === null || storage.isMatrixPrice(value));
    }

    function paintAll() {
      cells.forEach(function (input) { paint(input, false); });
    }

    function isCell(node) {
      return node && node.classList && node.classList.contains("grid__cell");
    }

    table.addEventListener("focusin", function (event) {
      if (!isCell(event.target)) return;
      event.target.dataset.before = event.target.value;
      event.target.select();
    });

    table.addEventListener("input", function (event) {
      if (!isCell(event.target)) return;
      var p = position(event.target);
      matrix.prices[p.r][p.c] = parseCell(event.target.value);
      paint(event.target, true);
      markDirty();
    });

    table.addEventListener("focusout", function (event) {
      if (!isCell(event.target)) return;
      var p = position(event.target);
      var value = matrix.prices[p.r][p.c];
      if (isNumber(value)) event.target.value = f.amount(value);
      paint(event.target, false);
    });

    table.addEventListener("keydown", function (event) {
      var input = event.target;
      if (!isCell(input)) return;
      var p = position(input);
      var length = input.value.length;
      var allSelected = input.selectionStart === 0 && input.selectionEnd === length;
      var next = null;
      switch (event.key) {
        case "ArrowUp": next = cellAt(p.r - 1, p.c); break;
        case "ArrowDown": next = cellAt(p.r + 1, p.c); break;
        case "Enter": next = cellAt(p.r + (event.shiftKey ? -1 : 1), p.c); event.preventDefault(); break;
        case "ArrowLeft":
          if (!allSelected && input.selectionStart > 0) return;
          next = cellAt(p.r, p.c - 1);
          break;
        case "ArrowRight":
          if (!allSelected && input.selectionEnd < length) return;
          next = cellAt(p.r, p.c + 1);
          break;
        case "Escape":
          input.value = input.dataset.before || "";
          matrix.prices[p.r][p.c] = parseCell(input.value);
          paint(input, false);
          markDirty();
          return;
        default:
          return;
      }
      if (next) {
        event.preventDefault();
        next.focus();
      }
    });

    // Paste a block copied from Excel (tab-separated columns, one line per row) starting at the focused cell.
    table.addEventListener("paste", function (event) {
      var input = event.target;
      if (!isCell(input)) return;
      var text = (event.clipboardData || window.clipboardData).getData("text") || "";
      text = text.replace(/(\r\n|\n|\r)$/, "");
      if (!/[\t\r\n]/.test(text)) return;
      event.preventDefault();
      var start = position(input);
      var written = 0;
      var invalid = 0;
      var outside = 0;
      text.split(/\r\n|\n|\r/).forEach(function (line, i) {
        line.split("\t").forEach(function (raw, j) {
          var cell = cellAt(start.r + i, start.c + j);
          if (!cell) {
            outside++;
            return;
          }
          var value = parseCell(raw);
          matrix.prices[start.r + i][start.c + j] = value;
          cell.value = isNumber(value) ? f.amount(value) : raw.trim();
          paint(cell, false);
          if (value !== null && isNaN(value)) invalid++;
          else written++;
        });
      });
      markDirty();
      var message = "Se pegaron " + written + (written === 1 ? " celda" : " celdas") + ".";
      if (invalid) message += " " + invalid + " con valores inválidos (marcadas en rojo).";
      if (outside) message += " " + outside + " quedaron fuera de la tabla y no se pegaron.";
      dom.toast(message, invalid ? "error" : "ok");
    });

    paintAll();
    return { node: el("div", { class: "grid-wrap" }, table), paintAll: paintAll };
  }

  function originalMatrix(id) {
    return C.pricing.findById(state.original.matrices, id);
  }

  function renderMatrixTabs(tabs, body) {
    tabs.textContent = "";
    state.working.matrices.forEach(function (matrix, index) {
      tabs.appendChild(el("button", {
        type: "button",
        class: "segmented__btn" + (index === state.matrixIndex ? " is-active" : ""),
        "aria-pressed": index === state.matrixIndex ? "true" : "false",
        text: matrix.label || "Sin nombre",
        onclick: function () {
          state.matrixIndex = index;
          renderMatrixTabs(tabs, body);
          renderMatrixBody(tabs, body);
        }
      }));
    });
  }

  function renderMatrixBody(tabs, body) {
    var matrix = state.working.matrices[state.matrixIndex];
    var motor = state.working.motor;
    body.textContent = "";
    var grid = null;
    function repaint() {
      if (grid) grid.paintAll();
    }
    body.appendChild(row([
      field("Nombre de la configuración", textInput(function () { return matrix.label; }, function (value) {
        matrix.label = value;
      }, { required: true, onChange: function () { renderMatrixTabs(tabs, body); } })),
      field("Categoría 2 del motor desde ancho (m)", decimalInput(function () { return matrix.category2.widthFrom; },
        function (value) { matrix.category2.widthFrom = value; repaint(); })),
      field("Categoría 2 del motor desde proyección (m)", decimalInput(function () { return matrix.category2.projectionFrom; },
        function (value) { matrix.category2.projectionFrom = value; repaint(); }))
    ]));
    body.appendChild(el("p", { class: "grid-legend" }, [
      el("span", { class: "grid-legend__swatch grid-legend__swatch--cat2" }),
      "Categoría 2 del motor (" + f.money(motor.category2) + "). ",
      el("span", { class: "grid-legend__swatch" }),
      "Categoría 1 (" + f.money(motor.category1) + "). Las celdas modificadas se ven en negrita y las inválidas en rojo."
    ]));
    grid = buildGrid(matrix, originalMatrix(matrix.id));
    state.grid = grid;
    body.appendChild(grid.node);
  }

  function matrixSection() {
    var tabs = el("div", { class: "segmented" });
    var body = el("div", { class: "matrix-editor" });
    if (state.matrixIndex >= state.working.matrices.length) state.matrixIndex = 0;
    renderMatrixTabs(tabs, body);
    renderMatrixBody(tabs, body);
    return section("Matrices de precios",
      "Filas: proyección. Columnas: ancho. Valores en pesos, antes de IVA, para el sistema manual con lona acrílica. " +
      "En computador puedes moverte con las flechas y Enter, y pegar bloques copiados desde Excel. " +
      "Una celda vacía significa que esa medida requiere cotización especial.",
      [tabs, body], true);
  }

  // ---------- Other sections ----------

  function motorSection() {
    var motor = state.working.motor;
    return section("Motorización", "Valor que se suma al precio manual por cada unidad motorizada. No lleva el incremento de la lona.", [
      row([
        field("Categoría 1 ($)", moneyInput(function () { return motor.category1; }, function (v) { motor.category1 = v; }),
          "Celdas fuera del recuadro de categoría 2."),
        field("Categoría 2 ($)", moneyInput(function () { return motor.category2; }, function (v) { motor.category2 = v; }),
          "Celdas resaltadas en las matrices.")
      ])
    ]);
  }

  function fabricSection() {
    var items = state.working.fabrics.map(function (fabric) {
      return el("div", { class: "admin-item" }, [
        row([
          field("Nombre de la lona", textInput(function () { return fabric.label; }, function (v) { fabric.label = v; }, { required: true })),
          field("Incremento sobre el precio base (%)", decimalInput(function () { return fabric.increasePercent; },
            function (v) { fabric.increasePercent = v; }, { allowZero: true, max: 1000 }))
        ]),
        field("Texto en las características de la cotización", textArea(function () { return fabric.description; },
          function (v) { fabric.description = v; }, 2))
      ]);
    });
    return section("Tipos de lona", "El porcentaje se aplica solo al precio base de la matriz: no afecta el motor, la instalación ni el transporte.", items);
  }

  function actuationSection() {
    var actuation = state.working.actuation;
    function item(key) {
      var data = actuation[key];
      return el("div", { class: "admin-item" }, [
        field("Nombre", textInput(function () { return data.label; }, function (v) { data.label = v; }, { required: true })),
        field("Texto en las características de la cotización", textArea(function () { return data.description; },
          function (v) { data.description = v; }, 2))
      ]);
    }
    return section("Accionamiento", "Nombres de las dos alternativas y el texto que aparece en la cotización según el sistema seleccionado.",
      [item("manual"), item("motorized")]);
  }

  function installationSection() {
    var inst = state.working.installation;
    return section("Instalación", "Se cobra una vez por cotización según el área total (ancho × proyección × cantidad). En la calculadora siempre se puede ajustar a mano.", [
      row([
        field("Límite inferior (m²)", decimalInput(function () { return inst.lowerLimit; }, function (v) { inst.lowerLimit = v; })),
        field("Límite superior (m²)", decimalInput(function () { return inst.upperLimit; }, function (v) { inst.upperLimit = v; }))
      ]),
      row([
        field("Área menor que el límite inferior ($)", moneyInput(function () { return inst.belowLowerValue; }, function (v) { inst.belowLowerValue = v; })),
        field("Área entre los dos límites, incluidos ($)", moneyInput(function () { return inst.betweenValue; },
          function (v) { inst.betweenValue = v; }, { allowEmpty: true, placeholder: "Pendiente" }),
          "Déjalo vacío mientras esté pendiente: la calculadora pedirá el valor manualmente."),
        field("Área mayor que el límite superior ($)", moneyInput(function () { return inst.aboveUpperValue; }, function (v) { inst.aboveUpperValue = v; }))
      ])
    ]);
  }

  function newDepartmentId() {
    return "dep-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function transportSection() {
    var list = el("div", { class: "transport-list" });
    function renderList(focusLast) {
      list.textContent = "";
      list.appendChild(el("div", { class: "transport-row transport-row--head" }, [
        el("span", { text: "Departamento" }), el("span", { text: "Valor ($)" }), el("span")
      ]));
      state.working.transport.forEach(function (item, index) {
        list.appendChild(el("div", { class: "transport-row" }, [
          textInput(function () { return item.name; }, function (v) { item.name = v; }, { required: true, ariaLabel: "Nombre del departamento" }),
          moneyInput(function () { return item.value; }, function (v) { item.value = v; }, { ariaLabel: "Valor del transporte de " + (item.name || "este departamento") }),
          el("button", {
            type: "button", class: "btn btn-icon", text: "✕",
            "aria-label": "Eliminar " + (item.name || "este departamento"),
            onclick: function () {
              if (!window.confirm("¿Eliminar " + (item.name || "este departamento") + " de la lista?")) return;
              state.working.transport.splice(index, 1);
              renderList(false);
              markDirty();
            }
          })
        ]));
      });
      if (focusLast) {
        var inputs = dom.$all(".transport-row:last-child input", list);
        if (inputs[0]) inputs[0].focus();
      }
    }
    renderList(false);
    var add = el("button", {
      type: "button", class: "btn btn-ghost", text: "+ Agregar departamento",
      onclick: function () {
        state.working.transport.push({ id: newDepartmentId(), name: "", value: null });
        renderList(true);
        markDirty();
      }
    });
    return section("Transporte por departamento", "Se cobra una vez por cotización. La opción «Otro» siempre aparece en la calculadora para escribir un valor personalizado.", [list, add]);
  }

  function taxSection() {
    var tax = state.working.tax;
    return section("IVA", "Los precios de las matrices, el motor, la instalación y el transporte se manejan antes de IVA.", [
      row([
        field("Nombre del impuesto", textInput(function () { return tax.name; }, function (v) { tax.name = v; }, { required: true })),
        field("Tasa (%)", decimalInput(function () { return tax.ratePercent; }, function (v) { tax.ratePercent = v; }, { allowZero: true, max: 100 }))
      ]),
      el("p", { class: "label", text: "Base gravable: el impuesto se calcula sobre" }),
      checkbox("Pérgolas (incluye lona y motor)", function () { return tax.appliesTo.products; }, function (v) { tax.appliesTo.products = v; }),
      checkbox("Instalación", function () { return tax.appliesTo.installation; }, function (v) { tax.appliesTo.installation = v; }),
      checkbox("Transporte", function () { return tax.appliesTo.transport; }, function (v) { tax.appliesTo.transport = v; })
    ]);
  }

  function formatQuoteNumber(quote) {
    var digits = String(quote.nextNumber);
    while (digits.length < quote.numberDigits) digits = "0" + digits;
    return quote.numberPrefix + digits;
  }

  function quoteSection() {
    var company = state.working.company;
    var quote = state.working.quote;
    var preview = el("p", { class: "note" });
    function updatePreview() {
      var valid = isNumber(quote.nextNumber) && isNumber(quote.numberDigits);
      preview.textContent = valid ? "La próxima cotización será la " + formatQuoteNumber(quote) + "." : "";
    }
    updatePreview();
    function text(get, set, options) {
      return textInput(get, set, options);
    }
    var section1 = section("Empresa y numeración", "Datos que aparecen en el encabezado y el pie de la cotización. Los campos vacíos no se muestran.", [
      row([
        field("Nombre de la empresa", text(function () { return company.name; }, function (v) { company.name = v; }, { required: true })),
        field("NIT (solo el número)", text(function () { return company.taxId; }, function (v) { company.taxId = v; }))
      ]),
      row([
        field("Teléfono", text(function () { return company.phone; }, function (v) { company.phone = v; })),
        field("Correo", text(function () { return company.email; }, function (v) { company.email = v; })),
        field("Sitio web", text(function () { return company.website; }, function (v) { company.website = v; }))
      ]),
      field("Dirección", text(function () { return company.address; }, function (v) { company.address = v; })),
      row([
        field("Título de la cotización", text(function () { return quote.title; }, function (v) { quote.title = v; }, { required: true })),
        field("Nombre del producto", text(function () { return quote.productName; }, function (v) { quote.productName = v; }, { required: true }))
      ]),
      row([
        field("Prefijo del número", text(function () { return quote.numberPrefix; }, function (v) { quote.numberPrefix = v; updatePreview(); })),
        field("Siguiente número", integerInput(function () { return quote.nextNumber; }, function (v) { quote.nextNumber = v; updatePreview(); }, { min: 1 })),
        field("Dígitos", integerInput(function () { return quote.numberDigits; }, function (v) { quote.numberDigits = v; updatePreview(); }, { min: 1, max: 10 }))
      ]),
      preview,
      el("p", { class: "note", text: "La numeración es de este dispositivo. Si varios celulares cotizan, usa un prefijo distinto en cada uno." })
    ]);
    return section1;
  }

  function conditionsSection() {
    var quote = state.working.quote;
    return section("Características, condiciones y garantía", "Textos fijos de la cotización. Los textos de lona y accionamiento se editan en sus secciones.", [
      field("Estructura", textArea(function () { return quote.structureText; }, function (v) { quote.structureText = v; }, 2)),
      field("Fabricación", textArea(function () { return quote.fabricationText; }, function (v) { quote.fabricationText = v; }, 2)),
      field("Garantía", textInput(function () { return quote.warrantyText; }, function (v) { quote.warrantyText = v; })),
      field("Condiciones comerciales (una por línea)", textArea(function () { return quote.conditions.join("\n"); }, function (v) {
        quote.conditions = v.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      }, 4)),
      row([
        field("Validez de la oferta", textInput(function () { return quote.validity; }, function (v) { quote.validity = v; }, { placeholder: "Ej.: 15 días" })),
        field("Forma de pago", textInput(function () { return quote.paymentTerms; }, function (v) { quote.paymentTerms = v; }, { placeholder: "Ej.: 50% anticipo, 50% contra entrega" })),
        field("Tiempo de entrega", textInput(function () { return quote.deliveryTime; }, function (v) { quote.deliveryTime = v; }, { placeholder: "Ej.: 20 días hábiles" }))
      ]),
      el("p", { class: "note", text: "Validez, forma de pago y tiempo de entrega solo aparecen en la cotización si tienen texto." })
    ]);
  }

  // ---------- Backup ----------

  function download(fileName, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = el("a", { href: url, download: fileName });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /** Replaces the whole configuration, never moving the quote counter backwards. */
  function replaceConfig(next, message) {
    var currentNumber = config().quote.nextNumber;
    var keptCounter = next.quote.nextNumber < currentNumber;
    if (keptCounter) next.quote.nextNumber = currentNumber;
    C.app.setConfig(next);
    startEditing();
    render();
    showErrors([]);
    dom.toast(message + (keptCounter ? " Se mantuvo el siguiente número de cotización para no repetir números." : ""));
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = storage.parseImport(String(reader.result || ""));
      if (!parsed.ok) {
        showErrors(parsed.errors, "No se importó «" + file.name + "»:");
        return;
      }
      var question = "Se reemplazará toda la configuración actual" + (state.dirty ? ", incluidos los cambios sin guardar," : "") +
        " por la del archivo «" + file.name + "». ¿Continuar?";
      if (!window.confirm(question)) return;
      replaceConfig(parsed.config, "Configuración importada.");
    };
    reader.onerror = function () {
      dom.toast("No se pudo leer el archivo.", "error");
    };
    reader.readAsText(file);
  }

  function backupSection() {
    var fileInput = el("input", { type: "file", accept: ".json,application/json", class: "sr-only", id: "adm-import-file" });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) importFile(fileInput.files[0]);
      fileInput.value = "";
    });
    nodes.exportButton = el("button", {
      type: "button", class: "btn btn-primary", text: "Exportar configuración (JSON)",
      onclick: function () {
        download("monttelier-configuracion-" + f.isoDate(new Date()) + ".json", storage.buildExport(config()));
        dom.toast("Configuración exportada.");
      }
    });
    nodes.exportNote = el("p", { class: "note", text: "Guarda o descarta los cambios pendientes para exportar.", hidden: true });
    var importButton = el("button", {
      type: "button", class: "btn btn-ghost", text: "Importar configuración (JSON)",
      onclick: function () { fileInput.click(); }
    });
    var restoreButton = el("button", {
      type: "button", class: "btn btn-danger", text: "Restaurar valores por defecto",
      onclick: function () {
        if (!window.confirm("Se reemplazarán precios, valores y textos por los valores originales de la aplicación. " +
          "El siguiente número de cotización se mantiene. ¿Continuar?")) return;
        replaceConfig(C.getDefaultConfig(), "Se restauraron los valores por defecto.");
      }
    });
    var content = [
      el("div", { class: "button-row" }, [nodes.exportButton, importButton]),
      nodes.exportNote,
      fileInput,
      el("p", { class: "note", text: "El archivo incluye las matrices, el motor, las lonas, la instalación, el transporte, el IVA, los textos y la numeración. Guárdalo como copia de seguridad o impórtalo en otro dispositivo." }),
      el("div", { class: "button-row" }, [restoreButton])
    ];
    return section("Respaldo", null, content);
  }

  // ---------- Lifecycle ----------

  function render() {
    nodes.root.textContent = "";
    [
      matrixSection(),
      motorSection(),
      fabricSection(),
      actuationSection(),
      installationSection(),
      transportSection(),
      taxSection(),
      quoteSection(),
      conditionsSection(),
      backupSection()
    ].forEach(function (node) { nodes.root.appendChild(node); });
    setDirty(state.dirty);
  }

  function save() {
    var errors = storage.validateConfig(state.working);
    if (errors.length) {
      showErrors(errors);
      dom.toast("Revisa los datos marcados antes de guardar.", "error");
      return;
    }
    // Quotes generated meanwhile may have moved the counter; keep it unless the user edited it here.
    if (state.working.quote.nextNumber === state.original.quote.nextNumber) {
      state.working.quote.nextNumber = config().quote.nextNumber;
    }
    var saved = C.app.setConfig(storage.clone(state.working));
    state.original = storage.clone(state.working);
    setDirty(false);
    showErrors([]);
    if (state.grid) state.grid.paintAll();
    dom.toast(saved ? "Cambios guardados." : "Los cambios se aplicaron, pero este navegador no permitió guardarlos.", saved ? "ok" : "error");
  }

  function discard() {
    if (!window.confirm("¿Descartar los cambios sin guardar?")) return;
    startEditing();
    render();
    showErrors([]);
  }

  /** Called when the admin view is shown. */
  function open() {
    if (!state.working) {
      startEditing();
      render();
      showErrors([]);
    }
  }

  /** Called before leaving the admin view. Returns false to stay. */
  function confirmLeave() {
    if (state.dirty && !window.confirm("Tienes cambios sin guardar en Administración. ¿Salir y descartarlos?")) {
      return false;
    }
    state.working = null;
    state.original = null;
    state.grid = null;
    state.dirty = false;
    return true;
  }

  function hasUnsavedChanges() {
    return state.dirty;
  }

  function init() {
    nodes = {
      root: dom.$("#admin-root"),
      errors: dom.$("#admin-errors"),
      status: dom.$("#admin-status"),
      save: dom.$("#btn-admin-save"),
      discard: dom.$("#btn-admin-discard")
    };
    nodes.save.addEventListener("click", save);
    nodes.discard.addEventListener("click", discard);
  }

  C.admin = {
    init: init,
    open: open,
    confirmLeave: confirmLeave,
    hasUnsavedChanges: hasUnsavedChanges
  };
})(window.Cotizador = window.Cotizador || {});
