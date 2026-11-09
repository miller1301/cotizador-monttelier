/**
 * Calculator view. Reads the form, runs the pricing engine on every change and
 * renders a transparent breakdown. The form (draft) is saved in the browser so
 * work survives a reload; it also keeps the quote number assigned to it.
 */
(function (C) {
  "use strict";

  var f = C.format;
  var dom = C.dom;
  var el = dom.el;
  var OTHER = C.pricing.OTHER_DEPARTMENT_ID;
  var CLIENT_FIELDS = ["name", "document", "phone", "email", "address"];

  var draft = null;
  var result = null;
  var nodes = {};
  var saveDraftSoon = dom.debounce(function () { C.storage.saveDraft(draft); }, 250);

  function config() {
    return C.app.getConfig();
  }

  function emptyDraft() {
    var client = {};
    CLIENT_FIELDS.forEach(function (key) { client[key] = ""; });
    return {
      width: "",
      projection: "",
      matrixId: "",
      actuation: "manual",
      fabricId: config().fabrics[0].id,
      quantity: "1",
      departmentId: "",
      otherDepartmentName: "",
      otherTransportValue: "",
      installationManual: false,
      installationManualValue: "",
      client: client,
      quoteNumber: null
    };
  }

  /** Restores the saved draft, keeping only known fields with the expected type. */
  function restoreDraft() {
    var stored = C.storage.loadDraft();
    var restored = emptyDraft();
    if (!stored) return restored;
    Object.keys(restored).forEach(function (key) {
      if (key === "client" || key === "quoteNumber") return;
      if (typeof stored[key] === typeof restored[key]) restored[key] = stored[key];
    });
    if (stored.client && typeof stored.client === "object") {
      CLIENT_FIELDS.forEach(function (key) {
        if (typeof stored.client[key] === "string") restored.client[key] = stored.client[key];
      });
    }
    if (typeof stored.quoteNumber === "string" && stored.quoteNumber) restored.quoteNumber = stored.quoteNumber;
    return restored;
  }

  /** Drops references to options that no longer exist after a configuration change. */
  function reconcileDraft() {
    var cfg = config();
    if (!C.pricing.findById(cfg.fabrics, draft.fabricId)) draft.fabricId = cfg.fabrics[0].id;
    if (draft.matrixId && !C.pricing.findById(cfg.matrices, draft.matrixId)) draft.matrixId = "";
    if (draft.departmentId && draft.departmentId !== OTHER && !C.pricing.findById(cfg.transport, draft.departmentId)) {
      draft.departmentId = "";
    }
  }

  // ---------- Rendering of the options that come from the configuration ----------

  function choice(name, value, title, detail) {
    return el("label", { class: "choice" }, [
      el("input", { type: "radio", name: name, value: value }),
      el("span", { class: "choice__box" }, [
        el("span", { class: "choice__title", text: title }),
        detail ? el("span", { class: "choice__detail", text: detail }) : null
      ])
    ]);
  }

  function renderChoices() {
    var cfg = config();
    nodes.choicesMatrix.textContent = "";
    cfg.matrices.forEach(function (matrix) {
      nodes.choicesMatrix.appendChild(choice("matrix", matrix.id, matrix.label));
    });
    nodes.choicesActuation.textContent = "";
    nodes.choicesActuation.appendChild(choice("actuation", "manual", cfg.actuation.manual.label, "Precio base"));
    nodes.choicesActuation.appendChild(choice("actuation", "motorized", cfg.actuation.motorized.label, "Incluye motor"));
    nodes.choicesFabric.textContent = "";
    cfg.fabrics.forEach(function (fabric) {
      var detail = fabric.increasePercent > 0 ? "+" + f.percent(fabric.increasePercent) : "Precio base";
      nodes.choicesFabric.appendChild(choice("fabric", fabric.id, fabric.label, detail));
    });
  }

  function renderDepartments() {
    var select = nodes.department;
    select.textContent = "";
    select.appendChild(el("option", { value: "", text: "Selecciona el departamento" }));
    config().transport.forEach(function (item) {
      select.appendChild(el("option", { value: item.id, text: item.name + " · " + f.money(item.value) }));
    });
    select.appendChild(el("option", { value: OTHER, text: "Otro (valor personalizado)" }));
  }

  function setRadio(name, value) {
    dom.$all("input[name=\"" + name + "\"]", nodes.form).forEach(function (input) {
      input.checked = input.value === value;
    });
  }

  function radioValue(name) {
    var checked = nodes.form.querySelector("input[name=\"" + name + "\"]:checked");
    return checked ? checked.value : "";
  }

  /** Copies the draft into the form fields. */
  function fillForm() {
    nodes.width.value = draft.width;
    nodes.projection.value = draft.projection;
    nodes.quantity.value = draft.quantity;
    setRadio("matrix", draft.matrixId);
    setRadio("actuation", draft.actuation);
    setRadio("fabric", draft.fabricId);
    nodes.department.value = draft.departmentId;
    nodes.otherName.value = draft.otherDepartmentName;
    nodes.otherValue.value = draft.otherTransportValue;
    nodes.installationManual.checked = draft.installationManual;
    nodes.installationManualValue.value = draft.installationManualValue;
    var hasClient = false;
    dom.$all("[data-client]", nodes.form).forEach(function (input) {
      input.value = draft.client[input.dataset.client] || "";
      if (input.value) hasClient = true;
    });
    nodes.clientCard.open = hasClient;
  }

  /** Copies the form fields into the draft. */
  function readForm() {
    draft.width = nodes.width.value;
    draft.projection = nodes.projection.value;
    draft.quantity = nodes.quantity.value;
    draft.matrixId = radioValue("matrix");
    draft.actuation = radioValue("actuation") || "manual";
    draft.fabricId = radioValue("fabric") || draft.fabricId;
    draft.departmentId = nodes.department.value;
    draft.otherDepartmentName = nodes.otherName.value;
    draft.otherTransportValue = nodes.otherValue.value;
    draft.installationManual = nodes.installationManual.checked;
    draft.installationManualValue = nodes.installationManualValue.value;
    dom.$all("[data-client]", nodes.form).forEach(function (input) {
      draft.client[input.dataset.client] = input.value;
    });
  }

  function engineInput() {
    return {
      matrixId: draft.matrixId,
      width: f.parseDecimal(draft.width),
      projection: f.parseDecimal(draft.projection),
      quantity: f.parseInteger(draft.quantity),
      actuation: draft.actuation,
      fabricId: draft.fabricId,
      departmentId: draft.departmentId,
      otherDepartmentName: draft.otherDepartmentName,
      otherTransportValue: f.parseMoney(draft.otherTransportValue),
      installationManual: draft.installationManual,
      installationManualValue: f.parseMoney(draft.installationManualValue)
    };
  }

  // ---------- Measures ----------

  /** Sorted unique values of an axis ("widths" or "projections") of the selected matrix, or of all matrices. */
  function axisValues(key) {
    var cfg = config();
    var matrix = C.pricing.findById(cfg.matrices, draft.matrixId);
    var source = matrix ? [matrix] : cfg.matrices;
    var values = [];
    source.forEach(function (m) {
      m[key].forEach(function (v) {
        if (values.indexOf(v) < 0) values.push(v);
      });
    });
    return values.sort(function (a, b) { return a - b; });
  }

  /** Moves to the next or previous measure that exists in the price list. */
  function stepMeasure(current, axis, direction) {
    var i;
    if (current === null || isNaN(current)) return axis[0];
    if (direction > 0) {
      for (i = 0; i < axis.length; i++) if (axis[i] > current + 1e-6) return axis[i];
      return current;
    }
    for (i = axis.length - 1; i >= 0; i--) if (axis[i] < current - 1e-6) return axis[i];
    return current;
  }

  function describeAxis(values) {
    var step = values.length > 1 ? values[1] - values[0] : null;
    var uniform = step !== null && values.every(function (v, i) {
      return i === 0 || Math.abs(v - values[i - 1] - step) < 1e-6;
    });
    return "de " + f.measure(values[0]) + " a " + f.measure(values[values.length - 1]) + " m" +
      (uniform ? " cada " + f.measure(step) + " m" : "");
  }

  // ---------- Events ----------

  function onFormChange(event) {
    var target = event.target;
    readForm();
    if (target === nodes.installationManual && draft.installationManual) {
      // Start the manual adjustment from the value given by the area rule.
      if (!draft.installationManualValue && result && result.installation && result.installation.ruleValue !== null) {
        nodes.installationManualValue.value = f.amount(result.installation.ruleValue);
        readForm();
      }
      update();
      nodes.installationManualValue.focus();
      return;
    }
    update();
  }

  function onStepClick(event) {
    var button = event.target.closest("[data-step-for]");
    if (!button) return;
    var input = document.getElementById(button.dataset.stepFor);
    var direction = Number(button.dataset.step);
    if (input === nodes.quantity) {
      var quantity = f.parseInteger(input.value);
      input.value = String(quantity === null || isNaN(quantity) ? 1 : Math.max(1, quantity + direction));
    } else {
      var axis = axisValues(input === nodes.width ? "widths" : "projections");
      input.value = f.measure(stepMeasure(f.parseDecimal(input.value), axis, direction));
    }
    readForm();
    update();
  }

  function normalizeMeasure(event) {
    var value = f.parseDecimal(event.target.value);
    if (value !== null && !isNaN(value)) {
      event.target.value = f.measure(value);
      readForm();
      update();
    }
  }

  function normalizeMoney(event) {
    var value = f.parseMoney(event.target.value);
    if (value !== null && !isNaN(value)) {
      event.target.value = f.amount(value);
      readForm();
      update();
    }
  }

  function bindEvents() {
    nodes.form.addEventListener("input", onFormChange);
    nodes.form.addEventListener("change", onFormChange);
    nodes.form.addEventListener("submit", function (event) { event.preventDefault(); });
    nodes.form.addEventListener("click", onStepClick);
    nodes.width.addEventListener("blur", normalizeMeasure);
    nodes.projection.addEventListener("blur", normalizeMeasure);
    nodes.otherValue.addEventListener("blur", normalizeMoney);
    nodes.installationManualValue.addEventListener("blur", normalizeMoney);
    nodes.generate.addEventListener("click", generate);
    nodes.newQuote.addEventListener("click", function () { newQuote(); });
    nodes.totalBarBtn.addEventListener("click", function () {
      nodes.summary.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ---------- Rendering of the results ----------

  function issuesFor(fields, kinds) {
    return result.issues.filter(function (item) {
      return fields.indexOf(item.field) >= 0 && (!kinds || kinds.indexOf(item.kind) >= 0);
    }).map(function (item) { return item.message; }).join(" ");
  }

  function installationNote(info, limits) {
    if (result.totalArea === null) return "Se calcula con el área total (ancho × proyección × cantidad).";
    var area = "Área total " + f.area(result.totalArea) + ": ";
    var range;
    if (info.rule === "below") range = "menos de " + f.area(limits.lowerLimit) + ".";
    else if (info.rule === "above") range = "más de " + f.area(limits.upperLimit) + ".";
    else range = "entre " + f.area(limits.lowerLimit) + " y " + f.area(limits.upperLimit) + ".";
    if (info.manual) {
      return "Valor ajustado manualmente. " + area + range + " Valor según el área: " +
        (info.ruleValue === null ? "pendiente de definir." : f.money(info.ruleValue) + ".");
    }
    if (info.ruleValue === null) {
      return area + range + " El valor para este rango está pendiente de definir: activa «Ajustar valor manualmente» y escríbelo.";
    }
    return area + range;
  }

  function summaryRow(label, value, detail, modifier) {
    return el("div", { class: "summary__row" + (modifier ? " summary__row--" + modifier : "") }, [
      el("dt", null, [label, detail ? el("span", { class: "summary__detail", text: detail }) : null]),
      el("dd", { text: value })
    ]);
  }

  function renderSummary() {
    var cfg = config();
    var r = result;
    var sel = r.selected;
    var list = nodes.summaryList;
    var dims = r.width !== null && r.projection !== null;
    var actuationLabel = cfg.actuation[r.actuation].label;
    list.textContent = "";

    list.appendChild(summaryRow("Configuración", r.matrix ? r.matrix.label : "—"));
    list.appendChild(summaryRow("Dimensiones", dims ? f.meters(r.width) + " × " + f.meters(r.projection) : "—",
      "ancho × proyección"));
    list.appendChild(summaryRow("Cantidad", r.quantity !== null ? f.units(r.quantity) : "—"));
    list.appendChild(summaryRow("Área total", f.area(r.totalArea),
      r.quantity > 1 && r.unitArea !== null ? f.area(r.unitArea) + " por unidad" : null));
    list.appendChild(summaryRow("Accionamiento", actuationLabel,
      r.actuation === "motorized" && r.category ? "Motor categoría " + r.category : null));
    list.appendChild(summaryRow("Tipo de lona", r.fabric ? r.fabric.label : "—",
      r.fabric ? (r.fabric.increasePercent > 0 ? "Incremento " + f.percent(r.fabric.increasePercent) : "Precio base") : null));

    var qty = r.quantity;
    list.appendChild(summaryRow("Precio de las pérgolas", sel ? f.money(sel.baseTotal) : "—",
      sel ? qty + " × " + f.money(r.unitBasePrice) + " según la lista de precios" : null, "money"));
    if (sel && sel.fabricTotal > 0) {
      list.appendChild(summaryRow("Incremento por lona " + r.fabric.label, f.money(sel.fabricTotal),
        qty + " × " + f.money(r.unitFabricIncrement) + " (" + f.percent(r.fabric.increasePercent) + " del precio base)", "money"));
    }
    if (sel && sel.motorTotal > 0) {
      list.appendChild(summaryRow("Incremento por motorización", f.money(sel.motorTotal),
        qty + " × " + f.money(r.unitMotorIncrement) + " · categoría " + r.category, "money"));
    }
    var inst = r.installation;
    list.appendChild(summaryRow("Instalación", inst.value !== null ? f.money(inst.value) : (inst.rule ? "Pendiente" : "—"),
      inst.manual ? "Valor ajustado manualmente" : (r.totalArea !== null ? "Según área total " + f.area(r.totalArea) : null), "money"));
    list.appendChild(summaryRow("Transporte", r.transport.value !== null ? f.money(r.transport.value) : "—",
      r.transport.label, "money"));
    list.appendChild(summaryRow("Subtotal antes de " + cfg.tax.name, sel ? f.money(sel.subtotal) : "—", null, "subtotal"));
    list.appendChild(summaryRow(cfg.tax.name + " (" + f.percent(cfg.tax.ratePercent) + ")", sel ? f.money(sel.tax) : "—",
      sel && sel.taxableBase !== null ? "Sobre " + f.money(sel.taxableBase) : null, "money"));
    list.appendChild(summaryRow("Total de la cotización", sel ? f.money(sel.total) : "—", actuationLabel, "total"));
  }

  function renderAlternatives() {
    var box = nodes.alternatives;
    var alts = result.alternatives;
    box.textContent = "";
    if (!alts || alts.manual.total === null) {
      box.hidden = true;
      return;
    }
    var cfg = config();
    box.appendChild(el("p", { class: "alternatives__title", text: "La cotización muestra las dos alternativas:" }));
    ["manual", "motorized"].forEach(function (key) {
      var alt = alts[key];
      box.appendChild(el("div", { class: "alternative" + (result.actuation === key ? " is-selected" : "") }, [
        el("span", { class: "alternative__name", text: cfg.actuation[key].label + (result.actuation === key ? " (seleccionado)" : "") }),
        el("span", { class: "alternative__value", text: f.money(alt.total) }),
        el("span", { class: "alternative__detail", text: f.money(alt.subtotal) + " antes de " + cfg.tax.name })
      ]));
    });
    box.hidden = false;
  }

  function render() {
    var cfg = config();
    var r = result;
    var widths = axisValues("widths");
    var projections = axisValues("projections");

    nodes.dimsNote.textContent = (r.unitArea !== null ? "Área por unidad: " + f.area(r.unitArea) + ". " : "") +
      "Medidas de la lista: ancho " + describeAxis(widths) + "; proyección " + describeAxis(projections) + ".";
    dom.setMessage(nodes.errDims, issuesFor(["width", "projection"], ["invalid"]));
    dom.setMessage(nodes.special, issuesFor(["special"]));

    nodes.actuationNote.textContent = r.category
      ? "Esta medida es categoría " + r.category + " del motor: " + f.money(r.unitMotorIncrement) + " por unidad sobre el sistema manual."
      : "El valor del motor depende de la medida: categoría 1 " + f.money(cfg.motor.category1) +
        ", categoría 2 " + f.money(cfg.motor.category2) + ".";

    nodes.qtyNote.textContent = r.quantity > 1
      ? "Las " + r.quantity + " unidades tienen la misma configuración y dimensiones."
      : "Para varias pérgolas con la misma configuración y dimensiones, aumenta la cantidad.";
    dom.setMessage(nodes.errQuantity, issuesFor(["quantity"], ["invalid"]));

    nodes.otherBox.hidden = draft.departmentId !== OTHER;
    dom.setMessage(nodes.errTransport, issuesFor(["transport"], ["invalid"]));

    var inst = r.installation;
    nodes.installationValue.textContent = inst.value !== null ? f.money(inst.value) : (inst.rule === "between" ? "Pendiente" : "—");
    nodes.installationNote.textContent = installationNote(inst, cfg.installation);
    nodes.installationManualField.hidden = !draft.installationManual;
    dom.setMessage(nodes.errInstallation, issuesFor(["installation"], ["invalid"]));

    renderSummary();
    renderAlternatives();

    nodes.pendingList.textContent = "";
    r.issues.forEach(function (item) {
      nodes.pendingList.appendChild(el("li", { text: item.message }));
    });
    nodes.pending.hidden = r.complete;
    nodes.generate.disabled = !r.complete;

    nodes.totalBarLabel.textContent = "Total con " + cfg.tax.name + " · " + cfg.actuation[r.actuation].label;
    if (r.complete) {
      nodes.totalBarValue.textContent = f.money(r.selected.total);
    } else {
      var special = r.issues.some(function (item) { return item.kind === "special"; });
      nodes.totalBarValue.textContent = special ? "Cotización especial" : "Faltan datos";
    }
    nodes.totalBarBtn.classList.toggle("is-complete", r.complete);

    nodes.draftNumber.textContent = draft.quoteNumber ? "Editando la cotización " + draft.quoteNumber : "";
  }

  function update() {
    result = C.pricing.calculate(config(), engineInput());
    render();
    saveDraftSoon();
  }

  // ---------- Quote ----------

  function clientData() {
    var data = {};
    CLIENT_FIELDS.forEach(function (key) { data[key] = String(draft.client[key] || "").trim(); });
    return data;
  }

  /** Renders the quote for the current draft. Returns false when the data is incomplete. */
  function showQuote() {
    readForm();
    update();
    if (!result.complete || !draft.quoteNumber) return false;
    C.quote.show({ result: result, client: clientData(), number: draft.quoteNumber, date: new Date() });
    return true;
  }

  function generate() {
    readForm();
    update();
    if (!result.complete) return;
    if (!draft.quoteNumber) {
      draft.quoteNumber = C.app.takeQuoteNumber();
      C.storage.saveDraft(draft);
      render();
    }
    location.hash = "#/cotizacion";
  }

  function hasData() {
    var empty = emptyDraft();
    return Object.keys(empty).some(function (key) {
      if (key === "client") {
        return CLIENT_FIELDS.some(function (field) { return draft.client[field]; });
      }
      return draft[key] !== empty[key];
    });
  }

  /** Clears the form. The next generated quote takes a new number. */
  function newQuote() {
    readForm();
    if (hasData() && !window.confirm("¿Empezar una nueva cotización? Se borrarán los datos del formulario actual.")) {
      return false;
    }
    draft = emptyDraft();
    C.storage.saveDraft(draft);
    fillForm();
    update();
    window.scrollTo(0, 0);
    return true;
  }

  /** Called by the app after the configuration changes (admin save, import, restore). */
  function onConfigChange() {
    readForm();
    reconcileDraft();
    renderChoices();
    renderDepartments();
    fillForm();
    update();
  }

  function init() {
    nodes = {
      form: dom.$("#calc-form"),
      width: dom.$("#in-width"),
      projection: dom.$("#in-projection"),
      quantity: dom.$("#in-quantity"),
      dimsNote: dom.$("#dims-note"),
      errDims: dom.$("#err-dims"),
      special: dom.$("#special-notice"),
      choicesMatrix: dom.$("#choices-matrix"),
      choicesActuation: dom.$("#choices-actuation"),
      choicesFabric: dom.$("#choices-fabric"),
      actuationNote: dom.$("#actuation-note"),
      qtyNote: dom.$("#qty-note"),
      errQuantity: dom.$("#err-quantity"),
      department: dom.$("#in-department"),
      otherBox: dom.$("#other-transport"),
      otherName: dom.$("#in-other-name"),
      otherValue: dom.$("#in-other-value"),
      errTransport: dom.$("#err-transport"),
      installationValue: dom.$("#installation-value"),
      installationNote: dom.$("#installation-note"),
      installationManual: dom.$("#in-installation-manual"),
      installationManualField: dom.$("#installation-manual-field"),
      installationManualValue: dom.$("#in-installation-value"),
      errInstallation: dom.$("#err-installation"),
      clientCard: dom.$("#client-card"),
      summary: dom.$("#summary"),
      summaryList: dom.$("#summary-list"),
      alternatives: dom.$("#alternatives"),
      pending: dom.$("#pending"),
      pendingList: dom.$("#pending-list"),
      generate: dom.$("#btn-generate"),
      draftNumber: dom.$("#draft-number"),
      newQuote: dom.$("#btn-new-quote"),
      totalBarBtn: dom.$("#total-bar-btn"),
      totalBarLabel: dom.$("#total-bar-label"),
      totalBarValue: dom.$("#total-bar-value")
    };
    draft = restoreDraft();
    reconcileDraft();
    renderChoices();
    renderDepartments();
    fillForm();
    bindEvents();
    update();
  }

  C.calculator = {
    init: init,
    onConfigChange: onConfigChange,
    showQuote: showQuote,
    newQuote: newQuote
  };
})(window.Cotizador = window.Cotizador || {});
