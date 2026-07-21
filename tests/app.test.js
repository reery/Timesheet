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

  function entry(start, finish) {
    return { start: start, finish: finish, breakStart: "", breakFinish: "" };
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
    frame.getBoundingClientRect();
    frame.contentDocument.documentElement.getBoundingClientRect();
    return Promise.resolve();
  }

  function waitForCondition(predicate, message) {
    return new Promise(function (resolve, reject) {
      var attempts = 0;
      var timer = window.setInterval(function () {
        attempts += 1;
        try {
          if (predicate()) {
            window.clearInterval(timer);
            resolve();
          } else if (attempts > 100) {
            window.clearInterval(timer);
            reject(new Error(message || "condition was not met"));
          }
        } catch (error) {
          window.clearInterval(timer);
          reject(error);
        }
      }, 20);
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

  function getAbsenceInput(dateKey) {
    return getDocument().querySelector(
      '[data-date="' + dateKey + '"] .absence-input'
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

  function selectPeriod(year, monthIndex) {
    var documentUnderTest = getDocument();
    var monthSelect = documentUnderTest.getElementById("monthSelect");
    var yearInput = documentUnderTest.getElementById("yearInput");

    monthSelect.value = String(monthIndex);
    yearInput.value = String(year);
    yearInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setWeeklyHours(value) {
    var input = getDocument().getElementById("weeklyHours");
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function selectRestoreText(text, name) {
    var appWindow = frame.contentWindow;
    var input = getDocument().getElementById("restoreInput");
    var file = new appWindow.File([text], name || "timesheet.json", {
      type: "application/json"
    });

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function withCleanup(promise, cleanup) {
    return promise.then(function (value) {
      cleanup();
      return value;
    }, function (error) {
      cleanup();
      throw error;
    });
  }

  function createFixedDateConstructor(RealDate, fixedDate) {
    function FixedDate() {
      var argumentsList = Array.prototype.slice.call(arguments);

      if (argumentsList.length === 0) {
        return new RealDate(fixedDate.getTime());
      }

      return new (Function.prototype.bind.apply(RealDate, [null].concat(argumentsList)))();
    }

    FixedDate.prototype = RealDate.prototype;
    FixedDate.now = function () {
      return fixedDate.getTime();
    };
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;

    return FixedDate;
  }

  function fillStorageToCapacity(storage) {
    var prefix = "__timesheet-quota-test__";
    var keys = [];
    var size = 256 * 1024;
    var index = 0;
    var key;
    var value;

    while (size >= 128) {
      value = "x".repeat(size);
      while (true) {
        key = prefix + index;
        try {
          storage.setItem(key, value);
          keys.push(key);
          index += 1;
        } catch (error) {
          break;
        }
      }
      size = Math.floor(size / 2);
    }

    return keys;
  }

  function removeStorageKeys(storage, keys) {
    keys.forEach(function (key) {
      storage.removeItem(key);
    });
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

  waitForReady()
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
        var fieldDefinitions = frame.contentWindow.TimesheetModel.getEntryFields();
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
        equal(documentUnderTest.querySelectorAll(".absence-input").length, expectedWeeks.length * 7);
        equal(documentUnderTest.querySelectorAll(".week-summary").length, expectedWeeks.length);
        equal(documentUnderTest.querySelector(".week-summary th").colSpan,
          fieldDefinitions.length + 2);
        equal(Array.prototype.map.call(
          documentUnderTest.querySelectorAll("[data-entry-field-heading]"),
          function (heading) {
            return heading.dataset.entryFieldHeading;
          }
        ).join(","), fieldDefinitions.map(function (field) {
          return field.key;
        }).join(","));
        equal(Array.prototype.map.call(
          documentUnderTest.querySelectorAll(".day-row:first-of-type .time-input"),
          function (input) {
            return input.dataset.field;
          }
        ).join(","), fieldDefinitions.map(function (field) {
          return field.key;
        }).join(","));
        equal(documentUnderTest.querySelector(".absence-heading").textContent, "Absence");
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
        var brand = documentUnderTest.querySelector(".brand-line");
        var periodBar = documentUnderTest.querySelector(".period-bar");
        var periodNavigation = documentUnderTest.querySelector(".period-navigation");
        var periodPicker = documentUnderTest.querySelector(".period-picker");
        var summaryStrip = documentUnderTest.querySelector(".summary-strip");
        var scheduleControl = documentUnderTest.querySelector(".schedule-control");
        var numberField = scheduleControl.querySelector(".number-field");
        var dailyTarget = documentUnderTest.getElementById("dailyTarget");
        var ledgerSection = documentUnderTest.querySelector(".ledger-section");
        var tableFrame = documentUnderTest.querySelector(".table-frame");
        var timeInput = documentUnderTest.querySelector(".time-input");
        var tableHeading = documentUnderTest.querySelector("thead th");
        var headerActions = documentUnderTest.getElementById("headerActions");
        var periodBounds = periodBar.getBoundingClientRect();
        var ledgerBounds = ledgerSection.getBoundingClientRect();
        var controls;

        equal(viewportWidth, 390);
        equal(documentUnderTest.documentElement.scrollWidth, viewportWidth);
        equal(summaryStrip.parentElement, periodBar);
        equal(periodNavigation.nextElementSibling, summaryStrip);
        equal(summaryStrip.nextElementSibling, scheduleControl);
        equal(summaryStrip.querySelectorAll(".summary-metric").length, 3);
        summaryStrip.querySelectorAll(".summary-metric").forEach(function (metric) {
          equal(metric.children.length, 3);
          equal(metric.children[0].tagName, "DT");
          equal(metric.children[1].tagName, "DD");
          equal(metric.children[1].classList.contains("metric-value"), true);
          equal(metric.children[2].tagName, "DD");
          equal(metric.children[2].classList.contains("metric-detail"), true);
        });
        equal(documentUnderTest.getElementById("monthKeyLabel"), null);
        equal(documentUnderTest.getElementById("monthHeading"), null);
        equal(documentUnderTest.getElementById("summaryCutoff"), null);
        equal(documentUnderTest.getElementById("monthPlanned"), null);
        equal(
          Math.round(periodNavigation.getBoundingClientRect().left),
          Math.round(periodBounds.left)
        );
        assert(periodPicker.getBoundingClientRect().width < periodBounds.width,
          "period picker should not stretch to the toolbar width");
        assert(dailyTarget.getBoundingClientRect().left >= numberField.getBoundingClientRect().right,
          "daily target should sit to the right of the hours picker");
        assert(brand.getBoundingClientRect().top <= 20, "brand should stay near the viewport top");
        assert(ledgerBounds.top >= periodBounds.bottom, "ledger should not overlap the toolbar");
        assert(ledgerBounds.top - periodBounds.bottom <= 20,
          "toolbar-to-ledger gap should stay compact");
        summaryStrip.querySelectorAll(".summary-metric").forEach(function (metric) {
          var bounds = metric.getBoundingClientRect();
          assert(bounds.left >= 0, "summary metric extends left of viewport");
          assert(bounds.right <= viewportWidth, "summary metric extends right of viewport");
        });
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
        var designPreview = dialog.querySelector(".design-preview");
        var preferencesButton = documentUnderTest.getElementById("settingsButton");
        var repositoryLink = dialog.querySelector(".about-details a");
        var todayTime;
        var firstWeek;
        var firstWeekRange;

        assert(documentUnderTest.querySelector("[data-brand-icon]"), "brand should include a timetable icon");
        equal(documentUnderTest.querySelector(".brand-line h1").textContent, "Timesheet");
        equal(documentUnderTest.querySelector("[data-app-version]").textContent, "v0.5");
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
        equal(documentUnderTest.querySelector("[data-about-version]").textContent, "Timesheet v0.5");
        equal(dialog.querySelector(".about-details p:first-child").textContent, "Local work time tracker.");
        equal(dialog.querySelector(".about-details p:nth-child(2)").textContent, "MIT licence.");
        equal(repositoryLink.textContent, "https://github.com/reery/Timesheet");
        equal(repositoryLink.href, "https://github.com/reery/Timesheet");
        equal(languageSelect.disabled, false);
        equal(languageSelect.options.length, 4);
        equal(languageSelect.value, "en");
        equal(designSelect.disabled, false);
        equal(designSelect.options.length, 3);
        equal(designSelect.value, "default-gradient");
        equal(designSelect.options[0].textContent, "Morning Fog");
        equal(designSelect.options[1].textContent, "Midnight Fog");
        equal(designSelect.options[2].textContent, "Ember Coast");
        assert(designPreview, "design selector should include a theme preview");
        assert(parseFloat(frame.contentWindow.getComputedStyle(designSelect).paddingLeft) >= 45,
          "design selector text should sit beside the theme preview");
        assert(frame.contentWindow.getComputedStyle(designPreview).backgroundImage !== "none",
          "design selector should preview the theme in the closed control");
        equal(dialog.querySelectorAll(".setting-icon").length, 0);

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
      return run("translates and persists language and design preferences", function () {
        var documentUnderTest = getDocument();
        var i18n = frame.contentWindow.TimesheetI18n;
        var core = frame.contentWindow.TimesheetCore;
        var languageSelect;
        var designSelect;
        var designPreview;
        var morningFogPreview;
        var emberCoastPreview;
        var selectedMonth = Number(currentMonthKey.slice(5, 7)) - 1;
        var languages = ["de", "es", "fr"];

        click("menuButton");
        click("settingsButton");
        languageSelect = documentUnderTest.getElementById("languageSelect");
        designSelect = documentUnderTest.getElementById("designSelect");
        designPreview = documentUnderTest.querySelector(".design-preview");
        morningFogPreview = frame.contentWindow.getComputedStyle(designPreview).backgroundImage;

        languages.forEach(function (language) {
          var calendar = i18n.getCalendar(language);
          var startLabel = i18n.translate(language, "column.start");
          var firstRow;
          var firstRowDate;

          languageSelect.value = language;
          languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
          firstRow = documentUnderTest.querySelector(".day-row");
          firstRowDate = core.parseIsoDate(firstRow.dataset.date);

          equal(frame.contentWindow.TimesheetApp.getState().preferences.language, language);
          equal(documentUnderTest.documentElement.lang, language);
          equal(documentUnderTest.querySelector(".brand-line h1").textContent,
            i18n.translate(language, "app.name"));
          equal(documentUnderTest.getElementById("settingsTitle").textContent,
            i18n.translate(language, "preferences.title"));
          equal(documentUnderTest.getElementById("ledgerHeading").textContent,
            i18n.translate(language, "ledger.title"));
          equal(documentUnderTest.querySelector("thead th").textContent,
            i18n.translate(language, "column.date"));
          equal(documentUnderTest.querySelector(".absence-heading").textContent,
            i18n.translate(language, "column.absence"));
          equal(documentUnderTest.getElementById("monthSelect").options[selectedMonth].textContent,
            calendar.months[selectedMonth]);
          equal(firstRow.querySelector(".weekday").textContent,
            calendar.weekdays[firstRowDate.getDay()]);
          equal(documentUnderTest.querySelector(".week-label").textContent,
            i18n.translate(language, "week.label", {
              week: core.getIsoWeek(firstRow.dataset.date).week
            }));
          equal(documentUnderTest.querySelector("[data-status-text]").textContent,
            i18n.translate(language, "storage.saved"));
          equal(documentUnderTest.getElementById("settingsCloseButton").getAttribute("aria-label"),
            i18n.translate(language, "preferences.close"));
          equal(designSelect.options[0].textContent, "Morning Fog");
          equal(designSelect.options[1].textContent, "Midnight Fog");
          assert(getInput(todayKey, "start").getAttribute("aria-label").indexOf(startLabel) === 0,
            "time input should use the selected language");
          equal(getAbsenceInput(firstRow.dataset.date).getAttribute("aria-label"),
            i18n.translate(language, "absence.inputLabel", {
              date: firstRow.querySelector("time").textContent
            }));
        });

        documentUnderTest.getElementById("weeklyHours").value = "invalid";
        documentUnderTest.getElementById("weeklyHours").dispatchEvent(new Event("input", {
          bubbles: true
        }));
        equal(documentUnderTest.getElementById("scheduleMessage").textContent,
          i18n.translate("fr", "validation.hours"));

        languageSelect.value = "de";
        languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
        designSelect.value = "ember-coast";
        designSelect.dispatchEvent(new Event("change", { bubbles: true }));

        equal(documentUnderTest.documentElement.dataset.design, "ember-coast");
        equal(designSelect.dataset.preview, "ember-coast");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--accent").trim(), "#ff9505");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--weekend-line").trim(), "#ec4e20");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--accent-strong").trim(), "#016fb9");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--line").trim(), "#d8dbe2");
        assert(frame.contentWindow.getComputedStyle(designPreview).backgroundImage !== "none",
          "design selector should preview the selected theme");
        assert(frame.contentWindow.getComputedStyle(designPreview).backgroundImage !== morningFogPreview,
          "design selector preview should follow the selected theme");
        emberCoastPreview = frame.contentWindow.getComputedStyle(designPreview).backgroundImage;

        designSelect.value = "midnight-fog";
        designSelect.dispatchEvent(new Event("change", { bubbles: true }));

        equal(documentUnderTest.documentElement.dataset.design, "midnight-fog");
        equal(designSelect.dataset.preview, "midnight-fog");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement).colorScheme, "dark");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--page").trim(), "#0d1721");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--surface").trim(), "#16232d");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--accent").trim(), "#61b7e5");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--weekend-line").trim(), "#d28b67");
        assert(frame.contentWindow.getComputedStyle(designPreview).backgroundImage !== morningFogPreview,
          "dark theme preview should differ from Morning Fog");
        assert(frame.contentWindow.getComputedStyle(designPreview).backgroundImage !== emberCoastPreview,
          "dark theme preview should differ from Ember Coast");
        assert(frame.contentWindow.getComputedStyle(designPreview, "::after").boxShadow !== "none",
          "dark theme preview should include a moon icon");
        click("settingsCloseButton");

        return reloadFrame().then(function () {
          var reloadedDocument = getDocument();
          var reloadedState = frame.contentWindow.TimesheetApp.getState();
          var reloadedLanguage = reloadedDocument.getElementById("languageSelect");
          var reloadedDesign = reloadedDocument.getElementById("designSelect");

          equal(reloadedState.preferences.language, "de");
          equal(reloadedState.preferences.design, "midnight-fog");
          equal(reloadedDocument.documentElement.lang, "de");
          equal(reloadedDocument.documentElement.dataset.design, "midnight-fog");
          equal(reloadedDesign.dataset.preview, "midnight-fog");
          equal(reloadedDocument.getElementById("settingsTitle").textContent, "Einstellungen");

          click("menuButton");
          click("settingsButton");
          reloadedLanguage.value = "en";
          reloadedLanguage.dispatchEvent(new Event("change", { bubbles: true }));
          reloadedDesign.value = "default-gradient";
          reloadedDesign.dispatchEvent(new Event("change", { bubbles: true }));
          equal(reloadedDocument.documentElement.lang, "en");
          equal(reloadedDocument.documentElement.dataset.design, "default-gradient");
          equal(frame.contentWindow.getComputedStyle(reloadedDocument.documentElement).colorScheme, "light");
          click("settingsCloseButton");
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
      return run("marks an absence without discarding entered times", function () {
        var documentUnderTest = getDocument();
        var core = frame.contentWindow.TimesheetCore;
        var absenceInput = getAbsenceInput(entryDateKey);
        var start = getInput(entryDateKey, "start");
        var row = start.closest("tr");
        var targetMinutes = core.getDailyTargetMinutes(entryDateKey, 32);

        equal(absenceInput.getAttribute("aria-label"), "Mark "
          + row.querySelector("time").textContent + " as an absence");
        assert(absenceInput.closest("label").getBoundingClientRect().width >= 44,
          "absence checkbox should have a 44px target");
        absenceInput.click();

        equal(frame.contentWindow.TimesheetApp.getState().entries[entryDateKey].absence, true);
        equal(row.classList.contains("is-absence"), true);
        row.querySelectorAll(".time-input").forEach(function (input) {
          equal(input.disabled, true);
        });
        equal(start.value, "09:00");
        equal(getInput(entryDateKey, "finish").value, "16:00");
        equal(row.querySelector("[data-day-worked]").textContent,
          core.formatDuration(targetMinutes));
        equal(row.querySelector("[data-day-decimal]").textContent,
          core.formatDecimalHours(targetMinutes));
        equal(row.querySelector("[data-work-note]").textContent, "Absence");
        equal(row.querySelector("[data-day-balance]").textContent, "0");

        return reloadFrame().then(function () {
          var reloadedInput = getAbsenceInput(entryDateKey);
          var reloadedStart = getInput(entryDateKey, "start");
          var reloadedRow = reloadedStart.closest("tr");

          equal(reloadedInput.checked, true);
          equal(reloadedStart.disabled, true);
          equal(reloadedStart.value, "09:00");
          equal(getInput(entryDateKey, "finish").value, "16:00");

          reloadedInput.click();
          equal(frame.contentWindow.TimesheetApp.getState().entries[entryDateKey].absence, false);
          equal(reloadedStart.disabled, false);
          equal(reloadedStart.value, "09:00");
          equal(reloadedRow.querySelector("[data-day-worked]").textContent, "6:30");
          equal(reloadedRow.querySelector("[data-work-note]").textContent, "30m auto break");
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
          core.formatDuration(expected.expectedMinutes)
        );
        equal(
          documentUnderTest.getElementById("monthExpectedDecimal").textContent,
          core.formatDecimalHours(expected.expectedMinutes) + " decimal hours"
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
      return run("removes entries after their last value is cleared", function () {
        var state = frame.contentWindow.TimesheetApp.getState();
        var emptyDateKey = Array.prototype.find.call(
          getDocument().querySelectorAll(".day-row"),
          function (row) {
            return row.dataset.date !== entryDateKey && !state.entries[row.dataset.date];
          }
        ).dataset.date;
        var start = getInput(emptyDateKey, "start");

        typeValue(start, "9");
        assert(frame.contentWindow.TimesheetApp.getState().entries[emptyDateKey],
          "nonempty input should create an entry");

        typeValue(start, "");
        equal(frame.contentWindow.TimesheetApp.getState().entries[emptyDateKey], undefined);

        return reloadFrame().then(function () {
          equal(frame.contentWindow.TimesheetApp.getState().entries[emptyDateKey], undefined);
          equal(getInput(emptyDateKey, "start").value, "");
        });
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
      return run("bounds navigation at the supported period limits", function () {
        var documentUnderTest = getDocument();
        var previous = documentUnderTest.getElementById("previousMonth");
        var next = documentUnderTest.getElementById("nextMonth");
        var rows;

        selectPeriod(1900, 0);
        equal(frame.contentWindow.TimesheetApp.getViewMonth(), "1900-01");
        equal(documentUnderTest.getElementById("yearInput").min, "1900");
        equal(documentUnderTest.getElementById("yearInput").max, "9999");
        equal(previous.disabled, true);
        equal(next.disabled, false);
        previous.click();
        equal(frame.contentWindow.TimesheetApp.getViewMonth(), "1900-01");

        selectPeriod(9999, 11);
        rows = documentUnderTest.querySelectorAll(".day-row");
        equal(frame.contentWindow.TimesheetApp.getViewMonth(), "9999-12");
        equal(previous.disabled, false);
        equal(next.disabled, true);
        equal(rows[rows.length - 1].dataset.date, "9999-12-31");
        next.click();
        equal(frame.contentWindow.TimesheetApp.getViewMonth(), "9999-12");

        click("todayButton");
        equal(frame.contentWindow.TimesheetApp.getViewMonth(), currentMonthKey);
      });
    })
    .then(function () {
      return run("refreshes today when the window regains focus", function () {
        var appWindow = frame.contentWindow;
        var RealDate = appWindow.Date;
        var realToday = new RealDate(todayKey + "T12:00:00");
        var simulatedToday = new RealDate(
          realToday.getFullYear(),
          realToday.getMonth() + 1,
          2,
          12
        );
        var simulatedTodayKey = appWindow.TimesheetCore.toIsoDate(simulatedToday);

        appWindow.Date = createFixedDateConstructor(RealDate, simulatedToday);
        appWindow.dispatchEvent(new appWindow.Event("focus"));

        equal(appWindow.TimesheetApp.getViewMonth(), simulatedTodayKey.slice(0, 7));
        equal(getDocument().querySelector(".day-row.is-today").dataset.date, simulatedTodayKey);

        appWindow.Date = RealDate;
        appWindow.dispatchEvent(new appWindow.Event("focus"));

        equal(appWindow.TimesheetApp.getViewMonth(), currentMonthKey);
        equal(getDocument().querySelector(".day-row.is-today").dataset.date, todayKey);
      });
    })
    .then(function () {
      return run("compacts the ledger and keeps the mobile header visible", function () {
        frame.style.width = "390px";

        return waitForLayout().then(function () {
          var documentUnderTest = getDocument();
          var dateCell = documentUnderTest.querySelector(".date-cell");
          var dateBounds = dateCell.querySelector("time").getBoundingClientRect();
          var weekdayBounds = dateCell.querySelector(".weekday").getBoundingClientRect();
          var table = documentUnderTest.getElementById("timesheetTable");
          var workNote = documentUnderTest.querySelector(
            '[data-date="' + entryDateKey + '"] [data-work-note]'
          );
          var positiveProbe = documentUnderTest.createElement("span");
          var header = documentUnderTest.querySelector(".app-header");
          var brand = documentUnderTest.querySelector(".brand-line");
          var menuButton = documentUnderTest.getElementById("menuButton");
          var headerBounds;
          var brandBounds;
          var menuBounds;

          equal(frame.contentWindow.innerWidth, 390);
          equal(documentUnderTest.documentElement.scrollWidth, 390);
          equal(Math.round(weekdayBounds.left - dateBounds.right), 8);
          assert(dateCell.getBoundingClientRect().width < 175, "mobile date column should stay compact");
          equal(Math.round(table.getBoundingClientRect().width), 1060);

          positiveProbe.style.color = "var(--positive)";
          documentUnderTest.body.appendChild(positiveProbe);
          equal(workNote.textContent, "30m auto break");
          equal(
            frame.contentWindow.getComputedStyle(workNote).color,
            frame.contentWindow.getComputedStyle(positiveProbe).color
          );
          positiveProbe.remove();

          frame.contentWindow.scrollTo(
            0,
            documentUnderTest.querySelector(".ledger-section").offsetTop + 200
          );
          headerBounds = header.getBoundingClientRect();
          brandBounds = brand.getBoundingClientRect();
          menuBounds = menuButton.getBoundingClientRect();

          assert(frame.contentWindow.scrollY > 0, "mobile page should scroll to the ledger");
          equal(frame.contentWindow.getComputedStyle(header).position, "sticky");
          equal(
            frame.contentWindow.getComputedStyle(header).backgroundColor,
            "rgba(0, 0, 0, 0)"
          );
          equal(frame.contentWindow.getComputedStyle(header).backdropFilter, "blur(12px)");
          assert(Math.abs(headerBounds.top) < 1, "mobile header should stay at the viewport top");
          assert(brandBounds.top >= headerBounds.top && brandBounds.bottom <= headerBounds.bottom,
            "brand should remain visible inside the sticky header");
          assert(menuBounds.top >= headerBounds.top && menuBounds.bottom <= headerBounds.bottom,
            "menu button should remain visible inside the sticky header");
          frame.contentWindow.scrollTo(0, 0);
        });
      });
    })
    .then(function () {
      return run("keeps the layout usable at the 320px minimum", function () {
        var documentUnderTest = getDocument();
        var tableFrame = documentUnderTest.querySelector(".table-frame");
        var summaryMetrics = documentUnderTest.querySelectorAll(".summary-metric");
        var firstMetricBounds;
        var secondMetricBounds;
        var controls;

        frame.style.width = "320px";
        click("menuButton");
        controls = documentUnderTest.querySelectorAll(
          ".mobile-menu-button, .header-actions button, .period-navigation button, .period-picker, .schedule-control"
        );

        equal(frame.contentWindow.innerWidth, 320);
        equal(documentUnderTest.documentElement.scrollWidth, 320);
        assert(tableFrame.scrollWidth > tableFrame.clientWidth, "ledger should remain independently scrollable");
        firstMetricBounds = summaryMetrics[0].getBoundingClientRect();
        secondMetricBounds = summaryMetrics[1].getBoundingClientRect();
        assert(Math.abs(secondMetricBounds.top - firstMetricBounds.top) < 1,
          "summary metrics should share one compact row at the minimum width");
        summaryMetrics.forEach(function (metric) {
          var bounds = metric.getBoundingClientRect();
          assert(bounds.left >= 0, "summary metric extends left of minimum viewport");
          assert(bounds.right <= 320, "summary metric extends right of minimum viewport");
        });
        controls.forEach(function (control) {
          var bounds = control.getBoundingClientRect();
          assert(bounds.left >= 0, "control extends left of minimum viewport");
          assert(bounds.right <= 320, "control extends right of minimum viewport");
          assert(bounds.height >= 44, "control should retain a 44px touch target");
        });

        click("settingsButton");
        var dialog = documentUnderTest.getElementById("settingsDialog");
        var languageSelect = documentUnderTest.getElementById("languageSelect");
        languageSelect.value = "es";
        languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
        var dialogBounds = dialog.getBoundingClientRect();
        equal(dialog.open, true);
        equal(documentUnderTest.documentElement.lang, "es");
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
          var label = row.querySelector("label");
          var labelBounds = label.getBoundingClientRect();
          var selectBounds = row.querySelector("select").getBoundingClientRect();

          assert(labelBounds.bottom <= selectBounds.top,
            "preference label should sit above its select at the minimum width");
          equal(frame.contentWindow.getComputedStyle(label).whiteSpace, "nowrap");
        });
        languageSelect.value = "de";
        languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
        var menuBounds = documentUnderTest.getElementById("menuButton").getBoundingClientRect();
        equal(documentUnderTest.documentElement.lang, "de");
        equal(documentUnderTest.documentElement.scrollWidth, 320);
        assert(menuBounds.right <= 320, "translated mobile header extends beyond viewport");
        assert(menuBounds.width >= 44, "mobile menu should retain a 44px touch target");
        languageSelect.value = "en";
        languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
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
          var languageSelect = documentUnderTest.getElementById("languageSelect");
          var dateCell = documentUnderTest.querySelector(".date-cell");
          var dateBounds = dateCell.querySelector("time").getBoundingClientRect();
          var weekdayBounds = dateCell.querySelector(".weekday").getBoundingClientRect();
          var numberField = documentUnderTest.querySelector(".schedule-control .number-field");
          var dailyTarget = documentUnderTest.getElementById("dailyTarget");
          var brandBounds;
          var actionBounds;

          languageSelect.value = "de";
          languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
          brandBounds = documentUnderTest.querySelector(".brand-line").getBoundingClientRect();
          actionBounds = headerActions.getBoundingClientRect();

          equal(frame.contentWindow.innerWidth, 841);
          equal(documentUnderTest.documentElement.scrollWidth, 841);
          equal(documentUnderTest.documentElement.lang, "de");
          equal(frame.contentWindow.getComputedStyle(documentUnderTest.getElementById("menuButton")).display, "none");
          equal(frame.contentWindow.getComputedStyle(headerActions).display, "flex");
          equal(frame.contentWindow.getComputedStyle(header).position, "relative");
          equal(headerActions.dataset.open, "false");
          equal(documentUnderTest.getElementById("restoreButton").nextElementSibling.id, "settingsButton");
          assert(dateCell.getBoundingClientRect().width < 200,
            "date column should tighten before the mobile breakpoint");
          equal(Math.round(weekdayBounds.left - dateBounds.right), 8);
          assert(dailyTarget.getBoundingClientRect().left >= numberField.getBoundingClientRect().right,
            "stacked daily target should sit to the right of the hours picker");
          assert(actionBounds.right <= header.getBoundingClientRect().right, "desktop actions should fit the header");
          assert(brandBounds.top < actionBounds.bottom && brandBounds.bottom > actionBounds.top,
            "brand and desktop actions should share one row");
          languageSelect.value = "en";
          languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    })
    .then(function () {
      return run("restores current and legacy backups through the file input", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var model = appWindow.TimesheetModel;
        var storageApi = appWindow.TimesheetStorage;
        var originalConfirm = appWindow.confirm;
        var localState = appWindow.TimesheetApp.getState();
        var availableDates = Array.prototype.filter.call(
          documentUnderTest.querySelectorAll(".day-row"),
          function (row) {
            return row.dataset.date !== entryDateKey
              && appWindow.TimesheetCore.getMonthKey(row.dataset.date) === currentMonthKey
              && !localState.entries[row.dataset.date];
          }
        ).map(function (row) {
          return row.dataset.date;
        });
        var importedDate = availableDates[0];
        var legacyDate = availableDates[1];
        var currentImport = model.createEmptyState();
        var legacyData = {
          version: model.SCHEMA_VERSION,
          entries: {},
          schedules: {}
        };
        var preservedStart = localState.entries[entryDateKey].start;
        var preservedDateFormat = localState.preferences.dateFormat;
        var confirmations = 0;
        var currentBackup;
        var legacyBackup;
        var workflow;

        currentImport.preferences = localState.preferences;
        currentImport.entries[importedDate] = model.createEmptyEntry();
        currentImport.entries[importedDate].start = "<x>&";
        currentBackup = storageApi.serializeBackup(currentImport);
        legacyData.entries[legacyDate] = entry("8", "12");
        legacyBackup = JSON.stringify({
          format: storageApi.BACKUP_FORMAT,
          version: model.SCHEMA_VERSION,
          exportedAt: "2026-07-21T12:00:00.000Z",
          data: legacyData
        });

        appWindow.confirm = function () {
          confirmations += 1;
          return true;
        };
        selectRestoreText(currentBackup, "current.json");

        workflow = waitForCondition(function () {
          var state = appWindow.TimesheetApp.getState();
          return state.entries[importedDate]
            && state.entries[importedDate].start === "<x>&";
        }, "current backup was not restored").then(function () {
          var importedInput = getInput(importedDate, "start");

          equal(appWindow.TimesheetApp.getState().entries[entryDateKey].start, preservedStart);
          equal(importedInput.value, "<x>&");
          equal(importedInput.closest("tr").querySelector("x"), null);
          equal(documentUnderTest.querySelector("[data-status-text]").textContent,
            "Backup restored and saved");
          equal(JSON.parse(currentBackup).version, 1);

          selectRestoreText(legacyBackup, "legacy.json");
          return waitForCondition(function () {
            var state = appWindow.TimesheetApp.getState();
            return state.entries[legacyDate]
              && state.entries[legacyDate].start === "8";
          }, "legacy backup was not restored");
        }).then(function () {
          var saved = JSON.parse(appWindow.localStorage.getItem(TEST_STORAGE_KEY));

          equal(confirmations, 2);
          equal(appWindow.TimesheetApp.getState().preferences.dateFormat, preservedDateFormat);
          equal(saved.version, 1);
          equal(saved.entries[importedDate].start, "<x>&");
          equal(saved.entries[legacyDate].start, "8");
        });

        return withCleanup(workflow, function () {
          delete documentUnderTest.getElementById("restoreInput").files;
          appWindow.confirm = originalConfirm;
        });
      });
    })
    .then(function () {
      return run("leaves state unchanged when restore is cancelled", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var originalConfirm = appWindow.confirm;
        var imported = appWindow.TimesheetModel.createEmptyState();
        var stateBefore = JSON.stringify(appWindow.TimesheetApp.getState());
        var confirmations = 0;
        var workflow;

        imported.schedules[currentMonthKey] = 12;
        appWindow.confirm = function () {
          confirmations += 1;
          return false;
        };
        selectRestoreText(appWindow.TimesheetStorage.serializeBackup(imported), "cancel.json");

        workflow = waitForCondition(function () {
          return documentUnderTest.querySelector("[data-status-text]").textContent
            === "Restore cancelled";
        }, "restore cancellation was not reported").then(function () {
          equal(confirmations, 1);
          equal(JSON.stringify(appWindow.TimesheetApp.getState()), stateBefore);
        });

        return withCleanup(workflow, function () {
          delete documentUnderTest.getElementById("restoreInput").files;
          appWindow.confirm = originalConfirm;
        });
      });
    })
    .then(function () {
      return run("rejects malformed and over-limit backups before confirmation", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var model = appWindow.TimesheetModel;
        var storageApi = appWindow.TimesheetStorage;
        var originalConfirm = appWindow.confirm;
        var stateBefore = JSON.stringify(appWindow.TimesheetApp.getState());
        var excessiveData = {
          version: model.SCHEMA_VERSION,
          entries: {},
          schedules: {}
        };
        var confirmations = 0;
        var index;
        var workflow;

        appWindow.confirm = function () {
          confirmations += 1;
          return true;
        };
        selectRestoreText("not json", "malformed.json");

        workflow = waitForCondition(function () {
          return documentUnderTest.querySelector("[data-status-text]").textContent
            === "The selected file is not valid JSON.";
        }, "malformed backup was not rejected").then(function () {
          for (index = 0; index <= model.MAX_ENTRY_COUNT; index += 1) {
            excessiveData.entries["entry-" + index] = null;
          }

          selectRestoreText(JSON.stringify({
            format: storageApi.BACKUP_FORMAT,
            version: model.SCHEMA_VERSION,
            exportedAt: "2026-07-21T12:00:00.000Z",
            data: excessiveData
          }), "too-many-entries.json");
          return waitForCondition(function () {
            return documentUnderTest.querySelector("[data-status-text]").textContent
              === "The saved data contains more than 50000 entries.";
          }, "over-limit backup was not rejected");
        }).then(function () {
          equal(confirmations, 0);
          equal(JSON.stringify(appWindow.TimesheetApp.getState()), stateBefore);
        });

        return withCleanup(workflow, function () {
          delete documentUnderTest.getElementById("restoreInput").files;
          appWindow.confirm = originalConfirm;
        });
      });
    })
    .then(function () {
      return run("does not apply a restore when persistence fails", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var storagePrototype = Object.getPrototypeOf(appWindow.localStorage);
        var originalSetItem = storagePrototype.setItem;
        var originalConfirm = appWindow.confirm;
        var imported = appWindow.TimesheetModel.createEmptyState();
        var stateBefore = JSON.stringify(appWindow.TimesheetApp.getState());
        var workflow;

        imported.schedules[currentMonthKey] = 18;
        storagePrototype.setItem = function () {
          throw new Error("Write failed");
        };
        appWindow.confirm = function () {
          return true;
        };
        selectRestoreText(appWindow.TimesheetStorage.serializeBackup(imported), "write-failure.json");

        workflow = waitForCondition(function () {
          return documentUnderTest.querySelector("[data-status-text]").textContent
            === "Browser storage rejected this edit. It was not saved.";
        }, "restore write failure was not reported").then(function () {
          equal(JSON.stringify(appWindow.TimesheetApp.getState()), stateBefore);
        });

        return withCleanup(workflow, function () {
          delete documentUnderTest.getElementById("restoreInput").files;
          storagePrototype.setItem = originalSetItem;
          appWindow.confirm = originalConfirm;
        });
      });
    })
    .then(function () {
      return run("rejects oversized backups before reading them", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var restoreInput = documentUnderTest.getElementById("restoreInput");
        var originalFileReader = appWindow.FileReader;
        var originalConfirm = appWindow.confirm;
        var stateBefore = JSON.stringify(appWindow.TimesheetApp.getState());
        var readerCalls = 0;
        var confirmCalls = 0;

        appWindow.FileReader = function () {
          readerCalls += 1;
        };
        appWindow.confirm = function () {
          confirmCalls += 1;
          return true;
        };
        Object.defineProperty(restoreInput, "files", {
          configurable: true,
          value: [{ size: appWindow.TimesheetStorage.MAX_BACKUP_BYTES + 1 }]
        });

        restoreInput.dispatchEvent(new Event("change", { bubbles: true }));

        equal(readerCalls, 0);
        equal(confirmCalls, 0);
        equal(JSON.stringify(appWindow.TimesheetApp.getState()), stateBefore);
        equal(documentUnderTest.querySelector("[data-status-text]").textContent,
          "Choose a backup no larger than 10 MiB.");
        equal(documentUnderTest.getElementById("saveStatus").dataset.tone, "error");

        delete restoreInput.files;
        appWindow.FileReader = originalFileReader;
        appWindow.confirm = originalConfirm;
      });
    })
    .then(function () {
      return run("preserves an initial storage write failure", function () {
        var storage = frame.contentWindow.localStorage;
        var fillerKeys;

        storage.removeItem(TEST_STORAGE_KEY);
        fillerKeys = fillStorageToCapacity(storage);
        assert(fillerKeys.length > 0, "test should reserve browser storage capacity");

        return reloadFrame().then(function () {
          var status = getDocument().getElementById("saveStatus");
          var message = status.querySelector("[data-status-text]").textContent;

          removeStorageKeys(frame.contentWindow.localStorage, fillerKeys);
          equal(status.dataset.tone, "error");
          equal(message, "Browser storage rejected this edit. It was not saved.");
        }, function (error) {
          removeStorageKeys(frame.contentWindow.localStorage, fillerKeys);
          throw error;
        });
      });
    })
    .then(finish)
    .catch(function (error) {
      failures.push("test setup: " + error.message);
      finish();
    });
})();