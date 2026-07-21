(function (root, factory) {
  "use strict";

  var core = root.TimesheetCore;
  var i18n = root.TimesheetI18n;
  var themes = root.TimesheetThemes;
  var api;

  if (!core && typeof require === "function") {
    core = require("./core.js");
  }
  if (!i18n && typeof require === "function") {
    i18n = require("./i18n.js");
  }
  if (!themes && typeof require === "function") {
    themes = require("./themes.js");
  }

  api = factory(root, core, i18n, themes);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetPreferences = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, core, i18n, themes) {
  "use strict";

  function create(options) {
    var elements = options.elements;

    function initialize() {
      populateLanguageSelect();
      populateThemeSelect();
      refresh();
    }

    function bind() {
      elements.closeButton.addEventListener("click", close);
      elements.dialog.addEventListener("click", onDialogClick);
      elements.dialog.addEventListener("close", onDialogClose);
      elements.dateFormatSelect.addEventListener("change", onDateFormatChange);
      elements.languageSelect.addEventListener("change", onLanguageChange);
      elements.themeSelect.addEventListener("change", onThemeChange);
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

    function populateThemeSelect() {
      elements.themeSelect.innerHTML = "";
      themes.getThemes().forEach(function (theme) {
        var option = root.document.createElement("option");
        option.value = theme.id;
        option.dataset.labelKey = theme.labelKey;
        elements.themeSelect.appendChild(option);
      });
    }

    function refresh() {
      Array.prototype.forEach.call(elements.themeSelect.options, function (option) {
        option.textContent = options.translate(option.dataset.labelKey);
      });
      sync();
    }

    function sync() {
      var preferences = options.getPreferences();

      elements.dateFormatSelect.value = preferences.dateFormat;
      elements.languageSelect.value = preferences.language;
      elements.themeSelect.value = preferences.theme;
      elements.themeSelect.dataset.preview = preferences.theme;
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

    function onThemeChange() {
      var value = elements.themeSelect.value;

      if (!themes.isSupportedTheme(value)) {
        sync();
        return;
      }

      options.onThemeChange(value);
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