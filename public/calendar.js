// Google Calendar's prefilled event link (DECISIONS 11/06): no OAuth, no server call; only the title and the time leave the browser.
// The datetime-local value is read as Japan time (UTC+9, no daylight saving) whatever the device's zone.
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, ""); // 20261201T010000Z

export function calendarLink(local, minutes, title) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(typeof local === "string" ? local : "");
  if (!m || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return null;
  const wall = Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5]);
  if (new Date(wall).toISOString().slice(0, 16) !== local) return null; // 02-30 or 24:00 would roll over into another day
  const start = wall - 9 * 3600e3;
  return `https://calendar.google.com/calendar/r/eventedit?action=TEMPLATE&dates=${stamp(start)}%2F${stamp(start + minutes * 60e3)}&stz=Asia/Tokyo&etz=Asia/Tokyo&text=${encodeURIComponent(title)}`;
}
