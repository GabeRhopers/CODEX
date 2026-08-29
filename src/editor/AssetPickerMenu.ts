import Phaser from "phaser";
import { hitRectFor } from "../ui/touchTarget";
import { GAME_HEIGHT } from "../config/gameConfig";
import { GameRect } from "./domOverlay";
import { FileInputOverlay } from "./FileInputOverlay";

/** One row/tile in a picker's dropdown — a built-in option (e.g. a
 * background scene, or a brush's own default art) and a user-uploaded
 * library entry are both just items here; the caller decides what
 * `textureKey` each one resolves to (a real thumbnail texture for images,
 * a shared icon for things with no visual thumbnail like audio tracks). */
export interface AssetPickerItem {
  id: string;
  label: string;
  textureKey: string;
  /** Shows a small "×" the caller's onDelete fires for — only ever true
   * for a user-uploaded library entry, never a built-in option (nothing
   * removes "Meadow" or a brush's default art). */
  deletable?: boolean;
}

export interface AssetPickerMenuOptions {
  scene: Phaser.Scene;
  /** Trigger button rect, in game coordinates — the dropdown itself opens
   * directly below it, same width. */
  trigger: GameRect;
  columns: number;
  itemSize: number;
  /** File input's `accept` attribute for the picker's own "Upload" tile —
   * omit to leave uploading out of this instance entirely (every current
   * caller provides one; kept optional in case a future picker is
   * selection-only). */
  uploadAccept?: string;
  triggerDepth: number;
  dropdownDepth: number;
  /** Checked before every open — returning false cancels it (the caller
   * is expected to have already surfaced why, e.g. a status toast) rather
   * than briefly flashing the dropdown open and shut. Used for the skin
   * picker specifically: only Markers/Enemies/Items/Decor are skinnable,
   * so opening it while a Block brush is selected has nothing to show. */
  canOpen?: () => boolean;
  onToggleOpen?: (open: boolean) => void;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onUploadFile?: (file: File) => void;
}

const BUTTON_COLOR = 0x0f3460;
const BUTTON_HOVER_COLOR = 0x3a5a9c;
const PANEL_BG_COLOR = 0x1a1a2e;
const ACTIVE_OUTLINE_COLOR = 0xffeb3b;
const DELETE_BG_COLOR = 0xaa3333;
const DELETE_HOVER_COLOR = 0xd14f4f;

const LABEL_HEIGHT = 18;
const CELL_PADDING = 4;
const PANEL_PADDING = 8;
const UPLOAD_TILE_LABEL = "+ Upload";

/**
 * A trigger button ("Skin: Default ▾", "BG: Meadow ▾", "Music: None ▾")
 * that opens a dropdown grid of small thumbnails below it — every
 * uploadable asset type (skins, backgrounds, music — see "Skin/
 * background/music libraries" under Art) shares this exact same picker
 * shape rather than each having its own bespoke upload/cycle/clear
 * buttons, so learning one teaches all three. Structurally mirrors
 * EditorUI's own category chip+dropdown (a toggleable container that
 * overlays whatever's normally shown there), just generic over an item
 * list instead of the fixed 5 palette categories.
 *
 * Owns its own small set of style constants rather than importing
 * EditorUI's, matching how FileInputOverlay/LevelNameInput are already
 * independent, reusable pieces — visually consistent by eye, not by
 * shared code.
 */
export class AssetPickerMenu {
  private readonly scene: Phaser.Scene;
  private readonly options: AssetPickerMenuOptions;
  private readonly triggerBg: Phaser.GameObjects.Rectangle;
  private readonly triggerLabel: Phaser.GameObjects.Text;
  private readonly dropdownContainer: Phaser.GameObjects.Container;
  private uploadOverlay?: FileInputOverlay;
  private isOpen = false;
  private items: AssetPickerItem[] = [];
  private activeId: string | null = null;

