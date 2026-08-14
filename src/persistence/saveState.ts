/** Shared save-state vocabulary for anything with a manual-Save-plus-
 * autosave workflow (the level editor, World Maker) — same four states,
 * same meaning, same visual treatment in both, so learning one teaches
 * the other. A persistent indicator using this, not the transient one-off
 * status toasts each scene already has, is what actually answers "does
 * storage match what's on screen right now." */
export type SaveState = "saved" | "unsaved" | "saving" | "error";

export const SAVE_STATE_DISPLAY: Record<SaveState, { text: string; color: string }> = {
  saved: { text: "● Saved", color: "#4caf50" },
  unsaved: { text: "● Unsaved changes", color: "#ffc107" },
  saving: { text: "● Saving…", color: "#8bb4ff" },
  error: { text: "● Save failed", color: "#ff5252" },
};
