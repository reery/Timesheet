(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var AUTOMATIC_BREAK_THRESHOLD_MINUTES = 6 * 60;
  var MINIMUM_BREAK_MINUTES = 30;
  var DEFAULT_WEEKLY_HOURS = 32;
  var MINUTES_PER_HOUR = 60;

  function parseTime(value) {
    var raw = value === null || value === undefined ? "" : String(value).trim();
    var hour;
    var minute;
    var compactMatch;
    var colonMatch;

    if (raw === "") {
      return { valid: false, empty: true, minutes: null, normalized: "" };
    }

    colonMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
    compactMatch = raw.match(/^\d{1,4}$/);

    if (colonMatch) {
      hour = Number(colonMatch[1]);
      minute = Number(colonMatch[2]);
    } else if (compactMatch && raw.length <= 2) {
      hour = Number(raw);
      minute = 0;
    } else if (compactMatch && raw.length === 3) {
      hour = Number(raw.slice(0, 1));
      minute = Number(raw.slice(1));
    } else if (compactMatch && raw.length === 4) {
      hour = Number(raw.slice(0, 2));
      minute = Number(raw.slice(2));
    } else {
      return { valid: false, empty: false, minutes: null, normalized: "" };
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return { valid: false, empty: false, minutes: null, normalized: "" };
    }

    return {
      valid: true,
      empty: false,
      minutes: hour * 60 + minute,
      normalized: padTwo(hour) + ":" + padTwo(minute)
    };
  }

  function padTwo(value) {
    return String(value).padStart(2, "0");
  }

  function calculateShift(entry) {
    var start = parseTime(entry && entry.start);
    var finish = parseTime(entry && entry.finish);
    var breakStart = parseTime(entry && entry.breakStart);
    var breakFinish = parseTime(entry && entry.breakFinish);
    var grossMinutes;
    var explicitBreakMinutes = 0;
    var deductedBreakMinutes;

    if (start.empty && finish.empty && breakStart.empty && breakFinish.empty) {
      return result("empty", "", false);
    }

    if (start.empty || finish.empty) {
      return result("incomplete", "Enter both start and finish.", false);
    }

    if (!start.valid || !finish.valid) {
      return result("invalid", "Use a valid 24-hour time.", false);
    }

    if (finish.minutes <= start.minutes) {
      return result("invalid", "Finish must be later than start on the same day.", false);
    }

    if (breakStart.empty !== breakFinish.empty) {
      return result("incomplete", "Enter both break start and break finish.", false);
    }

    if (!breakStart.empty && (!breakStart.valid || !breakFinish.valid)) {
      return result("invalid", "Use a valid 24-hour break time.", false);
    }

    if (!breakStart.empty) {
      if (breakFinish.minutes <= breakStart.minutes) {
        return result("invalid", "Break finish must be later than break start.", false);
      }

      if (breakStart.minutes < start.minutes || breakFinish.minutes > finish.minutes) {
        return result("invalid", "The break must be inside the work interval.", false);
      }

      explicitBreakMinutes = breakFinish.minutes - breakStart.minutes;
    }

    grossMinutes = finish.minutes - start.minutes;
    deductedBreakMinutes = grossMinutes >= AUTOMATIC_BREAK_THRESHOLD_MINUTES
      ? Math.max(explicitBreakMinutes, MINIMUM_BREAK_MINUTES)
      : explicitBreakMinutes;

    return {
      status: "valid",
      message: "",
      valid: true,
      complete: true,
      grossMinutes: grossMinutes,
      explicitBreakMinutes: explicitBreakMinutes,
      deductedBreakMinutes: deductedBreakMinutes,
      automaticBreakMinutes: deductedBreakMinutes - explicitBreakMinutes,
      workedMinutes: grossMinutes - deductedBreakMinutes
    };
  }

  function result(status, message, complete) {
    return {
      status: status,
      message: message,
      valid: status === "empty",
      complete: complete,
      grossMinutes: 0,
      explicitBreakMinutes: 0,
      deductedBreakMinutes: 0,
      automaticBreakMinutes: 0,
      workedMinutes: 0
    };
  }

  function formatDuration(totalMinutes) {
    var roundedMinutes;
    var sign;
    var absoluteMinutes;

    if (!Number.isFinite(totalMinutes)) {
      return "--";
    }

    roundedMinutes = Math.round(totalMinutes);
    sign = roundedMinutes < 0 ? "-" : "";
    absoluteMinutes = Math.abs(roundedMinutes);

    return sign + Math.floor(absoluteMinutes / 60) + ":" + padTwo(absoluteMinutes % 60);
  }

  function formatDecimalHours(totalMinutes) {
    var value;

    if (!Number.isFinite(totalMinutes)) {
      return "--";
    }

    value = Math.round((totalMinutes / 60) * 100) / 100;
    if (Object.is(value, -0)) {
      value = 0;
    }

    return String(value);
  }

  function formatSignedDecimalHours(totalMinutes) {
    var formatted = formatDecimalHours(totalMinutes);

    if (formatted === "--" || totalMinutes <= 0) {
      return formatted;
    }

    return "+" + formatted;
  }

  function toIsoDate(date) {
    return date.getFullYear() + "-" + padTwo(date.getMonth() + 1) + "-" + padTwo(date.getDate());
  }

  function parseIsoDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var year;
    var month;
    var day;
    var date;

    if (!match) {
      return null;
    }

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    date = new Date(year, month - 1, day, 12);

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    return date;
  }

  function addDays(date, amount) {
    var next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function startOfIsoWeek(date) {
    var day = date.getDay();
    var offset = day === 0 ? -6 : 1 - day;
    return addDays(date, offset);
  }

  function endOfIsoWeek(date) {
    return addDays(startOfIsoWeek(date), 6);
  }

  function getIsoWeek(dateOrKey) {
    var source = typeof dateOrKey === "string" ? parseIsoDate(dateOrKey) : dateOrKey;
    var date;
    var dayNumber;
    var weekYear;
    var yearStart;

    if (!(source instanceof Date) || Number.isNaN(source.getTime())) {
      return null;
    }

    date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
    dayNumber = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
    weekYear = date.getUTCFullYear();
    yearStart = new Date(Date.UTC(weekYear, 0, 1));

    return {
      week: Math.ceil((((date - yearStart) / 86400000) + 1) / 7),
      year: weekYear
    };
  }

  function buildMonthWeeks(year, monthIndex) {
    var firstDay = new Date(year, monthIndex, 1, 12);
    var lastDay = new Date(year, monthIndex + 1, 0, 12);
    var cursor = startOfIsoWeek(firstDay);
    var end = endOfIsoWeek(lastDay);
    var weeks = [];
    var dates;
    var weekInfo;
    var index;

    while (cursor <= end) {
      dates = [];
      for (index = 0; index < 7; index += 1) {
        dates.push(toIsoDate(addDays(cursor, index)));
      }
      weekInfo = getIsoWeek(cursor);
      weeks.push({ year: weekInfo.year, week: weekInfo.week, dates: dates });
      cursor = addDays(cursor, 7);
    }

    return weeks;
  }

  function getMonthDateKeys(year, monthIndex) {
    var count = new Date(year, monthIndex + 1, 0, 12).getDate();
    var dates = [];
    var day;

    for (day = 1; day <= count; day += 1) {
      dates.push(toIsoDate(new Date(year, monthIndex, day, 12)));
    }

    return dates;
  }

  function getMonthKey(dateOrKey) {
    if (typeof dateOrKey === "string" && /^\d{4}-\d{2}(?:-\d{2})?$/.test(dateOrKey)) {
      return dateOrKey.slice(0, 7);
    }

    return toIsoDate(dateOrKey).slice(0, 7);
  }

  function shiftMonthKey(monthKey, amount) {
    var match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    var date;

    if (!match) {
      return null;
    }

    date = new Date(Number(match[1]), Number(match[2]) - 1 + amount, 1, 12);
    return getMonthKey(date);
  }

  function isValidWeeklyHours(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 168;
  }

  function getEffectiveWeeklyHours(monthKey, schedules, defaultHours) {
    var fallback = isValidWeeklyHours(defaultHours) ? Number(defaultHours) : DEFAULT_WEEKLY_HOURS;
    var keys = Object.keys(schedules || {}).filter(function (key) {
      return /^\d{4}-\d{2}$/.test(key)
        && key <= monthKey
        && isValidWeeklyHours(schedules[key]);
    }).sort();

    if (keys.length === 0) {
      return fallback;
    }

    return Number(schedules[keys[keys.length - 1]]);
  }

  function getInheritedWeeklyHours(monthKey, schedules, defaultHours) {
    return getEffectiveWeeklyHours(shiftMonthKey(monthKey, -1), schedules, defaultHours);
  }

  function isWeekday(dateKey) {
    var date = parseIsoDate(dateKey);
    var day;

    if (!date) {
      return false;
    }

    day = date.getDay();
    return day >= 1 && day <= 5;
  }

  function getDailyTargetMinutes(dateKey, weeklyHours) {
    if (!isWeekday(dateKey) || !isValidWeeklyHours(weeklyHours)) {
      return 0;
    }

    return Number(weeklyHours) * MINUTES_PER_HOUR / 5;
  }

  function getDaySummary(dateKey, entry, schedules, todayKey) {
    var cutoff = todayKey || toIsoDate(new Date());
    var weeklyHours = getEffectiveWeeklyHours(getMonthKey(dateKey), schedules);
    var targetMinutes = getDailyTargetMinutes(dateKey, weeklyHours);
    var shift = calculateShift(entry || {});
    var workedMinutes = shift.status === "valid" ? shift.workedMinutes : 0;
    var evaluated = dateKey <= cutoff;

    return {
      date: dateKey,
      shift: shift,
      evaluated: evaluated,
      weeklyHours: weeklyHours,
      targetMinutes: targetMinutes,
      workedMinutes: workedMinutes,
      balanceMinutes: evaluated ? workedMinutes - targetMinutes : null
    };
  }

  function summarizeDates(dateKeys, entries, schedules, todayKey) {
    var summary = {
      workedMinutes: 0,
      expectedMinutes: 0,
      plannedMinutes: 0,
      balanceMinutes: 0,
      evaluatedDays: 0
    };

    dateKeys.forEach(function (dateKey) {
      var day = getDaySummary(dateKey, entries && entries[dateKey], schedules, todayKey);
      summary.plannedMinutes += day.targetMinutes;

      if (day.evaluated) {
        summary.workedMinutes += day.workedMinutes;
        summary.expectedMinutes += day.targetMinutes;
        summary.balanceMinutes += day.balanceMinutes;
        summary.evaluatedDays += 1;
      }
    });

    return summary;
  }

  return {
    AUTOMATIC_BREAK_THRESHOLD_MINUTES: AUTOMATIC_BREAK_THRESHOLD_MINUTES,
    MINIMUM_BREAK_MINUTES: MINIMUM_BREAK_MINUTES,
    DEFAULT_WEEKLY_HOURS: DEFAULT_WEEKLY_HOURS,
    parseTime: parseTime,
    calculateShift: calculateShift,
    formatDuration: formatDuration,
    formatDecimalHours: formatDecimalHours,
    formatSignedDecimalHours: formatSignedDecimalHours,
    toIsoDate: toIsoDate,
    parseIsoDate: parseIsoDate,
    addDays: addDays,
    startOfIsoWeek: startOfIsoWeek,
    endOfIsoWeek: endOfIsoWeek,
    getIsoWeek: getIsoWeek,
    buildMonthWeeks: buildMonthWeeks,
    getMonthDateKeys: getMonthDateKeys,
    getMonthKey: getMonthKey,
    shiftMonthKey: shiftMonthKey,
    isValidWeeklyHours: isValidWeeklyHours,
    getEffectiveWeeklyHours: getEffectiveWeeklyHours,
    getInheritedWeeklyHours: getInheritedWeeklyHours,
    isWeekday: isWeekday,
    getDailyTargetMinutes: getDailyTargetMinutes,
    getDaySummary: getDaySummary,
    summarizeDates: summarizeDates
  };
});