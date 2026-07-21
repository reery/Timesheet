(function (root, factory) {
  "use strict";

  var core = root.TimesheetCore;
  var i18n = root.TimesheetI18n;
  var api;

  if (!core && typeof require === "function") {
    core = require("./core.js");
  }
  if (!i18n && typeof require === "function") {
    i18n = require("./i18n.js");
  }

  api = factory(core, i18n, root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, i18n, host) {
  "use strict";

  var STORAGE_KEY = "local-timesheet.state.v1";
  var SCHEMA_VERSION = 1;
  var BACKUP_FORMAT = "local-timesheet-backup";
  var ENTRY_FIELDS = ["start", "finish", "breakStart", "breakFinish"];
  var SUPPORTED_LANGUAGES = i18n.SUPPORTED_LANGUAGES.slice();
  var SUPPORTED_DESIGNS = ["default-gradient", "midnight-fog", "ember-coast"];

  function createDefaultPreferences() {
    return {
      language: "en",
      design: "default-gradient",
      dateFormat: core.DATE_FORMATS.ISO
    };
  }

  function createEmptyState() {
    return {
      version: SCHEMA_VERSION,
      entries: {},
      schedules: {},
      preferences: createDefaultPreferences()
    };
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object") {
      return false;
    }

    return Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null;
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function cloneEntry(entry) {
    var copy = {};

    ENTRY_FIELDS.forEach(function (field) {
      copy[field] = entry[field] || "";
    });
    copy.absence = entry.absence === true;

    return copy;
  }

  function clonePreferences(preferences) {
    var source = preferences || createDefaultPreferences();

    return {
      language: source.language,
      design: source.design,
      dateFormat: source.dateFormat
    };
  }

  function cloneState(state) {
    var copy = createEmptyState();

    Object.keys(state.entries).forEach(function (dateKey) {
      copy.entries[dateKey] = cloneEntry(state.entries[dateKey]);
    });

    Object.keys(state.schedules).forEach(function (monthKey) {
      copy.schedules[monthKey] = Number(state.schedules[monthKey]);
    });

    copy.preferences = clonePreferences(state.preferences);

    return copy;
  }

  function validateState(candidate) {
    var normalized = createEmptyState();
    var invalidEntry;
    var invalidSchedule;

    if (!isPlainObject(candidate)) {
      return invalid("The saved data is not an object.", "storage.invalid.object");
    }

    if (candidate.version !== SCHEMA_VERSION) {
      return invalid("The saved data uses an unsupported version.", "storage.invalid.version");
    }

    if (!isPlainObject(candidate.entries) || !isPlainObject(candidate.schedules)) {
      return invalid("The saved data has an invalid structure.", "storage.invalid.structure");
    }

    if (hasOwn(candidate, "preferences")) {
      if (!isPlainObject(candidate.preferences)
          || SUPPORTED_LANGUAGES.indexOf(candidate.preferences.language) === -1
          || SUPPORTED_DESIGNS.indexOf(candidate.preferences.design) === -1
          || !core.isSupportedDateFormat(candidate.preferences.dateFormat)) {
        return invalid("The saved preferences are invalid.", "storage.invalid.preferences");
      }

      normalized.preferences = clonePreferences(candidate.preferences);
    }

    Object.keys(candidate.entries).some(function (dateKey) {
      var entry = candidate.entries[dateKey];
      var normalizedEntry = {};

      if (!core.parseIsoDate(dateKey) || !isPlainObject(entry)) {
        invalidEntry = dateKey;
        return true;
      }

      if (ENTRY_FIELDS.some(function (field) {
        if (!hasOwn(entry, field) || typeof entry[field] !== "string" || entry[field].length > 20) {
          return true;
        }

        normalizedEntry[field] = entry[field];
        return false;
      })) {
        invalidEntry = dateKey;
        return true;
      }

      if (hasOwn(entry, "absence") && typeof entry.absence !== "boolean") {
        invalidEntry = dateKey;
        return true;
      }

      normalizedEntry.absence = entry.absence === true;

      normalized.entries[dateKey] = normalizedEntry;
      return false;
    });

    if (invalidEntry) {
      return invalid(
        "The entry for " + invalidEntry + " is invalid.",
        "storage.invalid.entry",
        { key: invalidEntry }
      );
    }

    Object.keys(candidate.schedules).some(function (monthKey) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)
          || !core.isValidWeeklyHours(candidate.schedules[monthKey])) {
        invalidSchedule = monthKey;
        return true;
      }

      normalized.schedules[monthKey] = Number(candidate.schedules[monthKey]);
      return false;
    });

    if (invalidSchedule) {
      return invalid(
        "The schedule for " + invalidSchedule + " is invalid.",
        "storage.invalid.schedule",
        { key: invalidSchedule }
      );
    }

    return { valid: true, state: normalized, error: "", errorKey: "", errorParams: {} };
  }

  function invalid(message, errorKey, errorParams) {
    return {
      valid: false,
      state: createEmptyState(),
      error: message,
      errorKey: errorKey || "",
      errorParams: errorParams || {}
    };
  }

  function getBrowserStorage() {
    try {
      return host.localStorage;
    } catch (error) {
      return null;
    }
  }

  function loadState(storage, storageKey) {
    var raw;
    var parsed;
    var validation;
    var key = storageKey || STORAGE_KEY;

    if (!storage) {
      return {
        ok: false,
        state: createEmptyState(),
        message: "Browser storage is unavailable. Changes will not survive a reload.",
        messageKey: "storage.unavailableReload",
        messageParams: {}
      };
    }

    try {
      raw = storage.getItem(key);
    } catch (error) {
      return {
        ok: false,
        state: createEmptyState(),
        message: "The saved timesheet could not be read. Changes will not survive a reload.",
        messageKey: "storage.readFailedReload",
        messageParams: {}
      };
    }

    if (raw === null) {
      return { ok: true, state: createEmptyState(), message: "", messageKey: "", messageParams: {} };
    }

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        ok: false,
        state: createEmptyState(),
        message: "The saved timesheet is corrupted. A blank view was opened without overwriting it.",
        messageKey: "storage.corruptedBlank",
        messageParams: {}
      };
    }

    validation = validateState(parsed);
    if (!validation.valid) {
      return {
        ok: false,
        state: createEmptyState(),
        message: validation.error + " A blank view was opened without overwriting it.",
        messageKey: "storage.invalidBlank",
        messageParams: {
          errorKey: validation.errorKey,
          errorParams: validation.errorParams
        }
      };
    }

    return { ok: true, state: validation.state, message: "", messageKey: "", messageParams: {} };
  }

  function saveState(storage, state, storageKey) {
    var validation = validateState(state);
    var key = storageKey || STORAGE_KEY;

    if (!storage) {
      return {
        ok: false,
        message: "Browser storage is unavailable. This edit was not saved.",
        messageKey: "storage.unavailableEdit",
        messageParams: {}
      };
    }

    if (!validation.valid) {
      return {
        ok: false,
        message: validation.error + " This edit was not saved.",
        messageKey: "storage.invalidEdit",
        messageParams: {
          errorKey: validation.errorKey,
          errorParams: validation.errorParams
        }
      };
    }

    try {
      storage.setItem(key, JSON.stringify(validation.state));
      return { ok: true, message: "Saved locally", messageKey: "storage.saved", messageParams: {} };
    } catch (error) {
      return {
        ok: false,
        message: "Browser storage rejected this edit. It was not saved.",
        messageKey: "storage.rejectedEdit",
        messageParams: {}
      };
    }
  }

  function ensureMonthSchedule(state, monthKey) {
    var value;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      throw new Error("Invalid month key.");
    }

    if (hasOwn(state.schedules, monthKey) && core.isValidWeeklyHours(state.schedules[monthKey])) {
      return { changed: false, value: Number(state.schedules[monthKey]) };
    }

    value = core.getInheritedWeeklyHours(monthKey, state.schedules, core.DEFAULT_WEEKLY_HOURS);
    state.schedules[monthKey] = value;
    return { changed: true, value: value };
  }

  function serializeBackup(state, now) {
    var validation = validateState(state);
    var timestamp = now instanceof Date ? now : new Date();

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return JSON.stringify({
      format: BACKUP_FORMAT,
      version: SCHEMA_VERSION,
      exportedAt: timestamp.toISOString(),
      data: validation.state
    }, null, 2);
  }

  function parseBackup(text) {
    var candidate;
    var validation;
    var includesPreferences;

    try {
      candidate = JSON.parse(text);
    } catch (error) {
      return invalid("The selected file is not valid JSON.", "backup.invalidJson");
    }

    if (!isPlainObject(candidate)
        || candidate.format !== BACKUP_FORMAT
        || candidate.version !== SCHEMA_VERSION
        || typeof candidate.exportedAt !== "string") {
      return invalid(
        "The selected file is not a supported timesheet backup.",
        "backup.unsupported"
      );
    }

    includesPreferences = isPlainObject(candidate.data) && hasOwn(candidate.data, "preferences");
    validation = validateState(candidate.data);
    if (!validation.valid) {
      return validation;
    }

    return {
      valid: true,
      state: validation.state,
      exportedAt: candidate.exportedAt,
      includesPreferences: includesPreferences,
      error: "",
      errorKey: "",
      errorParams: {}
    };
  }

  function mergeStates(localState, importedState, options) {
    var localValidation = validateState(localState);
    var importedValidation = validateState(importedState);
    var merged;
    var includePreferences = !options || options.includePreferences !== false;

    if (!localValidation.valid) {
      throw new Error(localValidation.error);
    }

    if (!importedValidation.valid) {
      throw new Error(importedValidation.error);
    }

    merged = cloneState(localValidation.state);

    Object.keys(importedValidation.state.entries).forEach(function (dateKey) {
      merged.entries[dateKey] = cloneEntry(importedValidation.state.entries[dateKey]);
    });

    Object.keys(importedValidation.state.schedules).forEach(function (monthKey) {
      merged.schedules[monthKey] = importedValidation.state.schedules[monthKey];
    });

    if (includePreferences) {
      merged.preferences = clonePreferences(importedValidation.state.preferences);
    }

    return merged;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    BACKUP_FORMAT: BACKUP_FORMAT,
    ENTRY_FIELDS: ENTRY_FIELDS.slice(),
    SUPPORTED_LANGUAGES: SUPPORTED_LANGUAGES.slice(),
    SUPPORTED_DESIGNS: SUPPORTED_DESIGNS.slice(),
    createDefaultPreferences: createDefaultPreferences,
    createEmptyState: createEmptyState,
    cloneState: cloneState,
    validateState: validateState,
    getBrowserStorage: getBrowserStorage,
    loadState: loadState,
    saveState: saveState,
    ensureMonthSchedule: ensureMonthSchedule,
    serializeBackup: serializeBackup,
    parseBackup: parseBackup,
    mergeStates: mergeStates
  };
});