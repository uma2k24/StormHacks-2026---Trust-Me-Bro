import type { ShowTime } from "@/data/profile";

/**
 * A browser can't wake the listener up each morning, but their calendar can: this hands them a
 * repeating daily event (with an alert) at the time they chose, which every phone and computer
 * calendar can add. The iOS app schedules a real notification instead (MorningReminder.swift).
 */
export function downloadShowReminder(time: ShowTime, name: string) {
  if (time === "off") return;

  const pad = (value: number) => String(value).padStart(2, "0");
  const start = new Date();
  start.setDate(start.getDate() + 1); // from tomorrow morning
  const [hour, minute] = time.split(":");
  const day = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}`;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const greeting = name.trim() ? `Good morning, ${name.trim()}. ` : "Good morning. ";

  // No time zone on DTSTART: it's a "floating" time, so it stays at 8 am wherever they are.
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Morning Radio//EN",
    "BEGIN:VEVENT",
    "UID:morning-radio-daily@morning-radio",
    `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${hour}${minute}00`,
    "DURATION:PT15M",
    "RRULE:FREQ=DAILY",
    "SUMMARY:Morning Radio",
    `DESCRIPTION:${greeting}Your radio show is ready. Open Morning Radio and tap Play.`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Your morning radio is ready",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "morning-radio.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
