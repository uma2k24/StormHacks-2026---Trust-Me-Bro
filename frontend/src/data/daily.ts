/**
 * The radio's place in the listener's day, all worked out on the device (nothing here calls
 * Gemini): the greeting and the date, which mornings they have tuned in, a short list of little
 * things for today, the reminder the radio reads at the end of the show, and the message they can
 * send their family.
 * Mirrored in ios/VoiceReadiness/Models/Daily.swift.
 */

import { dayKey } from "@/data/learning";
import type { Profile } from "@/data/profile";
import type { Metric, StatusColor } from "@/types/screening";

// ---- the time of day ----------------------------------------------------------------------------

export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Saturday", "October 3": the date written out in full, so nobody has to work out what day it is. */
export function dateParts(date: Date = new Date()): { weekday: string; date: string } {
  return { weekday: WEEKDAYS[date.getDay()], date: `${MONTHS[date.getMonth()]} ${date.getDate()}` };
}

// ---- mornings tuned in --------------------------------------------------------------------------

/** One morning's check-in: the readiness score and which of the day's little things are ticked off. */
export type DayRecord = { score: number; done: string[] };

/** Keyed by dayKey() ("2026-10-03"). */
export type History = Record<string, DayRecord>;

/** How many days of history are kept on the device. */
export const HISTORY_DAYS = 60;

function shiftDay(day: string, by: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return dayKey(new Date(year, month - 1, date + by));
}

export type WeekDay = {
  day: string;
  /** "Mon" */
  label: string;
  /** "Monday", for screen readers */
  name: string;
  listened: boolean;
  today: boolean;
};

/** The last seven days, oldest first, ending today. */
export function lastSevenDays(history: History, today: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(today, index - 6);
    const [year, month, date] = day.split("-").map(Number);
    const name = WEEKDAYS[new Date(year, month - 1, date).getDay()];
    return { day, label: name.slice(0, 3), name, listened: Boolean(history[day]), today: index === 6 };
  });
}

/** Mornings in a row, counting back from today (or from yesterday, when today is still to come). */
export function streakOf(history: History, today: string): number {
  let day = history[today] ? today : shiftDay(today, -1);
  let count = 0;
  while (history[day]) {
    count += 1;
    day = shiftDay(day, -1);
  }
  return count;
}

export function streakLine(streak: number): string {
  return streak <= 1 ? "A lovely start!" : `${streak} mornings in a row!`;
}

/** A lived-in week for demo links, so the lamps aren't all dark: five of the six days before today. */
export function demoHistory(today: string): History {
  const history: History = {};
  [-6, -5, -3, -2, -1].forEach((offset) => {
    history[shiftDay(today, offset)] = { score: 80, done: [] };
  });
  return history;
}

// ---- the reminder -------------------------------------------------------------------------------

const SECOND_PERSON: Record<string, string> = {
  "i'm": "you're",
  "i am": "you are",
  my: "your",
  mine: "yours",
  myself: "yourself",
  me: "you",
  i: "you",
};

