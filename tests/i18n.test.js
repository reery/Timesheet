(function () {
  "use strict";

  var i18n = window.TimesheetI18n;
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

  test("exposes every supported language", function () {
    equal(i18n.SUPPORTED_LANGUAGES.join(","), "en,de,es,fr");
    equal(i18n.getLanguages().map(function (language) {
      return language.id + ":" + language.name;
    }).join(","), "en:English,de:Deutsch,es:Espa\u00f1ol,fr:Fran\u00e7ais");
    equal(i18n.getLanguageName("en"), "English");
    equal(i18n.getLanguageName("de"), "Deutsch");
    equal(i18n.getLanguageName("es"), "Espa\u00f1ol");
    equal(i18n.getLanguageName("fr"), "Fran\u00e7ais");
  });

  test("translates representative interface text", function () {
    equal(i18n.translate("en", "action.preferences"), "Preferences");
    equal(i18n.translate("de", "action.preferences"), "Einstellungen");
    equal(i18n.translate("es", "action.preferences"), "Preferencias");
    equal(i18n.translate("fr", "action.preferences"), "Pr\u00e9f\u00e9rences");
    equal(i18n.translate("fr", "theme.midnightFog"), "Midnight Fog");
    equal(i18n.translate("de", "summary.decimalHours", { hours: "96" }), "96 h dezimal");
    equal(i18n.translate("en", "preferences.timeLedger"), "Time ledger");
    equal(i18n.translate("de", "preferences.workDays"), "Arbeitstage");
    equal(i18n.translate("en", "deleteData.question"),
      "Do you really want to delete all locally saved data in your browser?");
    equal(i18n.translate("de", "preferences.deleteLocalData"), "Lokale Daten l\u00f6schen");
    equal(i18n.translate("es", "deleteData.backupAndDelete"), "Hacer copia y eliminar");
    equal(i18n.translate("fr", "storage.deleted"), "Donn\u00e9es locales supprim\u00e9es");
    equal(i18n.translate("es", "range.separator"), "a");
    equal(i18n.translate("fr", "schedule.eachWorkDay", { hours: "6" }),
      "6 h par jour travaill\u00e9");
    equal(i18n.translate("en", "storage.saving"), "Saving\u2026");
    equal(i18n.translate("de", "storage.saving"), "Wird gespeichert\u2026");
    equal(i18n.translate("es", "storage.saving"), "Guardando\u2026");
    equal(i18n.translate("fr", "storage.saving"), "Enregistrement\u2026");
  });

  test("uses localized absence terminology", function () {
    equal(i18n.translate("en", "column.absence"), "Absence");
    equal(i18n.translate("de", "column.absence"), "Abwesenheit");
    equal(i18n.translate("es", "column.absence"), "Ausencia");
    equal(i18n.translate("fr", "column.absence"), "Absence");
    equal(i18n.translate("de", "absence.inputLabel", { date: "20.07.2026" }),
      "20.07.2026 als Abwesenheit markieren");
  });

  test("keeps every locale catalog complete", function () {
    i18n.SUPPORTED_LANGUAGES.forEach(function (language) {
      equal(i18n.getMissingTranslations(language).join(","), "");
    });
  });

  test("interpolates values without changing missing placeholders", function () {
    equal(i18n.translate("es", "week.label", { week: 31 }), "Semana 31");
    equal(i18n.translate("en", "validation.year", { min: 1900, max: 9999 }),
      "Choose a year from 1900 to 9999.");
    equal(i18n.translate("de", "backup.tooLarge", { limit: 10 }),
      "Eine Sicherung mit h\u00f6chstens 10 MiB ausw\u00e4hlen.");
    equal(i18n.translate("en", "week.label"), "Week {week}");
  });

  test("falls back to English for unsupported locales and keys", function () {
    equal(i18n.translate("it", "period.today"), "Today");
    equal(i18n.translate("fr", "unknown.key"), "unknown.key");
    equal(i18n.normalizeLanguage("it"), "en");
  });

  test("provides independent localized calendar arrays", function () {
    var german = i18n.getCalendar("de");
    var spanish = i18n.getCalendar("es");
    var french = i18n.getCalendar("fr");

    equal(german.months[2], "M\u00e4rz");
    equal(spanish.months[6], "julio");
    equal(spanish.weekdays[3], "mi\u00e9");
    equal(french.months[7], "ao\u00fbt");
    equal(french.weekdays[1], "lun.");
    german.months[0] = "changed";
    equal(i18n.getCalendar("de").months[0], "Januar");
  });

  if (failures.length > 0) {
    document.body.dataset.status = "failed";
    document.title = "FAIL - Timesheet i18n tests";
    output.textContent = failures.length + " failed, " + passed + " passed\n\n" + failures.join("\n");
  } else {
    document.body.dataset.status = "passed";
    document.title = "PASS - Timesheet i18n tests";
    output.textContent = passed + " tests passed";
  }
})();