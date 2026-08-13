import {
  BOUNCE_CASTLE_TILE,
  BOUNCE_TILE,
  BRICK_CASTLE_TILE,
  BRICK_TILE,
  EMPTY_TILE,
  EntityType,
  GROUND_CASTLE_TILE,
  GROUND_DESERT_TILE,
  GROUND_GRASS_TILE,
  GROUND_SNOW_TILE,
  LAVA_TILE,
  WATER_TILE,
} from "../level/LevelSchema";
import { blockIconKey, groundIconKey } from "../level/groundSkins";

export type BrushKind = "tile" | "entity";
export type BrushCategory = "blocks" | "markers" | "enemies" | "items" | "decor";

export interface Brush {
  id: string;
  category: BrushCategory;
  kind: BrushKind;
  label: string;
  textureKey: string;
  tileIndex?: number;
  entityType?: EntityType;
  /** Draws a little extra breathing room after this brush's icon in
   * EditorUI's palette row — used sparingly, only to separate the
   * Blocks category's ground-skin/block-kind/hazard/erase groups so an
   * 11-icon row still reads as a few clusters, not one dense strip. */
  groupEnd?: boolean;
}

export const CATEGORIES: { id: BrushCategory; label: string }[] = [
  { id: "blocks", label: "Blocks" },
  { id: "markers", label: "Markers" },
  { id: "enemies", label: "Enemies" },
  { id: "items", label: "Items" },
  { id: "decor", label: "Decor" },
];

/**
 * Palette is data, not branching code: adding a new tile type or entity in
 * a later milestone means adding an entry here (plus a texture and, for
 * entities, a spawn case in PlayScene) — not new if/else logic in the
 * pointer handlers. `category` groups brushes for EditorUI's tabbed
 * palette (see CATEGORIES above) so the toolbar reads as a small set of
 * labeled groups rather than one ever-widening row of icons.
 *
 * Items/Markers/Enemies/Decor entities are all placed the same one-per-type
 * way spawn/goal have always been (see EntityPlacer's docstring) — a level
 * can have one Coin, one Bush, etc., not a trail of several. Lifting that
 * is a separate, larger change (EntityPlacer's Map<EntityType, Image>
 * would need to become Map<EntityType, Image[]>, plus matching
 * PlaceEntityCommand/PlayScene changes) that wasn't part of this pass.
 *
 * Decor brushes (bottom of the list) are purely cosmetic — PlayScene
 * spawns them as plain static images with no collision or overlap logic,
 * unlike every other entity category here.
 *
 * Blocks (below) used to be 4 generic entries (Ground/Brick/Bounce/Water)
 * whose *look* re-skinned with a level-wide "theme" you had to cycle
 * through to reach — so only one skin's Ground was ever paintable at a
 * time. Every skin is now its own permanent brush instead: a level can
 * freely mix Grass/Desert/Castle/Snow ground, and Castle's own procedural
 * Brick/Bounce/Lava sit alongside the real-art versions grass/desert/snow
 * share, rather than only being reachable by switching a level-wide
 * setting. See LevelSchema.ts for the tile constants and groundAutotile.ts
 * for how each maps to a render frame in the combined tileset.
 */
