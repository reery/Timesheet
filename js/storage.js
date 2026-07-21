(function (root, factory) {
  "use strict";

  var model = root.TimesheetModel;
  var api;

  if (!model && typeof require === "function") {
    model = require("./model.js");
  }

  api = factory(model, root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (model, host) {
  "use strict";

  var STORAGE_KEY = "local-timesheet.state.v1";
  var BACKUP_FORMAT = "local-timesheet-backup";
  var MAX_BACKUP_BYTES = 10 * 1024 * 1024;

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

  function invalid(message, errorKey, errorParams) {
    return {
      valid: false,
      state: model.createEmptyState(),
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
        state: model.createEmptyState(),
        message: "Browser storage is unavailable. Changes will not survive a reload.",
        messageKey: "storage.unavailableReload",
        messageParams: {},
        editMessageKey: "storage.unavailableEdit"
      };
    }

    try {
      raw = storage.getItem(key);
    } catch (error) {
      return {
        ok: false,
        state: model.createEmptyState(),
        message: "The saved timesheet could not be read. Changes will not survive a reload.",
        messageKey: "storage.readFailedReload",
        messageParams: {},
        editMessageKey: "storage.unreadableEdit"
      };
    }

    if (raw === null) {
      return { ok: true, state: model.createEmptyState(), message: "", messageKey: "", messageParams: {} };
    }

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        ok: false,
        state: model.createEmptyState(),
        message: "The saved timesheet is corrupted. A blank view was opened without overwriting it.",
        messageKey: "storage.corruptedBlank",
        messageParams: {},
        editMessageKey: "storage.unreadableEdit"
      };
    }

    validation = model.validateState(parsed);
    if (!validation.valid) {
      return {
        ok: false,
        state: model.createEmptyState(),
        message: validation.error + " A blank view was opened without overwriting it.",
        messageKey: "storage.invalidBlank",
        messageParams: {
          errorKey: validation.errorKey,
          errorParams: validation.errorParams
        },
        editMessageKey: "storage.unreadableEdit"
      };
    }

    return { ok: true, state: validation.state, message: "", messageKey: "", messageParams: {} };
  }

  function saveState(storage, state, storageKey) {
    var validation = model.validateState(state);
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
      storage.setItem(key, JSON.stringify(model.toPersistedState(validation.state)));
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

  function serializeBackup(state, now) {
    var validation = model.validateState(state);
    var timestamp = now instanceof Date ? now : new Date();

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return JSON.stringify({
      format: BACKUP_FORMAT,
      version: model.SCHEMA_VERSION,
      exportedAt: timestamp.toISOString(),
      data: model.toPersistedState(validation.state)
    }, null, 2);
  }

  function parseBackup(text) {
    var candidate;
    var validation;
    var includesPreferences;

    if (typeof text !== "string" || text.length > MAX_BACKUP_BYTES) {
      return invalid(
        "The selected backup is larger than 10 MiB.",
        "backup.tooLarge",
        { limit: MAX_BACKUP_BYTES / (1024 * 1024) }
      );
    }

    try {
      candidate = JSON.parse(text);
    } catch (error) {
      return invalid("The selected file is not valid JSON.", "backup.invalidJson");
    }

    if (!isPlainObject(candidate)
        || candidate.format !== BACKUP_FORMAT
        || candidate.version !== model.SCHEMA_VERSION
        || typeof candidate.exportedAt !== "string") {
      return invalid(
        "The selected file is not a supported timesheet backup.",
        "backup.unsupported"
      );
    }

    includesPreferences = isPlainObject(candidate.data) && hasOwn(candidate.data, "preferences");
    validation = model.validateState(candidate.data);
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

  return {
    STORAGE_KEY: STORAGE_KEY,
    BACKUP_FORMAT: BACKUP_FORMAT,
    MAX_BACKUP_BYTES: MAX_BACKUP_BYTES,
    getBrowserStorage: getBrowserStorage,
    loadState: loadState,
    saveState: saveState,
    serializeBackup: serializeBackup,
    parseBackup: parseBackup
  };
});