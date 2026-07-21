(function (root, factory) {
  "use strict";

  var i18n = root.TimesheetI18n;
  var api;

  if (!i18n && typeof require === "function") {
    i18n = require("./i18n.js");
  }

  api = factory(i18n);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (i18n) {
  "use strict";

  var AUTOMATIC_BREAK_THRESHOLD_MINUTES = 6 * 60;
  var MINIMUM_BREAK_MINUTES = 30;
  var DEFAULT_WEEKLY_HOURS = 32;
  var MINUTES_PER_HOUR = 60;
  var MIN_YEAR = 1900;
  var MAX_YEAR = 9999;
  var DATE_FORMATS = {
    ISO: "iso",
    DAY_MONTH_YEAR_DOTS: "day-month-year-dots",
    MONTH_DAY_YEAR_SLASHES: "month-day-year-slashes",
    MONTH_DAY_DASH: "month-day-dash",
    MONTH_DAY_SLASH: "month-day-slash",
    DAY_LONG_MONTH: "day-long-month"
  };
  var SUPPORTED_DATE_FORMATS = Object.keys(DATE_FORMATS).map(function (key) {
    return DATE_FORMATS[key];
  });
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
      return result("empty", "", "");
    }

    if (start.empty || finish.empty) {
      return result("incomplete", "shift.startFinish", "Enter both start and finish.");
    }

    if (!start.valid || !finish.valid) {
      return result("invalid", "shift.validTime", "Use a valid 24-hour time.");
    }

    if (finish.minutes <= start.minutes) {
      return result(
        "invalid",
        "shift.finishAfterStart",
        "Finish must be later than start on the same day."
      );
    }

    if (breakStart.empty !== breakFinish.empty) {
      return result("incomplete", "shift.breakPair", "Enter both break start and break finish.");
    }

    if (!breakStart.empty && (!breakStart.valid || !breakFinish.valid)) {
      return result("invalid", "shift.validBreakTime", "Use a valid 24-hour break time.");
    }

    if (!breakStart.empty) {
      if (breakFinish.minutes <= breakStart.minutes) {
        return result(
          "invalid",
          "shift.breakFinishAfterStart",
          "Break finish must be later than break start."
        );
      }

      if (breakStart.minutes < start.minutes || breakFinish.minutes > finish.minutes) {
        return result(
          "invalid",
          "shift.breakInsideShift",
          "The break must be inside the work interval."
        );
      }

      explicitBreakMinutes = breakFinish.minutes - breakStart.minutes;
    }

    grossMinutes = finish.minutes - start.minutes;
    deductedBreakMinutes = grossMinutes >= AUTOMATIC_BREAK_THRESHOLD_MINUTES
      ? Math.max(explicitBreakMinutes, MINIMUM_BREAK_MINUTES)
      : explicitBreakMinutes;

    return {
      status: "valid",
      messageKey: "",
      message: "",
      grossMinutes: grossMinutes,
      explicitBreakMinutes: explicitBreakMinutes,
      deductedBreakMinutes: deductedBreakMinutes,
      automaticBreakMinutes: deductedBreakMinutes - explicitBreakMinutes,
      workedMinutes: grossMinutes - deductedBreakMinutes
    };
  }

  function result(status, messageKey, message) {
    return {
      status: status,
      messageKey: messageKey,
      message: message,
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

  function isSupportedYear(value) {
    return Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR;
  }

  function isSupportedDateKey(value) {
    var date = parseIsoDate(value);

    return Boolean(date && isSupportedYear(date.getFullYear()));
  }

  function isSupportedMonthKey(value) {
    var match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);

    return Boolean(match && isSupportedYear(Number(match[1])));
  }

  function isSupportedDateFormat(value) {
    return SUPPORTED_DATE_FORMATS.indexOf(value) !== -1;
  }

  function formatDate(dateKey, format, language) {
    var date = parseIsoDate(dateKey);
    var selectedFormat = isSupportedDateFormat(format) ? format : DATE_FORMATS.ISO;
    var monthNames = i18n.getCalendar(language).months;
    var year;
    var month;
    var day;

    if (!date) {
      return String(dateKey || "");
    }

    year = String(date.getFullYear());
    month = padTwo(date.getMonth() + 1);
    day = padTwo(date.getDate());

    if (selectedFormat === DATE_FORMATS.DAY_MONTH_YEAR_DOTS) {
      return day + "." + month + "." + year;
    }
    if (selectedFormat === DATE_FORMATS.MONTH_DAY_YEAR_SLASHES) {
      return month + "/" + day + "/" + year;
    }
    if (selectedFormat === DATE_FORMATS.MONTH_DAY_DASH) {
      return month + "-" + day;
    }
    if (selectedFormat === DATE_FORMATS.MONTH_DAY_SLASH) {
      return month + "/" + day;
    }
    if (selectedFormat === DATE_FORMATS.DAY_LONG_MONTH) {
      return Number(day) + " " + monthNames[date.getMonth()];
    }

    return year + "-" + month + "-" + day;
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
    var supportedStart = new Date(MIN_YEAR, 0, 1, 12);
    var supportedEnd = new Date(MAX_YEAR, 11, 31, 12);
    var weeks = [];
    var dates;
    var weekInfo;
    var index;

    if (!isSupportedYear(year) || monthIndex < 0 || monthIndex > 11) {
      return weeks;
    }

    cursor = cursor < supportedStart ? supportedStart : cursor;
    end = end > supportedEnd ? supportedEnd : end;

    while (cursor <= end) {
      dates = [];
      for (index = 0; index < 7 && addDays(cursor, index) <= end; index += 1) {
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
    var absoluteMonth;
    var year;
    var monthIndex;

    if (!match || !isSupportedMonthKey(monthKey) || !Number.isInteger(amount)) {
      return null;
    }

    absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + amount;
    year = Math.floor(absoluteMonth / 12);
    monthIndex = absoluteMonth % 12;

    if (!isSupportedYear(year)) {
      return null;
    }

    return year + "-" + padTwo(monthIndex + 1);
  }

  function isValidWeeklyHours(value) {
    return typeof value === "number"
      && Number.isFinite(value)
      && value >= 0
      && value <= 168;
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
    var absence = Boolean(entry && entry.absence === true);
    var workedMinutes = absence
      ? targetMinutes
      : shift.status === "valid" ? shift.workedMinutes : 0;
    var evaluated = absence || dateKey <= cutoff || shift.status === "valid";

    return {
      date: dateKey,
      shift: shift,
      absence: absence,
      evaluated: evaluated,
      weeklyHours: weeklyHours,
      targetMinutes: targetMinutes,
      workedMinutes: workedMinutes,
      balanceMinutes: evaluated ? workedMinutes - targetMinutes : null
    };
  }

  function summarizeDaySummaries(days) {
    var summary = {
      workedMinutes: 0,
      expectedMinutes: 0,
      plannedMinutes: 0,
      balanceMinutes: 0,
      evaluatedDays: 0
    };

    days.forEach(function (day) {
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

  function summarizeDates(dateKeys, entries, schedules, todayKey) {
    return summarizeDaySummaries(dateKeys.map(function (dateKey) {
      return getDaySummary(dateKey, entries && entries[dateKey], schedules, todayKey);
    }));
  }

  return {
    DEFAULT_WEEKLY_HOURS: DEFAULT_WEEKLY_HOURS,
    MIN_YEAR: MIN_YEAR,
    MAX_YEAR: MAX_YEAR,
    parseTime: parseTime,
    calculateShift: calculateShift,
    formatDuration: formatDuration,
    formatDecimalHours: formatDecimalHours,
    formatSignedDecimalHours: formatSignedDecimalHours,
    DATE_FORMATS: Object.assign({}, DATE_FORMATS),
    toIsoDate: toIsoDate,
    parseIsoDate: parseIsoDate,
    isSupportedYear: isSupportedYear,
    isSupportedDateKey: isSupportedDateKey,
    isSupportedMonthKey: isSupportedMonthKey,
    isSupportedDateFormat: isSupportedDateFormat,
    formatDate: formatDate,
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
    summarizeDaySummaries: summarizeDaySummaries,
    summarizeDates: summarizeDates
  };
});