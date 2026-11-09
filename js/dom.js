/**
 * Small DOM helpers shared by the views.
 */
(function (C) {
  "use strict";

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

  /** Escapes text before inserting it into an HTML string. */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (ch) {
      return HTML_ESCAPES[ch];
    });
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (child) { append(node, child); });
      return;
    }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  }

  /**
   * Creates an element. attrs: "class", "text", "dataset", on<event> handlers,
   * booleans (true sets an empty attribute) and any other attribute as text.
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") Object.keys(value).forEach(function (name) { node.dataset[name] = value[name]; });
      else if (key.indexOf("on") === 0 && typeof value === "function") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    append(node, children);
    return node;
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  var toastTimer = null;

  /** Short status message at the bottom of the screen. kind: "ok" | "error". */
  function toast(message, kind) {
    var node = document.getElementById("toast");
    if (!node) return;
    node.textContent = message;
    node.className = "toast is-visible" + (kind === "error" ? " toast--error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.className = "toast"; }, kind === "error" ? 6000 : 3500);
  }

  /** Shows or hides an element and sets its text in one call. */
  function setMessage(node, message) {
    node.textContent = message || "";
    node.hidden = !message;
  }

  C.dom = {
    $: $,
    $all: $all,
    escapeHtml: escapeHtml,
    el: el,
    debounce: debounce,
    toast: toast,
    setMessage: setMessage
  };
})(window.Cotizador = window.Cotizador || {});
