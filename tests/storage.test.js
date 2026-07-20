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

  test("round trips validated preferences", function () {
    var memory = new MemoryStorage();
    var state = storageApi.createEmptyState();

    state.preferences.language = "de";
    state.preferences.dateFormat = "day-month-year-dots";
    equal(storageApi.saveState(memory, state).ok, true);
    equal(storageApi.loadState(memory).state.preferences.language, "de");
    equal(storageApi.loadState(memory).state.preferences.dateFormat, "day-month-year-dots");
  });

  test("defaults legacy state preferences and rejects invalid settings", function () {
    var legacyState = { version: 1, entries: {}, schedules: {} };
    var invalidState = storageApi.createEmptyState();

    invalidState.preferences.dateFormat = "unknown";
    equal(storageApi.validateState(legacyState).valid, true);
    equal(storageApi.validateState(legacyState).state.preferences.dateFormat, "iso");
    equal(storageApi.validateState(invalidState).valid, false);
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
    serialized = storageApi.serializeBackup(state, new Date("2026-07-16T12:00:00Z"));
    parsed = storageApi.parseBackup(serialized);

    equal(parsed.valid, true);
    equal(parsed.state.entries["2026-07-16"].finish, "1600");
    equal(parsed.includesPreferences, true);
    equal(parsed.state.preferences.dateFormat, "iso");
  });

  test("legacy backups preserve local preferences when merged", function () {
    var local = storageApi.createEmptyState();
    var legacyData = { version: 1, entries: {}, schedules: {} };
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
    imported.schedules["2026-07"] = 35;
    merged = storageApi.mergeStates(local, imported);

    equal(merged.entries["2026-07-15"].start, "800");
    equal(merged.entries["2026-07-16"].finish, "1600");
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