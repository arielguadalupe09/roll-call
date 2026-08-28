// Deliberately does nothing besides existing: Chrome/Android only offers
// the "install as app" prompt for a page whose scope has a registered
// service worker with a fetch handler. This page needs a live network
// round trip on every check-in, so it doesn't cache or intercept anything
// — the fetch event is left unhandled and falls through to the network.
self.addEventListener("fetch", () => {});
