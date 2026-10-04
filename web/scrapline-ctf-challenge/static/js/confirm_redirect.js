// Reads the `ref` parameter from the current URL and, after a short delay,
// takes the visitor back to the referenced feedback entry.
//
// INTENTIONALLY VULNERABLE: `ref` is concatenated straight into the redirect
// path with no validation, so a value containing ../ segments can walk the
// resulting path anywhere else on the site once the browser normalizes it.
(function () {
  var params = new URLSearchParams(window.location.search);
  var ref = params.get("ref");
  if (!ref) return;
  setTimeout(function () {
    window.location = "/f/" + ref;
  }, 2500);
})();
