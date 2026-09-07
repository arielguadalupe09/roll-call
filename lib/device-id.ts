const DEVICE_ID_KEY = "rollcall_device_id";

// Only ever called from a browser event handler (form submit, QR decode
// callback) — never during a page's static prerender — so touching
// localStorage here needs no SSR guard.
export function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
