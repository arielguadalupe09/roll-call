// One 12-hour "6:34 PM" format for every user-visible time. The locale is
// pinned (not `undefined`) so a browser/OS set to a 24-hour locale can't flip
// it back, and server/client renders agree.
export function formatTime12h(
  value: Date | string,
  options: { seconds?: boolean } = {},
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(options.seconds ? { second: "2-digit" } : {}),
    hour12: true,
  });
}
