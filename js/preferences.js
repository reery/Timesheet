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

  var WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
      elements.deleteLocalDataButton.addEventListener("click", openDeleteDialog);
      elements.deleteDataDialog.addEventListener("click", onDeleteDialogClick);
      elements.deleteDataDialog.addEventListener("keydown", onDeleteDialogKeyDown);
      elements.deleteDataDialog.addEventListener("close", onDeleteDialogClose);
      elements.confirmDeleteDataButton.addEventListener("click", function () {
        runDeleteAction(options.onDeleteLocalData);
      });
      elements.backupDeleteDataButton.addEventListener("click", function () {
        runDeleteAction(options.onBackupAndDelete);
      });
      elements.cancelDeleteDataButton.addEventListener("click", closeDeleteDialog);
      elements.dateFormatSelect.addEventListener("change", onDateFormatChange);
      elements.languageSelect.addEventListener("change", onLanguageChange);
      elements.themeSelect.addEventListener("change", onThemeChange);
      elements.workDayStartSelect.addEventListener("change", onWorkDayRangeChange);
      elements.workDayEndSelect.addEventListener("change", onWorkDayRangeChange);
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

    function populateWorkDaySelects() {
      var weekdays = i18n.getCalendar(options.getPreferences().language).weekdays;

      [elements.workDayStartSelect, elements.workDayEndSelect].forEach(function (select) {
        select.innerHTML = "";
        WEEKDAY_ORDER.forEach(function (day) {
          var option = root.document.createElement("option");
          option.value = String(day);
          option.textContent = weekdays[day];
          select.appendChild(option);
        });
      });
    }

    function refresh() {
      populateWorkDaySelects();
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
      elements.workDayStartSelect.value = String(preferences.workDayRange.start);
      elements.workDayEndSelect.value = String(preferences.workDayRange.end);
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

    function openDeleteDialog() {
      clearDeleteError();
      elements.deleteDataDialog.showModal();
      elements.cancelDeleteDataButton.focus({ preventScroll: true });
    }

    function closeDeleteDialog() {
      if (elements.deleteDataDialog.open) {
        elements.deleteDataDialog.close();
      }
    }

    function clearDeleteError() {
      elements.deleteDataError.hidden = true;
      elements.deleteDataError.textContent = "";
    }

    function showDeleteError(result) {
      var key = result.messageKey || result.errorKey;
      var parameters = result.messageParams || result.errorParams;
      var fallback = result.message || result.error;

      elements.deleteDataError.textContent = options.translate(key, parameters, fallback);
      elements.deleteDataError.hidden = false;
    }

    function runDeleteAction(action) {
      var result = action();

      if (result.ok) {
        closeDeleteDialog();
        return;
      }

      showDeleteError(result);
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

    function onDeleteDialogClick(event) {
      if (event.target === elements.deleteDataDialog) {
        closeDeleteDialog();
      }
    }

    function onDeleteDialogKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeDeleteDialog();
      }
    }

    function onDeleteDialogClose() {
      clearDeleteError();
      if (elements.dialog.open) {
        elements.deleteLocalDataButton.focus({ preventScroll: true });
      }
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

    function onWorkDayRangeChange() {
      var workDayRange = {
        start: Number(elements.workDayStartSelect.value),
        end: Number(elements.workDayEndSelect.value)
      };

      if (!core.isValidWorkDayRange(workDayRange)) {
        sync();
        return;
      }

      options.onWorkDayRangeChange(workDayRange);
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