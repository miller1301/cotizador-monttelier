/**
 * Pricing engine: pure functions over (config, input), no DOM access.
 *
 * Rules agreed with Monttelier (see README, "Reglas de cálculo"):
 * 1. The base price comes only from an exact cell of the selected matrix.
 *    Any other measure requires a special quote (no interpolation, no rounding of measures).
 * 2. Fabric increment = matrix base price x percent, rounded to pesos, per unit.
 *    It never applies to the motor, installation or transport.
 * 3. Motor increment per unit, by the category of the cell
 *    (category 2 = width and projection inside the matrix's category2 zone).
 * 4. Installation is charged once per quote, by total area (width x projection x quantity).
 * 5. Transport is charged once per quote, by department.
 * 6. Tax = taxable base x rate, rounded to pesos. The taxable base is set in config.tax.appliesTo.
 * The quote always computes both alternatives (manual and motorized) with the same parameters.
 */
(function (C) {
  "use strict";

  var EPSILON = 1e-6;
  var OTHER_DEPARTMENT_ID = "__other__";

  function indexOfValue(list, value) {
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(list[i] - value) < EPSILON) return i;
    }
    return -1;
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /** Exact cell lookup. Returns the price or null when the measure is not in the matrix. */
  function lookupBasePrice(matrix, width, projection) {
    var col = indexOfValue(matrix.widths, width);
    var row = indexOfValue(matrix.projections, projection);
    if (col < 0 || row < 0) return null;
    var price = matrix.prices[row][col];
    return typeof price === "number" && isFinite(price) && price > 0 ? price : null;
  }

  /** Motor category of a measure: 2 inside the matrix's category2 zone, 1 otherwise. */
  function motorCategory(matrix, width, projection) {
    var zone = matrix.category2;
    return width >= zone.widthFrom - EPSILON && projection >= zone.projectionFrom - EPSILON ? 2 : 1;
  }

  function motorIncrement(config, category) {
    return category === 2 ? config.motor.category2 : config.motor.category1;
  }

  function fabricIncrement(basePrice, fabric) {
    return Math.round(basePrice * fabric.increasePercent / 100);
  }

  /**
   * Installation rule by total area.
   * rule: "below" (< lowerLimit), "between" (lowerLimit..upperLimit, inclusive) or "above" (> upperLimit).
   * value is null when the "between" rule is still pending.
   */
  function installationByArea(installation, totalArea) {
    if (totalArea < installation.lowerLimit - EPSILON) {
      return { rule: "below", value: installation.belowLowerValue };
    }
    if (totalArea > installation.upperLimit + EPSILON) {
      return { rule: "above", value: installation.aboveUpperValue };
    }
    var between = installation.betweenValue;
    return { rule: "between", value: typeof between === "number" ? between : null };
  }

  /** Tax over the configured taxable base, rounded to pesos. */
  function taxFor(config, amounts) {
    var applies = config.tax.appliesTo;
    var base = (applies.products ? amounts.products : 0) +
      (applies.installation ? amounts.installation : 0) +
      (applies.transport ? amounts.transport : 0);
    return { base: base, value: Math.round(base * config.tax.ratePercent / 100) };
  }

  function issue(field, kind, message) {
    return { field: field, kind: kind, message: message };
  }

  /** kind: "missing" (not filled yet), "invalid" (wrong value) or "special" (needs a special quote). */
  function checkMeasure(value, field, label, issues) {
    if (value === null || value === undefined) {
      issues.push(issue(field, "missing", "Ingresa " + label.toLowerCase() + " en metros."));
      return null;
    }
    if (typeof value !== "number" || isNaN(value)) {
      issues.push(issue(field, "invalid", label + ": escribe un número en metros, por ejemplo 5,25."));
      return null;
    }
    if (value <= 0) {
      issues.push(issue(field, "invalid", label + " debe ser mayor que cero."));
      return null;
    }
    return value;
  }

  function checkQuantity(value, issues) {
    if (value === null || value === undefined) {
      issues.push(issue("quantity", "missing", "Ingresa la cantidad de unidades."));
      return null;
    }
    if (typeof value !== "number" || isNaN(value) || value < 1 || Math.floor(value) !== value) {
      issues.push(issue("quantity", "invalid", "La cantidad debe ser un número entero mayor que cero."));
      return null;
    }
    return value;
  }

  function resolveInstallation(config, input, totalArea, issues) {
    var info = { rule: null, ruleValue: null, manual: !!input.installationManual, value: null };
    if (totalArea !== null) {
      var byArea = installationByArea(config.installation, totalArea);
      info.rule = byArea.rule;
      info.ruleValue = byArea.value;
    }
    if (info.manual) {
      var manual = input.installationManualValue;
      if (manual === null || manual === undefined) {
        issues.push(issue("installation", "missing", "Escribe el valor de instalación."));
      } else if (typeof manual !== "number" || isNaN(manual) || manual < 0) {
        issues.push(issue("installation", "invalid", "El valor de instalación no es válido."));
      } else {
        info.value = manual;
      }
    } else if (info.rule === "between" && info.ruleValue === null) {
      var limits = config.installation;
      issues.push(issue("installation", "missing",
        "El valor de instalación para un área total entre " + C.format.area(limits.lowerLimit) +
        " y " + C.format.area(limits.upperLimit) + " está pendiente de definir. " +
        "Activa «Ajustar valor manualmente» y escríbelo."));
    } else {
      info.value = info.ruleValue;
    }
    return info;
  }

  function resolveTransport(config, input, issues) {
    var info = { departmentId: input.departmentId || null, isOther: false, label: null, value: null };
    if (!input.departmentId) {
      issues.push(issue("department", "missing", "Selecciona el departamento."));
      return info;
    }
    if (input.departmentId === OTHER_DEPARTMENT_ID) {
      info.isOther = true;
      info.label = String(input.otherDepartmentName || "").trim() || "Otro";
      var value = input.otherTransportValue;
      if (value === null || value === undefined) {
        issues.push(issue("transport", "missing", "Escribe el valor del transporte."));
      } else if (typeof value !== "number" || isNaN(value) || value < 0) {
        issues.push(issue("transport", "invalid", "El valor del transporte no es válido."));
      } else {
        info.value = value;
      }
      return info;
    }
    var department = findById(config.transport, input.departmentId);
    if (!department) {
      issues.push(issue("department", "missing", "El departamento seleccionado ya no existe. Selecciona otro."));
      return info;
    }
    info.label = department.name;
    info.value = department.value;
    return info;
  }

  function buildAlternative(config, parts, motorized) {
    var quantity = parts.quantity;
    var unitMotor = motorized ? parts.unitMotorIncrement : 0;
    var alternative = {
      actuation: motorized ? "motorized" : "manual",
      unitPrice: parts.unitBasePrice + parts.unitFabricIncrement + unitMotor,
      baseTotal: parts.unitBasePrice * quantity,
      fabricTotal: parts.unitFabricIncrement * quantity,
      motorTotal: unitMotor * quantity,
      products: 0,
      installation: parts.installation,
      transport: parts.transport,
      subtotal: null,
      taxableBase: null,
      tax: null,
      total: null
    };
    alternative.products = alternative.baseTotal + alternative.fabricTotal + alternative.motorTotal;
    if (parts.installation !== null && parts.transport !== null) {
      alternative.subtotal = alternative.products + parts.installation + parts.transport;
      var tax = taxFor(config, alternative);
      alternative.taxableBase = tax.base;
      alternative.tax = tax.value;
      alternative.total = alternative.subtotal + tax.value;
    }
    return alternative;
  }

  /**
   * Computes everything the calculator and the quote need.
   *
   * input: {
   *   matrixId, width, projection, quantity,            // numbers, null (empty) or NaN (invalid)
   *   actuation: "manual" | "motorized", fabricId,
   *   departmentId, otherDepartmentName, otherTransportValue,
   *   installationManual: boolean, installationManualValue
   * }
   *
   * Returns partial results while data is missing; `complete` is true only when
   * there are no issues and both alternatives have a total.
   */
  function calculate(config, input) {
    var issues = [];
    var result = {
      complete: false,
      issues: issues,
      matrix: null,
      width: null,
      projection: null,
      quantity: null,
      unitArea: null,
      totalArea: null,
      inMatrix: null,
      category: null,
      fabric: null,
      actuation: input.actuation === "motorized" ? "motorized" : "manual",
      unitBasePrice: null,
      unitFabricIncrement: null,
      unitMotorIncrement: null,
      installation: null,
      transport: null,
      alternatives: null,
      selected: null
    };

    result.width = checkMeasure(input.width, "width", "El ancho", issues);
    result.projection = checkMeasure(input.projection, "projection", "La proyección", issues);

    result.matrix = input.matrixId ? findById(config.matrices, input.matrixId) : null;
    if (!result.matrix) {
      issues.push(issue("matrix", "missing", "Selecciona la configuración de instalación."));
    }

    result.quantity = checkQuantity(input.quantity, issues);

    result.fabric = findById(config.fabrics, input.fabricId);
    if (!result.fabric) {
      issues.push(issue("fabric", "missing", "Selecciona el tipo de lona."));
    }

    if (result.width !== null && result.projection !== null) {
      result.unitArea = result.width * result.projection;
      if (result.quantity !== null) result.totalArea = result.unitArea * result.quantity;
    }

    if (result.matrix && result.width !== null && result.projection !== null) {
      var base = lookupBasePrice(result.matrix, result.width, result.projection);
      result.inMatrix = base !== null;
      if (base === null) {
        issues.push(issue("special", "special",
          "La medida " + C.format.measure(result.width) + " m × " + C.format.measure(result.projection) +
          " m no está en la lista de precios de " + result.matrix.label + ". Requiere cotización especial."));
      } else {
        result.unitBasePrice = base;
        result.category = motorCategory(result.matrix, result.width, result.projection);
        result.unitMotorIncrement = motorIncrement(config, result.category);
        if (result.fabric) result.unitFabricIncrement = fabricIncrement(base, result.fabric);
      }
    }

    result.installation = resolveInstallation(config, input, result.totalArea, issues);
    result.transport = resolveTransport(config, input, issues);

    if (result.unitBasePrice !== null && result.unitFabricIncrement !== null && result.quantity !== null) {
      var parts = {
        quantity: result.quantity,
        unitBasePrice: result.unitBasePrice,
        unitFabricIncrement: result.unitFabricIncrement,
        unitMotorIncrement: result.unitMotorIncrement,
        installation: result.installation.value,
        transport: result.transport.value
      };
      result.alternatives = {
        manual: buildAlternative(config, parts, false),
        motorized: buildAlternative(config, parts, true)
      };
      result.selected = result.alternatives[result.actuation];
    }

    result.complete = issues.length === 0 && !!result.selected && result.selected.total !== null &&
      result.alternatives.manual.total !== null;
    return result;
  }

  C.pricing = {
    OTHER_DEPARTMENT_ID: OTHER_DEPARTMENT_ID,
    calculate: calculate,
    lookupBasePrice: lookupBasePrice,
    motorCategory: motorCategory,
    installationByArea: installationByArea,
    findById: findById
  };
})(window.Cotizador = window.Cotizador || {});
