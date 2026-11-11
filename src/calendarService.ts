import { App, requestUrl } from "obsidian";
import type { BelkiSettings, CalendarFeed } from "./types";
import { todayIso } from "./dateUtils";
import { normalizeFeedUrl, parseIcs } from "./calendar";
import type { CalEvent } from "./calendar";

interface FeedState {
  events: CalEvent[];
  /** ISO timestamp of the last successful fetch. */
  fetchedAt?: string;
  error?: string;
}

/**
 * Loads the configured iCal feeds (read-only), keeps the parsed occurrences in
 * memory and in a cache file next to the plugin, and tells listeners when they
 * change. Nothing is ever sent anywhere: it only GETs the feed addresses.
 */
export class CalendarService {
  app: App;
  settings: BelkiSettings;
  cachePath: string;
  feeds = new Map<string, FeedState>();
  listeners = new Set<() => void>();
  refreshing = false;
  constructor(app: App, settings: BelkiSettings, cachePath: string) {
    this.app = app;
    this.settings = settings;
    this.cachePath = cachePath;
  }
  get enabled(): boolean {
    return this.settings.calendarsEnabled === true;
  }
  activeFeeds(): CalendarFeed[] {
    return this.settings.calendars.filter((feed) => feed.enabled && normalizeFeedUrl(feed.url));
  }
  feed(id: string): CalendarFeed | undefined {
    return this.settings.calendars.find((feed) => feed.id === id);
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const listener of this.listeners) listener();
  }
  /** Occurrences from enabled feeds; empty while the module is off. */
  events(): CalEvent[] {
    if (!this.enabled) return [];
    const out: CalEvent[] = [];
    for (const feed of this.activeFeeds()) out.push(...(this.feeds.get(feed.id)?.events || []));
    return out;
  }
  /** The oldest successful fetch among active feeds, for "synced 10:12". */
  lastSynced(): string | undefined {
    const times = this.activeFeeds().map((f) => this.feeds.get(f.id)?.fetchedAt).filter((t): t is string => Boolean(t));
    return times.sort()[0];
  }
  errors(): { feed: CalendarFeed; error: string }[] {
    return this.activeFeeds()
      .map((feed) => ({ feed, error: this.feeds.get(feed.id)?.error || "" }))
      .filter((e) => e.error);
  }
  async loadCache() {
    try {
      if (!(await this.app.vault.adapter.exists(this.cachePath))) return;
      const raw: unknown = JSON.parse(await this.app.vault.adapter.read(this.cachePath));
      if (!raw || typeof raw !== "object") return;
      for (const [id, state] of Object.entries(raw as Record<string, FeedState>)) {
        if (state && Array.isArray(state.events)) this.feeds.set(id, { events: state.events, fetchedAt: state.fetchedAt });
      }
      this.notify();
    } catch (error) {
      console.warn("[belki] Could not read the calendar cache.", error);
    }
  }
  async saveCache() {
    const data: Record<string, FeedState> = {};
    for (const [id, state] of this.feeds) data[id] = { events: state.events, fetchedAt: state.fetchedAt };
    try {
      await this.app.vault.adapter.write(this.cachePath, JSON.stringify(data));
    } catch (error) {
      console.warn("[belki] Could not write the calendar cache.", error);
    }
  }
  /**
   * Fetches every enabled feed. A feed that fails keeps its last good events
   * and records the error, so going offline doesn't empty the day plan.
   */
  async refresh(): Promise<void> {
    if (!this.enabled || this.refreshing) return;
    this.refreshing = true;
    try {
      // From the start of last year to the end of next year: enough for the
      // day plan, Upcoming, and the year plan's year switcher.
      const year = Number(todayIso().slice(0, 4));
      const from = `${year - 1}-01-01`;
      const to = `${year + 1}-12-31`;
      const ids = new Set(this.settings.calendars.map((f) => f.id));
      for (const id of [...this.feeds.keys()]) if (!ids.has(id)) this.feeds.delete(id);
      for (const feed of this.activeFeeds()) {
        const previous = this.feeds.get(feed.id);
        try {
          const response = await requestUrl({ url: normalizeFeedUrl(feed.url), method: "GET", throw: false });
          if (response.status < 200 || response.status >= 300) throw new Error(`The server answered ${response.status}.`);
          if (!/BEGIN:VCALENDAR/i.test(response.text)) throw new Error("That address didn't return a calendar (iCal) file.");
          this.feeds.set(feed.id, { events: parseIcs(response.text, feed.id, from, to), fetchedAt: new Date().toISOString() });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.feeds.set(feed.id, { events: previous?.events || [], fetchedAt: previous?.fetchedAt, error: message });
        }
      }
      await this.saveCache();
    } finally {
      this.refreshing = false;
      this.notify();
    }
  }
}

