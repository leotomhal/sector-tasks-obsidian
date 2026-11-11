import ICAL from "ical.js";
import { toIsoDate } from "./dateUtils";

/** One occurrence of a calendar event, ready to show. Read-only: never written to the tasks file. */
export interface CalEvent {
  /** Unique per occurrence: feed, event UID and start. */
  id: string;
  feedId: string;
  title: string;
  allDay: boolean;
  /** First and last day it covers (ISO dates, inclusive). */
  startDay: string;
  endDay: string;
  /** Timed events: local start/end in epoch milliseconds. */
  startMs?: number;
  endMs?: number;
  location?: string;
  description?: string;
}

/** A piece of an event on one particular day: minutes since midnight, or all-day. */
export interface DayPiece {
  event: CalEvent;
  allDay: boolean;
  startMin: number;
  endMin: number;
}

/** Safety cap so a never-ending rule ("every day") can't loop forever. */
const MAX_OCCURRENCES_PER_EVENT = 1500;

function dayOf(time: ICAL.Time): string {
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
}

function text(component: ICAL.Component, name: string): string | undefined {
  const value = component.getFirstPropertyValue(name);
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed ? trimmed : void 0;
}

/**
 * Reads an iCalendar file (e.g. a Google Calendar "secret address in iCal
 * format") and returns every occurrence that touches [fromDay, toDay].
 * Recurring events are expanded, moved occurrences and EXDATEs respected,
 * cancelled events skipped, times converted to the local time zone.
 */
export function parseIcs(ics: string, feedId: string, fromDay: string, toDay: string): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics) as unknown[]);
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // A broken VTIMEZONE only affects that zone; ical.js falls back to floating time.
    }
  }
  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (vevent.hasProperty("recurrence-id")) exceptions.push(event);
    else masters.set(event.uid, event);
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (master) master.relateException(exception);
    else masters.set(`${exception.uid}#${exception.recurrenceId?.toString()}`, exception);
  }

  const out: CalEvent[] = [];
  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if ((text(item.component, "status") || "").toUpperCase() === "CANCELLED") return;
    const allDay = start.isDate;
    const startDay = dayOf(start);
    // DTEND is exclusive; an all-day event on the 5th ends on the 6th.
    let endDay = allDay ? shiftDay(dayOf(end), -1) : dayOf(end);
    if (!allDay && end.hour === 0 && end.minute === 0 && end.second === 0 && endDay > startDay) endDay = shiftDay(endDay, -1);
    if (endDay < startDay) endDay = startDay;
    if (endDay < fromDay || startDay > toDay) return;
    out.push({
      id: `${feedId}:${item.uid}:${start.toString()}`,
      feedId,
      title: item.summary?.trim() || "(No title)",
      allDay,
      startDay,
      endDay,
      startMs: allDay ? void 0 : start.toJSDate().getTime(),
      endMs: allDay ? void 0 : end.toJSDate().getTime(),
      location: item.location?.trim() || void 0,
      description: item.description?.trim() || void 0
    });
  };

  const until = ICAL.Time.fromDateString(shiftDay(toDay, 1));
  for (const event of masters.values()) {
    if (!event.startDate) continue;
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate || event.startDate);
      continue;
    }
    const iterator = event.iterator();
    let count = 0;
    for (let next = iterator.next(); next && count < MAX_OCCURRENCES_PER_EVENT; next = iterator.next(), count++) {
      if (next.compare(until) >= 0) break;
      const details = event.getOccurrenceDetails(next);
      add(details.item, details.startDate, details.endDate);
    }
  }
  return out.sort((a, b) => a.startDay.localeCompare(b.startDay) || (a.startMs ?? 0) - (b.startMs ?? 0) || a.title.localeCompare(b.title));
}

/** Minutes since local midnight of `day` for an epoch time (can be <0 or >1440 when it falls outside that day). */
function minutesOn(day: string, ms: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round((ms - new Date(y, m - 1, d).getTime()) / 60000);
}

/** The parts of events that fall on one day, all-day ones first, then by start time. */
export function eventsOnDay(events: CalEvent[], day: string): DayPiece[] {
  const pieces: DayPiece[] = [];
  for (const event of events) {
    if (event.startDay > day || event.endDay < day) continue;
    if (event.allDay || event.startMs === void 0 || event.endMs === void 0) {
      pieces.push({ event, allDay: true, startMin: 0, endMin: 1440 });
      continue;
    }
    const startMin = Math.max(0, minutesOn(day, event.startMs));
    const endMin = Math.min(1440, minutesOn(day, event.endMs));
    if (endMin <= startMin && !(startMin === 0 && endMin === 0)) {
      pieces.push({ event, allDay: false, startMin, endMin: startMin });
      continue;
    }
    pieces.push({ event, allDay: false, startMin, endMin });
  }
  return pieces.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMin - b.startMin || a.event.title.localeCompare(b.event.title));
}

export function formatMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(1440, min));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** Google's "secret address" is often shared as webcal://; fetch it as https. */
export function normalizeFeedUrl(url: string): string {
  const trimmed = (url || "").trim();
  return trimmed.replace(/^webcal:\/\//i, "https://");
}
