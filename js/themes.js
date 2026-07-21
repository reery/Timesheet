(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetThemes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_THEME = "default-gradient";
  var THEMES = [
    { id: "default-gradient", labelKey: "theme.defaultGradient" },
    { id: "midnight-fog", labelKey: "theme.midnightFog" },
    { id: "ember-coast", labelKey: "theme.emberCoast" }
  ];

  function getThemes() {
    return THEMES.map(function (theme) {
      return { id: theme.id, labelKey: theme.labelKey };
    });
  }

  function isSupportedTheme(value) {
    return THEMES.some(function (theme) {
      return theme.id === value;
    });
  }

  return {
    DEFAULT_THEME: DEFAULT_THEME,
    getThemes: getThemes,
    isSupportedTheme: isSupportedTheme
  };
});