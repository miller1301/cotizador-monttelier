/**
 * Local persistence (localStorage), configuration validation and JSON backup.
 *
 * - The configuration lives under CONFIG_KEY. When nothing is stored, the
 *   defaults from default-config.js are used.
 * - The calculator draft (current form and assigned quote number) lives under DRAFT_KEY.
 * - Backups are JSON files: { app, exportedAt, config }.
 */
(function (C) {
  "use strict";

  var CONFIG_KEY = "monttelier.cotizador.config.v1";
  var DRAFT_KEY = "monttelier.cotizador.draft.v1";
  var EXPORT_APP_ID = "monttelier-cotizador";
  var MIN_MATRIX_PRICE = 1000;
  var MAX_ERRORS = 25;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isText(value) {
    return typeof value === "string";
  }

  function hasText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function isWholeAmount(value) {
    return isNumber(value) && value >= 0 && Math.floor(value) === value;
  }

  function isMatrixPrice(value) {
    return isNumber(value) && value >= MIN_MATRIX_PRICE && Math.floor(value) === value;
  }

  function isAxis(list) {
    if (!Array.isArray(list) || list.length === 0) return false;
    for (var i = 0; i < list.length; i++) {
      if (!isNumber(list[i]) || list[i] <= 0) return false;
      if (i > 0 && list[i] <= list[i - 1]) return false;
    }
    return true;
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase()
      .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u");
  }

  var storageAvailable = (function () {
    try {
      var key = "__monttelier_test__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  })();

  function readJSON(key) {
    if (!storageAvailable) return null;
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeJSON(key, value) {
    if (!storageAvailable) return false;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fills missing text-only fields from the defaults, so backups made before a
   * new text field existed keep working. Pricing sections are never filled in:
   * if they are missing, validation rejects the configuration.
   */
  function normalizeConfig(raw) {
    if (!isObject(raw)) return raw;
    var defaults = C.getDefaultConfig();
    var config = clone(raw);
    config.company = Object.assign({}, defaults.company, isObject(config.company) ? config.company : {});
    var actuation = isObject(config.actuation) ? config.actuation : {};
    config.actuation = {
      manual: Object.assign({}, defaults.actuation.manual, isObject(actuation.manual) ? actuation.manual : {}),
      motorized: Object.assign({}, defaults.actuation.motorized, isObject(actuation.motorized) ? actuation.motorized : {})
    };
    config.quote = Object.assign({}, defaults.quote, isObject(config.quote) ? config.quote : {});
    if (isObject(config.tax) && !isObject(config.tax.appliesTo)) {
      config.tax.appliesTo = clone(defaults.tax.appliesTo);
    }
    return config;
  }

  /** Returns a list of problems in Spanish (empty when the configuration is valid). */
  function validateConfig(config) {
    var errors = [];
    function fail(message) {
      if (errors.length < MAX_ERRORS) errors.push(message);
    }
    var f = C.format;

    if (!isObject(config)) return ["El archivo no contiene una configuración de la calculadora."];
    if (config.schemaVersion !== 1) fail("La versión de la configuración no es compatible con esta aplicación.");

    // Company
    if (!isObject(config.company) || !hasText(config.company.name)) {
      fail("Empresa: falta el nombre.");
    } else {
      ["taxId", "phone", "email", "address", "website"].forEach(function (key) {
        if (!isText(config.company[key])) fail("Empresa: el campo «" + key + "» debe ser texto.");
      });
    }

    // Matrices
    if (!Array.isArray(config.matrices) || config.matrices.length === 0) {
      fail("Faltan las matrices de precios.");
    } else {
      var matrixIds = {};
      config.matrices.forEach(function (matrix, index) {
        if (!isObject(matrix)) {
          fail("Matriz " + (index + 1) + ": formato inválido.");
          return;
        }
        var name = hasText(matrix.label) ? matrix.label : "Matriz " + (index + 1);
        if (!hasText(matrix.label)) fail(name + ": falta el nombre.");
        if (!hasText(matrix.id) || matrixIds[matrix.id]) fail(name + ": identificador vacío o repetido.");
        matrixIds[matrix.id] = true;
        var widthsOk = isAxis(matrix.widths);
        var projectionsOk = isAxis(matrix.projections);
        if (!widthsOk) fail(name + ": los anchos deben ser números positivos en orden creciente.");
        if (!projectionsOk) fail(name + ": las proyecciones deben ser números positivos en orden creciente.");
        if (!Array.isArray(matrix.prices)) {
          fail(name + ": faltan los precios.");
        } else if (widthsOk && projectionsOk) {
          if (matrix.prices.length !== matrix.projections.length) {
            fail(name + ": debe haber una fila de precios por cada proyección.");
          } else {
            var badCells = 0;
            var firstBad = null;
            matrix.prices.forEach(function (row, r) {
              if (!Array.isArray(row) || row.length !== matrix.widths.length) {
                fail(name + ": la fila de proyección " + f.measure(matrix.projections[r]) + " m no tiene un precio por cada ancho.");
                return;
              }
              row.forEach(function (price, c) {
                if (price !== null && !isMatrixPrice(price)) {
                  badCells++;
                  if (!firstBad) firstBad = { r: r, c: c };
                }
              });
            });
            if (badCells > 0) {
              fail(name + ": " + (badCells === 1 ? "1 precio inválido" : badCells + " precios inválidos") +
                " (por ejemplo ancho " + f.measure(matrix.widths[firstBad.c]) + " m × proyección " +
                f.measure(matrix.projections[firstBad.r]) + " m). Usa valores enteros en pesos, desde " +
                f.money(MIN_MATRIX_PRICE) + ", o deja la celda vacía.");
            }
          }
        }
        if (!isObject(matrix.category2) || !isNumber(matrix.category2.widthFrom) || matrix.category2.widthFrom <= 0 ||
            !isNumber(matrix.category2.projectionFrom) || matrix.category2.projectionFrom <= 0) {
          fail(name + ": los límites de la categoría 2 del motor deben ser medidas mayores que cero.");
        }
      });
    }

    // Motor
    if (!isObject(config.motor) || !isWholeAmount(config.motor.category1) || !isWholeAmount(config.motor.category2)) {
      fail("Motorización: los incrementos deben ser valores enteros en pesos.");
    }

    // Fabrics
    if (!Array.isArray(config.fabrics) || config.fabrics.length === 0) {
      fail("Faltan los tipos de lona.");
    } else {
      var fabricIds = {};
      config.fabrics.forEach(function (fabric, index) {
        var name = isObject(fabric) && hasText(fabric.label) ? "Lona " + fabric.label : "Lona " + (index + 1);
        if (!isObject(fabric)) {
          fail(name + ": formato inválido.");
          return;
        }
        if (!hasText(fabric.id) || fabricIds[fabric.id]) fail(name + ": identificador vacío o repetido.");
        fabricIds[fabric.id] = true;
        if (!hasText(fabric.label)) fail(name + ": falta el nombre.");
        if (!isNumber(fabric.increasePercent) || fabric.increasePercent < 0 || fabric.increasePercent > 1000) {
          fail(name + ": el incremento debe ser un porcentaje entre 0 y 1000.");
        }
        if (!isText(fabric.description)) fail(name + ": la descripción debe ser texto.");
      });
    }

    // Actuation texts
    ["manual", "motorized"].forEach(function (key) {
      var item = isObject(config.actuation) ? config.actuation[key] : null;
      if (!isObject(item) || !hasText(item.label) || !isText(item.description)) {
        fail("Accionamiento: faltan los textos del sistema " + (key === "manual" ? "manual." : "motorizado."));
      }
    });

    // Installation
    var inst = config.installation;
    if (!isObject(inst)) {
      fail("Falta la configuración de instalación.");
    } else {
      if (!isNumber(inst.lowerLimit) || inst.lowerLimit <= 0 || !isNumber(inst.upperLimit) || inst.upperLimit < inst.lowerLimit) {
        fail("Instalación: los límites de área deben ser mayores que cero y el superior no puede ser menor que el inferior.");
      }
      if (!isWholeAmount(inst.belowLowerValue)) fail("Instalación: el valor para áreas menores debe ser un entero en pesos.");
      if (!isWholeAmount(inst.aboveUpperValue)) fail("Instalación: el valor para áreas mayores debe ser un entero en pesos.");
      if (inst.betweenValue !== null && !isWholeAmount(inst.betweenValue)) {
        fail("Instalación: el valor para el rango intermedio debe ser un entero en pesos o quedar vacío (pendiente).");
      }
    }

    // Transport
    if (!Array.isArray(config.transport)) {
      fail("Falta la lista de transporte por departamento.");
    } else {
      var transportIds = {};
      var transportNames = {};
      config.transport.forEach(function (item, index) {
        var name = isObject(item) && hasText(item.name) ? item.name : "Departamento " + (index + 1);
        if (!isObject(item)) {
          fail("Transporte: el registro " + (index + 1) + " no es válido.");
          return;
        }
        if (!hasText(item.id) || transportIds[item.id]) fail("Transporte: " + name + " tiene un identificador vacío o repetido.");
        transportIds[item.id] = true;
        if (!hasText(item.name)) {
          fail("Transporte: el registro " + (index + 1) + " no tiene nombre.");
        } else {
          var key = normalizeName(item.name);
          if (key === "otro") fail("Transporte: el nombre «Otro» está reservado para el valor personalizado.");
          if (transportNames[key]) fail("Transporte: el departamento " + item.name + " está repetido.");
          transportNames[key] = true;
        }
        if (!isWholeAmount(item.value)) fail("Transporte: el valor de " + name + " debe ser un entero en pesos.");
      });
    }

    // Tax
    var tax = config.tax;
    if (!isObject(tax)) {
      fail("Falta la configuración del IVA.");
    } else {
      if (!hasText(tax.name)) fail("Impuesto: falta el nombre.");
      if (!isNumber(tax.ratePercent) || tax.ratePercent < 0 || tax.ratePercent > 100) {
        fail("Impuesto: la tasa debe estar entre 0% y 100%.");
      }
      if (!isObject(tax.appliesTo) || typeof tax.appliesTo.products !== "boolean" ||
          typeof tax.appliesTo.installation !== "boolean" || typeof tax.appliesTo.transport !== "boolean") {
        fail("Impuesto: la base gravable no es válida.");
      }
    }

    // Quote
    var quote = config.quote;
    if (!isObject(quote)) {
      fail("Falta la configuración de la cotización.");
    } else {
      if (!hasText(quote.title)) fail("Cotización: falta el título.");
      if (!hasText(quote.productName)) fail("Cotización: falta el nombre del producto.");
      if (!isText(quote.numberPrefix) || quote.numberPrefix.length > 20) fail("Cotización: el prefijo debe ser texto de máximo 20 caracteres.");
      if (!isNumber(quote.nextNumber) || quote.nextNumber < 1 || Math.floor(quote.nextNumber) !== quote.nextNumber) {
        fail("Cotización: el siguiente número debe ser un entero mayor que cero.");
      }
      if (!isNumber(quote.numberDigits) || quote.numberDigits < 1 || quote.numberDigits > 10 || Math.floor(quote.numberDigits) !== quote.numberDigits) {
        fail("Cotización: los dígitos del número deben ser un entero entre 1 y 10.");
      }
      ["structureText", "fabricationText", "warrantyText", "validity", "paymentTerms", "deliveryTime"].forEach(function (key) {
        if (!isText(quote[key])) fail("Cotización: el campo «" + key + "» debe ser texto.");
      });
      if (!Array.isArray(quote.conditions) || !quote.conditions.every(isText)) {
        fail("Cotización: las condiciones comerciales deben ser una lista de textos.");
      }
    }

    return errors;
  }

  /** Loads the stored configuration, falling back to the defaults when missing or invalid. */
  function loadConfig() {
    var stored = readJSON(CONFIG_KEY);
    if (!stored) return { config: C.getDefaultConfig(), source: "default", errors: [] };
    var config = normalizeConfig(stored);
    var errors = validateConfig(config);
    if (errors.length) return { config: C.getDefaultConfig(), source: "invalid", errors: errors };
    return { config: config, source: "stored", errors: [] };
  }

  function saveConfig(config) {
    return writeJSON(CONFIG_KEY, config);
  }

  function loadDraft() {
    var draft = readJSON(DRAFT_KEY);
    return isObject(draft) ? draft : null;
  }

  function saveDraft(draft) {
    return writeJSON(DRAFT_KEY, draft);
  }

  /** Builds the backup file content. */
  function buildExport(config) {
    return JSON.stringify({ app: EXPORT_APP_ID, exportedAt: new Date().toISOString(), config: config }, null, 2);
  }

  /** Parses and validates a backup file. Also accepts a bare configuration object. */
  function parseImport(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { ok: false, errors: ["El archivo no es un JSON válido."] };
    }
    var raw = isObject(data) && data.app === EXPORT_APP_ID && isObject(data.config) ? data.config : data;
    var config = normalizeConfig(raw);
    var errors = validateConfig(config);
    return errors.length ? { ok: false, errors: errors } : { ok: true, config: config };
  }

  C.storage = {
    CONFIG_KEY: CONFIG_KEY,
    DRAFT_KEY: DRAFT_KEY,
    MIN_MATRIX_PRICE: MIN_MATRIX_PRICE,
    available: storageAvailable,
    clone: clone,
    normalizeName: normalizeName,
    normalizeConfig: normalizeConfig,
    validateConfig: validateConfig,
    isMatrixPrice: isMatrixPrice,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    loadDraft: loadDraft,
    saveDraft: saveDraft,
    buildExport: buildExport,
    parseImport: parseImport
  };
})(window.Cotizador = window.Cotizador || {});