export const PALETTE: Brush[] = [
  { id: "ground-grass", category: "blocks", kind: "tile", label: "Grass", textureKey: groundIconKey("grass"), tileIndex: GROUND_GRASS_TILE },
  { id: "ground-desert", category: "blocks", kind: "tile", label: "Desert", textureKey: groundIconKey("desert"), tileIndex: GROUND_DESERT_TILE },
  { id: "ground-castle", category: "blocks", kind: "tile", label: "Castle", textureKey: groundIconKey("castle"), tileIndex: GROUND_CASTLE_TILE },
  {
    id: "ground-snow",
    category: "blocks",
    kind: "tile",
    label: "Snow",
    textureKey: groundIconKey("snow"),
    tileIndex: GROUND_SNOW_TILE,
    groupEnd: true,
  },
  { id: "brick", category: "blocks", kind: "tile", label: "Brick", textureKey: blockIconKey("grass", "brick"), tileIndex: BRICK_TILE },
  {
    id: "brick-castle",
    category: "blocks",
    kind: "tile",
    label: "Castle Brick",
    textureKey: blockIconKey("castle", "brick"),
    tileIndex: BRICK_CASTLE_TILE,
  },
  { id: "bounce", category: "blocks", kind: "tile", label: "Bounce", textureKey: blockIconKey("grass", "bounce"), tileIndex: BOUNCE_TILE },
  {
    id: "bounce-castle",
    category: "blocks",
    kind: "tile",
    label: "Castle Bounce",
    textureKey: blockIconKey("castle", "bounce"),
    tileIndex: BOUNCE_CASTLE_TILE,
    groupEnd: true,
  },
  { id: "water", category: "blocks", kind: "tile", label: "Water", textureKey: blockIconKey("grass", "water"), tileIndex: WATER_TILE },
  {
    id: "lava",
    category: "blocks",
    kind: "tile",
    label: "Lava",
    textureKey: blockIconKey("castle", "water"),
    tileIndex: LAVA_TILE,
    groupEnd: true,
  },
  { id: "eraser", category: "blocks", kind: "tile", label: "Erase", textureKey: "tile-eraser", tileIndex: EMPTY_TILE },
  { id: "spawn", category: "markers", kind: "entity", label: "Spawn", textureKey: "marker-spawn", entityType: "player-spawn" },
  { id: "goal", category: "markers", kind: "entity", label: "Goal", textureKey: "goal-portal", entityType: "goal" },
  { id: "chest", category: "markers", kind: "entity", label: "Chest", textureKey: "chest", entityType: "chest" },
  { id: "enemy-ghost", category: "enemies", kind: "entity", label: "Ghost", textureKey: "enemy-ghost-pillow", entityType: "enemy-ghost" },
  { id: "enemy-spike", category: "enemies", kind: "entity", label: "Spike", textureKey: "enemy-spike-crawler", entityType: "enemy-spike" },
  { id: "enemy-bat", category: "enemies", kind: "entity", label: "Bat", textureKey: "enemy-bat", entityType: "enemy-bat" },
  { id: "enemy-golem", category: "enemies", kind: "entity", label: "Golem", textureKey: "enemy-golem", entityType: "enemy-golem" },
  { id: "item-coin", category: "items", kind: "entity", label: "Coin", textureKey: "item-coin", entityType: "item-coin" },
  { id: "item-heart", category: "items", kind: "entity", label: "Heart", textureKey: "item-heart", entityType: "item-heart" },
  { id: "item-speed", category: "items", kind: "entity", label: "Speed", textureKey: "item-speed", entityType: "item-speed" },
  { id: "item-feather", category: "items", kind: "entity", label: "Feather", textureKey: "item-feather", entityType: "item-feather" },
  { id: "item-shield", category: "items", kind: "entity", label: "Shield", textureKey: "item-shield", entityType: "item-shield" },
  { id: "item-key", category: "items", kind: "entity", label: "Key", textureKey: "item-key", entityType: "item-key" },
  { id: "decor-bush", category: "decor", kind: "entity", label: "Bush", textureKey: "decor-bush", entityType: "decor-bush" },
  { id: "decor-tree", category: "decor", kind: "entity", label: "Tree", textureKey: "decor-tree", entityType: "decor-tree" },
  { id: "decor-cactus", category: "decor", kind: "entity", label: "Cactus", textureKey: "decor-cactus", entityType: "decor-cactus" },
  { id: "decor-lamp", category: "decor", kind: "entity", label: "Lamp", textureKey: "decor-lamp", entityType: "decor-lamp" },
  { id: "decor-cloud", category: "decor", kind: "entity", label: "Cloud", textureKey: "decor-cloud", entityType: "decor-cloud" },
  { id: "decor-snowman", category: "decor", kind: "entity", label: "Snowman", textureKey: "decor-snowman", entityType: "decor-snowman" },
  { id: "decor-sprout", category: "decor", kind: "entity", label: "Sprout", textureKey: "decor-sprout", entityType: "decor-sprout" },
  { id: "decor-mushroom", category: "decor", kind: "entity", label: "Mushroom", textureKey: "decor-mushroom", entityType: "decor-mushroom" },
  { id: "decor-rocks", category: "decor", kind: "entity", label: "Rocks", textureKey: "decor-rocks", entityType: "decor-rocks" },
  { id: "decor-bat", category: "decor", kind: "entity", label: "Sleep Bat", textureKey: "decor-bat", entityType: "decor-bat" },
];
