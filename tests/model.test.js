(function () {
  "use strict";

  var model = window.TimesheetModel;
  var output = document.getElementById("results");
  var passed = 0;
  var failures = [];

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

  test("exposes ordered ledger field definitions", function () {
    var fields = model.getEntryFields();

    equal(fields.map(function (field) {
      return field.key;
    }).join(","), "start,finish,breakStart,breakFinish");
    equal(fields.map(function (field) {
      return field.labelKey;
    }).join(","), "column.start,column.finish,column.breakStart,column.breakFinish");
    fields[0].key = "changed";
    equal(model.getEntryFields()[0].key, "start");
  });

  test("creates independent states with default preferences", function () {
    var first = model.createEmptyState();
    var second = model.createEmptyState();

    equal(first.version, model.SCHEMA_VERSION);
    equal(first.preferences.language, "en");
    equal(first.preferences.design, "default-gradient");
    equal(first.preferences.dateFormat, "iso");
    first.entries.test = {};
    equal(second.entries.test, undefined);
  });

  test("normalizes legacy preferences and absence flags", function () {
    var legacy = {
      version: 1,
      entries: { "2026-07-17": entry("800", "1200") },
      schedules: {}
    };
    var validation = model.validateState(legacy);

    equal(validation.valid, true);
    equal(validation.state.entries["2026-07-17"].absence, false);
    equal(validation.state.preferences.language, "en");
    equal(validation.state.preferences.design, "default-gradient");
    equal(validation.state.preferences.dateFormat, "iso");
  });

  test("rejects invalid entries preferences schedules and versions", function () {
    var invalidEntry = model.createEmptyState();
    var invalidPreferences = model.createEmptyState();
    var invalidSchedule = model.createEmptyState();
    var invalidVersion = model.createEmptyState();

    invalidEntry.entries["2026-07-16"] = entry("900", "1600");
    invalidEntry.entries["2026-07-16"].absence = "true";
    invalidPreferences.preferences.design = "unknown";
    invalidSchedule.schedules.invalid = 32;
    invalidVersion.version = 2;

    equal(model.validateState(invalidEntry).errorKey, "storage.invalid.entry");
    equal(model.validateState(invalidPreferences).errorKey, "storage.invalid.preferences");
    equal(model.validateState(invalidSchedule).errorKey, "storage.invalid.schedule");
    equal(model.validateState(invalidVersion).errorKey, "storage.invalid.version");
  });

  test("rejects empty and out-of-range persisted keys", function () {
    var emptyEntryKey = model.createEmptyState();
    var emptyScheduleKey = model.createEmptyState();
    var earlyEntry = model.createEmptyState();
    var lateSchedule = model.createEmptyState();

    emptyEntryKey.entries[""] = entry("900", "1600");
    emptyScheduleKey.schedules[""] = 32;
    earlyEntry.entries["1899-12-31"] = entry("900", "1600");
    lateSchedule.schedules["10000-01"] = 32;

    equal(model.validateState(emptyEntryKey).errorKey, "storage.invalid.entry");
    equal(model.validateState(emptyEntryKey).errorParams.key, "");
    equal(model.validateState(emptyScheduleKey).errorKey, "storage.invalid.schedule");
    equal(model.validateState(emptyScheduleKey).errorParams.key, "");
    equal(model.validateState(earlyEntry).errorKey, "storage.invalid.entry");
    equal(model.validateState(lateSchedule).errorKey, "storage.invalid.schedule");
  });

  test("rejects coercible schedules and oversized entry fields", function () {
    var values = [null, false, "", "32"];
    var oversized = model.createEmptyState();

    values.forEach(function (value) {
      var state = model.createEmptyState();

      state.schedules["2026-07"] = value;
      equal(model.validateState(state).errorKey, "storage.invalid.schedule");
    });

    oversized.entries["2026-07-16"] = entry("09:000", "16:00");
    equal(model.validateState(oversized).errorKey, "storage.invalid.entry");
  });

  test("rejects state collections above their limits", function () {
    var tooManyEntries = model.createEmptyState();
    var tooManySchedules = model.createEmptyState();
    var index;

    for (index = 0; index <= model.MAX_ENTRY_COUNT; index += 1) {
      tooManyEntries.entries["entry-" + index] = null;
    }
    for (index = 0; index <= model.MAX_SCHEDULE_COUNT; index += 1) {
      tooManySchedules.schedules["schedule-" + index] = null;
    }

    equal(model.validateState(tooManyEntries).errorKey, "storage.invalid.entriesLimit");
    equal(model.validateState(tooManyEntries).errorParams.limit, model.MAX_ENTRY_COUNT);
    equal(model.validateState(tooManySchedules).errorKey, "storage.invalid.schedulesLimit");
    equal(model.validateState(tooManySchedules).errorParams.limit, model.MAX_SCHEDULE_COUNT);
  });

  test("detects only entries without persisted meaning as empty", function () {
    equal(model.isEntryEmpty(), true);
    equal(model.isEntryEmpty(entry("", "")), true);
    equal(model.isEntryEmpty(entry("  ", "")), true);
    equal(model.isEntryEmpty(entry("9", "")), false);
    equal(model.isEntryEmpty({
      start: "", finish: "", breakStart: "", breakFinish: "", absence: true
    }), false);
  });

  test("snapshots inherited monthly schedules once", function () {
    var state = model.createEmptyState();

    state.schedules["2026-06"] = 32;
    equal(model.ensureMonthSchedule(state, "2026-07").value, 32);
    state.schedules["2026-06"] = 35;
    equal(model.ensureMonthSchedule(state, "2026-07").value, 32);
  });

  test("merges entries schedules and current preferences", function () {
    var local = model.createEmptyState();
    var imported = model.createEmptyState();
    var merged;

    local.entries["2026-07-15"] = entry("800", "1200");
    local.entries["2026-07-16"] = entry("900", "1500");
    local.preferences.dateFormat = "month-day-slash";
    imported.entries["2026-07-16"] = entry("900", "1600");
    imported.entries["2026-07-16"].absence = true;
    imported.schedules["2026-07"] = 35;
    imported.preferences.dateFormat = "day-long-month";
    merged = model.mergeStates(local, imported);

    equal(merged.entries["2026-07-15"].start, "800");
    equal(merged.entries["2026-07-16"].finish, "1600");
    equal(merged.entries["2026-07-16"].absence, true);
    equal(merged.schedules["2026-07"], 35);
    equal(merged.preferences.dateFormat, "day-long-month");
  });

  test("can preserve local preferences while merging legacy data", function () {
    var local = model.createEmptyState();
    var imported = model.createEmptyState();
    var merged;

    local.preferences.dateFormat = "month-day-slash";
    imported.preferences.dateFormat = "day-long-month";
    merged = model.mergeStates(local, imported, { includePreferences: false });

    equal(merged.preferences.dateFormat, "month-day-slash");
  });

  if (failures.length > 0) {
    document.body.dataset.status = "failed";
    document.title = "FAIL - Timesheet model tests";
    output.textContent = failures.length + " failed, " + passed + " passed\n\n" + failures.join("\n");
  } else {
    document.body.dataset.status = "passed";
    document.title = "PASS - Timesheet model tests";
    output.textContent = passed + " tests passed";
  }
})();