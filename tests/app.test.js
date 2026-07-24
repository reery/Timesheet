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

  function wait(milliseconds) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, milliseconds);
    });
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
        var themeSelect = documentUnderTest.getElementById("themeSelect");
        var workDayStartSelect = documentUnderTest.getElementById("workDayStartSelect");
        var workDayEndSelect = documentUnderTest.getElementById("workDayEndSelect");
        var themePreview = dialog.querySelector(".theme-preview");
        var preferencesButton = documentUnderTest.getElementById("settingsButton");
        var repositoryLink = dialog.querySelector(".about-details a");
        var settingsSections;
        var sectionHeading;
        var settingLabel;
        var todayTime;
        var firstWeek;
        var firstWeekRange;

        assert(documentUnderTest.querySelector("[data-brand-icon]"), "brand should include a timetable icon");
        equal(documentUnderTest.querySelector(".brand-line h1").textContent, "Timesheet");
        equal(documentUnderTest.querySelector("[data-app-version]").textContent, "v0.6");
        equal(preferencesButton.textContent.trim(), "Preferences");
        equal(documentUnderTest.body.textContent.indexOf("Settings"), -1);
        click("menuButton");
        click("settingsButton");
        equal(dialog.open, true);
        equal(documentUnderTest.body.classList.contains("settings-open"), true);
        equal(documentUnderTest.getElementById("menuButton").getAttribute("aria-expanded"), "false");
        equal(documentUnderTest.getElementById("settingsTitle").textContent, "Preferences");
        equal(documentUnderTest.querySelector('label[for="themeSelect"]').textContent, "Theme");
        settingsSections = dialog.querySelectorAll(".settings-section");
        sectionHeading = settingsSections[0].querySelector("h3");
        settingLabel = settingsSections[0].querySelector("label");
        equal(settingsSections.length, 4);
        equal(Array.prototype.map.call(settingsSections, function (section) {
          return section.querySelector("h3").textContent;
        }).join(","), "Display,Time ledger,Data,About");
        assert(parseFloat(frame.contentWindow.getComputedStyle(sectionHeading).fontSize)
          > parseFloat(frame.contentWindow.getComputedStyle(settingLabel).fontSize),
        "section headings should be larger than setting labels");
        equal(frame.contentWindow.getComputedStyle(settingLabel).textAlign, "right");
        dialog.querySelectorAll(".setting-row").forEach(function (row) {
          equal(frame.contentWindow.getComputedStyle(row).borderTopWidth, "0px");
        });
        equal(frame.contentWindow.getComputedStyle(dialog.querySelector(".settings-dialog-header"))
          .borderBottomWidth, "1px");
        equal(frame.contentWindow.getComputedStyle(settingsSections[1]).borderTopWidth, "1px");
        equal(frame.contentWindow.getComputedStyle(settingsSections[2]).borderTopWidth, "1px");
        equal(frame.contentWindow.getComputedStyle(settingsSections[3]).borderTopWidth, "1px");
        equal(documentUnderTest.getElementById("workDaysLabel").textContent, "Work days");
        equal(dialog.querySelector(".work-days-separator").textContent, "to");
        equal(workDayStartSelect.getAttribute("aria-label"), "First work day");
        equal(workDayEndSelect.getAttribute("aria-label"), "Last work day");
        equal(Array.prototype.map.call(workDayStartSelect.options, function (option) {
          return option.value;
        }).join(","), "1,2,3,4,5,6,0");
        equal(workDayStartSelect.value, "1");
        equal(workDayEndSelect.value, "5");
        assert(workDayStartSelect.getBoundingClientRect().width
          < dateFormatSelect.getBoundingClientRect().width * 0.55,
        "work-day selects should be about half the width of a standard select");
        equal(dialog.querySelector(".settings-dialog-header .eyebrow"), null);
        equal(documentUnderTest.getElementById("settingsCloseButton").getAttribute("aria-label"), "Close preferences");
        equal(documentUnderTest.querySelector("[data-about-version]").textContent, "Timesheet v0.6");
        equal(dialog.querySelector(".about-details p:first-child").textContent, "Local work time tracker.");
        equal(dialog.querySelector(".about-details p:nth-child(2)").textContent, "MIT licence.");
        equal(repositoryLink.textContent, "https://github.com/reery/Timesheet");
        equal(repositoryLink.href, "https://github.com/reery/Timesheet");
        equal(languageSelect.disabled, false);
        equal(languageSelect.options.length, 4);
        equal(languageSelect.value, "en");
        equal(themeSelect.disabled, false);
        equal(themeSelect.options.length, 3);
        equal(themeSelect.value, "default-gradient");
        equal(themeSelect.options[0].textContent, "Morning Fog");
        equal(themeSelect.options[1].textContent, "Midnight Fog");
        equal(themeSelect.options[2].textContent, "Ember Coast");
        assert(themePreview, "theme selector should include a preview");
        assert(parseFloat(frame.contentWindow.getComputedStyle(themeSelect).paddingLeft) >= 45,
          "theme selector text should sit beside the preview");
        assert(frame.contentWindow.getComputedStyle(themePreview).backgroundImage !== "none",
          "theme selector should preview the selected theme");
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
      return run("cancels local data deletion inside preferences", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var settingsDialog = documentUnderTest.getElementById("settingsDialog");
        var deleteDialog = documentUnderTest.getElementById("deleteDataDialog");
        var deleteButton = documentUnderTest.getElementById("deleteLocalDataButton");
        var yesButton = documentUnderTest.getElementById("confirmDeleteDataButton");
        var backupButton = documentUnderTest.getElementById("backupDeleteDataButton");
        var noButton = documentUnderTest.getElementById("cancelDeleteDataButton");
        var stateBefore = JSON.stringify(appWindow.TimesheetApp.getState());
        var storedBefore = appWindow.localStorage.getItem(TEST_STORAGE_KEY);
        var workflow;

        workflow = Promise.resolve().then(function () {
          click("menuButton");
          click("settingsButton");
          equal(deleteButton.textContent, "Delete local data");
          click("deleteLocalDataButton");

          equal(settingsDialog.open, true);
          equal(deleteDialog.open, true);
          equal(deleteDialog.getAttribute("aria-labelledby"), "deleteDataTitle");
          equal(deleteDialog.getAttribute("aria-describedby"), "deleteDataQuestion");
          equal(documentUnderTest.getElementById("deleteDataTitle").textContent,
            "Delete local data");
          equal(documentUnderTest.getElementById("deleteDataQuestion").textContent,
            "Do you really want to delete all locally saved data in your browser?");
          equal(Array.prototype.map.call(
            deleteDialog.querySelectorAll(".delete-data-dialog-actions button"),
            function (button) {
              return button.textContent;
            }
          ).join(","), "Yes,Backup and delete,No");
          equal(yesButton.classList.contains("button-danger"), true);
          equal(backupButton.classList.contains("button-positive"), true);
          equal(noButton.classList.contains("button-secondary"), true);
          assert(documentUnderTest.activeElement === noButton,
            "No should receive initial confirmation focus");

          click("cancelDeleteDataButton");
          equal(deleteDialog.open, false);
          equal(settingsDialog.open, true);

          click("deleteLocalDataButton");
          deleteDialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          equal(deleteDialog.open, false);
          equal(settingsDialog.open, true);

          click("deleteLocalDataButton");
          noButton.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true
          }));
          equal(deleteDialog.open, false);
          equal(settingsDialog.open, true);

          click("deleteLocalDataButton");
          deleteDialog.close();
          equal(settingsDialog.open, true);
          equal(JSON.stringify(appWindow.TimesheetApp.getState()), stateBefore);
          equal(appWindow.localStorage.getItem(TEST_STORAGE_KEY), storedBefore);
          click("settingsCloseButton");
        });

        return withCleanup(workflow, function () {
          if (deleteDialog.open) {
            deleteDialog.close();
          }
          if (settingsDialog.open) {
            settingsDialog.close();
          }
        });
      });
    })
    .then(function () {
      return run("translates and persists language and theme preferences", function () {
        var documentUnderTest = getDocument();
        var i18n = frame.contentWindow.TimesheetI18n;
        var core = frame.contentWindow.TimesheetCore;
        var languageSelect;
        var themeSelect;
        var themePreview;
        var workDayStartSelect;
        var morningFogPreview;
        var emberCoastPreview;
        var selectedMonth = Number(currentMonthKey.slice(5, 7)) - 1;
        var languages = ["de", "es", "fr"];

        click("menuButton");
        click("settingsButton");
        languageSelect = documentUnderTest.getElementById("languageSelect");
        themeSelect = documentUnderTest.getElementById("themeSelect");
        workDayStartSelect = documentUnderTest.getElementById("workDayStartSelect");
        themePreview = documentUnderTest.querySelector(".theme-preview");
        morningFogPreview = frame.contentWindow.getComputedStyle(themePreview).backgroundImage;

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
          equal(Array.prototype.map.call(workDayStartSelect.options, function (option) {
            return option.textContent;
          }).join(","), [1, 2, 3, 4, 5, 6, 0].map(function (day) {
            return calendar.weekdays[day];
          }).join(","));
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
          equal(themeSelect.options[0].textContent, "Morning Fog");
          equal(themeSelect.options[1].textContent, "Midnight Fog");
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
        themeSelect.value = "ember-coast";
        themeSelect.dispatchEvent(new Event("change", { bubbles: true }));

        equal(documentUnderTest.documentElement.dataset.theme, "ember-coast");
        equal(themeSelect.dataset.preview, "ember-coast");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--accent").trim(), "#ff9505");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--optional-day-line").trim(), "#ec4e20");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--accent-strong").trim(), "#016fb9");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--line").trim(), "#d8dbe2");
        assert(frame.contentWindow.getComputedStyle(themePreview).backgroundImage !== "none",
          "theme selector should preview the selected theme");
        assert(frame.contentWindow.getComputedStyle(themePreview).backgroundImage !== morningFogPreview,
          "theme selector preview should follow the selected theme");
        emberCoastPreview = frame.contentWindow.getComputedStyle(themePreview).backgroundImage;

        themeSelect.value = "midnight-fog";
        themeSelect.dispatchEvent(new Event("change", { bubbles: true }));

        equal(documentUnderTest.documentElement.dataset.theme, "midnight-fog");
        equal(themeSelect.dataset.preview, "midnight-fog");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement).colorScheme, "dark");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--page").trim(), "#0d1721");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--surface").trim(), "#16232d");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--accent").trim(), "#61b7e5");
        equal(frame.contentWindow.getComputedStyle(documentUnderTest.documentElement)
          .getPropertyValue("--optional-day-line").trim(), "#d28b67");
        assert(frame.contentWindow.getComputedStyle(themePreview).backgroundImage !== morningFogPreview,
          "dark theme preview should differ from Morning Fog");
        assert(frame.contentWindow.getComputedStyle(themePreview).backgroundImage !== emberCoastPreview,
          "dark theme preview should differ from Ember Coast");
        assert(frame.contentWindow.getComputedStyle(themePreview, "::after").boxShadow !== "none",
          "dark theme preview should include a moon icon");
        click("settingsCloseButton");

        return reloadFrame().then(function () {
          var reloadedDocument = getDocument();
          var reloadedState = frame.contentWindow.TimesheetApp.getState();
          var reloadedLanguage = reloadedDocument.getElementById("languageSelect");
          var reloadedTheme = reloadedDocument.getElementById("themeSelect");

          equal(reloadedState.preferences.language, "de");
          equal(reloadedState.preferences.theme, "midnight-fog");
          equal(reloadedDocument.documentElement.lang, "de");
          equal(reloadedDocument.documentElement.dataset.theme, "midnight-fog");
          equal(reloadedTheme.dataset.preview, "midnight-fog");
          equal(reloadedDocument.getElementById("settingsTitle").textContent, "Einstellungen");

          click("menuButton");
          click("settingsButton");
          reloadedLanguage.value = "en";
          reloadedLanguage.dispatchEvent(new Event("change", { bubbles: true }));
          reloadedTheme.value = "default-gradient";
          reloadedTheme.dispatchEvent(new Event("change", { bubbles: true }));
          equal(reloadedDocument.documentElement.lang, "en");
          equal(reloadedDocument.documentElement.dataset.theme, "default-gradient");
          equal(frame.contentWindow.getComputedStyle(reloadedDocument.documentElement).colorScheme, "light");
          click("settingsCloseButton");
        });
      });
    })
    .then(function () {
      return run("persists work days and applies them to styling and targets", function () {
        var documentUnderTest = getDocument();
        var appWindow = frame.contentWindow;
        var core = appWindow.TimesheetCore;
        var weeks = core.buildMonthWeeks(
          Number(currentMonthKey.slice(0, 4)),
          Number(currentMonthKey.slice(5, 7)) - 1
        );
        var completedWeekIndex = weeks.findIndex(function (week) {
          return week.dates.every(function (dateKey) {
            return core.getMonthKey(dateKey) === currentMonthKey;
          }) && week.dates[6] <= todayKey;
        });
        var saturdayRow = Array.prototype.find.call(
          documentUnderTest.querySelectorAll(".day-row"),
          function (row) {
            return core.getMonthKey(row.dataset.date) === currentMonthKey
              && core.parseIsoDate(row.dataset.date).getDay() === 6;
          }
        );
        var tuesdayRow = Array.prototype.find.call(
          documentUnderTest.querySelectorAll(".day-row"),
          function (row) {
            return core.getMonthKey(row.dataset.date) === currentMonthKey
              && core.parseIsoDate(row.dataset.date).getDay() === 2;
          }
        );
        var startSelect;
        var endSelect;

        assert(completedWeekIndex >= 0, "test month should contain a completed full week");
        equal(saturdayRow.classList.contains("is-optional-day"), true);
        equal(tuesdayRow.classList.contains("is-optional-day"), false);

        click("menuButton");
        click("settingsButton");
        startSelect = documentUnderTest.getElementById("workDayStartSelect");
        endSelect = documentUnderTest.getElementById("workDayEndSelect");
        startSelect.value = "5";
        startSelect.dispatchEvent(new Event("change", { bubbles: true }));
        endSelect.value = "1";
        endSelect.dispatchEvent(new Event("change", { bubbles: true }));

        equal(JSON.stringify(appWindow.TimesheetApp.getState().preferences.workDayRange),
          JSON.stringify({ start: 5, end: 1 }));
        saturdayRow = documentUnderTest.querySelector('[data-date="' + saturdayRow.dataset.date + '"]');
        tuesdayRow = documentUnderTest.querySelector('[data-date="' + tuesdayRow.dataset.date + '"]');
        equal(saturdayRow.classList.contains("is-optional-day"), false);
        equal(tuesdayRow.classList.contains("is-optional-day"), true);
        equal(documentUnderTest.getElementById("dailyTarget").textContent,
          "8 h each work day");

        setWeeklyHours(42);
        startSelect.value = "1";
        startSelect.dispatchEvent(new Event("change", { bubbles: true }));
        endSelect.value = "0";
        endSelect.dispatchEvent(new Event("change", { bubbles: true }));

        equal(documentUnderTest.querySelectorAll(".day-row.is-optional-day").length, 0);
        equal(documentUnderTest.getElementById("dailyTarget").textContent,
          "6 h each work day");
        equal(documentUnderTest.querySelector(
          '.week-summary[data-week-index="' + completedWeekIndex + '"] [data-week-target]'
        ).textContent, "42h expected");
        click("settingsCloseButton");

        return reloadFrame().then(function () {
          var reloadedDocument = getDocument();
          var reloadedState = frame.contentWindow.TimesheetApp.getState();

          equal(JSON.stringify(reloadedState.preferences.workDayRange),
            JSON.stringify({ start: 1, end: 0 }));
          equal(reloadedState.schedules[currentMonthKey], 42);
          equal(reloadedDocument.getElementById("workDayStartSelect").value, "1");
          equal(reloadedDocument.getElementById("workDayEndSelect").value, "0");
          equal(reloadedDocument.getElementById("dailyTarget").textContent,
            "6 h each work day");

          setWeeklyHours(32);
          click("menuButton");
          click("settingsButton");
          endSelect = reloadedDocument.getElementById("workDayEndSelect");
          endSelect.value = "5";
          endSelect.dispatchEvent(new Event("change", { bubbles: true }));
          click("settingsCloseButton");

          equal(JSON.stringify(frame.contentWindow.TimesheetApp.getState().preferences.workDayRange),
            JSON.stringify({ start: 1, end: 5 }));
          equal(frame.contentWindow.TimesheetApp.getState().schedules[currentMonthKey], 32);
          equal(reloadedDocument.querySelectorAll(".day-row.is-optional-day").length > 0, true);
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
      return run("coalesces rapid time input persistence", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var storagePrototype = Object.getPrototypeOf(appWindow.localStorage);
        var originalSetItem = storagePrototype.setItem;
        var start = getInput(entryDateKey, "start");
        var row = start.closest("tr");
        var writeCount = 0;
        var workflow;

        storagePrototype.setItem = function (key, value) {
          if (key === TEST_STORAGE_KEY) {
            writeCount += 1;
          }
          return originalSetItem.call(this, key, value);
        };

        workflow = Promise.resolve().then(function () {
          ["0", "09", "09:", "09:00"].forEach(function (value) {
            typeValue(start, value);
          });

          equal(appWindow.TimesheetApp.getState().entries[entryDateKey].start, "09:00");
          equal(row.querySelector("[data-day-worked]").textContent, "6:30");
          equal(documentUnderTest.querySelector("[data-status-text]").textContent, "Saving\u2026");
          equal(writeCount, 0);

          return wait(350);
        }).then(function () {
          equal(writeCount, 1);
          equal(documentUnderTest.querySelector("[data-status-text]").textContent, "Saved locally");
        });

        return withCleanup(workflow, function () {
          storagePrototype.setItem = originalSetItem;
        });
      });
    })
    .then(function () {
      return run("flushes normalized time input on blur", function () {
        var appWindow = frame.contentWindow;
        var storagePrototype = Object.getPrototypeOf(appWindow.localStorage);
        var originalSetItem = storagePrototype.setItem;
        var start = getInput(entryDateKey, "start");
        var writeCount = 0;
        var workflow;

        storagePrototype.setItem = function (key, value) {
          if (key === TEST_STORAGE_KEY) {
            writeCount += 1;
          }
          return originalSetItem.call(this, key, value);
        };

        workflow = Promise.resolve().then(function () {
          typeValue(start, "900");
          equal(writeCount, 0);
          leaveInput(start);

          equal(start.value, "09:00");
          equal(writeCount, 1);
          equal(JSON.parse(appWindow.localStorage.getItem(TEST_STORAGE_KEY))
            .entries[entryDateKey].start, "09:00");

          return wait(350);
        }).then(function () {
          equal(writeCount, 1);
        });

        return withCleanup(workflow, function () {
          storagePrototype.setItem = originalSetItem;
        });
      });
    })
    .then(function () {
      return run("flushes pending time input on page hide", function () {
        var appWindow = frame.contentWindow;
        var storagePrototype = Object.getPrototypeOf(appWindow.localStorage);
        var originalSetItem = storagePrototype.setItem;
        var start = getInput(entryDateKey, "start");
        var writeCount = 0;
        var workflow;

        storagePrototype.setItem = function (key, value) {
          if (key === TEST_STORAGE_KEY) {
            writeCount += 1;
          }
          return originalSetItem.call(this, key, value);
        };

        workflow = Promise.resolve().then(function () {
          typeValue(start, "09:00");
          equal(writeCount, 0);
          appWindow.dispatchEvent(new appWindow.Event("pagehide"));

          equal(writeCount, 1);
          equal(JSON.parse(appWindow.localStorage.getItem(TEST_STORAGE_KEY))
            .entries[entryDateKey].start, "09:00");

          return wait(350);
        }).then(function () {
          equal(writeCount, 1);
        });

        return withCleanup(workflow, function () {
          storagePrototype.setItem = originalSetItem;
        });
      });
    })
    .then(function () {
      return run("reports a rejected queued save and retries on a later edit", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var storagePrototype = Object.getPrototypeOf(appWindow.localStorage);
        var originalSetItem = storagePrototype.setItem;
        var start = getInput(entryDateKey, "start");
        var rejectWrite = true;
        var writeCount = 0;
        var workflow;

        storagePrototype.setItem = function (key, value) {
          if (key === TEST_STORAGE_KEY) {
            writeCount += 1;
            if (rejectWrite) {
              throw new Error("Write failed");
            }
          }
          return originalSetItem.call(this, key, value);
        };

        typeValue(start, "9");
        workflow = waitForCondition(function () {
          return documentUnderTest.querySelector("[data-status-text]").textContent
            === "Browser storage rejected this edit. It was not saved.";
        }, "queued save failure was not reported").then(function () {
          equal(writeCount, 1);
          equal(appWindow.TimesheetApp.getState().entries[entryDateKey].start, "9");

          rejectWrite = false;
          typeValue(start, "09:00");
          return waitForCondition(function () {
            return documentUnderTest.querySelector("[data-status-text]").textContent
              === "Saved locally";
          }, "later edit did not retry persistence");
        }).then(function () {
          equal(writeCount, 2);
          equal(JSON.parse(appWindow.localStorage.getItem(TEST_STORAGE_KEY))
            .entries[entryDateKey].start, "09:00");
        });

        return withCleanup(workflow, function () {
          storagePrototype.setItem = originalSetItem;
        });
      });
    })
    .then(function () {
      return run("absorbs a pending edit into an immediate absence save", function () {
        var appWindow = frame.contentWindow;
        var storagePrototype = Object.getPrototypeOf(appWindow.localStorage);
        var originalSetItem = storagePrototype.setItem;
        var start = getInput(entryDateKey, "start");
        var absence = getAbsenceInput(entryDateKey);
        var writeCount = 0;
        var workflow;

        storagePrototype.setItem = function (key, value) {
          if (key === TEST_STORAGE_KEY) {
            writeCount += 1;
          }
          return originalSetItem.call(this, key, value);
        };

        workflow = Promise.resolve().then(function () {
          typeValue(start, "09:00");
          equal(writeCount, 0);
          absence.click();

          equal(writeCount, 1);
          equal(JSON.parse(appWindow.localStorage.getItem(TEST_STORAGE_KEY))
            .entries[entryDateKey].absence, true);
          return wait(350);
        }).then(function () {
          equal(writeCount, 1);
          absence.click();
        });

        return withCleanup(workflow, function () {
          storagePrototype.setItem = originalSetItem;
        });
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
        equal(getDocument().getElementById("dailyTarget").textContent, "7 h each work day");

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
      return run("coalesces weekly-hours input and flushes it on blur", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var storagePrototype = Object.getPrototypeOf(appWindow.localStorage);
        var originalSetItem = storagePrototype.setItem;
        var weeklyHours = documentUnderTest.getElementById("weeklyHours");
        var writeCount = 0;
        var workflow;

        storagePrototype.setItem = function (key, value) {
          if (key === TEST_STORAGE_KEY) {
            writeCount += 1;
          }
          return originalSetItem.call(this, key, value);
        };

        workflow = Promise.resolve().then(function () {
          ["3", "31", "31.5"].forEach(setWeeklyHours);

          equal(appWindow.TimesheetApp.getState().schedules[appWindow.TimesheetApp.getViewMonth()], 31.5);
          equal(documentUnderTest.getElementById("dailyTarget").textContent, "6.3 h each work day");
          equal(documentUnderTest.querySelector("[data-status-text]").textContent, "Saving\u2026");
          equal(writeCount, 0);

          weeklyHours.dispatchEvent(new FocusEvent("blur"));
          equal(writeCount, 1);
          equal(documentUnderTest.querySelector("[data-status-text]").textContent, "Saved locally");

          return wait(350);
        }).then(function () {
          equal(writeCount, 1);
        });

        return withCleanup(workflow, function () {
          storagePrototype.setItem = originalSetItem;
        });
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
          var label = row.querySelector("label, .setting-label");
          var labelBounds = label.getBoundingClientRect();
          var selectBounds = row.querySelector("select").getBoundingClientRect();

          assert(labelBounds.bottom <= selectBounds.top,
            "preference label should sit above its select at the minimum width");
          equal(frame.contentWindow.getComputedStyle(label).whiteSpace, "nowrap");
          equal(frame.contentWindow.getComputedStyle(label).textAlign, "left");
        });
        var workDaysControl = dialog.querySelector(".work-days-control");
        var workDaySelects = workDaysControl.querySelectorAll("select");
        var workDaysBounds = workDaysControl.getBoundingClientRect();
        assert(workDaysBounds.left >= dialogBounds.left,
          "work-day control extends left of preferences dialog");
        assert(workDaysBounds.right <= dialogBounds.right,
          "work-day control extends right of preferences dialog");
        assert(Math.abs(workDaySelects[0].getBoundingClientRect().width
          - workDaySelects[1].getBoundingClientRect().width) < 1,
        "work-day selects should share the available width equally");
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
      return run("keeps backup and restore statuses after pending edits", function () {
        var appWindow = frame.contentWindow;
        var documentUnderTest = getDocument();
        var originalConfirm = appWindow.confirm;
        var localState = appWindow.TimesheetApp.getState();
        var emptyRow = Array.prototype.find.call(
          documentUnderTest.querySelectorAll(".day-row"),
          function (row) {
            return !localState.entries[row.dataset.date];
          }
        );
        var start = emptyRow.querySelector('[data-field="start"]');
        var imported = appWindow.TimesheetApp.getState();
        var workflow;

        typeValue(start, "8");
        click("exportButton");
        equal(documentUnderTest.querySelector("[data-status-text]").textContent,
          "Backup downloaded");

        workflow = wait(350).then(function () {
          equal(documentUnderTest.querySelector("[data-status-text]").textContent,
            "Backup downloaded");

          imported.schedules[currentMonthKey] = 33;
          typeValue(start, "800");
          appWindow.confirm = function () {
            return true;
          };
          selectRestoreText(appWindow.TimesheetStorage.serializeBackup(imported), "pending.json");
          return waitForCondition(function () {
            return documentUnderTest.querySelector("[data-status-text]").textContent
              === "Backup restored and saved";
          }, "pending-edit backup was not restored");
        }).then(function () {
          equal(JSON.parse(appWindow.localStorage.getItem(TEST_STORAGE_KEY))
            .entries[emptyRow.dataset.date].start, "800");
          return wait(350);
        }).then(function () {
          equal(documentUnderTest.querySelector("[data-status-text]").textContent,
            "Backup restored and saved");
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
      return run("deletes active local data and cancels pending saves", function () {
        var appWindow = frame.contentWindow;
        var storage = appWindow.localStorage;
        var storageApi = appWindow.TimesheetStorage;
        var model = appWindow.TimesheetModel;
        var seeded = model.createEmptyState();
        var seededEntry = model.createEmptyEntry();
        var sentinelKey = "local-timesheet.test.delete-sentinel";
        var seedResult;
        var workflow;

        seededEntry.start = "800";
        seededEntry.finish = "1600";
        seededEntry.absence = true;
        seeded.entries[entryDateKey] = seededEntry;
        seeded.schedules[currentMonthKey] = 37;
        seeded.preferences.language = "fr";
        seeded.preferences.theme = "midnight-fog";
        seeded.preferences.dateFormat = "month-day-slash";
        seeded.preferences.workDayRange = { start: 2, end: 6 };
        seedResult = storageApi.saveState(storage, seeded, TEST_STORAGE_KEY);
        assert(seedResult.ok,
          "direct-delete seed should save: " + seedResult.messageKey + " / " + seedResult.message);
        storage.setItem(sentinelKey, "keep me");

        workflow = reloadFrame().then(function () {
          var documentUnderTest = getDocument();
          var state;

          equal(documentUnderTest.documentElement.lang, "fr");
          equal(documentUnderTest.documentElement.dataset.theme, "midnight-fog");
          typeValue(getInput(entryDateKey, "start"), "7");
          click("menuButton");
          click("settingsButton");
          click("deleteLocalDataButton");
          click("confirmDeleteDataButton");

          state = appWindow.TimesheetApp.getState();
          assert(!documentUnderTest.getElementById("deleteDataDialog").open,
            "direct delete should close confirmation");
          assert(documentUnderTest.getElementById("settingsDialog").open,
            "direct delete should keep preferences open");
          equal(appWindow.localStorage.getItem(TEST_STORAGE_KEY), null);
          equal(appWindow.localStorage.getItem(sentinelKey), "keep me");
          equal(Object.keys(state.entries).length, 0);
          equal(Object.keys(state.schedules).length, 0);
          equal(JSON.stringify(state.preferences),
            JSON.stringify(appWindow.TimesheetModel.createEmptyState().preferences));
          equal(documentUnderTest.documentElement.lang, "en");
          equal(documentUnderTest.documentElement.dataset.theme, "default-gradient");
          equal(documentUnderTest.getElementById("dateFormatSelect").value, "iso");
          equal(documentUnderTest.getElementById("workDayStartSelect").value, "1");
          equal(documentUnderTest.getElementById("workDayEndSelect").value, "5");
          equal(documentUnderTest.getElementById("weeklyHours").value, "32");
          equal(getInput(entryDateKey, "start").value, "");
          equal(documentUnderTest.querySelector("[data-status-text]").textContent,
            "Local data deleted");
          equal(documentUnderTest.getElementById("saveStatus").dataset.tone, "success");

          return wait(350);
        }).then(function () {
          equal(appWindow.localStorage.getItem(TEST_STORAGE_KEY), null);
          click("settingsCloseButton");
        });

        return withCleanup(workflow, function () {
          var documentUnderTest = getDocument();
          appWindow.localStorage.removeItem(sentinelKey);
          if (documentUnderTest.getElementById("deleteDataDialog").open) {
            documentUnderTest.getElementById("deleteDataDialog").close();
          }
          if (documentUnderTest.getElementById("settingsDialog").open) {
            documentUnderTest.getElementById("settingsDialog").close();
          }
        });
      });
    })
    .then(function () {
      return run("backs up current data before deleting it", function () {
        var appWindow = frame.contentWindow;
        var storage = appWindow.localStorage;
        var seeded = appWindow.TimesheetModel.createEmptyState();
        var seededEntry = appWindow.TimesheetModel.createEmptyEntry();
        var seedResult;

        seededEntry.start = "900";
        seededEntry.finish = "1730";
        seededEntry.absence = true;
        seeded.entries[entryDateKey] = seededEntry;
        seeded.schedules[currentMonthKey] = 35;
        seeded.preferences.language = "es";
        seeded.preferences.theme = "ember-coast";
        seeded.preferences.dateFormat = "day-month-year-dots";
        seeded.preferences.workDayRange = { start: 0, end: 4 };
        seedResult = appWindow.TimesheetStorage.saveState(
          storage,
          seeded,
          TEST_STORAGE_KEY
        );
        assert(seedResult.ok,
          "backup-delete seed should save: " + seedResult.messageKey + " / " + seedResult.message);

        return reloadFrame().then(function () {
          var documentUnderTest = getDocument();
          var currentStorage = appWindow.localStorage;
          var storageApi = appWindow.TimesheetStorage;
          var storagePrototype = Object.getPrototypeOf(currentStorage);
          var anchorPrototype = appWindow.HTMLAnchorElement.prototype;
          var originalSerializeBackup = storageApi.serializeBackup;
          var originalRemoveItem = storagePrototype.removeItem;
          var originalAnchorClick = anchorPrototype.click;
          var sequence = [];
          var backupText = "";
          var downloadName = "";
          var workflow;

          storageApi.serializeBackup = function (state) {
            sequence.push("serialize");
            backupText = originalSerializeBackup(state);
            return backupText;
          };
          anchorPrototype.click = function () {
            sequence.push("download");
            downloadName = this.download;
          };
          storagePrototype.removeItem = function (key) {
            if (key === TEST_STORAGE_KEY) {
              sequence.push("delete");
            }
            return originalRemoveItem.call(this, key);
          };

          workflow = Promise.resolve().then(function () {
            var backup;

            click("menuButton");
            click("settingsButton");
            click("deleteLocalDataButton");
            click("backupDeleteDataButton");

            backup = JSON.parse(backupText);
            equal(sequence.join(","), "serialize,download,delete");
            equal(downloadName,
              "timesheet-backup-" + appWindow.TimesheetCore.toIsoDate(new appWindow.Date()) + ".json");
            equal(backup.data.entries[entryDateKey].finish, "1730");
            assert(backup.data.entries[entryDateKey].absence,
              "backup should preserve absence");
            equal(backup.data.schedules[currentMonthKey], 35);
            equal(backup.data.preferences.language, "es");
            equal(backup.data.preferences.design, "ember-coast");
            equal(backup.data.preferences.dateFormat, "day-month-year-dots");
            equal(currentStorage.getItem(TEST_STORAGE_KEY), null);
            equal(documentUnderTest.getElementById("deleteDataDialog").open, false);
            assert(documentUnderTest.getElementById("settingsDialog").open,
              "backup delete should keep preferences open");
            equal(documentUnderTest.querySelector("[data-status-text]").textContent,
              "Local data deleted");
            return wait(0);
          });

          return withCleanup(workflow, function () {
            storageApi.serializeBackup = originalSerializeBackup;
            storagePrototype.removeItem = originalRemoveItem;
            anchorPrototype.click = originalAnchorClick;
            if (documentUnderTest.getElementById("deleteDataDialog").open) {
              documentUnderTest.getElementById("deleteDataDialog").close();
            }
            if (documentUnderTest.getElementById("settingsDialog").open) {
              documentUnderTest.getElementById("settingsDialog").close();
            }
          });
        });
      });
    })
    .then(function () {
      return run("keeps local data when backup or deletion fails", function () {
        var appWindow = frame.contentWindow;
        var storage = appWindow.localStorage;
        var seeded = appWindow.TimesheetModel.createEmptyState();
        var seededEntry = appWindow.TimesheetModel.createEmptyEntry();
        var seedResult;

        seededEntry.start = "815";
        seededEntry.finish = "1645";
        seeded.entries[entryDateKey] = seededEntry;
        seeded.schedules[currentMonthKey] = 30;
        seedResult = appWindow.TimesheetStorage.saveState(
          storage,
          seeded,
          TEST_STORAGE_KEY
        );
        assert(seedResult.ok,
          "failure-path seed should save: " + seedResult.messageKey + " / " + seedResult.message);

        return reloadFrame().then(function () {
          var documentUnderTest = getDocument();
          var currentStorage = appWindow.localStorage;
          var storageApi = appWindow.TimesheetStorage;
          var storagePrototype = Object.getPrototypeOf(currentStorage);
          var originalSerializeBackup = storageApi.serializeBackup;
          var originalRemoveItem = storagePrototype.removeItem;
          var stateBefore = JSON.stringify(appWindow.TimesheetApp.getState());
          var storedBefore = currentStorage.getItem(TEST_STORAGE_KEY);
          var removalCalls = 0;
          var workflow;

          storageApi.serializeBackup = function () {
            throw new Error("Backup failed");
          };
          storagePrototype.removeItem = function (key) {
            if (key === TEST_STORAGE_KEY) {
              removalCalls += 1;
            }
            return originalRemoveItem.call(this, key);
          };

          workflow = Promise.resolve().then(function () {
            click("menuButton");
            click("settingsButton");
            click("deleteLocalDataButton");
            click("backupDeleteDataButton");

            equal(removalCalls, 0);
            assert(documentUnderTest.getElementById("deleteDataDialog").open,
              "backup failure should keep confirmation open");
            equal(documentUnderTest.getElementById("deleteDataError").hidden, false);
            equal(documentUnderTest.getElementById("deleteDataError").textContent,
              "The backup could not be created.");
            equal(documentUnderTest.querySelector("[data-status-text]").textContent,
              "The backup could not be created.");
            equal(JSON.stringify(appWindow.TimesheetApp.getState()), stateBefore);
            equal(currentStorage.getItem(TEST_STORAGE_KEY), storedBefore);

            storageApi.serializeBackup = originalSerializeBackup;
            storagePrototype.removeItem = function (key) {
              if (key === TEST_STORAGE_KEY) {
                removalCalls += 1;
                throw new Error("Removal failed");
              }
              return originalRemoveItem.call(this, key);
            };
            click("confirmDeleteDataButton");

            equal(removalCalls, 1);
            assert(documentUnderTest.getElementById("deleteDataDialog").open,
              "removal failure should keep confirmation open");
            equal(documentUnderTest.getElementById("deleteDataError").textContent,
              "Browser storage rejected the deletion. Local data was not deleted.");
            equal(documentUnderTest.querySelector("[data-status-text]").textContent,
              "Browser storage rejected the deletion. Local data was not deleted.");
            equal(documentUnderTest.getElementById("saveStatus").dataset.tone, "error");
            equal(JSON.stringify(appWindow.TimesheetApp.getState()), stateBefore);
            equal(currentStorage.getItem(TEST_STORAGE_KEY), storedBefore);
          });

          return withCleanup(workflow, function () {
            storageApi.serializeBackup = originalSerializeBackup;
            storagePrototype.removeItem = originalRemoveItem;
            if (documentUnderTest.getElementById("deleteDataDialog").open) {
              documentUnderTest.getElementById("deleteDataDialog").close();
            }
            if (documentUnderTest.getElementById("settingsDialog").open) {
              documentUnderTest.getElementById("settingsDialog").close();
            }
          });
        });
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