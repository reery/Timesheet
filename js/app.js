(function (root) {
  "use strict";

  var i18n = root.TimesheetI18n;
  var themes = root.TimesheetThemes;
  var model = root.TimesheetModel;
  var storageApi = root.TimesheetStorage;
  var APP_VERSION = "v0.6";
  var SAVE_DELAY_MS = 250;
  var browserStorage = storageApi.getBrowserStorage();
  var storageKey = getStorageKey();
  var loadResult = storageApi.loadState(browserStorage, storageKey);
  var state = loadResult.state;
  var storageWritable = loadResult.ok;
  var storageEditMessageKey = loadResult.editMessageKey || "storage.unreadableEdit";
  var elements = {};
  var currentStatus = null;
  var pendingSaveTimer = null;
  var hasPendingSave = false;
  var menuController;
  var preferencesController;
  var ledgerController;

  function getStorageKey() {
    var requestedKey;

    try {
      requestedKey = new URLSearchParams(root.location.search).get("storageKey");
    } catch (error) {
      requestedKey = null;
    }

    return requestedKey && /^local-timesheet\.test\.[a-z0-9.-]+$/i.test(requestedKey)
      ? requestedKey
      : storageApi.STORAGE_KEY;
  }

  function initialize() {
    cacheElements();
    initializePreferences();
    initializeMenu();
    initializeLedger();
    initializeVersion();
    applyPreferences();
    bindEvents();

    if (loadResult.message) {
      setDiagnosticStatus(loadResult, "error");
    } else {
      setStatus("storage.saved", "success");
    }

    ledgerController.initialize();

    document.body.dataset.appStatus = "ready";
  }

  function cacheElements() {
    [
      "saveStatus", "restoreInput", "settingsButton",
      "menuButton", "headerActions", "settingsDialog", "settingsCloseButton",
      "dateFormatSelect", "languageSelect", "themeSelect",
      "workDayStartSelect", "workDayEndSelect",
      "deleteLocalDataButton", "deleteDataDialog", "deleteDataError",
      "confirmDeleteDataButton", "backupDeleteDataButton", "cancelDeleteDataButton",
      "previousMonth", "monthSelect", "yearInput", "nextMonth", "todayButton",
      "weeklyHours", "scheduleMessage", "dailyTarget",
      "monthWorked", "monthWorkedDecimal",
      "monthExpected", "monthExpectedDecimal", "monthBalanceMetric", "monthBalance",
      "timesheetColgroup", "ledgerHeaderRow", "ledgerBody"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
    });
    elements.statusText = elements.saveStatus.querySelector("[data-status-text]");
  }

  function initializeMenu() {
    menuController = root.TimesheetMenu.create({
      menuButton: elements.menuButton,
      actionsElement: elements.headerActions,
      translate: translate,
      actionHandlers: {
        backup: downloadBackup,
        restore: function () {
          elements.restoreInput.click();
        },
        preferences: preferencesController.open
      }
    });
  }

  function initializePreferences() {
    preferencesController = root.TimesheetPreferences.create({
      elements: {
        dialog: elements.settingsDialog,
        closeButton: elements.settingsCloseButton,
        dateFormatSelect: elements.dateFormatSelect,
        languageSelect: elements.languageSelect,
        themeSelect: elements.themeSelect,
        workDayStartSelect: elements.workDayStartSelect,
        workDayEndSelect: elements.workDayEndSelect,
        deleteLocalDataButton: elements.deleteLocalDataButton,
        deleteDataDialog: elements.deleteDataDialog,
        deleteDataError: elements.deleteDataError,
        confirmDeleteDataButton: elements.confirmDeleteDataButton,
        backupDeleteDataButton: elements.backupDeleteDataButton,
        cancelDeleteDataButton: elements.cancelDeleteDataButton
      },
      getPreferences: function () {
        return state.preferences;
      },
      translate: translate,
      focusReturn: function () {
        menuController.focusReturn(elements.settingsButton);
      },
      onDateFormatChange: onDateFormatChange,
      onLanguageChange: onLanguageChange,
      onThemeChange: onThemeChange,
      onWorkDayRangeChange: onWorkDayRangeChange,
      onDeleteLocalData: deleteLocalData,
      onBackupAndDelete: backupAndDelete
    });
    preferencesController.initialize();
  }

  function initializeLedger() {
    ledgerController = root.TimesheetLedger.create({
      elements: {
        previousMonth: elements.previousMonth,
        monthSelect: elements.monthSelect,
        yearInput: elements.yearInput,
        nextMonth: elements.nextMonth,
        todayButton: elements.todayButton,
        weeklyHours: elements.weeklyHours,
        scheduleMessage: elements.scheduleMessage,
        dailyTarget: elements.dailyTarget,
        monthWorked: elements.monthWorked,
        monthWorkedDecimal: elements.monthWorkedDecimal,
        monthExpected: elements.monthExpected,
        monthExpectedDecimal: elements.monthExpectedDecimal,
        monthBalanceMetric: elements.monthBalanceMetric,
        monthBalance: elements.monthBalance,
        timesheetColgroup: elements.timesheetColgroup,
        ledgerHeaderRow: elements.ledgerHeaderRow,
        ledgerBody: elements.ledgerBody
      },
      getState: function () {
        return state;
      },
      canPersist: function () {
        return storageWritable;
      },
      persistState: persistState,
      queuePersistState: queuePersistState,
      flushPendingState: flushPendingState,
      setStatus: setStatus,
      translate: translate
    });
  }

  function initializeVersion() {
    document.querySelectorAll("[data-app-version]").forEach(function (element) {
      element.textContent = APP_VERSION;
    });
    document.querySelectorAll("[data-about-version]").forEach(function (element) {
      element.textContent = "Timesheet " + APP_VERSION;
    });
  }

  function translate(key, parameters, fallback) {
    var value = key ? i18n.translate(state.preferences.language, key, parameters) : "";

    if ((!value || value === key) && fallback) {
      return fallback;
    }

    return value;
  }

  function translateDiagnostic(key, parameters, fallback) {
    var resolvedParameters = Object.assign({}, parameters || {});

    if (resolvedParameters.errorKey) {
      resolvedParameters.error = translate(
        resolvedParameters.errorKey,
        resolvedParameters.errorParams,
        resolvedParameters.error || ""
      );
    }

    return translate(key, resolvedParameters, fallback);
  }

  function translateStaticContent() {
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (element) {
      element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (element) {
      element.title = translate(element.dataset.i18nTitle);
    });
  }

  function applyLanguage() {
    document.documentElement.lang = state.preferences.language;
    translateStaticContent();
    ledgerController.refreshLanguage();
    menuController.refresh();
    preferencesController.refresh();

    if (currentStatus) {
      renderStatus();
    }
  }

  function applyTheme() {
    var theme = themes.isSupportedTheme(state.preferences.theme)
      ? state.preferences.theme
      : themes.DEFAULT_THEME;

    document.documentElement.dataset.theme = theme;
    elements.themeSelect.dataset.preview = theme;
  }

  function applyPreferences() {
    applyLanguage();
    applyTheme();
    preferencesController.sync();
  }

  function bindEvents() {
    menuController.bind();
    preferencesController.bind();
    ledgerController.bind();
    elements.restoreInput.addEventListener("change", restoreBackup);
    root.addEventListener("pagehide", flushPendingState);
    document.addEventListener("visibilitychange", flushWhenHidden);
  }

  function flushWhenHidden() {
    if (document.hidden) {
      flushPendingState();
    }
  }

  function onDateFormatChange(value) {
    state.preferences.dateFormat = value;
    persistState();
    ledgerController.render();
  }

  function onLanguageChange(value) {
    state.preferences.language = value;
    applyLanguage();
    persistState();
    ledgerController.render();
  }

  function onThemeChange(value) {
    state.preferences.theme = value;
    applyTheme();
    preferencesController.sync();
    persistState();
  }

  function onWorkDayRangeChange(workDayRange) {
    state.preferences.workDayRange = {
      start: workDayRange.start,
      end: workDayRange.end
    };
    persistState();
    ledgerController.render();
  }

  function setStatus(key, tone, parameters, fallback) {
    currentStatus = {
      key: key,
      parameters: parameters || {},
      fallback: fallback || "",
      tone: tone || "neutral"
    };
    renderStatus();
  }

  function renderStatus() {
    var message = translateDiagnostic(
      currentStatus.key,
      currentStatus.parameters,
      currentStatus.fallback
    );

    elements.statusText.textContent = message;
    elements.saveStatus.dataset.tone = currentStatus.tone;
    elements.saveStatus.title = message;
  }

  function setDiagnosticStatus(result, tone) {
    setStatus(
      result.messageKey || result.errorKey,
      tone,
      result.messageParams || result.errorParams,
      result.message || result.error
    );
  }

  function clearPendingSave() {
    if (pendingSaveTimer !== null) {
      root.clearTimeout(pendingSaveTimer);
      pendingSaveTimer = null;
    }

    hasPendingSave = false;
  }

  function queuePersistState() {
    if (!storageWritable) {
      setStatus(storageEditMessageKey, "error");
      return false;
    }

    if (!hasPendingSave) {
      setStatus("storage.saving", "neutral");
    }

    hasPendingSave = true;
    if (pendingSaveTimer !== null) {
      root.clearTimeout(pendingSaveTimer);
    }
    pendingSaveTimer = root.setTimeout(flushPendingState, SAVE_DELAY_MS);
    return true;
  }

  function flushPendingState() {
    if (!hasPendingSave) {
      return true;
    }

    return persistState();
  }

  function persistState() {
    var result;

    clearPendingSave();

    if (!storageWritable) {
      setStatus(storageEditMessageKey, "error");
      return false;
    }

    result = storageApi.saveState(browserStorage, state, storageKey);
    setDiagnosticStatus(result, result.ok ? "success" : "error");
    return result.ok;
  }

  function downloadBackup() {
    var json;
    var blob;
    var url;
    var link;
    var result;

    flushPendingState();

    try {
      json = storageApi.serializeBackup(state);
      blob = new Blob([json], { type: "application/json" });
      url = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = url;
      link.download = "timesheet-backup-" + ledgerController.getTodayKey() + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 0);
      result = {
        ok: true,
        message: "Backup downloaded",
        messageKey: "backup.downloaded",
        messageParams: {}
      };
    } catch (error) {
      result = {
        ok: false,
        message: "The backup could not be created.",
        messageKey: "backup.createFailed",
        messageParams: {}
      };
    }

    setDiagnosticStatus(result, result.ok ? "success" : "error");
    return result;
  }

  function backupAndDelete() {
    var backupResult = downloadBackup();

    if (!backupResult.ok) {
      return backupResult;
    }

    return deleteLocalData();
  }

  function deleteLocalData() {
    var result = storageApi.deleteState(browserStorage, storageKey);

    if (!result.ok) {
      setDiagnosticStatus(result, "error");
      return result;
    }

    clearPendingSave();
    state = model.createEmptyState();
    storageWritable = true;
    applyPreferences();
    ledgerController.render();
    setDiagnosticStatus(result, "success");
    return result;
  }

  function restoreBackup() {
    var file = elements.restoreInput.files && elements.restoreInput.files[0];
    var reader;

    if (!file) {
      return;
    }

    if (file.size > storageApi.MAX_BACKUP_BYTES) {
      setStatus("backup.tooLarge", "error", {
        limit: storageApi.MAX_BACKUP_BYTES / (1024 * 1024)
      });
      elements.restoreInput.value = "";
      return;
    }

    reader = new FileReader();
    reader.addEventListener("load", function () {
      applyBackup(String(reader.result || ""));
      elements.restoreInput.value = "";
    });
    reader.addEventListener("error", function () {
      setStatus("backup.readFailed", "error");
      elements.restoreInput.value = "";
    });
    reader.readAsText(file);
  }

  function applyBackup(text) {
    var parsed = storageApi.parseBackup(text);
    var merged;
    var result;

    if (!parsed.valid) {
      setDiagnosticStatus(parsed, "error");
      return;
    }

    if (!root.confirm(translate(
      parsed.includesPreferences ? "restore.confirmPreferences" : "restore.confirm"
    ))) {
      if (!flushPendingState()) {
        return;
      }
      setStatus("restore.cancelled", "neutral");
      return;
    }

    if (!flushPendingState()) {
      return;
    }

    merged = model.mergeStates(state, parsed.state, {
      includePreferences: parsed.includesPreferences
    });
    model.ensureMonthSchedule(merged, ledgerController.getViewMonth());
    result = storageApi.saveState(browserStorage, merged, storageKey);

    if (!result.ok) {
      setDiagnosticStatus(result, "error");
      return;
    }

    state = merged;
    storageWritable = true;
    applyPreferences();
    ledgerController.render();
    setStatus("restore.saved", "success");
  }

  root.TimesheetApp = {
    getState: function () {
      return model.cloneState(state);
    },
    getViewMonth: function () {
      return ledgerController.getViewMonth();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})(window);