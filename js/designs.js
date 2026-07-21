(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetDesigns = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_DESIGN = "default-gradient";
  var DESIGNS = [
    { id: "default-gradient", labelKey: "design.defaultGradient" },
    { id: "midnight-fog", labelKey: "design.midnightFog" },
    { id: "ember-coast", labelKey: "design.emberCoast" }
  ];

  function getDesigns() {
    return DESIGNS.map(function (design) {
      return { id: design.id, labelKey: design.labelKey };
    });
  }

  function isSupportedDesign(value) {
    return DESIGNS.some(function (design) {
      return design.id === value;
    });
  }

  return {
    DEFAULT_DESIGN: DEFAULT_DESIGN,
    getDesigns: getDesigns,
    isSupportedDesign: isSupportedDesign
  };
});