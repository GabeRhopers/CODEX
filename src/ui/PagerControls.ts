import Phaser from "phaser";
import { clampPage, pageCount, pageLabel } from "./pager";

/**
 * The "‹ Prev — Page 2 of 3 — Next ›" row, shared by every screen that pages a
 * list.
 *
 * Four screens need identical controls (My Levels, My Worlds, Templates, the
 * World Maker's available list), and four hand-rolled copies is how they end up
 * subtly different. The paging arithmetic itself lives in `pager.ts`, which is
 * pure and tested on its own; this is only the Phaser objects.
 *
 * Returns the objects rather than adding them anywhere, because every caller
 * keeps its rows in a container it wipes on refresh and needs these to go in
 * with them.
 */

const BUTTON_STYLE = {
  fontSize: "12px",
  color: "#ffffff",
  backgroundColor: "#0f3460",
  // Tall enough to be worth aiming at on a phone — see ui/touchTarget.ts.
  padding: { x: 12, y: 10 },
} as const;

export interface PagerControlsOptions {
  scene: Phaser.Scene;
  /** Left edge of the row. */
  x: number;
  y: number;
  page: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
}

/** Builds the controls, or returns nothing at all when everything fits on one
 * page — a pager that always reads "Page 1 of 1" is just noise. */
export function makePagerControls(options: PagerControlsOptions): Phaser.GameObjects.GameObject[] {
  const { scene, x, y, page, total, perPage, onChange } = options;
  const pages = pageCount(total, perPage);
  if (pages <= 1) return [];

  const current = clampPage(page, total, perPage);

  const button = (bx: number, label: string, to: number, enabled: boolean): Phaser.GameObjects.Text => {
    const text = scene.add.text(bx, y, label, {
      ...BUTTON_STYLE,
      // Greyed rather than removed: a control that vanishes at the ends makes
      // the other one jump sideways under the finger already reaching for it.
      color: enabled ? "#ffffff" : "#6a6f90",
    });
    if (!enabled) return text;
    text.setInteractive({ useHandCursor: true });
    text.on("pointerdown", () => onChange(to));
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#0f3460" }));
    return text;
  };

  const prev = button(x, "‹ Prev", current - 1, current > 0);
  const label = scene.add
    .text(x + 86, y + 8, pageLabel(current, total, perPage), { fontSize: "11px", color: "#a6a6c8" })
    .setName("pager-label");
  const next = button(x + 176, "Next ›", current + 1, current < pages - 1);

  return [prev, label, next];
}
