import Phaser from "phaser";
import { getWorldStorage } from "../persistence/storage";
import { drawSavedList } from "../ui/savedList";
import { WorldSummary } from "../world/WorldSchema";

/** Lists saved worlds with Play/Edit/Delete — the World equivalent of
 * LevelBrowserScene, and now literally the same screen: both call
 * `ui/savedList.ts`, which is what made "same layout on purpose so the two feel
 * like one family" true by construction rather than by two people keeping two
 * files in step. */
export class WorldBrowserScene extends Phaser.Scene {
  /** An inspection surface for the specs, not state this class uses — see
   * LevelBrowserScene's own pair for the full reasoning. */
  listContainer!: Phaser.GameObjects.Container;
  statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("WorldBrowser");
  }

  create(): void {
    ({ listContainer: this.listContainer, statusText: this.statusText } = drawSavedList<WorldSummary>({
      scene: this,
      title: "My Worlds",
      action: { label: "New World", onClick: () => this.scene.start("WorldMaker") },
      emptyMessage: "No worlds yet — chain a few levels together with New World.",
      fallbackName: "Untitled World",
      noun: "world",
      secondary: (world) => `${world.levelCount} level${world.levelCount === 1 ? "" : "s"}`,
      actions: [
        { label: "Play", onClick: (world) => this.playWorld(world.id) },
        { label: "Edit", onClick: (world) => void this.editWorld(world.id) },
      ],
      list: () => getWorldStorage().list(),
      remove: (id) => getWorldStorage().remove(id),
    }));
  }

  /**
   * Opens the world's map rather than launching its first level directly.
   *
   * The map is where progress lives, so entering through it is also what makes
   * "resume where I left off" work — going straight to level 1 would restart
   * every world on every visit, which is what this used to do. The map itself
   * handles an empty world and a since-deleted level, so neither needs checking
   * twice.
   */
  private playWorld(id: string): void {
    this.scene.start("WorldMap", { worldId: id });
  }

  private async editWorld(id: string): Promise<void> {
    const world = await getWorldStorage().load(id);
    if (!world) return;
    this.scene.start("WorldMaker", { world });
  }
}
