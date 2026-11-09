/**
 * App bootstrap: loads the configuration, wires the views to a small hash
 * router (#/calculadora, #/cotizacion, #/admin) and registers the service
 * worker when the app is served over http(s).
 */
(function (C) {
  "use strict";

  var dom = C.dom;
  var ROUTES = { calculadora: "view-calculator", cotizacion: "view-quote", admin: "view-admin" };
  var DEFAULT_TITLE = document.title;

  var config = null;
  var currentRoute = null;

  function getConfig() {
    return config;
  }

  /** Replaces and stores the configuration, then refreshes the calculator. Returns false if it could not be stored. */
  function setConfig(next) {
    config = next;
    var saved = C.storage.saveConfig(config);
    C.calculator.onConfigChange();
    return saved;
  }

  function formatQuoteNumber(quote, number) {
    var digits = String(number);
    while (digits.length < quote.numberDigits) digits = "0" + digits;
    return quote.numberPrefix + digits;
  }

  /** Assigns the next consecutive quote number and advances the counter. */
  function takeQuoteNumber() {
    var quote = config.quote;
    var number = formatQuoteNumber(quote, quote.nextNumber);
    quote.nextNumber += 1;
    C.storage.saveConfig(config);
    return number;
  }

  function showBanner(message) {
    var banner = dom.$("#banner");
    banner.textContent = message;
    banner.hidden = false;
  }

  function routeFromHash() {
    var name = location.hash.replace(/^#\/?/, "");
    return ROUTES[name] ? name : "calculadora";
  }

  function replaceHash(name) {
    try {
      history.replaceState(null, "", "#/" + name);
    } catch (error) {
      location.replace("#/" + name);
    }
  }

  function showView(name) {
    Object.keys(ROUTES).forEach(function (key) {
      document.getElementById(ROUTES[key]).hidden = key !== name;
    });
    document.body.className = document.body.className.replace(/\broute-\S+/g, "").trim() + " route-" + name;
    dom.$all(".app-nav a").forEach(function (link) {
      var active = link.dataset.route === name || (name === "cotizacion" && link.dataset.route === "calculadora");
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    currentRoute = name;
  }

  function onRoute() {
    var name = routeFromHash();
    if (name === currentRoute) return;
    if (currentRoute === "admin" && !C.admin.confirmLeave()) {
      replaceHash("admin");
      return;
    }
    if (name === "cotizacion" && !C.calculator.showQuote()) {
      replaceHash("calculadora");
      name = "calculadora";
      if (name === currentRoute) return;
    }
    showView(name);
    if (name === "admin") C.admin.open();
    if (name === "cotizacion") {
      C.quote.layout();
      document.title = C.quote.documentTitle() || DEFAULT_TITLE;
    } else {
      document.title = DEFAULT_TITLE;
    }
    window.scrollTo(0, 0);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register("sw.js").catch(function () {
      // Offline support is optional; the app works without it.
    });
  }

  function init() {
    var loaded = C.storage.loadConfig();
    config = loaded.config;
    if (!C.storage.available) {
      showBanner("Este navegador no permite guardar datos (por ejemplo, en modo privado). La calculadora funciona, pero los cambios y la numeración se perderán al cerrarla.");
    } else if (loaded.source === "invalid") {
      showBanner("La configuración guardada en este navegador no es válida y se cargaron los valores por defecto. Importa un respaldo en Administración.");
    }

    C.calculator.init();
    C.quote.init();
    C.admin.init();

    window.addEventListener("hashchange", onRoute);
    window.addEventListener("beforeunload", function (event) {
      if (C.admin.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    onRoute();
    registerServiceWorker();
    document.dispatchEvent(new CustomEvent("cotizador:ready"));
  }

  C.app = {
    getConfig: getConfig,
    setConfig: setConfig,
    takeQuoteNumber: takeQuoteNumber
  };

  document.addEventListener("DOMContentLoaded", init);
})(window.Cotizador = window.Cotizador || {});
