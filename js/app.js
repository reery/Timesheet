(function (root) {
  "use strict";

  var i18n = root.TimesheetI18n;
  var core = root.TimesheetCore;
  var storageApi = root.TimesheetStorage;
  var APP_VERSION = "v0.4";
  var MOBILE_MENU_QUERY = "(max-width: 840px)";
  var EMPTY_ENTRY = {
    start: "",
    finish: "",
    breakStart: "",
    breakFinish: "",
    absence: false
  };
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
  var currentStatus = null;
  var mobileMenuMedia = root.matchMedia(MOBILE_MENU_QUERY);

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
    initializeVersion();
    populateLanguageSelect();
    applyPreferences();
    bindEvents();
    initializeVisibleMonth();
    renderMonth();

    if (loadResult.message) {
      setDiagnosticStatus(loadResult, "error");
    } else {
      setStatus("storage.saved", "success");
    }

    document.body.dataset.appStatus = "ready";

    if (core.getMonthKey(todayKey) === core.getMonthKey(viewDate)) {
      focusTimeInput(todayKey, "start");
    }
  }

  function cacheElements() {
    [
      "saveStatus", "exportButton", "restoreButton", "restoreInput", "settingsButton",
      "menuButton", "headerActions", "settingsDialog", "settingsCloseButton",
      "dateFormatSelect", "languageSelect", "designSelect",
      "previousMonth", "monthSelect", "yearInput", "nextMonth", "todayButton",
      "weeklyHours", "scheduleMessage", "dailyTarget", "monthKeyLabel",
      "monthHeading", "summaryCutoff", "monthWorked", "monthWorkedDecimal",
      "monthExpected", "monthExpectedDecimal", "monthPlanned", "monthBalanceMetric", "monthBalance",
      "timesheetTable", "ledgerBody"
    ].forEach(function (id) {
      elements[id] = document.getElementById(id);
    });
    elements.statusText = elements.saveStatus.querySelector("[data-status-text]");
  }

  function initializeVersion() {
    document.querySelectorAll("[data-app-version]").forEach(function (element) {
      element.textContent = APP_VERSION;
    });
    document.querySelectorAll("[data-about-version]").forEach(function (element) {
      element.textContent = "Timesheet " + APP_VERSION;
    });
  }

  function translate(key, parameters, fallback) {
    var value = key ? i18n.translate(state.preferences.language, key, parameters) : "";

    if ((!value || value === key) && fallback) {
      return fallback;
    }

    return value;
  }

  function translateDiagnostic(key, parameters, fallback) {
    var resolvedParameters = Object.assign({}, parameters || {});

    if (resolvedParameters.errorKey) {
      resolvedParameters.error = translate(
        resolvedParameters.errorKey,
        resolvedParameters.errorParams,
        resolvedParameters.error || ""
      );
    }

    return translate(key, resolvedParameters, fallback);
  }

  function translateStaticContent() {
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (element) {
      element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (element) {
      element.title = translate(element.dataset.i18nTitle);
    });
  }

  function populateLanguageSelect() {
    elements.languageSelect.innerHTML = "";
    i18n.SUPPORTED_LANGUAGES.forEach(function (language) {
      var option = document.createElement("option");
      option.value = language;
      option.textContent = i18n.getLanguageName(language);
      elements.languageSelect.appendChild(option);
    });
  }

  function applyLanguage() {
    document.documentElement.lang = state.preferences.language;
    translateStaticContent();
    populateMonthSelect();
    setHeaderMenuOpen(elements.headerActions.dataset.open === "true");

    if (currentStatus) {
      renderStatus();
    }
  }

  function applyDesign() {
    var design = storageApi.SUPPORTED_DESIGNS.indexOf(state.preferences.design) !== -1
      ? state.preferences.design
      : "default-gradient";

    document.documentElement.dataset.design = design;
    elements.designSelect.dataset.preview = design;
  }

  function applyPreferences() {
    applyLanguage();
    applyDesign();
    syncPreferenceControls();
  }

  function syncPreferenceControls() {
    elements.dateFormatSelect.value = state.preferences.dateFormat;
    elements.languageSelect.value = state.preferences.language;
    elements.designSelect.value = state.preferences.design;
    elements.designSelect.dataset.preview = state.preferences.design;
  }

  function populateMonthSelect() {
    var selectedMonth = String(viewDate.getMonth());

    elements.monthSelect.innerHTML = "";
    i18n.getCalendar(state.preferences.language).months.forEach(function (name, index) {
      var option = document.createElement("option");
      option.value = String(index);
      option.textContent = name;
      elements.monthSelect.appendChild(option);
    });
    elements.monthSelect.value = selectedMonth;
  }

  function bindEvents() {
    elements.menuButton.addEventListener("click", toggleHeaderMenu);
    elements.settingsButton.addEventListener("click", openSettings);
    elements.settingsCloseButton.addEventListener("click", closeSettings);
    elements.settingsDialog.addEventListener("click", onSettingsDialogClick);
    elements.settingsDialog.addEventListener("close", onSettingsDialogClose);
    elements.dateFormatSelect.addEventListener("change", onDateFormatChange);
    elements.languageSelect.addEventListener("change", onLanguageChange);
    elements.designSelect.addEventListener("change", onDesignChange);
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKeydown);
    if (typeof mobileMenuMedia.addEventListener === "function") {
      mobileMenuMedia.addEventListener("change", onViewportChange);
    } else {
      mobileMenuMedia.addListener(onViewportChange);
    }
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
    elements.exportButton.addEventListener("click", function () {
      closeHeaderMenu();
      downloadBackup();
    });
    elements.restoreButton.addEventListener("click", function () {
      closeHeaderMenu();
      elements.restoreInput.click();
    });
    elements.restoreInput.addEventListener("change", restoreBackup);
  }

  function toggleHeaderMenu() {
    setHeaderMenuOpen(elements.headerActions.dataset.open !== "true");
  }

  function closeHeaderMenu() {
    setHeaderMenuOpen(false);
  }

  function setHeaderMenuOpen(open) {
    var expanded = Boolean(open && mobileMenuMedia.matches);

    elements.headerActions.dataset.open = expanded ? "true" : "false";
    elements.menuButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    elements.menuButton.setAttribute("aria-label", translate(expanded ? "menu.close" : "menu.open"));
  }

  function onDocumentClick(event) {
    if (elements.headerActions.dataset.open === "true"
        && !elements.headerActions.contains(event.target)
        && !elements.menuButton.contains(event.target)) {
      closeHeaderMenu();
    }
  }

  function onDocumentKeydown(event) {
    if (event.key === "Escape" && elements.headerActions.dataset.open === "true") {
      closeHeaderMenu();
      elements.menuButton.focus();
    }
  }

  function onViewportChange(event) {
    if (!event.matches) {
      closeHeaderMenu();
    }
  }

  function openSettings() {
    syncPreferenceControls();
    closeHeaderMenu();
    document.body.classList.add("settings-open");
    elements.settingsDialog.showModal();
  }

  function closeSettings() {
    if (elements.settingsDialog.open) {
      document.body.classList.remove("settings-open");
      elements.settingsDialog.close();
    }
  }

  function onSettingsDialogClick(event) {
    if (event.target === elements.settingsDialog) {
      closeSettings();
    }
  }

  function onSettingsDialogClose() {
    document.body.classList.remove("settings-open");
    if (mobileMenuMedia.matches) {
      elements.menuButton.focus({ preventScroll: true });
    } else {
      elements.settingsButton.focus({ preventScroll: true });
    }
  }

  function onDateFormatChange() {
    var value = elements.dateFormatSelect.value;

    if (!core.isSupportedDateFormat(value)) {
      syncPreferenceControls();
      return;
    }

    state.preferences.dateFormat = value;
    persistState();
    renderMonth();
  }

  function onLanguageChange() {
    var value = elements.languageSelect.value;

    if (!i18n.isSupportedLanguage(value)) {
      syncPreferenceControls();
      return;
    }

    state.preferences.language = value;
    applyLanguage();
    syncPreferenceControls();
    persistState();
    renderMonth();
  }

  function onDesignChange() {
    var value = elements.designSelect.value;

    if (storageApi.SUPPORTED_DESIGNS.indexOf(value) === -1) {
      syncPreferenceControls();
      return;
    }

    state.preferences.design = value;
    applyDesign();
    syncPreferenceControls();
    persistState();
  }

  function initializeVisibleMonth() {
    var result = storageApi.ensureMonthSchedule(state, core.getMonthKey(viewDate));
    if (result.changed && storageWritable) {
      persistState();
    }
  }

  function setStatus(key, tone, parameters, fallback) {
    currentStatus = {
      key: key,
      parameters: parameters || {},
      fallback: fallback || "",
      tone: tone || "neutral"
    };
    renderStatus();
  }

  function renderStatus() {
    var message = translateDiagnostic(
      currentStatus.key,
      currentStatus.parameters,
      currentStatus.fallback
    );

    elements.statusText.textContent = message;
    elements.saveStatus.dataset.tone = currentStatus.tone;
    elements.saveStatus.title = message;
  }

  function setDiagnosticStatus(result, tone) {
    setStatus(
      result.messageKey || result.errorKey,
      tone,
      result.messageParams || result.errorParams,
      result.message || result.error
    );
  }

  function persistState() {
    var result;

    if (!storageWritable) {
      setStatus("storage.unreadableEdit", "error");
      return false;
    }

    result = storageApi.saveState(browserStorage, state, storageKey);
    setDiagnosticStatus(result, result.ok ? "success" : "error");
    return result.ok;
  }

  function renderMonth() {
    var monthKey = core.getMonthKey(viewDate);
    var weeklyHours = core.getEffectiveWeeklyHours(monthKey, state.schedules);
    var monthName = i18n.getCalendar(state.preferences.language).months[viewDate.getMonth()];

    elements.monthSelect.value = String(viewDate.getMonth());
    elements.yearInput.value = String(viewDate.getFullYear());
    elements.weeklyHours.value = String(weeklyHours);
    elements.weeklyHours.setAttribute("aria-invalid", "false");
    elements.scheduleMessage.textContent = "";
    elements.monthKeyLabel.textContent = monthKey;
    elements.monthHeading.textContent = translate("month.heading", {
      month: monthName,
      year: viewDate.getFullYear()
    });
    document.title = translate("title.month", {
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
    var lastDate = week.dates[6];

    return rows
      + '<tr class="week-summary" data-week-index="' + weekIndex + '">'
      + '<th scope="row" colspan="6">'
      + '<span class="week-label">' + escapeHtml(translate("week.label", { week: week.week })) + '</span>'
      + '<span class="week-range">' + escapeHtml(translate("range.to", {
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
    var date = core.parseIsoDate(dateKey);
    var entry = state.entries[dateKey] || EMPTY_ENTRY;
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
      + '<div class="date-line"><time datetime="' + dateKey + '">' + formatDisplayDate(dateKey) + '</time>'
      + '<span class="weekday">' + escapeHtml(weekdayName) + '</span></div>'
      + '<span id="' + messageId + '" class="row-message"></span>'
      + '</th>'
      + renderTimeCell(dateKey, "start", "column.start", entry.start, messageId)
      + renderTimeCell(dateKey, "finish", "column.finish", entry.finish, messageId)
      + renderTimeCell(dateKey, "breakStart", "column.breakStart", entry.breakStart, messageId)
      + renderTimeCell(dateKey, "breakFinish", "column.breakFinish", entry.breakFinish, messageId)
      + renderAbsenceCell(dateKey, entry.absence === true)
      + '<td class="result-cell"><output class="result-value" data-day-worked>--</output>'
      + '<span class="work-note" data-work-note></span></td>'
      + '<td class="decimal-cell"><output class="decimal-value" data-day-decimal>--</output></td>'
      + '<td class="balance-cell"><output class="balance-value" data-balance="neutral" data-day-balance>--</output></td>'
      + '</tr>';
  }

  function renderTimeCell(dateKey, field, labelKey, value, messageId) {
    var label = translate(labelKey);
    var inputLabel = translate("time.inputLabel", {
      label: label,
      date: formatDisplayDate(dateKey)
    });

    return '<td><input class="time-input" type="text" inputmode="numeric" maxlength="5"'
      + ' autocomplete="off" spellcheck="false" placeholder="--:--"'
      + ' aria-label="' + escapeHtml(inputLabel) + '" aria-describedby="' + messageId + '"'
      + ' aria-invalid="false" data-field="' + field + '" value="' + escapeHtml(value) + '"></td>';
  }

  function renderAbsenceCell(dateKey, checked) {
    var inputLabel = translate("absence.inputLabel", {
      date: formatDisplayDate(dateKey)
    });

    return '<td class="absence-cell"><label class="absence-control">'
      + '<input class="absence-input" type="checkbox" aria-label="'
      + escapeHtml(inputLabel) + '"' + (checked ? " checked" : "") + '>'
      + '</label></td>';
  }

  function formatDisplayDate(dateKey) {
    return core.formatDate(
      dateKey,
      state.preferences.dateFormat,
      state.preferences.language
    );
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
    var absenceInput = row.querySelector(".absence-input");

    hasError = !summary.absence && hasError;
    row.classList.toggle("has-error", hasError);
    row.classList.toggle("is-absence", summary.absence);
    absenceInput.checked = summary.absence;
    row.querySelectorAll(".time-input").forEach(function (input) {
      input.disabled = summary.absence;
      input.setAttribute("aria-invalid", hasError ? "true" : "false");
    });
    rowMessage.textContent = hasError ? translate(shift.messageKey, {}, shift.message) : "";
    rowMessage.title = rowMessage.textContent;

    if (summary.absence) {
      workedOutput.textContent = core.formatDuration(summary.workedMinutes);
      decimalOutput.textContent = core.formatDecimalHours(summary.workedMinutes);
      workNote.textContent = translate("work.absence");
    } else if (shift.status === "valid") {
      workedOutput.textContent = core.formatDuration(summary.workedMinutes);
      decimalOutput.textContent = core.formatDecimalHours(summary.workedMinutes);
      workNote.textContent = shift.automaticBreakMinutes > 0
        ? translate("work.autoBreak", { minutes: shift.automaticBreakMinutes })
        : "";
    } else {
      workedOutput.textContent = "--";
      decimalOutput.textContent = "--";
      workNote.textContent = "";
    }

    setBalanceOutput(balanceOutput, summary.balanceMinutes, summary.evaluated);
    balanceOutput.title = summary.evaluated
      ? translate("balance.detail", {
        worked: core.formatDecimalHours(summary.workedMinutes),
        target: core.formatDecimalHours(summary.targetMinutes)
      })
      : translate("summary.notDueYet");
  }

  function updateWeekRow(row) {
    var week = viewWeeks[Number(row.dataset.weekIndex)];
    var summary = core.summarizeDates(week.dates, state.entries, state.schedules, todayKey);
    var hasEvaluatedDate = summary.evaluatedDays > 0;

    row.querySelector("[data-week-target]").textContent = hasEvaluatedDate
      ? translate("summary.expectedHours", { hours: core.formatDecimalHours(summary.expectedMinutes) })
      : translate("summary.notDueYet");
    row.querySelector("[data-week-worked]").textContent = hasEvaluatedDate
      ? core.formatDuration(summary.workedMinutes)
      : "--";
    row.querySelector("[data-week-decimal]").textContent = hasEvaluatedDate
      ? core.formatDecimalHours(summary.workedMinutes)
      : "--";
    setBalanceOutput(row.querySelector("[data-week-balance]"), summary.balanceMinutes, hasEvaluatedDate);
  }

  function updateMonthSummary(monthDates, summary) {
    var hasDueDate = monthDates.some(function (dateKey) {
      return dateKey <= todayKey;
    });
    var hasEvaluatedDate = summary.evaluatedDays > 0;
    var hasEnteredFutureDate = monthDates.some(function (dateKey) {
      return dateKey > todayKey
        && core.getDaySummary(dateKey, state.entries[dateKey], state.schedules, todayKey).evaluated;
    });
    var monthEnd = monthDates[monthDates.length - 1];
    var cutoff = monthEnd < todayKey ? monthEnd : todayKey;

    if (!hasEvaluatedDate) {
      elements.summaryCutoff.textContent = translate("summary.notDueYet");
    } else if (!hasDueDate) {
      elements.summaryCutoff.textContent = translate("summary.enteredFuture");
    } else {
      elements.summaryCutoff.textContent = translate(
        hasEnteredFutureDate ? "summary.throughFuture" : "summary.through",
        { date: formatDisplayDate(cutoff) }
      );
    }
    elements.monthWorked.textContent = hasEvaluatedDate
      ? core.formatDuration(summary.workedMinutes)
      : "--";
    elements.monthWorkedDecimal.textContent = hasEvaluatedDate
      ? translate("summary.decimalHours", { hours: core.formatDecimalHours(summary.workedMinutes) })
      : "--";
    elements.monthExpected.textContent = hasEvaluatedDate
      ? core.formatDuration(summary.expectedMinutes)
      : "--";
    elements.monthExpectedDecimal.textContent = hasEvaluatedDate
      ? translate("summary.decimalHours", { hours: core.formatDecimalHours(summary.expectedMinutes) })
      : "--";
    elements.monthPlanned.textContent = translate("summary.hours", {
      hours: core.formatDecimalHours(summary.plannedMinutes)
    });
    elements.monthBalance.textContent = hasEvaluatedDate
      ? translate("summary.hours", { hours: core.formatSignedDecimalHours(summary.balanceMinutes) })
      : "--";
    elements.monthBalanceMetric.dataset.balance = hasEvaluatedDate
      ? getBalanceTone(summary.balanceMinutes)
      : "neutral";
  }

  function updateScheduleSummary() {
    var monthKey = core.getMonthKey(viewDate);
    var weeklyHours = core.getEffectiveWeeklyHours(monthKey, state.schedules);
    var dailyMinutes = weeklyHours * 60 / 5;

    elements.dailyTarget.textContent = translate("schedule.eachWeekday", {
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
    if (!state.entries[dateKey]) {
      state.entries[dateKey] = {
        start: "",
        finish: "",
        breakStart: "",
        breakFinish: "",
        absence: false
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

  function onAbsenceChange(event) {
    var input = event.target.closest(".absence-input");
    var row;

    if (!input) {
      return;
    }

    row = input.closest(".day-row");
    getOrCreateEntry(row.dataset.date).absence = input.checked;
    persistState();
    renderComputedValues();
  }

  function onScheduleInput() {
    var raw = elements.weeklyHours.value.trim();
    var monthKey = core.getMonthKey(viewDate);
    var value = Number(raw);
    var valid = raw !== "" && core.isValidWeeklyHours(value);

    elements.weeklyHours.setAttribute("aria-invalid", valid ? "false" : "true");
    elements.scheduleMessage.textContent = valid ? "" : translate("validation.hours");

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
      setStatus("validation.year", "warning");
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
      setStatus("backup.downloaded", "success");
    } catch (error) {
      setStatus("backup.createFailed", "error");
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
      setStatus("backup.readFailed", "error");
      elements.restoreInput.value = "";
    });
    reader.readAsText(file);
  }

  function applyBackup(text) {
    var parsed = storageApi.parseBackup(text);
    var merged;
    var result;

    if (!parsed.valid) {
      setDiagnosticStatus(parsed, "error");
      return;
    }

    if (!root.confirm(translate(
      parsed.includesPreferences ? "restore.confirmPreferences" : "restore.confirm"
    ))) {
      setStatus("restore.cancelled", "neutral");
      return;
    }

    merged = storageApi.mergeStates(state, parsed.state, {
      includePreferences: parsed.includesPreferences
    });
    storageApi.ensureMonthSchedule(merged, core.getMonthKey(viewDate));
    result = storageApi.saveState(browserStorage, merged, storageKey);

    if (!result.ok) {
      setDiagnosticStatus(result, "error");
      return;
    }

    state = merged;
    storageWritable = true;
    applyPreferences();
    renderMonth();
    setStatus("restore.saved", "success");
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