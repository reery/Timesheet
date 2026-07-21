(function () {
  "use strict";

  var storageApi = window.TimesheetStorage;
  var output = document.getElementById("results");
  var passed = 0;
  var failures = [];

  function MemoryStorage() {
    this.values = {};
    this.failWrites = false;
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
    var state = storageApi.createEmptyState();

    state.entries["2026-07-16"] = entry("9", "");
    equal(storageApi.saveState(memory, state).ok, true);
    equal(storageApi.loadState(memory).state.entries["2026-07-16"].start, "9");
  });

  test("round trips absences and defaults legacy entries to unchecked", function () {
    var memory = new MemoryStorage();
    var state = storageApi.createEmptyState();
    var legacyState = storageApi.createEmptyState();

    state.entries["2026-07-16"] = entry("900", "1600");
    state.entries["2026-07-16"].absence = true;
    legacyState.entries["2026-07-17"] = entry("800", "1200");

    equal(storageApi.saveState(memory, state).ok, true);
    equal(storageApi.loadState(memory).state.entries["2026-07-16"].absence, true);
    equal(storageApi.validateState(legacyState).valid, true);
    equal(storageApi.validateState(legacyState).state.entries["2026-07-17"].absence, false);
  });

  test("rejects malformed absence flags", function () {
    var state = storageApi.createEmptyState();

    state.entries["2026-07-16"] = entry("900", "1600");
    state.entries["2026-07-16"].absence = "true";

    equal(storageApi.validateState(state).valid, false);
    equal(storageApi.validateState(state).errorKey, "storage.invalid.entry");
  });

  test("round trips validated preferences", function () {
    var memory = new MemoryStorage();
    var state = storageApi.createEmptyState();

    equal(storageApi.SUPPORTED_LANGUAGES.join(","), "en,de,es,fr");
    equal(storageApi.SUPPORTED_DESIGNS.join(","), "default-gradient,midnight-fog,ember-coast");
    state.preferences.language = "es";
    state.preferences.design = "midnight-fog";
    state.preferences.dateFormat = "day-month-year-dots";
    equal(storageApi.saveState(memory, state).ok, true);
    equal(storageApi.loadState(memory).state.preferences.language, "es");
    equal(storageApi.loadState(memory).state.preferences.design, "midnight-fog");
    equal(storageApi.loadState(memory).state.preferences.dateFormat, "day-month-year-dots");
  });

  test("defaults legacy state preferences and rejects invalid settings", function () {
    var legacyState = { version: 1, entries: {}, schedules: {} };
    var invalidState = storageApi.createEmptyState();
    var invalidDesign = storageApi.createEmptyState();

    invalidState.preferences.dateFormat = "unknown";
    invalidDesign.preferences.design = "unknown";
    equal(storageApi.validateState(legacyState).valid, true);
    equal(storageApi.validateState(legacyState).state.preferences.dateFormat, "iso");
    equal(storageApi.validateState(legacyState).state.preferences.language, "en");
    equal(storageApi.validateState(legacyState).state.preferences.design, "default-gradient");
    equal(storageApi.validateState(invalidState).valid, false);
    equal(storageApi.validateState(invalidDesign).valid, false);
    equal(storageApi.validateState(invalidDesign).errorKey, "storage.invalid.preferences");
  });

  test("returns stable keys with storage diagnostics", function () {
    var memory = new MemoryStorage();
    var state = storageApi.createEmptyState();
    var invalid;

    state.schedules.invalid = 32;
    invalid = storageApi.validateState(state);
    equal(invalid.errorKey, "storage.invalid.schedule");
    equal(invalid.errorParams.key, "invalid");
    equal(storageApi.saveState(null, storageApi.createEmptyState()).messageKey,
      "storage.unavailableEdit");
    equal(storageApi.parseBackup("not json").errorKey, "backup.invalidJson");
  });

  test("does not overwrite malformed stored data while loading", function () {
    var memory = new MemoryStorage();
    memory.values[storageApi.STORAGE_KEY] = "{bad json";

    equal(storageApi.loadState(memory).ok, false);
    equal(memory.values[storageApi.STORAGE_KEY], "{bad json");
  });

  test("rejects unsupported schema versions", function () {
    var state = storageApi.createEmptyState();
    state.version = 2;

    equal(storageApi.validateState(state).valid, false);
  });

  test("reports rejected writes", function () {
    var memory = new MemoryStorage();
    memory.failWrites = true;

    equal(storageApi.saveState(memory, storageApi.createEmptyState()).ok, false);
  });

  test("snapshots the previous effective schedule once", function () {
    var state = storageApi.createEmptyState();
    state.schedules["2026-06"] = 32;

    equal(storageApi.ensureMonthSchedule(state, "2026-07").value, 32);
    state.schedules["2026-06"] = 35;
    equal(storageApi.ensureMonthSchedule(state, "2026-07").value, 32);
  });

  test("serializes and parses a valid backup", function () {
    var state = storageApi.createEmptyState();
    var serialized;
    var parsed;

    state.entries["2026-07-16"] = entry("900", "1600");
    state.entries["2026-07-16"].absence = true;
    serialized = storageApi.serializeBackup(state, new Date("2026-07-16T12:00:00Z"));
    parsed = storageApi.parseBackup(serialized);

    equal(parsed.valid, true);
    equal(parsed.state.entries["2026-07-16"].finish, "1600");
    equal(parsed.state.entries["2026-07-16"].absence, true);
    equal(parsed.includesPreferences, true);
    equal(parsed.state.preferences.dateFormat, "iso");
  });

  test("legacy backups preserve local preferences when merged", function () {
    var local = storageApi.createEmptyState();
    var legacyData = {
      version: 1,
      entries: { "2026-07-16": entry("900", "1600") },
      schedules: {}
    };
    var parsed = storageApi.parseBackup(JSON.stringify({
      format: storageApi.BACKUP_FORMAT,
      version: storageApi.SCHEMA_VERSION,
      exportedAt: "2026-07-16T12:00:00.000Z",
      data: legacyData
    }));
    var merged;

    local.preferences.dateFormat = "month-day-slash";
    merged = storageApi.mergeStates(local, parsed.state, {
      includePreferences: parsed.includesPreferences
    });

    equal(parsed.valid, true);
    equal(parsed.includesPreferences, false);
  equal(parsed.state.entries["2026-07-16"].absence, false);
    equal(merged.preferences.dateFormat, "month-day-slash");
  });

  test("current backups replace local preferences when merged", function () {
    var local = storageApi.createEmptyState();
    var imported = storageApi.createEmptyState();
    var merged;

    local.preferences.dateFormat = "month-day-slash";
    imported.preferences.dateFormat = "day-long-month";
    merged = storageApi.mergeStates(local, imported, { includePreferences: true });

    equal(merged.preferences.dateFormat, "day-long-month");
  });

  test("merge restore keeps unrelated local dates and imports conflicts", function () {
    var local = storageApi.createEmptyState();
    var imported = storageApi.createEmptyState();
    var merged;

    local.entries["2026-07-15"] = entry("800", "1200");
    local.entries["2026-07-16"] = entry("900", "1500");
    local.schedules["2026-07"] = 32;
    imported.entries["2026-07-16"] = entry("900", "1600");
    imported.entries["2026-07-16"].absence = true;
    imported.schedules["2026-07"] = 35;
    merged = storageApi.mergeStates(local, imported);

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
      version: storageApi.SCHEMA_VERSION,
      exportedAt: "2026-07-16T12:00:00.000Z"
    })).valid, false);
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