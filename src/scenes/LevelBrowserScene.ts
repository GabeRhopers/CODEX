import Phaser from "phaser";
import { LevelSummary } from "../level/LevelSchema";
import { getLevelStorage } from "../persistence/storage";
import { drawSavedList } from "../ui/savedList";

/** Lists every saved level with Edit/Delete actions — the piece the MVP's
 * single-slot Save/Load never had. Persistence already supported this
 * (StorageAdapter.list/remove); this scene is purely the missing UI.
 *
 * The screen itself lives in `ui/savedList.ts`, shared with My Worlds — see
 * that file for why, and for what each of these options is standing in for. */
export class LevelBrowserScene extends Phaser.Scene {
  /**
   * The rows, and the line that reports a failed delete.
   *
   * Public rather than private, and nothing in this class reads them: they are
   * here as an inspection surface, because the specs address *the list* rather
   * than the whole screen (see `SavedList`, and `drive-failure.spec.ts`'s own
   * note on why a top-level scan of the scene is not good enough). Marking them
   * private would be the more flattering label and the less true one — TypeScript
   * says as much, refusing to compile a private field with no reader.
   */
  listContainer!: Phaser.GameObjects.Container;
  statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("LevelBrowser");
  }

  create(): void {
    ({ listContainer: this.listContainer, statusText: this.statusText } = drawSavedList<LevelSummary>({
      scene: this,
      title: "My Levels",
      action: { label: "New Level", onClick: () => this.scene.start("Editor") },
      emptyMessage: "No saved levels yet.",
      fallbackName: "Untitled Level",
      noun: "level",
      secondary: (level) => `Updated ${formatDate(level.updatedAt)}`,
      // Play first, Edit second — the same order My Worlds and Templates use,
      // and the order of the two things a child wants to do with a saved level.
      // Until 2026-10-22 there was no Play here at all: the only way to play
      // your own level was to open it in the editor and press Test Play, while
      // every *other* list on the screen offered Play directly. The row layout
      // made the absence visible too — `savedList` lays actions out right to
      // left from a fixed x, so a one-action row left a hole exactly where My
      // Worlds draws its Play.
      actions: [
        { label: "Play", onClick: (level) => void this.playLevel(level.id) },
        { label: "Edit", onClick: (level) => void this.editLevel(level.id) },
      ],
      list: () => getLevelStorage().list(),
      remove: (id) => getLevelStorage().remove(id),
    }));
  }

  private async editLevel(id: string): Promise<void> {
    const level = await getLevelStorage().load(id);
    if (!level) return;
    this.scene.start("Editor", { level });
  }

  /**
   * Plays the saved level, and comes back here rather than to the editor.
   *
   * `returnScene` is all that is needed: PlayScene's back navigation is already
   * generic (`scene.start(this.returnScene)`), and the *wording* of its back
   * button comes from `play/backDestination.ts`, which knows this key.
   *
   * Not cloned, unlike `TemplateBrowserScene.play`. A template is a shared
   * built-in that must survive being played, so it hands over a copy; this is
   * the player's own level, freshly loaded from storage, and PlayScene never
   * writes a level back.
   */
  private async playLevel(id: string): Promise<void> {
    const level = await getLevelStorage().load(id);
    if (!level) return;
    this.scene.start("Play", { level, returnScene: "LevelBrowser" });
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
