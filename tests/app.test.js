(function () {
  "use strict";

  var frame = document.getElementById("appFrame");
  var output = document.getElementById("results");
  var passed = 0;
  var failures = [];
  var TEST_STORAGE_KEY = "local-timesheet.test.integration.v1";
  var todayKey;
  var currentMonthKey;
  var entryDateKey;

  function equal(actual, expected) {
    if (!Object.is(actual, expected)) {
      throw new Error("expected " + JSON.stringify(expected) + ", received " + JSON.stringify(actual));
    }
  }

  function assert(value, message) {
    if (!value) {
      throw new Error(message || "assertion failed");
    }
  }

  function waitForFrameLoad() {
    return new Promise(function (resolve) {
      frame.addEventListener("load", function handleLoad() {
        frame.removeEventListener("load", handleLoad);
        resolve();
      });
    });
  }

  function waitForReady() {
    return new Promise(function (resolve, reject) {
      var attempts = 0;
      var timer = window.setInterval(function () {
        attempts += 1;
        try {
          if (frame.contentDocument.body.dataset.appStatus === "ready") {
            window.clearInterval(timer);
            resolve();
          } else if (attempts > 100) {
            window.clearInterval(timer);
            reject(new Error("app did not become ready"));
          }
        } catch (error) {
          window.clearInterval(timer);
          reject(error);
        }
      }, 20);
    });
  }

  function reloadFrame() {
    var loaded = waitForFrameLoad();
    frame.contentWindow.location.reload();
    return loaded.then(waitForReady);
  }

  function waitForLayout() {
    return new Promise(function (resolve) {
      frame.contentWindow.requestAnimationFrame(function () {
        frame.contentWindow.requestAnimationFrame(resolve);
      });
    });
  }

  function run(name, callback) {
    return Promise.resolve().then(callback).then(function () {
      passed += 1;
    }).catch(function (error) {
      failures.push(name + ": " + error.message);
    });
  }

  function getDocument() {
    return frame.contentDocument;
  }

  function getInput(dateKey, field) {
    return getDocument().querySelector(
      '[data-date="' + dateKey + '"] [data-field="' + field + '"]'
    );
  }

  function typeValue(input, value) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function leaveInput(input) {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  }

  function click(id) {
    getDocument().getElementById(id).click();
  }

  function selectMonth(monthIndex) {
    var select = getDocument().getElementById("monthSelect");
    select.value = String(monthIndex);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setWeeklyHours(value) {
    var input = getDocument().getElementById("weeklyHours");
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function finish() {
    if (failures.length > 0) {
      document.body.dataset.status = "failed";
      document.title = "FAIL - Timesheet app tests";
      output.textContent = failures.length + " failed, " + passed + " passed\n\n" + failures.join("\n");
    } else {
      document.body.dataset.status = "passed";
      document.title = "PASS - Timesheet app tests";
      output.textContent = passed + " tests passed";
    }
  }

  waitForFrameLoad()
    .then(waitForReady)
    .then(function () {
      todayKey = frame.contentWindow.TimesheetCore.toIsoDate(new frame.contentWindow.Date());
      currentMonthKey = todayKey.slice(0, 7);
      entryDateKey = todayKey;
      frame.contentWindow.localStorage.removeItem(TEST_STORAGE_KEY);
      return reloadFrame();
    })
    .then(function () {
      return run("opens on the current month with today selected", function () {
        var documentUnderTest = getDocument();
        var tableFrame = documentUnderTest.querySelector(".table-frame");
        var todayRow = documentUnderTest.querySelector('[data-date="' + todayKey + '"]');
        var frameBounds;
        var todayBounds;
        var expectedWeeks = frame.contentWindow.TimesheetCore.buildMonthWeeks(
          Number(currentMonthKey.slice(0, 4)),
          Number(currentMonthKey.slice(5, 7)) - 1
        );

        equal(frame.contentWindow.TimesheetApp.getViewMonth(), currentMonthKey);
        equal(documentUnderTest.querySelectorAll(".day-row").length, expectedWeeks.length * 7);
        equal(documentUnderTest.querySelectorAll(".week-summary").length, expectedWeeks.length);
        assert(todayRow.classList.contains("is-today"));
        frameBounds = tableFrame.getBoundingClientRect();
        todayBounds = todayRow.getBoundingClientRect();
        assert(todayBounds.top >= frameBounds.top, "today should not be above the visible ledger");
        assert(todayBounds.bottom <= frameBounds.bottom, "today should not be below the visible ledger");
      });
    })
    .then(function () {
      return run("contains responsive controls and isolates ledger overflow", function () {
        var documentUnderTest = getDocument();
        var viewportWidth = frame.contentWindow.innerWidth;
        var tableFrame = documentUnderTest.querySelector(".table-frame");
        var timeInput = documentUnderTest.querySelector(".time-input");
        var tableHeading = documentUnderTest.querySelector("thead th");
        var headerActions = documentUnderTest.getElementById("headerActions");
        var controls;

        equal(viewportWidth, 390);
        equal(documentUnderTest.documentElement.scrollWidth, viewportWidth);
        equal(frame.contentWindow.getComputedStyle(headerActions).display, "none");
        click("menuButton");
        equal(documentUnderTest.getElementById("menuButton").getAttribute("aria-expanded"), "true");
        controls = documentUnderTest.querySelectorAll(
          ".mobile-menu-button, .header-actions button, .period-navigation button, .period-picker, .schedule-control"
        );
        assert(tableFrame.scrollWidth > tableFrame.clientWidth, "ledger should scroll horizontally");
        assert(
          parseFloat(frame.contentWindow.getComputedStyle(documentUnderTest.body).fontSize) >= 16,
          "body text should use at least a 16px baseline"
        );
        assert(
          parseFloat(frame.contentWindow.getComputedStyle(timeInput).fontSize) >= 15,
          "time entry text should remain readable"
        );
        assert(
          parseFloat(frame.contentWindow.getComputedStyle(tableHeading).fontSize) >= 12,
          "table headings should remain readable"
        );
        controls.forEach(function (control) {
          var bounds = control.getBoundingClientRect();
          assert(bounds.left >= 0, "control extends left of viewport");
          assert(bounds.right <= viewportWidth, "control extends right of viewport");
          assert(bounds.height >= 44, "control should provide a 44px touch target");
        });
        documentUnderTest.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        equal(documentUnderTest.getElementById("menuButton").getAttribute("aria-expanded"), "false");
        click("menuButton");
        documentUnderTest.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true
        }));
        equal(documentUnderTest.getElementById("menuButton").getAttribute("aria-expanded"), "false");
        equal(documentUnderTest.activeElement, documentUnderTest.getElementById("menuButton"));
      });
    })
    .then(function () {
      return run("opens preferences and persists formatted display dates", function () {
        var documentUnderTest = getDocument();
        var core = frame.contentWindow.TimesheetCore;
        var dialog = documentUnderTest.getElementById("settingsDialog");
        var dateFormatSelect = documentUnderTest.getElementById("dateFormatSelect");
        var languageSelect = documentUnderTest.getElementById("languageSelect");
        var designSelect = documentUnderTest.getElementById("designSelect");
        var preferencesButton = documentUnderTest.getElementById("settingsButton");
        var repositoryLink = dialog.querySelector(".about-details a");
        var todayTime;
        var firstWeek;
        var firstWeekRange;

        assert(documentUnderTest.querySelector("[data-brand-icon]"), "brand should include a timetable icon");
        equal(documentUnderTest.querySelector(".brand-line h1").textContent, "Timesheet");
        equal(documentUnderTest.querySelector("[data-app-version]").textContent, "v0.3");
        equal(preferencesButton.textContent.trim(), "Preferences");
        equal(documentUnderTest.body.textContent.indexOf("Settings"), -1);
        click("menuButton");
        click("settingsButton");
        equal(dialog.open, true);
        equal(documentUnderTest.body.classList.contains("settings-open"), true);
        equal(documentUnderTest.getElementById("menuButton").getAttribute("aria-expanded"), "false");
        equal(documentUnderTest.getElementById("settingsTitle").textContent, "Preferences");
        equal(dialog.querySelector(".settings-dialog-header .eyebrow"), null);
        equal(documentUnderTest.getElementById("settingsCloseButton").getAttribute("aria-label"), "Close preferences");
        equal(documentUnderTest.querySelector("[data-about-version]").textContent, "Timesheet v0.3");
        equal(dialog.querySelector(".about-details p:first-child").textContent, "Local work time tracker.");
        equal(dialog.querySelector(".about-details p:nth-child(2)").textContent, "MIT licence.");
        equal(repositoryLink.textContent, "https://github.com/reery/Timesheet");
        equal(repositoryLink.href, "https://github.com/reery/Timesheet");
        equal(languageSelect.disabled, true);
        equal(languageSelect.options.length, 2);
        equal(languageSelect.value, "en");
        equal(designSelect.disabled, true);
        equal(designSelect.value, "default-gradient");

        dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        equal(dialog.open, false);
        equal(documentUnderTest.body.classList.contains("settings-open"), false);
        click("menuButton");
        click("settingsButton");

        dateFormatSelect.value = core.DATE_FORMATS.DAY_MONTH_YEAR_DOTS;
        dateFormatSelect.dispatchEvent(new Event("change", { bubbles: true }));
        equal(
          frame.contentWindow.TimesheetApp.getState().preferences.dateFormat,
          core.DATE_FORMATS.DAY_MONTH_YEAR_DOTS
        );

        todayTime = documentUnderTest.querySelector('[data-date="' + todayKey + '"] time');
        equal(todayTime.textContent, core.formatDate(todayKey, core.DATE_FORMATS.DAY_MONTH_YEAR_DOTS, "en"));
        equal(todayTime.getAttribute("datetime"), todayKey);
        assert(
          getInput(todayKey, "start").getAttribute("aria-label").indexOf(todayTime.textContent) !== -1,
          "time input label should use the selected display date"
        );

        firstWeek = core.buildMonthWeeks(
          Number(currentMonthKey.slice(0, 4)),
          Number(currentMonthKey.slice(5, 7)) - 1
        )[0];
        firstWeekRange = core.formatDate(
          firstWeek.dates[0],
          core.DATE_FORMATS.DAY_MONTH_YEAR_DOTS,
          "en"
        ) + " to " + core.formatDate(
          firstWeek.dates[6],
          core.DATE_FORMATS.DAY_MONTH_YEAR_DOTS,
          "en"
        );
        equal(documentUnderTest.querySelector(".week-range").textContent, firstWeekRange);
        equal(
          documentUnderTest.getElementById("summaryCutoff").textContent,
          "Through " + core.formatDate(todayKey, core.DATE_FORMATS.DAY_MONTH_YEAR_DOTS, "en")
        );

        click("settingsCloseButton");
        equal(dialog.open, false);
        equal(documentUnderTest.activeElement, documentUnderTest.getElementById("menuButton"));

        return reloadFrame().then(function () {
          var reloadedTime = getDocument().querySelector('[data-date="' + todayKey + '"] time');
          equal(
            frame.contentWindow.TimesheetApp.getState().preferences.dateFormat,
            frame.contentWindow.TimesheetCore.DATE_FORMATS.DAY_MONTH_YEAR_DOTS
          );
          equal(reloadedTime.textContent, frame.contentWindow.TimesheetCore.formatDate(
            todayKey,
            frame.contentWindow.TimesheetCore.DATE_FORMATS.DAY_MONTH_YEAR_DOTS,
            "en"
          ));
          equal(reloadedTime.getAttribute("datetime"), todayKey);
        });
      });
    })
    .then(function () {
      return run("calculates and normalizes shorthand time", function () {
        var start = getInput(entryDateKey, "start");
        var finish = getInput(entryDateKey, "finish");
        var row = start.closest("tr");

        typeValue(start, "900");
        typeValue(finish, "1600");
        equal(row.querySelector("[data-day-worked]").textContent, "6:30");
        equal(row.querySelector("[data-day-decimal]").textContent, "6.5");
        equal(row.querySelector("[data-work-note]").textContent, "30m auto break");

        leaveInput(start);
        leaveInput(finish);
        equal(start.value, "09:00");
        equal(finish.value, "16:00");
      });
    })
    .then(function () {
      return run("persists entries across reload", function () {
        return reloadFrame().then(function () {
          equal(getInput(entryDateKey, "start").value, "09:00");
          equal(getInput(entryDateKey, "finish").value, "16:00");
          equal(getDocument().querySelector('[data-date="' + entryDateKey + '"] [data-day-worked]').textContent, "6:30");
        });
      });
    })
    .then(function () {
      return run("shows monthly worked time and a due-to-date balance", function () {
        var documentUnderTest = getDocument();
        var core = frame.contentWindow.TimesheetCore;
        var appState = frame.contentWindow.TimesheetApp.getState();
        var monthDates = core.getMonthDateKeys(
          Number(currentMonthKey.slice(0, 4)),
          Number(currentMonthKey.slice(5, 7)) - 1
        );
        var expected = core.summarizeDates(monthDates, appState.entries, appState.schedules, todayKey);

        equal(documentUnderTest.getElementById("monthWorked").textContent, "6:30");
        equal(documentUnderTest.getElementById("monthWorkedDecimal").textContent, "6.5 decimal hours");
        equal(
          documentUnderTest.getElementById("monthExpected").textContent,
          core.formatDecimalHours(expected.expectedMinutes) + " h"
        );
        equal(
          documentUnderTest.getElementById("monthBalance").textContent,
          core.formatSignedDecimalHours(expected.balanceMinutes) + " h"
        );
        equal(documentUnderTest.getElementById("monthBalanceMetric").dataset.balance, "negative");
      });
    })
    .then(function () {
      return run("keeps future balances neutral", function () {
        var futureRow = Array.prototype.find.call(
          getDocument().querySelectorAll(".day-row"),
          function (row) {
            return row.dataset.date > todayKey;
          }
        );
        var futureBalance = futureRow.querySelector("[data-day-balance]");
        equal(futureBalance.textContent, "--");
        equal(futureBalance.title, "Not due yet");
      });
    })
    .then(function () {
      return run("validates incomplete breaks without discarding them", function () {
        var breakStart = getInput(entryDateKey, "breakStart");
        var row = breakStart.closest("tr");

        typeValue(breakStart, "1200");
        equal(row.classList.contains("has-error"), true);
        equal(row.querySelector(".row-message").textContent, "Enter both break start and break finish.");
        equal(frame.contentWindow.TimesheetApp.getState().entries[entryDateKey].breakStart, "1200");

        typeValue(breakStart, "");
        equal(row.classList.contains("has-error"), false);
      });
    })
    .then(function () {
      return run("snapshots and independently edits monthly schedules", function () {
        var nextMonthKey = frame.contentWindow.TimesheetCore.shiftMonthKey(currentMonthKey, 1);

        setWeeklyHours(35);
        equal(getDocument().getElementById("dailyTarget").textContent, "7 h each weekday");

        click("nextMonth");
        equal(frame.contentWindow.TimesheetApp.getViewMonth(), nextMonthKey);
        equal(getDocument().getElementById("weeklyHours").value, "35");
        setWeeklyHours(30);

        click("previousMonth");
        equal(getDocument().getElementById("weeklyHours").value, "35");
        click("nextMonth");
        equal(getDocument().getElementById("weeklyHours").value, "30");
      });
    })
    .then(function () {
      return run("shows balances and weekly totals for valid future shifts", function () {
        var core = frame.contentWindow.TimesheetCore;
        var nextMonthKey = core.shiftMonthKey(currentMonthKey, 1);
        var weeks = core.buildMonthWeeks(
          Number(nextMonthKey.slice(0, 4)),
          Number(nextMonthKey.slice(5, 7)) - 1
        );
        var weekIndex = weeks.findIndex(function (week) {
          return week.dates[0] > todayKey && week.dates.some(function (dateKey) {
            return core.getMonthKey(dateKey) === nextMonthKey && core.isWeekday(dateKey);
          });
        });
        var futureDateKey = weeks[weekIndex].dates.find(function (dateKey) {
          return core.getMonthKey(dateKey) === nextMonthKey && core.isWeekday(dateKey);
        });
        var start = getInput(futureDateKey, "start");
        var finish = getInput(futureDateKey, "finish");
        var dayRow = start.closest("tr");
        var weekRow = getDocument().querySelector(
          '.week-summary[data-week-index="' + weekIndex + '"]'
        );

        typeValue(start, "900");
        typeValue(finish, "1600");

        var state = frame.contentWindow.TimesheetApp.getState();
        var daySummary = core.getDaySummary(
          futureDateKey,
          state.entries[futureDateKey],
          state.schedules,
          todayKey
        );
        var weekSummary = core.summarizeDates(
          weeks[weekIndex].dates,
          state.entries,
          state.schedules,
          todayKey
        );
        var monthSummary = core.summarizeDates(
          core.getMonthDateKeys(
            Number(nextMonthKey.slice(0, 4)),
            Number(nextMonthKey.slice(5, 7)) - 1
          ),
          state.entries,
          state.schedules,
          todayKey
        );

        equal(dayRow.querySelector("[data-day-balance]").textContent,
          core.formatSignedDecimalHours(daySummary.balanceMinutes));
        equal(dayRow.querySelector("[data-day-balance]").dataset.balance, "positive");
        equal(weekRow.querySelector("[data-week-target]").textContent,
          core.formatDecimalHours(weekSummary.expectedMinutes) + "h expected");
        equal(weekRow.querySelector("[data-week-worked]").textContent,
          core.formatDuration(weekSummary.workedMinutes));
        equal(weekRow.querySelector("[data-week-decimal]").textContent,
          core.formatDecimalHours(weekSummary.workedMinutes));
        equal(weekRow.querySelector("[data-week-balance]").textContent,
          core.formatSignedDecimalHours(weekSummary.balanceMinutes));
        equal(weekRow.querySelector("[data-week-balance]").dataset.balance, "positive");
        equal(getDocument().getElementById("summaryCutoff").textContent, "Entered future shifts");
        equal(getDocument().getElementById("monthWorked").textContent,
          core.formatDuration(monthSummary.workedMinutes));
        equal(getDocument().getElementById("monthBalance").textContent,
          core.formatSignedDecimalHours(monthSummary.balanceMinutes) + " h");
      });
    })
    .then(function () {
      return run("returns to today from an explicitly selected month", function () {
        var currentMonthIndex = Number(currentMonthKey.slice(5, 7)) - 1;
        var otherMonthIndex = currentMonthIndex === 0 ? 1 : 0;

        selectMonth(otherMonthIndex);
        assert(frame.contentWindow.TimesheetApp.getViewMonth() !== currentMonthKey);
        click("todayButton");
        equal(frame.contentWindow.TimesheetApp.getViewMonth(), currentMonthKey);
      });
    })
    .then(function () {
      return run("keeps the layout usable at the 320px minimum", function () {
        var documentUnderTest = getDocument();
        var tableFrame = documentUnderTest.querySelector(".table-frame");
        var summaryMetrics = documentUnderTest.querySelectorAll(".summary-metric");
        var controls;

        frame.style.width = "320px";
        click("menuButton");
        controls = documentUnderTest.querySelectorAll(
          ".mobile-menu-button, .header-actions button, .period-navigation button, .period-picker, .schedule-control"
        );

        equal(frame.contentWindow.innerWidth, 320);
        equal(documentUnderTest.documentElement.scrollWidth, 320);
        assert(tableFrame.scrollWidth > tableFrame.clientWidth, "ledger should remain independently scrollable");
        assert(
          summaryMetrics[1].getBoundingClientRect().top >= summaryMetrics[0].getBoundingClientRect().bottom,
          "summary metrics should stack at the minimum width"
        );
        controls.forEach(function (control) {
          var bounds = control.getBoundingClientRect();
          assert(bounds.left >= 0, "control extends left of minimum viewport");
          assert(bounds.right <= 320, "control extends right of minimum viewport");
          assert(bounds.height >= 44, "control should retain a 44px touch target");
        });

        click("settingsButton");
        var dialog = documentUnderTest.getElementById("settingsDialog");
        var dialogBounds = dialog.getBoundingClientRect();
        equal(dialog.open, true);
        equal(documentUnderTest.documentElement.scrollWidth, 320);
        assert(dialogBounds.left >= 0, "preferences dialog extends left of minimum viewport");
        assert(dialogBounds.right <= 320, "preferences dialog extends right of minimum viewport");
        dialog.querySelectorAll("button, select").forEach(function (control) {
          var bounds = control.getBoundingClientRect();
          assert(bounds.left >= dialogBounds.left, "preferences control extends left of dialog");
          assert(bounds.right <= dialogBounds.right, "preferences control extends right of dialog");
          assert(bounds.height >= 44, "preferences control should retain a 44px touch target");
        });
        dialog.querySelectorAll(".setting-row").forEach(function (row) {
          var iconBounds = row.querySelector(".setting-icon").getBoundingClientRect();
          var label = row.querySelector("label");
          var labelBounds = label.getBoundingClientRect();
          var selectBounds = row.querySelector("select").getBoundingClientRect();

          assert(iconBounds.top < selectBounds.bottom && iconBounds.bottom > selectBounds.top,
            "preference icon and select should share one row");
          assert(labelBounds.top < selectBounds.bottom && labelBounds.bottom > selectBounds.top,
            "preference label and select should share one row");
          assert(labelBounds.right <= selectBounds.left, "preference label should not overlap its select");
          equal(frame.contentWindow.getComputedStyle(label).whiteSpace, "nowrap");
        });
        click("settingsCloseButton");
      });
    })
    .then(function () {
      return run("restores one-row actions above the mobile breakpoint", function () {
        frame.style.width = "841px";

        return waitForLayout().then(function () {
          var documentUnderTest = getDocument();
          var header = documentUnderTest.querySelector(".app-header");
          var headerActions = documentUnderTest.getElementById("headerActions");
          var brandBounds = documentUnderTest.querySelector(".brand-line").getBoundingClientRect();
          var actionBounds = headerActions.getBoundingClientRect();

          equal(frame.contentWindow.innerWidth, 841);
          equal(documentUnderTest.documentElement.scrollWidth, 841);
          equal(frame.contentWindow.getComputedStyle(documentUnderTest.getElementById("menuButton")).display, "none");
          equal(frame.contentWindow.getComputedStyle(headerActions).display, "flex");
          equal(headerActions.dataset.open, "false");
          equal(documentUnderTest.getElementById("restoreButton").nextElementSibling.id, "settingsButton");
          assert(actionBounds.right <= header.getBoundingClientRect().right, "desktop actions should fit the header");
          assert(brandBounds.top < actionBounds.bottom && brandBounds.bottom > actionBounds.top,
            "brand and desktop actions should share one row");
        });
      });
    })
    .then(finish)
    .catch(function (error) {
      failures.push("test setup: " + error.message);
      finish();
    });
})();