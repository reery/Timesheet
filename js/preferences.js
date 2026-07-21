(function (root, factory) {
  "use strict";

  var core = root.TimesheetCore;
  var i18n = root.TimesheetI18n;
  var designs = root.TimesheetDesigns;
  var api;

  if (!core && typeof require === "function") {
    core = require("./core.js");
  }
  if (!i18n && typeof require === "function") {
    i18n = require("./i18n.js");
  }
  if (!designs && typeof require === "function") {
    designs = require("./designs.js");
  }

  api = factory(root, core, i18n, designs);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetPreferences = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, core, i18n, designs) {
  "use strict";

  function create(options) {
    var elements = options.elements;

    function initialize() {
      populateLanguageSelect();
      populateDesignSelect();
      refresh();
    }

    function bind() {
      elements.closeButton.addEventListener("click", close);
      elements.dialog.addEventListener("click", onDialogClick);
      elements.dialog.addEventListener("close", onDialogClose);
      elements.dateFormatSelect.addEventListener("change", onDateFormatChange);
      elements.languageSelect.addEventListener("change", onLanguageChange);
      elements.designSelect.addEventListener("change", onDesignChange);
    }

    function populateLanguageSelect() {
      elements.languageSelect.innerHTML = "";
      i18n.getLanguages().forEach(function (language) {
        var option = root.document.createElement("option");
        option.value = language.id;
        option.textContent = language.name;
        elements.languageSelect.appendChild(option);
      });
    }

    function populateDesignSelect() {
      elements.designSelect.innerHTML = "";
      designs.getDesigns().forEach(function (design) {
        var option = root.document.createElement("option");
        option.value = design.id;
        option.dataset.labelKey = design.labelKey;
        elements.designSelect.appendChild(option);
      });
    }

    function refresh() {
      Array.prototype.forEach.call(elements.designSelect.options, function (option) {
        option.textContent = options.translate(option.dataset.labelKey);
      });
      sync();
    }

    function sync() {
      var preferences = options.getPreferences();

      elements.dateFormatSelect.value = preferences.dateFormat;
      elements.languageSelect.value = preferences.language;
      elements.designSelect.value = preferences.design;
      elements.designSelect.dataset.preview = preferences.design;
    }

    function open() {
      sync();
      root.document.body.classList.add("settings-open");
      elements.dialog.showModal();
    }

    function close() {
      if (elements.dialog.open) {
        root.document.body.classList.remove("settings-open");
        elements.dialog.close();
      }
    }

    function onDialogClick(event) {
      if (event.target === elements.dialog) {
        close();
      }
    }

    function onDialogClose() {
      root.document.body.classList.remove("settings-open");
      options.focusReturn();
    }

    function onDateFormatChange() {
      var value = elements.dateFormatSelect.value;

      if (!core.isSupportedDateFormat(value)) {
        sync();
        return;
      }

      options.onDateFormatChange(value);
    }

    function onLanguageChange() {
      var value = elements.languageSelect.value;

      if (!i18n.isSupportedLanguage(value)) {
        sync();
        return;
      }

      options.onLanguageChange(value);
    }

    function onDesignChange() {
      var value = elements.designSelect.value;

      if (!designs.isSupportedDesign(value)) {
        sync();
        return;
      }

      options.onDesignChange(value);
    }

    return {
      initialize: initialize,
      bind: bind,
      refresh: refresh,
      sync: sync,
      open: open,
      close: close
    };
  }

  return { create: create };
});