/** "Take my blood pressure pill" -> "take your blood pressure pill": how the radio says it back. */
function spokenTask(text: string): string {
  const task = text
    .trim()
    .replace(/[.!]+$/, "")
    .replace(/\b(i'm|i am|my|mine|myself|me|i)\b/gi, (word) => SECOND_PERSON[word.toLowerCase()]);
  return task.charAt(0).toLowerCase() + task.slice(1);
}

/** The reminder as a line on today's list, e.g. "Take your blood pressure pill". Empty when there is none. */
export function reminderTask(profile: Pick<Profile, "reminder">): string {
  const task = spokenTask(profile.reminder);
  return task.charAt(0).toUpperCase() + task.slice(1);
}

/** What the radio says at the very end of the show, or null when there's nothing to remind them of. */
export function reminderLine(profile: Pick<Profile, "name" | "reminder">): string | null {
  const task = spokenTask(profile.reminder);
  if (!task) return null;
  const name = profile.name.trim() || "friend";
  return `Before you go, ${name}, a little reminder: ${task}.`;
}

// ---- little things for today --------------------------------------------------------------------

export type TodayIcon = "reminder" | "drink" | "rest" | "walk" | "umbrella" | "careful" | "sun" | "chat" | "water";

export type TodayItem = { id: string; icon: TodayIcon; text: string };

type PlanInput = {
  profile: Pick<Profile, "reminder" | "familyName">;
  status: StatusColor;
  metrics: { jitter: Metric; hnr: Metric };
  /** What the weather segment said this morning, if there was one. */
  weather?: string;
};

function weatherItem(weather = ""): TodayItem {
  const text = weather.toLowerCase();
  if (/snow|\bice\b|icy|frost|slipp/.test(text)) {
    return { id: "careful", icon: "careful", text: "Mind your step: it may be icy" };
  }
  if (/rain|shower|drizzle|storm/.test(text)) {
    return /afternoon|later|tonight|evening/.test(text)
      ? { id: "walk", icon: "walk", text: "Go for a walk before the rain" }
      : { id: "umbrella", icon: "umbrella", text: "Take an umbrella out" };
  }
  if (/\bhot\b|heat/.test(text)) {
    return { id: "water", icon: "water", text: "Drink plenty of water" };
  }
  if (/sun|clear|bright|warm/.test(text)) {
    return { id: "sun", icon: "sun", text: "Enjoy a little sunshine" };
  }
  return { id: "walk", icon: "walk", text: "Get some fresh air" };
}

/**
 * Three little things for today: their own reminder first, then one for their voice, then one for
 * the weather, topped up with a chat or a glass of water. Gentle and never diagnostic.
 */
export function planForToday({ profile, status, metrics, weather }: PlanInput): TodayItem[] {
  const family = profile.familyName.trim();
  const chat: TodayItem = {
    id: "chat",
    icon: "chat",
    text: family ? `Have a chat with ${family}` : "Have a chat with a friend",
  };

  const items: TodayItem[] = [];
  const task = reminderTask(profile);
  if (task) items.push({ id: "reminder", icon: "reminder", text: task });

  if (status === "red") {
    items.push({ id: "rest", icon: "rest", text: "Rest your voice today" });
  } else if (metrics.hnr.isWarning) {
    items.push({ id: "drink", icon: "drink", text: "Sip a warm drink" });
  } else if (metrics.jitter.isWarning) {
    items.push({ id: "rest", icon: "rest", text: "Take it gently this morning" });
  } else {
    items.push(chat);
  }

  items.push(weatherItem(weather));

  for (const extra of [chat, { id: "water", icon: "water", text: "Drink a glass of water" } as TodayItem]) {
    if (items.length >= 3) break;
    if (!items.some((item) => item.id === extra.id)) items.push(extra);
  }
  return items.slice(0, 3);
}

// ---- family -------------------------------------------------------------------------------------

/** The text they can send their family, written from today's result. A tired day asks for a call. */
export function familyMessage(profile: Pick<Profile, "name" | "familyName">, status: StatusColor): string {
  const hello = `Hi ${profile.familyName.trim() || "there"}, it's ${profile.name.trim()}. I listened to my Morning Radio today`;
  if (status === "green") return `${hello}, and I'm feeling ready for the day.`;
  if (status === "yellow") return `${hello}. My voice sounded a little tired, so I'm taking it easy.`;
  return `${hello}. My voice sounded quite tired, so I'm resting. Could you give me a call when you're free?`;
}

/** What the button that sends it says: a tired day asks for a call outright. */
export function familyAction(profile: Pick<Profile, "familyName">, status: StatusColor): string {
  const name = profile.familyName.trim();
  return status === "red" ? `Ask ${name} to call me` : `Tell ${name} how I am`;
}

/** Just the digits (and a leading +), for tel: and sms: links. */
export function dialable(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

export function hasFamily(profile: Pick<Profile, "familyName" | "familyPhone">): boolean {
  return Boolean(profile.familyName.trim() && dialable(profile.familyPhone).replace("+", "").length >= 3);
}
