(function (root) {
  "use strict";

  var core = root.TimesheetCore;
  var storageApi = root.TimesheetStorage;
  var MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var EMPTY_ENTRY = { start: "", finish: "", breakStart: "", breakFinish: "" };
  var today = new Date();
  var todayKey = core.toIsoDate(today);
  var viewDate = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  var browserStorage = storageApi.getBrowserStorage();
  var storageKey = getStorageKey();
  var loadResult = storageApi.loadState(browserStorage, storageKey);
  var state = loadResult.state;
  var storageWritable = loadResult.ok;
  var viewWeeks = [];
  var elements = {};

  function getStorageKey() {
    var requestedKey;

    try {
      requestedKey = new URLSearchParams(root.location.search).get("storageKey");
    } catch (error) {
      requestedKey = null;
    }

    return requestedKey && /^local-timesheet\.test\.[a-z0-9.-]+$/i.test(requestedKey)
      ? requestedKey
      : storageApi.STORAGE_KEY;
  }

  function initialize() {
    cacheElements();
    populateMonthSelect();
    bindEvents();
    initializeVisibleMonth();
    renderMonth();

    if (loadResult.message) {
      setStatus(loadResult.message, "error");
    } else {
      setStatus("Saved locally", "success");
    }

    document.body.dataset.appStatus = "ready";

    if (core.getMonthKey(todayKey) === core.getMonthKey(viewDate)) {
      root.requestAnimationFrame(function () {
        focusTimeInput(todayKey, "start");
      });
    }
  }

  function cacheElements() {
    [
      "saveStatus", "exportButton", "restoreButton", "restoreInput",
      "previousMonth", "monthSelect", "yearInput", "nextMonth", "todayButton",
      "weeklyHours", "scheduleMessage", "dailyTarget", "monthKeyLabel",
      "monthHeading", "summaryCutoff", "monthWorked", "monthWorkedDecimal",
      "monthExpected", "monthPlanned", "monthBalanceMetric", "monthBalance",
      "timesheetTable", "ledgerBody"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
    });
    elements.statusText = elements.saveStatus.querySelector("[data-status-text]");
  }

  function populateMonthSelect() {
    MONTH_NAMES.forEach(function (name, index) {
      var option = document.createElement("option");
      option.value = String(index);
      option.textContent = name;
      elements.monthSelect.appendChild(option);
    });
  }

  function bindEvents() {
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
    elements.exportButton.addEventListener("click", downloadBackup);
    elements.restoreButton.addEventListener("click", function () {
      elements.restoreInput.click();
    });
    elements.restoreInput.addEventListener("change", restoreBackup);
  }

  function initializeVisibleMonth() {
    var result = storageApi.ensureMonthSchedule(state, core.getMonthKey(viewDate));
    if (result.changed && storageWritable) {
      persistState();
    }
  }

  function setStatus(message, tone) {
    elements.statusText.textContent = message;
    elements.saveStatus.dataset.tone = tone || "neutral";
    elements.saveStatus.title = message;
  }

  function persistState() {
    var result;

    if (!storageWritable) {
      setStatus("This edit was not saved. Restore a valid backup to replace unreadable storage.", "error");
      return false;
    }

    result = storageApi.saveState(browserStorage, state, storageKey);
    setStatus(result.message, result.ok ? "success" : "error");
    return result.ok;
  }

  function renderMonth() {
    var monthKey = core.getMonthKey(viewDate);
    var weeklyHours = core.getEffectiveWeeklyHours(monthKey, state.schedules);

    elements.monthSelect.value = String(viewDate.getMonth());
    elements.yearInput.value = String(viewDate.getFullYear());
    elements.weeklyHours.value = String(weeklyHours);
    elements.weeklyHours.setAttribute("aria-invalid", "false");
    elements.scheduleMessage.textContent = "";
    elements.monthKeyLabel.textContent = monthKey;
    elements.monthHeading.textContent = MONTH_NAMES[viewDate.getMonth()] + " " + viewDate.getFullYear();
    document.title = elements.monthHeading.textContent + " - Timesheet";

    viewWeeks = core.buildMonthWeeks(viewDate.getFullYear(), viewDate.getMonth());
    elements.ledgerBody.innerHTML = viewWeeks.map(renderWeek).join("");
    renderComputedValues();
  }

  function renderWeek(week, weekIndex) {
    var rows = week.dates.map(renderDayRow).join("");
    var firstDate = week.dates[0];
    var lastDate = week.dates[6];

    return rows
      + '<tr class="week-summary" data-week-index="' + weekIndex + '">'
      + '<th scope="row" colspan="5">'
      + '<span class="week-label">Week ' + week.week + '</span>'
      + '<span class="week-range">' + firstDate + ' to ' + lastDate + '</span>'
      + '<span class="week-target" data-week-target></span>'
      + '</th>'
      + '<td class="result-cell"><output class="result-value" data-week-worked>--</output></td>'
      + '<td class="decimal-cell"><output class="decimal-value" data-week-decimal>--</output></td>'
      + '<td class="balance-cell"><output class="balance-value" data-balance="neutral" data-week-balance>--</output></td>'
      + '</tr>';
  }

  function renderDayRow(dateKey) {
    var date = core.parseIsoDate(dateKey);
    var entry = state.entries[dateKey] || EMPTY_ENTRY;
    var selectedMonthKey = core.getMonthKey(viewDate);
    var classes = ["day-row"];
    var day = date.getDay();
    var messageId = "message-" + dateKey;

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
      + '<div class="date-line"><time datetime="' + dateKey + '">' + dateKey + '</time>'
      + '<span class="weekday">' + WEEKDAY_NAMES[day] + '</span></div>'
      + '<span id="' + messageId + '" class="row-message"></span>'
      + '</th>'
      + renderTimeCell(dateKey, "start", "Start", entry.start, messageId)
      + renderTimeCell(dateKey, "finish", "Finish", entry.finish, messageId)
      + renderTimeCell(dateKey, "breakStart", "Break start", entry.breakStart, messageId)
      + renderTimeCell(dateKey, "breakFinish", "Break finish", entry.breakFinish, messageId)
      + '<td class="result-cell"><output class="result-value" data-day-worked>--</output>'
      + '<span class="work-note" data-work-note></span></td>'
      + '<td class="decimal-cell"><output class="decimal-value" data-day-decimal>--</output></td>'
      + '<td class="balance-cell"><output class="balance-value" data-balance="neutral" data-day-balance>--</output></td>'
      + '</tr>';
  }

  function renderTimeCell(dateKey, field, label, value, messageId) {
    return '<td><input class="time-input" type="text" inputmode="numeric" maxlength="5"'
      + ' autocomplete="off" spellcheck="false" placeholder="--:--"'
      + ' aria-label="' + label + ' for ' + dateKey + '" aria-describedby="' + messageId + '"'
      + ' aria-invalid="false" data-field="' + field + '" value="' + escapeHtml(value) + '"></td>';
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
    var monthDates = core.getMonthDateKeys(viewDate.getFullYear(), viewDate.getMonth());
    var monthSummary = core.summarizeDates(monthDates, state.entries, state.schedules, todayKey);

    elements.ledgerBody.querySelectorAll(".day-row").forEach(updateDayRow);
    elements.ledgerBody.querySelectorAll(".week-summary").forEach(updateWeekRow);
    updateMonthSummary(monthDates, monthSummary);
    updateScheduleSummary();
  }

  function updateDayRow(row) {
    var dateKey = row.dataset.date;
    var summary = core.getDaySummary(dateKey, state.entries[dateKey], state.schedules, todayKey);
    var shift = summary.shift;
    var hasError = shift.status === "invalid" || shift.status === "incomplete";
    var workedOutput = row.querySelector("[data-day-worked]");
    var decimalOutput = row.querySelector("[data-day-decimal]");
    var balanceOutput = row.querySelector("[data-day-balance]");
    var workNote = row.querySelector("[data-work-note]");
    var rowMessage = row.querySelector(".row-message");

    row.classList.toggle("has-error", hasError);
    row.querySelectorAll(".time-input").forEach(function (input) {
      input.setAttribute("aria-invalid", hasError ? "true" : "false");
    });
    rowMessage.textContent = hasError ? shift.message : "";
    rowMessage.title = hasError ? shift.message : "";

    if (shift.status === "valid") {
      workedOutput.textContent = core.formatDuration(shift.workedMinutes);
      decimalOutput.textContent = core.formatDecimalHours(shift.workedMinutes);
      workNote.textContent = shift.automaticBreakMinutes > 0
        ? shift.automaticBreakMinutes + "m auto break"
        : "";
    } else {
      workedOutput.textContent = "--";
      decimalOutput.textContent = "--";
      workNote.textContent = "";
    }

    setBalanceOutput(balanceOutput, summary.balanceMinutes, summary.evaluated);
    balanceOutput.title = summary.evaluated
      ? core.formatDecimalHours(summary.workedMinutes) + " worked - "
        + core.formatDecimalHours(summary.targetMinutes) + " target"
      : "Not due yet";
  }

  function updateWeekRow(row) {
    var week = viewWeeks[Number(row.dataset.weekIndex)];
    var summary = core.summarizeDates(week.dates, state.entries, state.schedules, todayKey);
    var hasEvaluatedDate = week.dates.some(function (dateKey) {
      return dateKey <= todayKey;
    });

    row.querySelector("[data-week-target]").textContent = hasEvaluatedDate
      ? core.formatDecimalHours(summary.expectedMinutes) + "h target to date"
      : "Not due yet";
    row.querySelector("[data-week-worked]").textContent = hasEvaluatedDate
      ? core.formatDuration(summary.workedMinutes)
      : "--";
    row.querySelector("[data-week-decimal]").textContent = hasEvaluatedDate
      ? core.formatDecimalHours(summary.workedMinutes)
      : "--";
    setBalanceOutput(row.querySelector("[data-week-balance]"), summary.balanceMinutes, hasEvaluatedDate);
  }

  function updateMonthSummary(monthDates, summary) {
    var hasEvaluatedDate = monthDates.some(function (dateKey) {
      return dateKey <= todayKey;
    });
    var monthEnd = monthDates[monthDates.length - 1];
    var cutoff = monthEnd < todayKey ? monthEnd : todayKey;

    elements.summaryCutoff.textContent = hasEvaluatedDate ? "Through " + cutoff : "Not due yet";
    elements.monthWorked.textContent = hasEvaluatedDate
      ? core.formatDuration(summary.workedMinutes)
      : "--";
    elements.monthWorkedDecimal.textContent = hasEvaluatedDate
      ? core.formatDecimalHours(summary.workedMinutes) + " decimal hours"
      : "--";
    elements.monthExpected.textContent = hasEvaluatedDate
      ? core.formatDecimalHours(summary.expectedMinutes) + " h"
      : "--";
    elements.monthPlanned.textContent = core.formatDecimalHours(summary.plannedMinutes) + " h";
    elements.monthBalance.textContent = hasEvaluatedDate
      ? core.formatSignedDecimalHours(summary.balanceMinutes) + " h"
      : "--";
    elements.monthBalanceMetric.dataset.balance = hasEvaluatedDate
      ? getBalanceTone(summary.balanceMinutes)
      : "neutral";
  }

  function updateScheduleSummary() {
    var monthKey = core.getMonthKey(viewDate);
    var weeklyHours = core.getEffectiveWeeklyHours(monthKey, state.schedules);
    var dailyMinutes = weeklyHours * 60 / 5;

    elements.dailyTarget.textContent = core.formatDecimalHours(dailyMinutes) + " h each weekday";
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
    if (!state.entries[dateKey]) {
      state.entries[dateKey] = {
        start: "",
        finish: "",
        breakStart: "",
        breakFinish: ""
      };
    }

    return state.entries[dateKey];
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
    persistState();
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
    persistState();
    renderComputedValues();
  }

  function onScheduleInput() {
    var raw = elements.weeklyHours.value.trim();
    var monthKey = core.getMonthKey(viewDate);
    var value = Number(raw);
    var valid = raw !== "" && core.isValidWeeklyHours(value);

    elements.weeklyHours.setAttribute("aria-invalid", valid ? "false" : "true");
    elements.scheduleMessage.textContent = valid ? "" : "Enter 0 to 168 hours.";

    if (!valid) {
      return;
    }

    state.schedules[monthKey] = value;
    persistState();
    renderComputedValues();
  }

  function onScheduleBlur() {
    var monthKey = core.getMonthKey(viewDate);

    if (elements.weeklyHours.getAttribute("aria-invalid") === "true") {
      elements.weeklyHours.value = String(core.getEffectiveWeeklyHours(monthKey, state.schedules));
      elements.weeklyHours.setAttribute("aria-invalid", "false");
      elements.scheduleMessage.textContent = "";
    }
  }

  function onPeriodChange() {
    var year = Number(elements.yearInput.value);
    var month = Number(elements.monthSelect.value);

    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      elements.yearInput.value = String(viewDate.getFullYear());
      setStatus("Choose a year from 1900 to 9999.", "warning");
      return;
    }

    viewDate = new Date(year, month, 1, 12);
    initializeVisibleMonth();
    renderMonth();
  }

  function changeMonth(amount) {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + amount, 1, 12);
    initializeVisibleMonth();
    renderMonth();
  }

  function goToToday() {
    viewDate = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    initializeVisibleMonth();
    renderMonth();
    root.requestAnimationFrame(function () {
      focusTimeInput(todayKey, "start");
    });
  }

  function focusTimeInput(dateKey, field) {
    var input = elements.ledgerBody.querySelector(
      '[data-date="' + dateKey + '"] [data-field="' + field + '"]'
    );
    var row;
    var tableFrame;
    var targetTop;

    if (input) {
      input.focus({ preventScroll: true });
      input.select();
      row = input.closest("tr");
      tableFrame = input.closest(".table-frame");
      targetTop = row.offsetTop - (tableFrame.clientHeight - row.offsetHeight) / 2;
      tableFrame.scrollTop = Math.max(0, targetTop);
    }
  }

  function downloadBackup() {
    var json;
    var blob;
    var url;
    var link;

    try {
      json = storageApi.serializeBackup(state);
      blob = new Blob([json], { type: "application/json" });
      url = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = url;
      link.download = "timesheet-backup-" + todayKey + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 0);
      setStatus("Backup downloaded", "success");
    } catch (error) {
      setStatus("The backup could not be created.", "error");
    }
  }

  function restoreBackup() {
    var file = elements.restoreInput.files && elements.restoreInput.files[0];
    var reader;

    if (!file) {
      return;
    }

    reader = new FileReader();
    reader.addEventListener("load", function () {
      applyBackup(String(reader.result || ""));
      elements.restoreInput.value = "";
    });
    reader.addEventListener("error", function () {
      setStatus("The selected backup could not be read.", "error");
      elements.restoreInput.value = "";
    });
    reader.readAsText(file);
  }

  function applyBackup(text) {
    var parsed = storageApi.parseBackup(text);
    var merged;
    var result;

    if (!parsed.valid) {
      setStatus(parsed.error, "error");
      return;
    }

    if (!root.confirm(
      "Restore this backup? Imported entries and monthly hours will replace matching local values. Other local dates will stay."
    )) {
      setStatus("Restore cancelled", "neutral");
      return;
    }

    merged = storageApi.mergeStates(state, parsed.state);
    storageApi.ensureMonthSchedule(merged, core.getMonthKey(viewDate));
    result = storageApi.saveState(browserStorage, merged, storageKey);

    if (!result.ok) {
      setStatus(result.message, "error");
      return;
    }

    state = merged;
    storageWritable = true;
    renderMonth();
    setStatus("Backup restored and saved", "success");
  }

  root.TimesheetApp = {
    getState: function () {
      return storageApi.cloneState(state);
    },
    getViewMonth: function () {
      return core.getMonthKey(viewDate);
    },
    render: renderMonth
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})(window);