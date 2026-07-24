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

  test("formats every supported display date style", function () {
    var formats = core.DATE_FORMATS;

    equal(core.formatDate("2026-07-20", formats.ISO, "en"), "2026-07-20");
    equal(core.formatDate("2026-07-20", formats.DAY_MONTH_YEAR_DOTS, "en"), "20.07.2026");
    equal(core.formatDate("2026-07-20", formats.MONTH_DAY_YEAR_SLASHES, "en"), "07/20/2026");
    equal(core.formatDate("2026-07-20", formats.MONTH_DAY_DASH, "en"), "07-20");
    equal(core.formatDate("2026-07-20", formats.MONTH_DAY_SLASH, "en"), "07/20");
    equal(core.formatDate("2026-07-20", formats.DAY_LONG_MONTH, "en"), "20 July");
  });

  test("falls back safely for unsupported formats and invalid dates", function () {
    equal(core.formatDate("2026-07-20", "unknown", "en"), "2026-07-20");
    equal(core.formatDate("not-a-date", core.DATE_FORMATS.ISO, "en"), "not-a-date");
    equal(core.formatDate("2026-03-05", core.DATE_FORMATS.DAY_LONG_MONTH, "de"), "5 M\u00e4rz");
    equal(core.formatDate("2026-07-20", core.DATE_FORMATS.DAY_LONG_MONTH, "es"), "20 julio");
    equal(core.formatDate("2026-08-20", core.DATE_FORMATS.DAY_LONG_MONTH, "fr"), "20 ao\u00fbt");
    equal(core.formatDate("2026-07-20", core.DATE_FORMATS.DAY_LONG_MONTH, "it"), "20 July");
  });

  test("enforces supported period boundaries", function () {
    equal(core.MIN_YEAR, 1900);
    equal(core.MAX_YEAR, 9999);
    equal(core.isSupportedYear(1900), true);
    equal(core.isSupportedYear(9999), true);
    equal(core.isSupportedYear(1899), false);
    equal(core.isSupportedYear(10000), false);
    equal(core.isSupportedDateKey("1900-01-01"), true);
    equal(core.isSupportedDateKey("1899-12-31"), false);
    equal(core.isSupportedMonthKey("9999-12"), true);
    equal(core.isSupportedMonthKey("10000-01"), false);
  });

  test("bounds month shifts and the final rendered week", function () {
    var finalWeeks = core.buildMonthWeeks(9999, 11);
    var finalDates = finalWeeks[finalWeeks.length - 1].dates;

    equal(core.shiftMonthKey("1900-01", -1), null);
    equal(core.shiftMonthKey("1900-01", 1), "1900-02");
    equal(core.shiftMonthKey("9999-12", 1), null);
    equal(core.shiftMonthKey("9999-12", -1), "9999-11");
    equal(finalDates[finalDates.length - 1], "9999-12-31");
    equal(finalDates.length < 7, true);
  });

  test("requires primitive numeric weekly hours", function () {
    equal(core.isValidWeeklyHours(0), true);
    equal(core.isValidWeeklyHours(32.5), true);
    equal(core.isValidWeeklyHours(168), true);
    equal(core.isValidWeeklyHours(null), false);
    equal(core.isValidWeeklyHours(false), false);
    equal(core.isValidWeeklyHours("32"), false);
    equal(core.isValidWeeklyHours(""), false);
  });

  test("returns stable validation keys with English fallback messages", function () {
    var incomplete = core.calculateShift({ start: "09:00" });
    var invalidBreak = core.calculateShift({
      start: "09:00",
      finish: "16:00",
      breakStart: "08:30",
      breakFinish: "09:30"
    });

    equal(incomplete.messageKey, "shift.startFinish");
    equal(incomplete.message, "Enter both start and finish.");
    equal(invalidBreak.messageKey, "shift.breakInsideShift");
    equal(invalidBreak.message, "The break must be inside the work interval.");
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

  test("validates and counts inclusive cyclic work-day ranges", function () {
    equal(core.isValidWorkDayRange({ start: 1, end: 5 }), true);
    equal(core.isValidWorkDayRange({ start: 0, end: 6 }), true);
    equal(core.isValidWorkDayRange({ start: -1, end: 5 }), false);
    equal(core.isValidWorkDayRange({ start: 1, end: 7 }), false);
    equal(core.isValidWorkDayRange({ start: 1 }), false);
    equal(core.isValidWorkDayRange(null), false);
    equal(core.getWorkDayCount({ start: 0, end: 5 }), 6);
    equal(core.getWorkDayCount({ start: 5, end: 1 }), 4);
    equal(core.getWorkDayCount({ start: 3, end: 3 }), 1);
    equal(core.getWorkDayCount({ start: 1, end: 0 }), 7);
  });

  test("identifies work days in forward ranges that cross Sunday", function () {
    var sundayToFriday = { start: 0, end: 5 };
    var fridayToMonday = { start: 5, end: 1 };

    equal(core.isWorkDay("2026-07-19", sundayToFriday), true);
    equal(core.isWorkDay("2026-07-18", sundayToFriday), false);
    equal(core.isWorkDay("2026-07-17", fridayToMonday), true);
    equal(core.isWorkDay("2026-07-18", fridayToMonday), true);
    equal(core.isWorkDay("2026-07-19", fridayToMonday), true);
    equal(core.isWorkDay("2026-07-13", fridayToMonday), true);
    equal(core.isWorkDay("2026-07-14", fridayToMonday), false);
  });

  test("distributes 42 weekly hours evenly across all seven days", function () {
    var allDays = { start: 1, end: 0 };
    var dates = [
      "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16",
      "2026-07-17", "2026-07-18", "2026-07-19"
    ];
    var summary = core.summarizeDates(
      dates,
      {},
      { "2026-07": 42 },
      "2026-07-19",
      allDays
    );

    dates.forEach(function (dateKey) {
      equal(core.getDailyTargetMinutes(dateKey, 42, allDays), 360);
    });
    equal(summary.expectedMinutes, 2520);
    equal(summary.plannedMinutes, 2520);
    equal(summary.balanceMinutes, -2520);
  });

  test("uses the selected range for weekend absences and optional weekday work", function () {
    var fridayToMonday = { start: 5, end: 1 };
    var saturdayAbsence = core.getDaySummary(
      "2026-07-18",
      { absence: true },
      { "2026-07": 32 },
      "2026-07-18",
      fridayToMonday
    );
    var tuesdayWork = core.getDaySummary(
      "2026-07-14",
      { start: "09:00", finish: "12:00" },
      { "2026-07": 32 },
      "2026-07-14",
      fridayToMonday
    );

    equal(saturdayAbsence.targetMinutes, 480);
    equal(saturdayAbsence.workedMinutes, 480);
    equal(saturdayAbsence.balanceMinutes, 0);
    equal(tuesdayWork.targetMinutes, 0);
    equal(tuesdayWork.balanceMinutes, 180);
  });

  test("credits an absence with the weekday target and ignores preserved times", function () {
    var day = core.getDaySummary(
      "2026-07-20",
      { start: "09:00", finish: "", absence: true },
      { "2026-07": 32 },
      "2026-07-16"
    );
    var summary = core.summarizeDates(
      ["2026-07-20"],
      { "2026-07-20": { absence: true } },
      { "2026-07": 32 },
      "2026-07-16"
    );

    equal(day.absence, true);
    equal(day.shift.status, "incomplete");
    equal(day.evaluated, true);
    equal(day.targetMinutes, 384);
    equal(day.workedMinutes, 384);
    equal(day.balanceMinutes, 0);
    equal(summary.workedMinutes, 384);
    equal(summary.expectedMinutes, 384);
    equal(summary.balanceMinutes, 0);
    equal(summary.evaluatedDays, 1);
  });

  test("evaluates a weekend absence without crediting work time", function () {
    var day = core.getDaySummary(
      "2026-07-18",
      { absence: true },
      { "2026-07": 32 },
      "2026-07-16"
    );

    equal(day.absence, true);
    equal(day.evaluated, true);
    equal(day.targetMinutes, 0);
    equal(day.workedMinutes, 0);
    equal(day.balanceMinutes, 0);
  });

  test("inherits the latest prior schedule and keeps explicit months independent", function () {
    var schedules = { "2026-05": 32, "2026-07": 35 };

    equal(core.getEffectiveWeeklyHours("2026-06", schedules), 32);
    equal(core.getInheritedWeeklyHours("2026-08", schedules), 35);
    equal(core.getEffectiveWeeklyHours("2026-07", schedules), 35);
  });

  test("summaries include entered future shifts and ignore blank future deficits", function () {
    var dates = ["2026-07-13", "2026-07-14", "2026-07-17", "2026-07-20"];
    var entries = {
      "2026-07-13": { start: "09:00", finish: "16:00" },
      "2026-07-17": { start: "09:00", finish: "16:00" }
    };
    var summary = core.summarizeDates(dates, entries, { "2026-07": 32 }, "2026-07-16");

    equal(summary.workedMinutes, 780);
    equal(summary.expectedMinutes, 1152);
    equal(summary.plannedMinutes, 1536);
    equal(summary.balanceMinutes, -372);
    equal(summary.evaluatedDays, 3);
  });

  test("aggregates precomputed day summaries without recalculating them", function () {
    var dates = ["2026-07-13", "2026-07-14", "2026-07-17"];
    var entries = {
      "2026-07-13": { start: "09:00", finish: "16:00" },
      "2026-07-17": { absence: true }
    };
    var schedules = { "2026-07": 32 };
    var days = dates.map(function (dateKey) {
      return core.getDaySummary(dateKey, entries[dateKey], schedules, "2026-07-16");
    });

    equal(
      JSON.stringify(core.summarizeDaySummaries(days)),
      JSON.stringify(core.summarizeDates(dates, entries, schedules, "2026-07-16"))
    );
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