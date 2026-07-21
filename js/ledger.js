(function (root, factory) {
  "use strict";

  var core = root.TimesheetCore;
  var model = root.TimesheetModel;
  var i18n = root.TimesheetI18n;
  var api;

  if (!core && typeof require === "function") {
    core = require("./core.js");
  }
  if (!model && typeof require === "function") {
    model = require("./model.js");
  }
  if (!i18n && typeof require === "function") {
    i18n = require("./i18n.js");
  }

  api = factory(root, core, model, i18n);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetLedger = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, core, model, i18n) {
  "use strict";

  function create(options) {
    var elements = options.elements;
    var emptyEntry = model.createEmptyEntry();
    var today = new root.Date();
    var todayKey = core.toIsoDate(today);
    var viewDate = new root.Date(today.getFullYear(), today.getMonth(), 1, 12);
    var viewWeeks = [];

    function initialize() {
      elements.yearInput.min = String(core.MIN_YEAR);
      elements.yearInput.max = String(core.MAX_YEAR);
      initializeVisibleMonth();
      render();

      if (core.getMonthKey(todayKey) === core.getMonthKey(viewDate)) {
        focusTimeInput(todayKey, "start");
      }
    }

    function bind() {
      root.addEventListener("focus", refreshCurrentDate);
      root.document.addEventListener("visibilitychange", onVisibilityChange);
      elements.previousMonth.addEventListener("click", function () {
        changeMonth(-1);
      });
      elements.nextMonth.addEventListener("click", function () {
        changeMonth(1);
      });
      elements.todayButton.addEventListener("click", goToToday);
      elements.monthSelect.addEventListener("change", onPeriodChange);
      elements.yearInput.addEventListener("change", onPeriodChange);
      elements.yearInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      });
      elements.weeklyHours.addEventListener("input", onScheduleInput);
      elements.weeklyHours.addEventListener("blur", onScheduleBlur);
      elements.ledgerBody.addEventListener("input", onTimeInput);
      elements.ledgerBody.addEventListener("focusout", onTimeBlur);
      elements.ledgerBody.addEventListener("change", onAbsenceChange);
    }

    function refreshLanguage() {
      renderStructure();
      populateMonthSelect();
    }

    function populateMonthSelect() {
      var selectedMonth = String(viewDate.getMonth());
      var language = options.getState().preferences.language;

      elements.monthSelect.innerHTML = "";
      i18n.getCalendar(language).months.forEach(function (name, index) {
        var option = root.document.createElement("option");
        option.value = String(index);
        option.textContent = name;
        elements.monthSelect.appendChild(option);
      });
      elements.monthSelect.value = selectedMonth;
    }

    function renderStructure() {
      var fields = model.getEntryFields();

      elements.timesheetColgroup.innerHTML = '<col class="date-column">'
        + fields.map(function () {
          return '<col class="time-column">';
        }).join("")
        + '<col class="absence-column">'
        + '<col class="result-column">'
        + '<col class="decimal-column">'
        + '<col class="balance-column">';

      elements.ledgerHeaderRow.innerHTML = '<th scope="col">'
        + escapeHtml(options.translate("column.date")) + '</th>'
        + fields.map(function (field) {
          return '<th scope="col" data-entry-field-heading="' + field.key + '">'
            + escapeHtml(options.translate(field.labelKey)) + '</th>';
        }).join("")
        + '<th scope="col" class="absence-heading">'
        + escapeHtml(options.translate("column.absence")) + '</th>'
        + '<th scope="col">' + escapeHtml(options.translate("column.worked")) + '</th>'
        + '<th scope="col">' + escapeHtml(options.translate("column.decimal")) + '</th>'
        + '<th scope="col">' + escapeHtml(options.translate("column.balance")) + '</th>';
    }

    function onVisibilityChange() {
      if (!root.document.hidden) {
        refreshCurrentDate();
      }
    }

    function refreshCurrentDate() {
      var previousTodayKey = todayKey;
      var nextToday = new root.Date();
      var nextTodayKey = core.toIsoDate(nextToday);
      var followsToday = core.getMonthKey(viewDate) === core.getMonthKey(previousTodayKey);

      if (nextTodayKey === previousTodayKey) {
        return;
      }

      today = nextToday;
      todayKey = nextTodayKey;

      if (followsToday) {
        viewDate = new root.Date(today.getFullYear(), today.getMonth(), 1, 12);
        initializeVisibleMonth();
      }

      render();
    }

    function initializeVisibleMonth() {
      var result = model.ensureMonthSchedule(options.getState(), core.getMonthKey(viewDate));

      if (result.changed && options.canPersist()) {
        options.persistState();
      }
    }

    function render() {
      var state = options.getState();
      var monthKey = core.getMonthKey(viewDate);
      var weeklyHours = core.getEffectiveWeeklyHours(monthKey, state.schedules);
      var monthName = i18n.getCalendar(state.preferences.language).months[viewDate.getMonth()];

      elements.monthSelect.value = String(viewDate.getMonth());
      elements.yearInput.value = String(viewDate.getFullYear());
      updatePeriodNavigation();
      elements.weeklyHours.value = String(weeklyHours);
      elements.weeklyHours.setAttribute("aria-invalid", "false");
      elements.scheduleMessage.textContent = "";
      root.document.title = options.translate("title.month", {
        month: monthName,
        year: viewDate.getFullYear()
      });

      viewWeeks = core.buildMonthWeeks(viewDate.getFullYear(), viewDate.getMonth());
      elements.ledgerBody.innerHTML = viewWeeks.map(renderWeek).join("");
      renderComputedValues();
    }

    function renderWeek(week, weekIndex) {
      var rows = week.dates.map(renderDayRow).join("");
      var firstDate = week.dates[0];
      var lastDate = week.dates[week.dates.length - 1];

      return rows
        + '<tr class="week-summary" data-week-index="' + weekIndex + '">'
        + '<th scope="row" colspan="' + (model.getEntryFields().length + 2) + '">'
        + '<span class="week-label">'
        + escapeHtml(options.translate("week.label", { week: week.week })) + '</span>'
        + '<span class="week-range">' + escapeHtml(options.translate("range.to", {
          start: formatDisplayDate(firstDate),
          end: formatDisplayDate(lastDate)
        })) + '</span>'
        + '<span class="week-target" data-week-target></span>'
        + '</th>'
        + '<td class="result-cell"><output class="result-value" data-week-worked>--</output></td>'
        + '<td class="decimal-cell"><output class="decimal-value" data-week-decimal>--</output></td>'
        + '<td class="balance-cell"><output class="balance-value" data-balance="neutral" data-week-balance>--</output></td>'
        + '</tr>';
    }

    function renderDayRow(dateKey) {
      var state = options.getState();
      var date = core.parseIsoDate(dateKey);
      var entry = state.entries[dateKey] || emptyEntry;
      var selectedMonthKey = core.getMonthKey(viewDate);
      var classes = ["day-row"];
      var day = date.getDay();
      var messageId = "message-" + dateKey;
      var weekdayName = i18n.getCalendar(state.preferences.language).weekdays[day];

      if (day === 0 || day === 6) {
        classes.push("is-weekend");
      }
      if (core.getMonthKey(dateKey) !== selectedMonthKey) {
        classes.push("is-adjacent");
      }
      if (dateKey === todayKey) {
        classes.push("is-today");
      }
      if (dateKey > todayKey) {
        classes.push("is-future");
      }

      return '<tr class="' + classes.join(" ") + '" data-date="' + dateKey + '">'
        + '<th scope="row" class="date-cell">'
        + '<div class="date-line"><time datetime="' + dateKey + '">'
        + formatDisplayDate(dateKey) + '</time>'
        + '<span class="weekday">' + escapeHtml(weekdayName) + '</span></div>'
        + '<span id="' + messageId + '" class="row-message"></span>'
        + '</th>'
        + model.getEntryFields().map(function (field) {
          return renderTimeCell(dateKey, field, entry[field.key], messageId);
        }).join("")
        + renderAbsenceCell(dateKey, entry.absence === true)
        + '<td class="result-cell"><output class="result-value" data-day-worked>--</output>'
        + '<span class="work-note" data-work-note></span></td>'
        + '<td class="decimal-cell"><output class="decimal-value" data-day-decimal>--</output></td>'
        + '<td class="balance-cell"><output class="balance-value" data-balance="neutral" data-day-balance>--</output></td>'
        + '</tr>';
    }

    function renderTimeCell(dateKey, field, value, messageId) {
      var label = options.translate(field.labelKey);
      var inputLabel = options.translate("time.inputLabel", {
        label: label,
        date: formatDisplayDate(dateKey)
      });

      return '<td><input class="time-input" type="text" inputmode="' + field.inputMode
        + '" maxlength="' + field.maxLength + '"'
        + ' autocomplete="off" spellcheck="false" placeholder="--:--"'
        + ' aria-label="' + escapeHtml(inputLabel) + '" aria-describedby="' + messageId + '"'
        + ' aria-invalid="false" data-field="' + field.key + '" value="'
        + escapeHtml(value) + '"></td>';
    }

    function renderAbsenceCell(dateKey, checked) {
      var inputLabel = options.translate("absence.inputLabel", {
        date: formatDisplayDate(dateKey)
      });

      return '<td class="absence-cell"><label class="absence-control">'
        + '<input class="absence-input" type="checkbox" aria-label="'
        + escapeHtml(inputLabel) + '"' + (checked ? " checked" : "") + '>'
        + '</label></td>';
    }

    function formatDisplayDate(dateKey) {
      var preferences = options.getState().preferences;

      return core.formatDate(dateKey, preferences.dateFormat, preferences.language);
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function renderComputedValues() {
      var state = options.getState();
      var monthDates = core.getMonthDateKeys(viewDate.getFullYear(), viewDate.getMonth());
      var summaries = {};
      var monthSummary;

      function getSummary(dateKey) {
        if (!Object.prototype.hasOwnProperty.call(summaries, dateKey)) {
          summaries[dateKey] = core.getDaySummary(
            dateKey,
            state.entries[dateKey],
            state.schedules,
            todayKey
          );
        }

        return summaries[dateKey];
      }

      monthSummary = core.summarizeDaySummaries(monthDates.map(getSummary));
      elements.ledgerBody.querySelectorAll(".day-row").forEach(function (row) {
        updateDayRow(row, getSummary(row.dataset.date));
      });
      elements.ledgerBody.querySelectorAll(".week-summary").forEach(function (row) {
        updateWeekRow(row, getSummary);
      });
      updateMonthSummary(monthSummary);
      updateScheduleSummary();
    }

    function updateDayRow(row, summary) {
      var shift = summary.shift;
      var hasError = shift.status === "invalid" || shift.status === "incomplete";
      var workedOutput = row.querySelector("[data-day-worked]");
      var decimalOutput = row.querySelector("[data-day-decimal]");
      var balanceOutput = row.querySelector("[data-day-balance]");
      var workNote = row.querySelector("[data-work-note]");
      var rowMessage = row.querySelector(".row-message");
      var absenceInput = row.querySelector(".absence-input");

      hasError = !summary.absence && hasError;
      row.classList.toggle("has-error", hasError);
      row.classList.toggle("is-absence", summary.absence);
      absenceInput.checked = summary.absence;
      row.querySelectorAll(".time-input").forEach(function (input) {
        input.disabled = summary.absence;
        input.setAttribute("aria-invalid", hasError ? "true" : "false");
      });
      rowMessage.textContent = hasError
        ? options.translate(shift.messageKey, {}, shift.message)
        : "";
      rowMessage.title = rowMessage.textContent;

      if (summary.absence) {
        workedOutput.textContent = core.formatDuration(summary.workedMinutes);
        decimalOutput.textContent = core.formatDecimalHours(summary.workedMinutes);
        workNote.textContent = options.translate("work.absence");
      } else if (shift.status === "valid") {
        workedOutput.textContent = core.formatDuration(summary.workedMinutes);
        decimalOutput.textContent = core.formatDecimalHours(summary.workedMinutes);
        workNote.textContent = shift.automaticBreakMinutes > 0
          ? options.translate("work.autoBreak", { minutes: shift.automaticBreakMinutes })
          : "";
      } else {
        workedOutput.textContent = "--";
        decimalOutput.textContent = "--";
        workNote.textContent = "";
      }

      setBalanceOutput(balanceOutput, summary.balanceMinutes, summary.evaluated);
      balanceOutput.title = summary.evaluated
        ? options.translate("balance.detail", {
          worked: core.formatDecimalHours(summary.workedMinutes),
          target: core.formatDecimalHours(summary.targetMinutes)
        })
        : options.translate("summary.notDueYet");
    }

    function updateWeekRow(row, getSummary) {
      var week = viewWeeks[Number(row.dataset.weekIndex)];
      var summary = core.summarizeDaySummaries(week.dates.map(getSummary));
      var hasEvaluatedDate = summary.evaluatedDays > 0;

      row.querySelector("[data-week-target]").textContent = hasEvaluatedDate
        ? options.translate("summary.expectedHours", {
          hours: core.formatDecimalHours(summary.expectedMinutes)
        })
        : options.translate("summary.notDueYet");
      row.querySelector("[data-week-worked]").textContent = hasEvaluatedDate
        ? core.formatDuration(summary.workedMinutes)
        : "--";
      row.querySelector("[data-week-decimal]").textContent = hasEvaluatedDate
        ? core.formatDecimalHours(summary.workedMinutes)
        : "--";
      setBalanceOutput(
        row.querySelector("[data-week-balance]"),
        summary.balanceMinutes,
        hasEvaluatedDate
      );
    }

    function updateMonthSummary(summary) {
      var hasEvaluatedDate = summary.evaluatedDays > 0;

      elements.monthWorked.textContent = hasEvaluatedDate
        ? core.formatDuration(summary.workedMinutes)
        : "--";
      elements.monthWorkedDecimal.textContent = hasEvaluatedDate
        ? options.translate("summary.decimalHours", {
          hours: core.formatDecimalHours(summary.workedMinutes)
        })
        : "--";
      elements.monthExpected.textContent = hasEvaluatedDate
        ? core.formatDuration(summary.expectedMinutes)
        : "--";
      elements.monthExpectedDecimal.textContent = hasEvaluatedDate
        ? options.translate("summary.decimalHours", {
          hours: core.formatDecimalHours(summary.expectedMinutes)
        })
        : "--";
      elements.monthBalance.textContent = hasEvaluatedDate
        ? options.translate("summary.hours", {
          hours: core.formatSignedDecimalHours(summary.balanceMinutes)
        })
        : "--";
      elements.monthBalanceMetric.dataset.balance = hasEvaluatedDate
        ? getBalanceTone(summary.balanceMinutes)
        : "neutral";
    }

    function updateScheduleSummary() {
      var weeklyHours = core.getEffectiveWeeklyHours(
        core.getMonthKey(viewDate),
        options.getState().schedules
      );
      var weekdayKey = core.getMonthDateKeys(
        viewDate.getFullYear(),
        viewDate.getMonth()
      ).find(core.isWeekday);
      var dailyMinutes = core.getDailyTargetMinutes(weekdayKey, weeklyHours);

      elements.dailyTarget.textContent = options.translate("schedule.eachWeekday", {
        hours: core.formatDecimalHours(dailyMinutes)
      });
    }

    function setBalanceOutput(output, minutes, evaluated) {
      if (!evaluated || minutes === null) {
        output.textContent = "--";
        output.dataset.balance = "neutral";
        return;
      }

      output.textContent = core.formatSignedDecimalHours(minutes);
      output.dataset.balance = getBalanceTone(minutes);
    }

    function getBalanceTone(minutes) {
      if (minutes > 0.0001) {
        return "positive";
      }
      if (minutes < -0.0001) {
        return "negative";
      }
      return "neutral";
    }

    function getOrCreateEntry(dateKey) {
      var state = options.getState();

      if (!state.entries[dateKey]) {
        state.entries[dateKey] = model.createEmptyEntry();
      }

      return state.entries[dateKey];
    }

    function pruneEmptyEntry(dateKey) {
      var state = options.getState();

      if (model.isEntryEmpty(state.entries[dateKey])) {
        delete state.entries[dateKey];
      }
    }

    function onTimeInput(event) {
      var input = event.target.closest(".time-input");
      var row;
      var entry;

      if (!input) {
        return;
      }

      row = input.closest(".day-row");
      entry = getOrCreateEntry(row.dataset.date);
      entry[input.dataset.field] = input.value;
      pruneEmptyEntry(row.dataset.date);
      options.persistState();
      renderComputedValues();
    }

    function onTimeBlur(event) {
      var input = event.target.closest(".time-input");
      var parsed;
      var row;

      if (!input || input.value.trim() === "") {
        return;
      }

      parsed = core.parseTime(input.value);
      if (!parsed.valid || parsed.normalized === input.value) {
        return;
      }

      row = input.closest(".day-row");
      input.value = parsed.normalized;
      getOrCreateEntry(row.dataset.date)[input.dataset.field] = parsed.normalized;
      options.persistState();
      renderComputedValues();
    }

    function onAbsenceChange(event) {
      var input = event.target.closest(".absence-input");
      var row;

      if (!input) {
        return;
      }

      row = input.closest(".day-row");
      getOrCreateEntry(row.dataset.date).absence = input.checked;
      pruneEmptyEntry(row.dataset.date);
      options.persistState();
      renderComputedValues();
    }

    function onScheduleInput() {
      var raw = elements.weeklyHours.value.trim();
      var monthKey = core.getMonthKey(viewDate);
      var value = Number(raw);
      var valid = raw !== "" && core.isValidWeeklyHours(value);

      elements.weeklyHours.setAttribute("aria-invalid", valid ? "false" : "true");
      elements.scheduleMessage.textContent = valid ? "" : options.translate("validation.hours");

      if (!valid) {
        return;
      }

      options.getState().schedules[monthKey] = value;
      options.persistState();
      renderComputedValues();
    }

    function onScheduleBlur() {
      if (elements.weeklyHours.getAttribute("aria-invalid") === "true") {
        elements.weeklyHours.value = String(core.getEffectiveWeeklyHours(
          core.getMonthKey(viewDate),
          options.getState().schedules
        ));
        elements.weeklyHours.setAttribute("aria-invalid", "false");
        elements.scheduleMessage.textContent = "";
      }
    }

    function onPeriodChange() {
      var year = Number(elements.yearInput.value);
      var month = Number(elements.monthSelect.value);

      if (!core.isSupportedYear(year) || !Number.isInteger(month) || month < 0 || month > 11) {
        elements.yearInput.value = String(viewDate.getFullYear());
        options.setStatus("validation.year", "warning", {
          min: core.MIN_YEAR,
          max: core.MAX_YEAR
        });
        return;
      }

      viewDate = new root.Date(year, month, 1, 12);
      initializeVisibleMonth();
      render();
    }

    function changeMonth(amount) {
      var monthKey = core.shiftMonthKey(core.getMonthKey(viewDate), amount);

      if (!monthKey) {
        updatePeriodNavigation();
        return;
      }

      viewDate = core.parseIsoDate(monthKey + "-01");
      initializeVisibleMonth();
      render();
    }

    function updatePeriodNavigation() {
      var monthKey = core.getMonthKey(viewDate);

      elements.previousMonth.disabled = core.shiftMonthKey(monthKey, -1) === null;
      elements.nextMonth.disabled = core.shiftMonthKey(monthKey, 1) === null;
    }

    function goToToday() {
      today = new root.Date();
      todayKey = core.toIsoDate(today);
      viewDate = new root.Date(today.getFullYear(), today.getMonth(), 1, 12);
      initializeVisibleMonth();
      render();
      focusTimeInput(todayKey, "start");
    }

    function focusTimeInput(dateKey, field) {
      var input = elements.ledgerBody.querySelector(
        '[data-date="' + dateKey + '"] [data-field="' + field + '"]'
      );
      var row;
      var tableFrame;
      var targetTop;

      if (input && !input.disabled) {
        input.focus({ preventScroll: true });
        input.select();
        row = input.closest("tr");
        tableFrame = input.closest(".table-frame");
        targetTop = row.offsetTop - (tableFrame.clientHeight - row.offsetHeight) / 2;
        tableFrame.scrollTop = Math.max(0, targetTop);
      }
    }

    function getViewMonth() {
      return core.getMonthKey(viewDate);
    }

    function getTodayKey() {
      return todayKey;
    }

    return {
      initialize: initialize,
      bind: bind,
      refreshLanguage: refreshLanguage,
      render: render,
      getViewMonth: getViewMonth,
      getTodayKey: getTodayKey
    };
  }

  return { create: create };
});