  constructor(options: AssetPickerMenuOptions) {
    this.scene = options.scene;
    this.options = options;
    const { x, y, width, height } = options.trigger;

    this.triggerBg = this.scene.add
      .rectangle(x, y, width, height, BUTTON_COLOR)
      .setOrigin(0, 0)
      .setDepth(options.triggerDepth)
      .setInteractive({ useHandCursor: true });
    this.triggerBg.on("pointerdown", () => this.toggle());
    this.triggerBg.on("pointerover", () => this.triggerBg.setFillStyle(BUTTON_HOVER_COLOR));
    this.triggerBg.on("pointerout", () => this.triggerBg.setFillStyle(BUTTON_COLOR));

    this.triggerLabel = this.scene.add
      .text(x + width / 2, y + height / 2, "", { fontSize: "12px", color: "#ffffff", align: "center", wordWrap: { width: width - 8 } })
      .setOrigin(0.5, 0.5)
      .setDepth(options.triggerDepth);

    this.dropdownContainer = this.scene.add.container(0, 0).setDepth(options.dropdownDepth).setVisible(false);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  setTriggerLabel(label: string): void {
    this.triggerLabel.setText(label);
  }

  /** Rebuilds the dropdown's grid from scratch — cheap enough to call on
   * every upload/select/delete rather than diffing, and simplest to keep
   * correct as items shift the upload tile's own position around. */
  setItems(items: AssetPickerItem[], activeId: string | null): void {
    this.items = items;
    this.activeId = activeId;
    if (this.isOpen) this.renderDropdown();
  }

  get isMenuOpen(): boolean {
    return this.isOpen;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dropdownContainer.setVisible(false);
    // The upload tile's real DOM <input> (see FileInputOverlay) isn't part
    // of dropdownContainer, so hiding that container alone would leave it
    // sitting there — invisible but still the actual click target — right
    // over whatever the editor shows once this picker closes. Destroying
    // it here (rebuilt fresh next time renderDropdown runs) is simpler
    // than adding a separate show/hide toggle for one DOM element.
    this.uploadOverlay?.destroy();
    this.uploadOverlay = undefined;
    this.options.onToggleOpen?.(false);
  }

  private open(): void {
    if (this.isOpen) return;
    if (this.options.canOpen && !this.options.canOpen()) return;
    this.isOpen = true;
    this.dropdownContainer.setVisible(true);
    this.renderDropdown();
    this.options.onToggleOpen?.(true);
  }

  private toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private renderDropdown(): void {
    this.dropdownContainer.removeAll(true);
    // Rebuilt fresh below (same reasoning as removeAll(true) above) rather
    // than repositioned in place — setItems can re-render while already
    // open (e.g. right after an upload resolves), and a stale overlay
    // pointing at the previous layout's slot would otherwise linger.
    this.uploadOverlay?.destroy();
    this.uploadOverlay = undefined;
    const { trigger, columns, itemSize, uploadAccept, dropdownDepth } = this.options;
    const cellWidth = trigger.width / columns;
    const cellHeight = itemSize + LABEL_HEIGHT + CELL_PADDING * 2;
    const totalSlots = this.items.length + (uploadAccept ? 1 : 0);
    const rows = Math.max(1, Math.ceil(totalSlots / columns));
    const panelHeight = rows * cellHeight + PANEL_PADDING * 2;
    // Below the trigger by default, but flipped above it when that would run
    // off the bottom of the scene.
    //
    // This is not hypothetical tidiness. The skin picker's trigger sits at
    // y=384 in a 468px-tall scene, so its panel starts at 412 and each row is
    // 52px: the *second* row lands at y=472, entirely below the canvas, where
    // it renders nowhere and cannot be clicked. One row is three slots, and the
    // skin picker spends two of them on "Use default" and "Built-in art" — so
    // from the moment a brush had two skins, the second was unreachable, which
    // is exactly when naming them starts to matter. Found by an e2e test that
    // picked a skin by name and watched nothing happen.
    const below = trigger.y + trigger.height + 2;
    const above = trigger.y - panelHeight - 2;
    // Prefer below; use above when below overflows and above actually fits;
    // otherwise clamp to the bottom edge so a panel too tall for either side
    // still shows as much as it can rather than dropping rows into the void.
    const panelY =
      below + panelHeight <= GAME_HEIGHT ? below : above >= 0 ? above : Math.max(0, GAME_HEIGHT - panelHeight);

    const bg = this.scene.add
      .rectangle(trigger.x, panelY, trigger.width, panelHeight, PANEL_BG_COLOR)
      .setOrigin(0, 0)
      .setDepth(dropdownDepth)
      .setStrokeStyle(1, BUTTON_HOVER_COLOR);
    this.dropdownContainer.add(bg);

    const slotPosition = (index: number): { x: number; y: number } => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      return {
        x: trigger.x + PANEL_PADDING + col * cellWidth + cellWidth / 2 - PANEL_PADDING / columns,
        y: panelY + PANEL_PADDING + row * cellHeight,
      };
    };

    // Tap targets, sized once for the whole grid. These tiles are the smallest
    // interactive things in the app — 24px for the music picker — which on a
    // phone held sideways is about 20 CSS px against a 44px guideline. Capped at
    // the cell so one tile's target can never reach into its neighbour's; where
    // a cell is smaller than the guideline the cell wins, which is the honest
    // answer rather than an overlapping lie. See ui/touchTarget.ts.
    const hitRect = hitRectFor({ width: itemSize, height: itemSize }, { width: cellWidth, height: cellHeight });

    this.items.forEach((item, index) => {
      const { x, y } = slotPosition(index);
      // A Zone rather than a hit area on the Image: setDisplaySize scales the
      // icon, and an Image's hit area is measured in unscaled texture space, so
      // the same rectangle would come out a different size per texture. Added
      // *before* the icon so each tile still reads as [Image, Text] to the e2e
      // helper that finds tiles by their label.
      const hit = this.scene.add
        .zone(x, y + itemSize / 2, hitRect.width, hitRect.height)
        .setDepth(dropdownDepth + 1)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        this.options.onSelect(item.id);
        this.close();
      });
      this.dropdownContainer.add(hit);

      const icon = this.scene.add
        .image(x, y + itemSize / 2, item.textureKey)
        .setDepth(dropdownDepth + 1)
        .setDisplaySize(itemSize, itemSize);
      this.dropdownContainer.add(icon);

      if (item.id === this.activeId) {
        const outline = this.scene.add
          .rectangle(x, y + itemSize / 2, itemSize + 4, itemSize + 4)
          .setStrokeStyle(2, ACTIVE_OUTLINE_COLOR)
          .setDepth(dropdownDepth + 1);
        this.dropdownContainer.add(outline);
      }

      const label = this.scene.add
        .text(x, y + itemSize + 2, item.label, { fontSize: "10px", color: "#cccccc", align: "center", wordWrap: { width: cellWidth - 4 } })
        .setOrigin(0.5, 0)
        .setDepth(dropdownDepth + 1);
      this.dropdownContainer.add(label);

      if (item.deletable && this.options.onDelete) {
        const badgeSize = 12;
        const badgeX = x + itemSize / 2 - badgeSize / 2;
        const badgeY = y - badgeSize / 2 + 2;
        const badge = this.scene.add
          .rectangle(badgeX, badgeY, badgeSize, badgeSize, DELETE_BG_COLOR)
          .setDepth(dropdownDepth + 2)
          .setInteractive({ useHandCursor: true });
        badge.on("pointerover", () => badge.setFillStyle(DELETE_HOVER_COLOR));
        badge.on("pointerout", () => badge.setFillStyle(DELETE_BG_COLOR));
        badge.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.options.onDelete?.(item.id);
        });
        const badgeLabel = this.scene.add
          .text(badgeX, badgeY, "×", { fontSize: "10px", color: "#ffffff" })
          .setOrigin(0.5, 0.5)
          .setDepth(dropdownDepth + 3);
        this.dropdownContainer.add([badge, badgeLabel]);
      }
    });

    if (uploadAccept) {
      const { x, y } = slotPosition(this.items.length);
      const uploadRect: GameRect = { x: x - cellWidth / 2 + 2, y, width: cellWidth - 4, height: itemSize };
      const uploadBg = this.scene.add
        .rectangle(uploadRect.x, uploadRect.y, uploadRect.width, uploadRect.height, BUTTON_COLOR)
        .setOrigin(0, 0)
        .setDepth(dropdownDepth + 1);
      const uploadLabel = this.scene.add
        .text(x, y + itemSize / 2, UPLOAD_TILE_LABEL, { fontSize: "10px", color: "#ffffff", align: "center", wordWrap: { width: cellWidth - 6 } })
        .setOrigin(0.5, 0.5)
        .setDepth(dropdownDepth + 2);
      this.dropdownContainer.add([uploadBg, uploadLabel]);

      if (this.options.onUploadFile) {
        this.uploadOverlay = new FileInputOverlay(
          this.scene,
          uploadRect,
          uploadAccept,
          (file) => {
            this.options.onUploadFile?.(file);
            this.close();
          },
          (hovering) => uploadBg.setFillStyle(hovering ? BUTTON_HOVER_COLOR : BUTTON_COLOR),
        );
      }
    }
  }

  destroy(): void {
    this.uploadOverlay?.destroy();
  }
}
