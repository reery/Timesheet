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