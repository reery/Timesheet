(function () {
  "use strict";

  var core = window.TimesheetCore;
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

  test("parses shorthand 900", function () {
    equal(core.parseTime("900").normalized, "09:00");
  });

  test("parses shorthand 1600", function () {
    equal(core.parseTime("1600").normalized, "16:00");
  });

  test("rejects impossible times", function () {
    equal(core.parseTime("2400").valid, false);
    equal(core.parseTime("1260").valid, false);
  });

  test("applies the automatic break to a seven-hour shift", function () {
    var shift = core.calculateShift({ start: "900", finish: "1600" });

    equal(shift.status, "valid");
    equal(shift.deductedBreakMinutes, 30);
    equal(shift.workedMinutes, 390);
    equal(core.formatDuration(shift.workedMinutes), "6:30");
    equal(core.formatDecimalHours(shift.workedMinutes), "6.5");
  });

  test("uses a longer explicit break instead of adding another break", function () {
    var shift = core.calculateShift({
      start: "09:00",
      finish: "16:00",
      breakStart: "12:00",
      breakFinish: "13:00"
    });

    equal(shift.deductedBreakMinutes, 60);
    equal(shift.automaticBreakMinutes, 0);
    equal(shift.workedMinutes, 360);
  });

  test("enforces a 30-minute minimum when the entered break is shorter", function () {
    var shift = core.calculateShift({
      start: "09:00",
      finish: "16:00",
      breakStart: "12:00",
      breakFinish: "12:15"
    });

    equal(shift.explicitBreakMinutes, 15);
    equal(shift.deductedBreakMinutes, 30);
    equal(shift.workedMinutes, 390);
  });

  test("deducts only the entered break below six hours", function () {
    var shift = core.calculateShift({
      start: "09:00",
      finish: "14:45",
      breakStart: "12:00",
      breakFinish: "12:15"
    });

    equal(shift.deductedBreakMinutes, 15);
    equal(shift.workedMinutes, 330);
  });

  test("applies the automatic break at exactly six gross hours", function () {
    var shift = core.calculateShift({ start: "09:00", finish: "15:00" });

    equal(shift.deductedBreakMinutes, 30);
    equal(shift.workedMinutes, 330);
  });

  test("requires a complete break pair inside the shift", function () {
    equal(core.calculateShift({
      start: "09:00",
      finish: "16:00",
      breakStart: "12:00"
    }).status, "incomplete");
    equal(core.calculateShift({
      start: "09:00",
      finish: "16:00",
      breakStart: "08:30",
      breakFinish: "09:30"
    }).status, "invalid");
  });

  test("builds complete Monday-Sunday groups for a leap month", function () {
    var weeks = core.buildMonthWeeks(2024, 1);

    equal(weeks.length, 5);
    equal(weeks[0].dates[0], "2024-01-29");
    equal(weeks[4].dates[6], "2024-03-03");
    equal(core.getMonthDateKeys(2024, 1).length, 29);
  });

  test("computes ISO week years across New Year", function () {
    equal(core.getIsoWeek("2021-01-01").year, 2020);
    equal(core.getIsoWeek("2021-01-01").week, 53);
    equal(core.getIsoWeek("2021-01-04").year, 2021);
    equal(core.getIsoWeek("2021-01-04").week, 1);
  });

  test("derives a 6.4-hour weekday target from 32 hours", function () {
    equal(core.getDailyTargetMinutes("2026-07-13", 32), 384);
    equal(core.getDailyTargetMinutes("2026-07-18", 32), 0);
  });

  test("inherits the latest prior schedule and keeps explicit months independent", function () {
    var schedules = { "2026-05": 32, "2026-07": 35 };

    equal(core.getEffectiveWeeklyHours("2026-06", schedules), 32);
    equal(core.getInheritedWeeklyHours("2026-08", schedules), 35);
    equal(core.getEffectiveWeeklyHours("2026-07", schedules), 35);
  });

  test("summaries accrue through today and ignore future deficits", function () {
    var dates = ["2026-07-13", "2026-07-14", "2026-07-17"];
    var entries = {
      "2026-07-13": { start: "09:00", finish: "16:00" },
      "2026-07-17": { start: "09:00", finish: "16:00" }
    };
    var summary = core.summarizeDates(dates, entries, { "2026-07": 32 }, "2026-07-16");

    equal(summary.workedMinutes, 390);
    equal(summary.expectedMinutes, 768);
    equal(summary.plannedMinutes, 1152);
    equal(summary.balanceMinutes, -378);
  });

  test("week totals apply each date's own monthly schedule", function () {
    var dates = [
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
      "2027-01-01", "2027-01-02", "2027-01-03"
    ];
    var summary = core.summarizeDates(
      dates,
      {},
      { "2026-12": 30, "2027-01": 35 },
      "2027-12-31"
    );

    equal(summary.expectedMinutes, 1860);
    equal(summary.plannedMinutes, 1860);
  });

  test("weekend work adds positive balance without a target", function () {
    var day = core.getDaySummary(
      "2026-07-18",
      { start: "09:00", finish: "12:00" },
      { "2026-07": 32 },
      "2026-07-18"
    );

    equal(day.targetMinutes, 0);
    equal(day.balanceMinutes, 180);
  });

  if (failures.length > 0) {
    document.body.dataset.status = "failed";
    document.title = "FAIL - Timesheet core tests";
    output.textContent = failures.length + " failed, " + passed + " passed\n\n" + failures.join("\n");
  } else {
    document.body.dataset.status = "passed";
    document.title = "PASS - Timesheet core tests";
    output.textContent = passed + " tests passed";
  }
})();