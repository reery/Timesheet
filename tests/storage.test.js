(function () {
  "use strict";

  var storageApi = window.TimesheetStorage;
  var model = window.TimesheetModel;
  var themes = window.TimesheetThemes;
  var output = document.getElementById("results");
  var passed = 0;
  var failures = [];

  function MemoryStorage() {
    this.values = {};
    this.failWrites = false;
    this.failRemovals = false;
  }

  MemoryStorage.prototype.getItem = function (key) {
    return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
  };

  MemoryStorage.prototype.setItem = function (key, value) {
    if (this.failWrites) {
      throw new Error("Write failed");
    }
    this.values[key] = String(value);
  };

  MemoryStorage.prototype.removeItem = function (key) {
    if (this.failRemovals) {
      throw new Error("Removal failed");
    }
    delete this.values[key];
  };

  function test(name, callback) {
    try {
      callback();
      passed += 1;
    } catch (error) {
      failures.push(name + ": " + error.message);
    }
  }

  function equal(actual, expected) {
    if (!Object.is(actual, expected)) {
      throw new Error("expected " + JSON.stringify(expected) + ", received " + JSON.stringify(actual));
    }
  }

  function entry(start, finish) {
    return { start: start, finish: finish, breakStart: "", breakFinish: "" };
  }

  test("finds browser local storage", function () {
    equal(storageApi.getBrowserStorage() === window.localStorage, true);
  });

  test("round trips raw partial input", function () {
    var memory = new MemoryStorage();
    var state = model.createEmptyState();

    state.entries["2026-07-16"] = entry("9", "");
    equal(storageApi.saveState(memory, state).ok, true);
    equal(storageApi.loadState(memory).state.entries["2026-07-16"].start, "9");
  });

  test("round trips absences and defaults legacy entries to unchecked", function () {
    var memory = new MemoryStorage();
    var state = model.createEmptyState();
    var legacyState = model.createEmptyState();

    state.entries["2026-07-16"] = entry("900", "1600");
    state.entries["2026-07-16"].absence = true;
    legacyState.entries["2026-07-17"] = entry("800", "1200");

    equal(storageApi.saveState(memory, state).ok, true);
    equal(storageApi.loadState(memory).state.entries["2026-07-16"].absence, true);
    equal(model.validateState(legacyState).valid, true);
    equal(model.validateState(legacyState).state.entries["2026-07-17"].absence, false);
  });

  test("rejects malformed absence flags", function () {
    var state = model.createEmptyState();

    state.entries["2026-07-16"] = entry("900", "1600");
    state.entries["2026-07-16"].absence = "true";

    equal(model.validateState(state).valid, false);
    equal(model.validateState(state).errorKey, "storage.invalid.entry");
  });

  test("round trips validated preferences", function () {
    var memory = new MemoryStorage();
    var state = model.createEmptyState();
    var persisted;

    equal(themes.getThemes().map(function (theme) {
      return theme.id;
    }).join(","), "default-gradient,midnight-fog,ember-coast");
    state.preferences.language = "es";
    state.preferences.theme = "midnight-fog";
    state.preferences.dateFormat = "day-month-year-dots";
    state.preferences.workDayRange = { start: 5, end: 1 };
    equal(storageApi.saveState(memory, state).ok, true);
    persisted = JSON.parse(memory.values[storageApi.STORAGE_KEY]);
    equal(persisted.preferences.design, "midnight-fog");
    equal(persisted.preferences.theme, undefined);
    equal(
      JSON.stringify(persisted.preferences.workDayRange),
      JSON.stringify({ start: 5, end: 1 })
    );
    equal(storageApi.loadState(memory).state.preferences.language, "es");
    equal(storageApi.loadState(memory).state.preferences.theme, "midnight-fog");
    equal(storageApi.loadState(memory).state.preferences.dateFormat, "day-month-year-dots");
    equal(
      JSON.stringify(storageApi.loadState(memory).state.preferences.workDayRange),
      JSON.stringify({ start: 5, end: 1 })
    );
  });

  test("defaults legacy state preferences and rejects invalid settings", function () {
    var legacyState = { version: 1, entries: {}, schedules: {} };
    var invalidState = model.createEmptyState();
    var invalidTheme = model.createEmptyState();

    invalidState.preferences.dateFormat = "unknown";
    invalidTheme.preferences.theme = "unknown";
    equal(model.validateState(legacyState).valid, true);
    equal(model.validateState(legacyState).state.preferences.dateFormat, "iso");
    equal(model.validateState(legacyState).state.preferences.language, "en");
    equal(model.validateState(legacyState).state.preferences.theme, "default-gradient");
    equal(
      JSON.stringify(model.validateState(legacyState).state.preferences.workDayRange),
      JSON.stringify({ start: 1, end: 5 })
    );
    equal(model.validateState(invalidState).valid, false);
    equal(model.validateState(invalidTheme).valid, false);
    equal(model.validateState(invalidTheme).errorKey, "storage.invalid.preferences");
  });

  test("returns stable keys with storage diagnostics", function () {
    var memory = new MemoryStorage();
    var state = model.createEmptyState();
    var invalid;
    var unavailable = storageApi.loadState(null);

    state.schedules.invalid = 32;
    invalid = model.validateState(state);
    equal(invalid.errorKey, "storage.invalid.schedule");
    equal(invalid.errorParams.key, "invalid");
    equal(storageApi.saveState(null, model.createEmptyState()).messageKey,
      "storage.unavailableEdit");
    equal(unavailable.editMessageKey, "storage.unavailableEdit");
    equal(storageApi.parseBackup("not json").errorKey, "backup.invalidJson");
  });

  test("does not overwrite malformed stored data while loading", function () {
    var memory = new MemoryStorage();
    memory.values[storageApi.STORAGE_KEY] = "{bad json";

    equal(storageApi.loadState(memory).ok, false);
    equal(storageApi.loadState(memory).editMessageKey, "storage.unreadableEdit");
    equal(memory.values[storageApi.STORAGE_KEY], "{bad json");
  });

  test("rejects unsupported schema versions", function () {
    var state = model.createEmptyState();
    state.version = 2;

    equal(model.validateState(state).valid, false);
  });

  test("reports rejected writes", function () {
    var memory = new MemoryStorage();
    memory.failWrites = true;

    equal(storageApi.saveState(memory, model.createEmptyState()).ok, false);
  });

  test("deletes only the requested storage key", function () {
    var memory = new MemoryStorage();
    var customKey = "local-timesheet.test.delete-state";
    var result;

    memory.setItem(storageApi.STORAGE_KEY, "default state");
    memory.setItem(customKey, "custom state");
    memory.setItem("unrelated", "keep me");

    result = storageApi.deleteState(memory, customKey);
    equal(result.ok, true);
    equal(result.messageKey, "storage.deleted");
    equal(memory.getItem(customKey), null);
    equal(memory.getItem(storageApi.STORAGE_KEY), "default state");
    equal(memory.getItem("unrelated"), "keep me");

    equal(storageApi.deleteState(memory).ok, true);
    equal(memory.getItem(storageApi.STORAGE_KEY), null);
    equal(memory.getItem("unrelated"), "keep me");
  });

  test("reports failed deletion without changing stored data", function () {
    var memory = new MemoryStorage();

    memory.setItem(storageApi.STORAGE_KEY, "saved state");
    memory.failRemovals = true;

    equal(storageApi.deleteState(null).messageKey, "storage.unavailableDelete");
    equal(storageApi.deleteState(memory).ok, false);
    equal(storageApi.deleteState(memory).messageKey, "storage.rejectedDelete");
    equal(memory.getItem(storageApi.STORAGE_KEY), "saved state");
  });

  test("snapshots the previous effective schedule once", function () {
    var state = model.createEmptyState();
    state.schedules["2026-06"] = 32;

    equal(model.ensureMonthSchedule(state, "2026-07").value, 32);
    state.schedules["2026-06"] = 35;
    equal(model.ensureMonthSchedule(state, "2026-07").value, 32);
  });

  test("serializes and parses a valid backup", function () {
    var state = model.createEmptyState();
    var serialized;
    var parsed;

    state.entries["2026-07-16"] = entry("900", "1600");
    state.entries["2026-07-16"].absence = true;
    state.preferences.workDayRange = { start: 0, end: 5 };
    serialized = storageApi.serializeBackup(state, new Date("2026-07-16T12:00:00Z"));
    parsed = storageApi.parseBackup(serialized);

    equal(parsed.valid, true);
    equal(parsed.state.entries["2026-07-16"].finish, "1600");
    equal(parsed.state.entries["2026-07-16"].absence, true);
    equal(parsed.includesPreferences, true);
    equal(parsed.state.preferences.dateFormat, "iso");
    equal(parsed.state.preferences.theme, "default-gradient");
    equal(
      JSON.stringify(parsed.state.preferences.workDayRange),
      JSON.stringify({ start: 0, end: 5 })
    );
    equal(JSON.parse(serialized).data.preferences.design, "default-gradient");
    equal(JSON.parse(serialized).data.preferences.theme, undefined);
    equal(
      JSON.stringify(JSON.parse(serialized).data.preferences.workDayRange),
      JSON.stringify({ start: 0, end: 5 })
    );
  });

  test("legacy backups preserve local preferences when merged", function () {
    var local = model.createEmptyState();
    var legacyData = {
      version: 1,
      entries: { "2026-07-16": entry("900", "1600") },
      schedules: {}
    };
    var parsed = storageApi.parseBackup(JSON.stringify({
      format: storageApi.BACKUP_FORMAT,
      version: model.SCHEMA_VERSION,
      exportedAt: "2026-07-16T12:00:00.000Z",
      data: legacyData
    }));
    var merged;

    local.preferences.dateFormat = "month-day-slash";
    local.preferences.workDayRange = { start: 5, end: 1 };
    merged = model.mergeStates(local, parsed.state, {
      includePreferences: parsed.includesPreferences
    });

    equal(parsed.valid, true);
    equal(parsed.includesPreferences, false);
  equal(parsed.state.entries["2026-07-16"].absence, false);
    equal(merged.preferences.dateFormat, "month-day-slash");
    equal(
      JSON.stringify(merged.preferences.workDayRange),
      JSON.stringify({ start: 5, end: 1 })
    );
  });

  test("current backups replace local preferences when merged", function () {
    var local = model.createEmptyState();
    var imported = model.createEmptyState();
    var merged;

    local.preferences.theme = "default-gradient";
    imported.preferences.theme = "midnight-fog";
    merged = model.mergeStates(local, imported, { includePreferences: true });

    equal(merged.preferences.theme, "midnight-fog");
  });

  test("merge restore keeps unrelated local dates and imports conflicts", function () {
    var local = model.createEmptyState();
    var imported = model.createEmptyState();
    var merged;

    local.entries["2026-07-15"] = entry("800", "1200");
    local.entries["2026-07-16"] = entry("900", "1500");
    local.schedules["2026-07"] = 32;
    imported.entries["2026-07-16"] = entry("900", "1600");
    imported.entries["2026-07-16"].absence = true;
    imported.schedules["2026-07"] = 35;
    merged = model.mergeStates(local, imported);

    equal(merged.entries["2026-07-15"].start, "800");
    equal(merged.entries["2026-07-16"].finish, "1600");
    equal(merged.entries["2026-07-16"].absence, true);
    equal(merged.schedules["2026-07"], 35);
  });

  test("rejects malformed backup envelopes", function () {
    equal(storageApi.parseBackup("{}").valid, false);
    equal(storageApi.parseBackup("not json").valid, false);
    equal(storageApi.parseBackup(JSON.stringify({
      format: storageApi.BACKUP_FORMAT,
      version: model.SCHEMA_VERSION,
      exportedAt: "2026-07-16T12:00:00.000Z"
    })).valid, false);
  });

  test("rejects backup text above the size limit", function () {
    var oversized = "x".repeat(storageApi.MAX_BACKUP_BYTES + 1);
    var parsed = storageApi.parseBackup(oversized);

    equal(storageApi.MAX_BACKUP_BYTES, 10 * 1024 * 1024);
    equal(parsed.valid, false);
    equal(parsed.errorKey, "backup.tooLarge");
    equal(parsed.errorParams.limit, 10);
  });

  if (failures.length > 0) {
    document.body.dataset.status = "failed";
    document.title = "FAIL - Timesheet storage tests";
    output.textContent = failures.length + " failed, " + passed + " passed\n\n" + failures.join("\n");
  } else {
    document.body.dataset.status = "passed";
    document.title = "PASS - Timesheet storage tests";
    output.textContent = passed + " tests passed";
  }
})();