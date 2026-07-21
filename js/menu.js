(function (root, factory) {
  "use strict";

  var api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.TimesheetMenu = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var MOBILE_MENU_QUERY = "(max-width: 840px)";

  function create(options) {
    var menuButton = options.menuButton;
    var actionsElement = options.actionsElement;
    var actionHandlers = options.actionHandlers || {};
    var media = root.matchMedia(MOBILE_MENU_QUERY);

    function bind() {
      menuButton.addEventListener("click", toggle);
      actionsElement.addEventListener("click", onActionClick);
      root.document.addEventListener("click", onDocumentClick);
      root.document.addEventListener("keydown", onDocumentKeydown);

      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onViewportChange);
      } else {
        media.addListener(onViewportChange);
      }
    }

    function toggle() {
      setOpen(actionsElement.dataset.open !== "true");
    }

    function close() {
      setOpen(false);
    }

    function setOpen(open) {
      var expanded = Boolean(open && media.matches);

      actionsElement.dataset.open = expanded ? "true" : "false";
      menuButton.setAttribute("aria-expanded", expanded ? "true" : "false");
      menuButton.setAttribute("aria-label", options.translate(
        expanded ? "menu.close" : "menu.open"
      ));
    }

    function refresh() {
      setOpen(actionsElement.dataset.open === "true");
    }

    function onActionClick(event) {
      var button = event.target.closest("[data-action]");
      var handler;

      if (!button || !actionsElement.contains(button)) {
        return;
      }

      handler = actionHandlers[button.dataset.action];
      if (typeof handler === "function") {
        close();
        handler();
      }
    }

    function onDocumentClick(event) {
      if (actionsElement.dataset.open === "true"
          && !actionsElement.contains(event.target)
          && !menuButton.contains(event.target)) {
        close();
      }
    }

    function onDocumentKeydown(event) {
      if (event.key === "Escape" && actionsElement.dataset.open === "true") {
        close();
        menuButton.focus();
      }
    }

    function onViewportChange(event) {
      if (!event.matches) {
        close();
      }
    }

    function focusReturn(defaultElement) {
      (media.matches ? menuButton : defaultElement).focus({ preventScroll: true });
    }

    refresh();

    return {
      bind: bind,
      close: close,
      refresh: refresh,
      focusReturn: focusReturn
    };
  }

  return { create: create };
});