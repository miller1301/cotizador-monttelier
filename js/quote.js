/**
 * Printable one-page quote. The same HTML is shown as an on-screen preview and
 * printed (css/print.css hides everything else). Both alternatives (manual and
 * motorized) are always listed with the same measures, fabric, installation
 * and transport; the grand total is the alternative selected in the calculator.
 */
(function (C) {
  "use strict";

  var f = C.format;
  var dom = C.dom;
  var esc = dom.escapeHtml;

  var PX_PER_MM = 96 / 25.4;
  // Printable height of a Letter page with 12 mm margins (A4 is taller), the strictest case.
  var MAX_CONTENT_HEIGHT_MM = 255;

  var current = null;
  var nodes = {};

  function joinWithAnd(items) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
  }

  function companyLines(company) {
    var lines = [];
    if (company.taxId) lines.push("NIT " + company.taxId);
    var contact = [company.phone, company.email, company.website].filter(Boolean);
    if (contact.length) lines.push(contact.join(" · "));
    if (company.address) lines.push(company.address);
    return lines;
  }

  function clientBlock(client) {
    var fields = [
      ["Cliente", client.name],
      ["NIT / C.C.", client.document],
      ["Teléfono", client.phone],
      ["Correo", client.email],
      ["Dirección", client.address]
    ].filter(function (item) { return item[1]; });
    if (!fields.length) return "";
    return "<section class=\"q-client\"><h3 class=\"q-h3\">Datos del cliente</h3><dl class=\"q-client__grid\">" +
      fields.map(function (item) {
        return "<div><dt>" + esc(item[0]) + "</dt><dd>" + esc(item[1]) + "</dd></div>";
      }).join("") + "</dl></section>";
  }

  function valueRow(label, manual, motorized, selected, className) {
    return "<tr" + (className ? " class=\"" + className + "\"" : "") + "><th scope=\"row\">" + label + "</th>" +
      "<td" + (selected === "manual" ? " class=\"is-selected\"" : "") + ">" + esc(f.money(manual)) + "</td>" +
      "<td" + (selected === "motorized" ? " class=\"is-selected\"" : "") + ">" + esc(f.money(motorized)) + "</td></tr>";
  }

  function buildHtml(data) {
    var cfg = data.config;
    var r = data.result;
    var q = cfg.quote;
    var company = cfg.company;
    var manual = r.alternatives.manual;
    var motorized = r.alternatives.motorized;
    var selectedKey = r.actuation;
    var selected = r.alternatives[selectedKey];
    var taxLabel = esc(cfg.tax.name) + " (" + esc(f.percent(cfg.tax.ratePercent)) + ")";
    var qty = r.quantity;

    var quantityText = qty === 1
      ? "1 unidad"
      : esc(f.units(qty)) + " con la misma configuración y dimensiones";
    var areaText = esc(f.area(r.totalArea)) + (qty > 1 ? " (" + esc(f.area(r.unitArea)) + " por unidad)" : "");

    var features = [
      q.structureText,
      q.fabricationText,
      r.fabric.description,
      cfg.actuation[selectedKey].description,
      q.warrantyText
    ].filter(function (text) { return String(text || "").trim(); });

    var conditions = (q.conditions || []).filter(function (text) { return String(text || "").trim(); })
      .map(function (text) { return esc(text); });
    if (q.validity.trim()) conditions.push("<strong>Validez de la oferta:</strong> " + esc(q.validity));
    if (q.paymentTerms.trim()) conditions.push("<strong>Forma de pago:</strong> " + esc(q.paymentTerms));
    if (q.deliveryTime.trim()) conditions.push("<strong>Tiempo de entrega:</strong> " + esc(q.deliveryTime));

    var applies = cfg.tax.appliesTo;
    var taxedConcepts = [];
    if (applies.products) taxedConcepts.push("pérgolas");
    if (applies.installation) taxedConcepts.push("instalación");
    if (applies.transport) taxedConcepts.push("transporte");
    var taxNote = taxedConcepts.length < 3
      ? "<p class=\"q-note\">" + esc(cfg.tax.name) + " calculado sobre: " +
        esc(taxedConcepts.length ? joinWithAnd(taxedConcepts) : "ningún concepto") + ".</p>"
      : "";

    var productLabel = qty === 1 ? "Pérgola (1 unidad)" : "Pérgolas (" + esc(f.units(qty)) + ")";
    var rows = "";
    if (qty > 1) {
      rows += valueRow("Valor por unidad", manual.unitPrice, motorized.unitPrice, selectedKey, "q-table__muted");
    }
    rows += valueRow(productLabel, manual.products, motorized.products, selectedKey);
    rows += valueRow("Instalación", manual.installation, motorized.installation, selectedKey);
    rows += valueRow("Transporte · " + esc(r.transport.label), manual.transport, motorized.transport, selectedKey);
    rows += valueRow("Valor antes de " + esc(cfg.tax.name), manual.subtotal, motorized.subtotal, selectedKey, "q-table__strong");
    rows += valueRow(taxLabel, manual.tax, motorized.tax, selectedKey);
    rows += valueRow("Valor con " + esc(cfg.tax.name), manual.total, motorized.total, selectedKey, "q-table__total");

    var footerLines = companyLines(company);

    return "" +
      "<article class=\"quote-sheet\">" +
        "<header class=\"q-header\">" +
          "<div class=\"q-header__brand\">" +
            "<img class=\"q-logo\" src=\"assets/logo-monttelier.png\" alt=\"Monttelier\">" +
            "<p class=\"q-company\">" + esc(company.name) + "</p>" +
          "</div>" +
          "<div class=\"q-header__meta\">" +
            "<h1 class=\"q-title\">" + esc(q.title) + "</h1>" +
            "<dl class=\"q-meta\">" +
              "<div><dt>No.</dt><dd>" + esc(data.number) + "</dd></div>" +
              "<div><dt>Fecha</dt><dd>" + esc(f.longDate(data.date)) + "</dd></div>" +
            "</dl>" +
          "</div>" +
        "</header>" +
        clientBlock(data.client) +
        "<section class=\"q-product\">" +
          "<h2 class=\"q-product__title\">" + esc(q.productName) + " – CONFIGURACIÓN " + esc(r.matrix.label.toUpperCase()) + "</h2>" +
          "<p class=\"q-line\"><strong>Dimensiones:</strong> " + esc(f.measure(r.width)) + " m de ancho × " +
            esc(f.measure(r.projection)) + " m de proyección.</p>" +
          "<p class=\"q-line\"><strong>Cantidad:</strong> " + quantityText + ". <strong>Área total:</strong> " + areaText + ".</p>" +
          "<p class=\"q-line\"><strong>Sistema de accionamiento seleccionado:</strong> " +
            (selectedKey === "motorized" ? "motorizado" : "manual") + ".</p>" +
          "<h3 class=\"q-h3\">Características del producto</h3>" +
          "<ul class=\"q-list\">" + features.map(function (text) { return "<li>" + esc(text) + "</li>"; }).join("") + "</ul>" +
        "</section>" +
        "<section class=\"q-values\">" +
          "<h3 class=\"q-h3\">Valores</h3>" +
          "<table class=\"q-table\">" +
            "<thead><tr><th scope=\"col\">Concepto</th>" +
              "<th scope=\"col\"" + (selectedKey === "manual" ? " class=\"is-selected\"" : "") + ">" + esc(cfg.actuation.manual.label) + "</th>" +
              "<th scope=\"col\"" + (selectedKey === "motorized" ? " class=\"is-selected\"" : "") + ">" + esc(cfg.actuation.motorized.label) + "</th>" +
            "</tr></thead>" +
            "<tbody>" + rows + "</tbody>" +
          "</table>" +
          taxNote +
          "<div class=\"q-total\">" +
            "<div class=\"q-total__text\">" +
              "<span class=\"q-total__label\">VALOR TOTAL DE LA COTIZACIÓN</span>" +
              "<span class=\"q-total__note\">" + esc(cfg.actuation[selectedKey].label) + " · " + esc(cfg.tax.name) + " incluido</span>" +
            "</div>" +
            "<span class=\"q-total__value\">" + esc(f.money(selected.total)) + "</span>" +
          "</div>" +
        "</section>" +
        (conditions.length
          ? "<section class=\"q-conditions\"><h3 class=\"q-h3\">Condiciones comerciales</h3><ul class=\"q-list\">" +
            conditions.map(function (text) { return "<li>" + text + "</li>"; }).join("") + "</ul></section>"
          : "") +
        "<footer class=\"q-footer\">" + esc([company.name].concat(footerLines).join(" · ")) + "</footer>" +
      "</article>";
  }

  /** Scales the preview down to the screen width (print ignores the scale). */
  function fitPreview() {
    var page = nodes.page;
    page.style.transform = "";
    nodes.preview.style.height = "";
    var available = nodes.preview.clientWidth;
    var natural = page.offsetWidth;
    if (!available || !natural) return;
    var scale = Math.min(1, available / natural);
    if (scale < 1) {
      page.style.transform = "scale(" + scale + ")";
      nodes.preview.style.height = Math.ceil(page.offsetHeight * scale) + "px";
    }
  }

  function sheetHeightMm(sheet) {
    return sheet.offsetHeight / PX_PER_MM;
  }

  /**
   * Keeps the quote on one page: switches to a compact layout when the content
   * is too tall, and warns if it still does not fit (for example, very long conditions).
   */
  function checkFits() {
    var sheet = nodes.page.querySelector(".quote-sheet");
    if (!sheet || !sheet.offsetHeight) return;
    sheet.classList.remove("is-compact");
    if (sheetHeightMm(sheet) > MAX_CONTENT_HEIGHT_MM) sheet.classList.add("is-compact");
    dom.setMessage(nodes.warning, sheetHeightMm(sheet) > MAX_CONTENT_HEIGHT_MM
      ? "La cotización ocupa más de una página. Acorta las condiciones comerciales o los textos en Administración."
      : "");
  }

  function layout() {
    if (!current) return;
    checkFits();
    fitPreview();
  }

  /** data: { result, client, number, date } */
  function show(data) {
    current = {
      config: C.app.getConfig(),
      result: data.result,
      client: data.client,
      number: data.number,
      date: data.date
    };
    nodes.page.innerHTML = buildHtml(current);
    var logo = nodes.page.querySelector(".q-logo");
    if (logo && !logo.complete) logo.addEventListener("load", layout);
    layout();
  }

  /** Suggested PDF file name (browsers use the document title). */
  function documentTitle() {
    if (!current) return null;
    var name = current.client.name ? " - " + current.client.name : "";
    return "Cotización " + current.number + name + " - " + current.config.company.name;
  }

  function init() {
    nodes = {
      page: dom.$("#quote-page"),
      preview: dom.$("#quote-preview"),
      warning: dom.$("#quote-warning")
    };
    dom.$("#btn-print").addEventListener("click", function () { window.print(); });
    dom.$("#btn-new-from-quote").addEventListener("click", function () {
      if (C.calculator.newQuote()) location.hash = "#/calculadora";
    });
    window.addEventListener("resize", dom.debounce(function () {
      if (!dom.$("#view-quote").hidden) layout();
    }, 150));
  }

  C.quote = {
    init: init,
    show: show,
    layout: layout,
    buildHtml: buildHtml,
    documentTitle: documentTitle
  };
})(window.Cotizador = window.Cotizador || {});
