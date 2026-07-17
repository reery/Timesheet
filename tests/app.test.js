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
        var expectedWeeks = frame.contentWindow.TimesheetCore.buildMonthWeeks(
          Number(currentMonthKey.slice(0, 4)),
          Number(currentMonthKey.slice(5, 7)) - 1
        );

        equal(frame.contentWindow.TimesheetApp.getViewMonth(), currentMonthKey);
        equal(documentUnderTest.querySelectorAll(".day-row").length, expectedWeeks.length * 7);
        equal(documentUnderTest.querySelectorAll(".week-summary").length, expectedWeeks.length);
        assert(documentUnderTest.querySelector('[data-date="' + todayKey + '"]').classList.contains("is-today"));
      });
    })
    .then(function () {
      return run("contains responsive controls and isolates ledger overflow", function () {
        var documentUnderTest = getDocument();
        var viewportWidth = frame.contentWindow.innerWidth;
        var tableFrame = documentUnderTest.querySelector(".table-frame");
        var timeInput = documentUnderTest.querySelector(".time-input");
        var tableHeading = documentUnderTest.querySelector("thead th");
        var controls = documentUnderTest.querySelectorAll(
          ".header-actions button, .period-navigation button, .period-picker, .schedule-control"
        );

        equal(viewportWidth, 390);
        equal(documentUnderTest.documentElement.scrollWidth, viewportWidth);
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
        var controls = documentUnderTest.querySelectorAll(
          ".header-actions button, .period-navigation button, .period-picker, .schedule-control"
        );

        frame.style.width = "320px";

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
      });
    })
    .then(finish)
    .catch(function (error) {
      failures.push("test setup: " + error.message);
      finish();
    });
})();