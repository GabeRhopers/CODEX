import { BOUNCE_TILE, BRICK_TILE, EMPTY_TILE, EntityType, GROUND_TILE } from "../level/LevelSchema";
import { groundIconKey } from "../level/themes";

export type BrushKind = "tile" | "entity";
export type BrushCategory = "blocks" | "markers" | "enemies" | "items";

export interface Brush {
  id: string;
  category: BrushCategory;
  kind: BrushKind;
  label: string;
  textureKey: string;
  tileIndex?: number;
  entityType?: EntityType;
}

export const CATEGORIES: { id: BrushCategory; label: string }[] = [
  { id: "blocks", label: "Blocks" },
  { id: "markers", label: "Markers" },
  { id: "enemies", label: "Enemies" },
  { id: "items", label: "Items" },
];

/**
 * Palette is data, not branching code: adding a new tile type or entity in
 * a later milestone means adding an entry here (plus a texture and, for
 * entities, a spawn case in PlayScene) — not new if/else logic in the
 * pointer handlers. `category` groups brushes for EditorUI's tabbed
 * palette (see CATEGORIES above) so the toolbar reads as a small set of
 * labeled groups rather than one ever-widening row of icons.
 *
 * Items are placed the same one-per-type way spawn/goal/enemies always
 * have been (see EntityPlacer's docstring) — a level can have one Coin,
 * one Heart, etc., not a trail of several. Lifting that is a separate,
 * larger change (EntityPlacer's Map<EntityType, Image> would need to
 * become Map<EntityType, Image[]>, plus matching PlaceEntityCommand/
 * PlayScene changes) that wasn't part of this pass.
 */
export const PALETTE: Brush[] = [
  { id: "ground", category: "blocks", kind: "tile", label: "Ground", textureKey: groundIconKey("grass"), tileIndex: GROUND_TILE },
  { id: "brick", category: "blocks", kind: "tile", label: "Brick", textureKey: "tile-brick-icon", tileIndex: BRICK_TILE },
  { id: "bounce", category: "blocks", kind: "tile", label: "Bounce", textureKey: "tile-bounce-icon", tileIndex: BOUNCE_TILE },
  { id: "eraser", category: "blocks", kind: "tile", label: "Erase", textureKey: "tile-eraser", tileIndex: EMPTY_TILE },
  { id: "spawn", category: "markers", kind: "entity", label: "Spawn", textureKey: "marker-spawn", entityType: "player-spawn" },
  { id: "goal", category: "markers", kind: "entity", label: "Goal", textureKey: "goal-portal", entityType: "goal" },
  { id: "enemy-ghost", category: "enemies", kind: "entity", label: "Ghost", textureKey: "enemy-ghost-pillow", entityType: "enemy-ghost" },
  { id: "enemy-spike", category: "enemies", kind: "entity", label: "Spike", textureKey: "enemy-spike-crawler", entityType: "enemy-spike" },
  { id: "enemy-bat", category: "enemies", kind: "entity", label: "Bat", textureKey: "enemy-bat", entityType: "enemy-bat" },
  { id: "item-coin", category: "items", kind: "entity", label: "Coin", textureKey: "item-coin", entityType: "item-coin" },
  { id: "item-heart", category: "items", kind: "entity", label: "Heart", textureKey: "item-heart", entityType: "item-heart" },
  { id: "item-speed", category: "items", kind: "entity", label: "Speed", textureKey: "item-speed", entityType: "item-speed" },
  { id: "item-feather", category: "items", kind: "entity", label: "Feather", textureKey: "item-feather", entityType: "item-feather" },
  { id: "item-shield", category: "items", kind: "entity", label: "Shield", textureKey: "item-shield", entityType: "item-shield" },
];
