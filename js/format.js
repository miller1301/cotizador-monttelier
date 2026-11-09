/**
 * Formatting and parsing helpers following Colombian conventions:
 * thousands separated by dots, decimals with a comma, amounts in whole pesos.
 *
 * Pure functions with no DOM access.
 */
(function (C) {
  "use strict";

  var NBSP = "\u00a0";
  var MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];

  /** 7201405 -> "7.201.405" (rounded to whole pesos). */
  function groupThousands(value) {
    var rounded = Math.round(value);
    var digits = String(Math.abs(rounded));
    var out = "";
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
      out += digits.charAt(i);
    }
    return (rounded < 0 ? "-" : "") + out;
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** 7201405 -> "$ 7.201.405". Missing values render as a dash. */
  function money(value) {
    return isNumber(value) ? "$" + NBSP + groupThousands(value) : "—";
  }

  /** 7201405 -> "7.201.405" (no currency sign), empty string for missing values. */
  function amount(value) {
    return isNumber(value) ? groupThousands(value) : "";
  }

  /** 5 -> "5,00" */
  function measure(value) {
    return isNumber(value) ? value.toFixed(2).replace(".", ",") : "";
  }

  /** 5 -> "5,00 m" */
  function meters(value) {
    return isNumber(value) ? measure(value) + NBSP + "m" : "—";
  }

  /** 15 -> "15,00 m²" */
  function area(value) {
    return isNumber(value) ? measure(value) + NBSP + "m²" : "—";
  }

  /** 25 -> "25%", 12.5 -> "12,5%" */
  function percent(value) {
    if (!isNumber(value)) return "—";
    var rounded = Math.round(value * 100) / 100;
    return String(rounded).replace(".", ",") + "%";
  }

  /** 1 -> "1 unidad", 3 -> "3 unidades" */
  function units(count) {
    return count === 1 ? "1 unidad" : count + " unidades";
  }

  /** Date -> "6 de noviembre de 2026" */
  function longDate(date) {
    return date.getDate() + " de " + MONTHS[date.getMonth()] + " de " + date.getFullYear();
  }

  /** Date -> "2026-11-06" (local time), used for file names. */
  function isoDate(date) {
    var month = String(date.getMonth() + 1);
    var day = String(date.getDate());
    return date.getFullYear() + "-" + (month.length < 2 ? "0" : "") + month + "-" + (day.length < 2 ? "0" : "") + day;
  }

  function clean(input) {
    return String(input === null || input === undefined ? "" : input).replace(/[\s\u00a0]+/g, "");
  }

  /**
   * Parses a decimal typed with a comma or a dot ("5,25", "5.25", "5,").
   * Returns null when empty and NaN when the text is not a valid number.
   */
  function parseDecimal(input) {
    if (typeof input === "number") return isFinite(input) ? input : NaN;
    var text = clean(input);
    if (!text) return null;
    if (!/^\d*[.,]?\d*$/.test(text) || /^[.,]$/.test(text)) return NaN;
    return parseFloat(text.replace(",", "."));
  }

  /** Parses a whole number ("3"). Returns null when empty and NaN when invalid. */
  function parseInteger(input) {
    if (typeof input === "number") return isFinite(input) && Math.floor(input) === input ? input : NaN;
    var text = clean(input);
    if (!text) return null;
    return /^\d+$/.test(text) ? parseInt(text, 10) : NaN;
  }

  /**
   * Parses an amount in pesos written in any usual way: "150000", "150.000",
   * "$ 150.000", "150,000" or "150.000,00". A final separator followed by one
   * or two digits is read as cents and rounded to whole pesos.
   * Returns null when empty and NaN when invalid (negative values included).
   */
  function parseMoney(input) {
    if (typeof input === "number") return isFinite(input) && input >= 0 ? Math.round(input) : NaN;
    var text = clean(input).replace(/^\$/, "");
    if (!text) return null;
    if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return NaN;
    var cents = text.match(/^(.*?)[.,](\d{1,2})$/);
    if (cents) {
      var whole = cents[1].replace(/[.,]/g, "");
      if (whole && !/^\d+$/.test(whole)) return NaN;
      return Math.round(parseFloat((whole || "0") + "." + cents[2]));
    }
    return parseInt(text.replace(/[.,]/g, ""), 10);
  }

  /** True when the text has a decimal part ("7.201.405,50"), which matrix prices must not have. */
  function hasCents(input) {
    return /[.,]\d{1,2}$/.test(clean(input));
  }

  C.format = {
    groupThousands: groupThousands,
    money: money,
    amount: amount,
    measure: measure,
    meters: meters,
    area: area,
    percent: percent,
    units: units,
    longDate: longDate,
    isoDate: isoDate,
    parseDecimal: parseDecimal,
    parseInteger: parseInteger,
    parseMoney: parseMoney,
    hasCents: hasCents
  };
})(window.Cotizador = window.Cotizador || {});
