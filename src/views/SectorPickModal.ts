import { App, FuzzySuggestModal } from "obsidian";
import type { SectorConfig } from "../types";
import { INBOX_SECTOR } from "../tasksFormat";

interface SectorChoice {
  tag: string;
  label: string;
}

/** "Move to sector…": pick the Inbox or one of the sectors. */
export class SectorPickModal extends FuzzySuggestModal<SectorChoice> {
  sectors: SectorConfig[];
  current?: string;
  pick: (tag: string) => void;
  constructor(app: App, sectors: SectorConfig[], current: string | undefined, pick: (tag: string) => void) {
    super(app);
    this.sectors = sectors;
    this.current = current;
    this.pick = pick;
    this.setPlaceholder("Move to sector…");
  }
  getItems(): SectorChoice[] {
    const all = [{ tag: "", label: INBOX_SECTOR }, ...this.sectors.map((s) => ({ tag: s.tag, label: s.label }))];
    return all.filter((s) => s.tag.toLowerCase() !== (this.current || "").toLowerCase());
  }
  getItemText(item: SectorChoice): string {
    return item.label;
  }
  onChooseItem(item: SectorChoice) {
    this.pick(item.tag);
  }
}
