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

  api = factory(core, i18n, themes);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, i18n, themes) {
  "use strict";

  var SCHEMA_VERSION = 1;
  var LEGACY_THEME_FIELD = "design";
  var MAX_ENTRY_COUNT = 50000;
  var MAX_SCHEDULE_COUNT = 2400;
  var ENTRY_FIELD_DEFINITIONS = [
    { key: "start", labelKey: "column.start", inputMode: "numeric", maxLength: 5 },
    { key: "finish", labelKey: "column.finish", inputMode: "numeric", maxLength: 5 },
    { key: "breakStart", labelKey: "column.breakStart", inputMode: "numeric", maxLength: 5 },
    { key: "breakFinish", labelKey: "column.breakFinish", inputMode: "numeric", maxLength: 5 }
  ];
  var ENTRY_FIELDS = ENTRY_FIELD_DEFINITIONS.map(function (field) {
    return field.key;
  });

  function createDefaultPreferences() {
    return {
      language: i18n.DEFAULT_LANGUAGE,
      theme: themes.DEFAULT_THEME,
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

  function createEmptyEntry() {
    var entry = {};

    ENTRY_FIELDS.forEach(function (field) {
      entry[field] = "";
    });
    entry.absence = false;

    return entry;
  }

  function getEntryFields() {
    return ENTRY_FIELD_DEFINITIONS.map(function (field) {
      return {
        key: field.key,
        labelKey: field.labelKey,
        inputMode: field.inputMode,
        maxLength: field.maxLength
      };
    });
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
    var copy = createEmptyEntry();

    ENTRY_FIELDS.forEach(function (field) {
      copy[field] = entry[field] || "";
    });
    copy.absence = entry.absence === true;

    return copy;
  }

  function isEntryEmpty(entry) {
    return !entry || (entry.absence !== true && ENTRY_FIELDS.every(function (field) {
      return String(entry[field] || "").trim() === "";
    }));
  }

  function clonePreferences(preferences) {
    var source = preferences || createDefaultPreferences();

    return {
      language: source.language,
      theme: hasOwn(source, "theme") ? source.theme : source[LEGACY_THEME_FIELD],
      dateFormat: source.dateFormat
    };
  }

  function toPersistedState(state) {
    var preferences = {
      language: state.preferences.language,
      dateFormat: state.preferences.dateFormat
    };

    preferences[LEGACY_THEME_FIELD] = state.preferences.theme;

    return {
      version: state.version,
      entries: state.entries,
      schedules: state.schedules,
      preferences: preferences
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
    var invalidEntry = null;
    var invalidSchedule = null;
    var hasInvalidEntry = false;
    var hasInvalidSchedule = false;
    var entryKeys;
    var scheduleKeys;
    var theme;

    if (!isPlainObject(candidate)) {
      return invalid("The saved data is not an object.", "storage.invalid.object");
    }

    if (candidate.version !== SCHEMA_VERSION) {
      return invalid("The saved data uses an unsupported version.", "storage.invalid.version");
    }

    if (!isPlainObject(candidate.entries) || !isPlainObject(candidate.schedules)) {
      return invalid("The saved data has an invalid structure.", "storage.invalid.structure");
    }

    entryKeys = Object.keys(candidate.entries);
    scheduleKeys = Object.keys(candidate.schedules);

    if (entryKeys.length > MAX_ENTRY_COUNT) {
      return invalid(
        "The saved data contains too many entries.",
        "storage.invalid.entriesLimit",
        { limit: MAX_ENTRY_COUNT }
      );
    }

    if (scheduleKeys.length > MAX_SCHEDULE_COUNT) {
      return invalid(
        "The saved data contains too many schedules.",
        "storage.invalid.schedulesLimit",
        { limit: MAX_SCHEDULE_COUNT }
      );
    }

    if (hasOwn(candidate, "preferences")) {
      if (!isPlainObject(candidate.preferences)) {
        return invalid("The saved preferences are invalid.", "storage.invalid.preferences");
      }

      theme = hasOwn(candidate.preferences, "theme")
        ? candidate.preferences.theme
        : candidate.preferences[LEGACY_THEME_FIELD];

      if (!i18n.isSupportedLanguage(candidate.preferences.language)
          || !themes.isSupportedTheme(theme)
          || !core.isSupportedDateFormat(candidate.preferences.dateFormat)) {
        return invalid("The saved preferences are invalid.", "storage.invalid.preferences");
      }

      normalized.preferences = {
        language: candidate.preferences.language,
        theme: theme,
        dateFormat: candidate.preferences.dateFormat
      };
    }

    entryKeys.some(function (dateKey) {
      var entry = candidate.entries[dateKey];
      var normalizedEntry = {};

      if (!core.isSupportedDateKey(dateKey) || !isPlainObject(entry)) {
        invalidEntry = dateKey;
        hasInvalidEntry = true;
        return true;
      }

      if (ENTRY_FIELD_DEFINITIONS.some(function (field) {
        if (!hasOwn(entry, field.key)
            || typeof entry[field.key] !== "string"
            || entry[field.key].length > field.maxLength) {
          return true;
        }

        normalizedEntry[field.key] = entry[field.key];
        return false;
      })) {
        invalidEntry = dateKey;
        hasInvalidEntry = true;
        return true;
      }

      if (hasOwn(entry, "absence") && typeof entry.absence !== "boolean") {
        invalidEntry = dateKey;
        hasInvalidEntry = true;
        return true;
      }

      normalizedEntry.absence = entry.absence === true;
      normalized.entries[dateKey] = normalizedEntry;
      return false;
    });

    if (hasInvalidEntry) {
      return invalid(
        "The entry for " + invalidEntry + " is invalid.",
        "storage.invalid.entry",
        { key: invalidEntry }
      );
    }

    scheduleKeys.some(function (monthKey) {
      if (!core.isSupportedMonthKey(monthKey)
          || !core.isValidWeeklyHours(candidate.schedules[monthKey])) {
        invalidSchedule = monthKey;
        hasInvalidSchedule = true;
        return true;
      }

      normalized.schedules[monthKey] = candidate.schedules[monthKey];
      return false;
    });

    if (hasInvalidSchedule) {
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

  function ensureMonthSchedule(state, monthKey) {
    var value;

    if (!core.isSupportedMonthKey(monthKey)) {
      throw new Error("Invalid month key.");
    }

    if (hasOwn(state.schedules, monthKey) && core.isValidWeeklyHours(state.schedules[monthKey])) {
      return { changed: false, value: Number(state.schedules[monthKey]) };
    }

    value = core.getInheritedWeeklyHours(monthKey, state.schedules, core.DEFAULT_WEEKLY_HOURS);
    state.schedules[monthKey] = value;
    return { changed: true, value: value };
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
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_ENTRY_COUNT: MAX_ENTRY_COUNT,
    MAX_SCHEDULE_COUNT: MAX_SCHEDULE_COUNT,
    getEntryFields: getEntryFields,
    createEmptyState: createEmptyState,
    createEmptyEntry: createEmptyEntry,
    isEntryEmpty: isEntryEmpty,
    cloneState: cloneState,
    toPersistedState: toPersistedState,
    validateState: validateState,
    ensureMonthSchedule: ensureMonthSchedule,
    mergeStates: mergeStates
  };
});