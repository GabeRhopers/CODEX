import {
  BOUNCE_CASTLE_TILE,
  BOUNCE_TILE,
  BRICK_CASTLE_TILE,
  BRICK_TILE,
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
 * Markers (Spawn/Goal/Chest) stay one-per-type-per-level — PlayScene's
 * spawn/win/chest-open logic is built around exactly one of each, Spawn
 * especially (the player can only start in one place). Checkpoint is one
 * exception within the Markers category: a level can have any number of
 * them, same as Enemies/Items/Decor below, since the whole point is
 * offering several respawn points along a level — see PlayScene's
 * checkpoint handling for why "singleton" doesn't apply to it the way it
 * does to its Marker siblings. `basket-sub`/`basket-up` are singleton too,
 * but per *area* rather than per level — Main can hold one of each (its
 * doorways down to Sub and up to Up), and Sub/Up can each hold one
 * matching basket of their own (the doorway back) — see "Sub/Up areas"
 * under Art for the full pairing/teleport story and EditorScene's
 * `MARKER_TYPES`. Enemies/Items/Decor have no per-type limit
 * either: a level can have any number of each, one per tile
 * (see EntityPlacer's docstring for the shared "one entity per tile"
 * invariant). Erasing isn't a brush here at all as of the header redesign —
 * see EditorScene's `eraserActive` — so there's no per-category Erase
 * entry to list below.
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
  { id: "spawn", category: "markers", kind: "entity", label: "Spawn", textureKey: "marker-spawn", entityType: "player-spawn" },
  { id: "goal", category: "markers", kind: "entity", label: "Goal", textureKey: "goal-portal", entityType: "goal" },
  { id: "chest", category: "markers", kind: "entity", label: "Chest", textureKey: "chest", entityType: "chest" },
  { id: "checkpoint", category: "markers", kind: "entity", label: "Checkpoint", textureKey: "checkpoint-bell", entityType: "checkpoint" },
  // Basket (Down) and Basket (Up) intentionally share one texture — see
  // UP_BASKET_TINT_COLOR below for how "Up" stays visually distinguishable
  // anyway, everywhere either one renders.
  { id: "basket-sub", category: "markers", kind: "entity", label: "Basket (Down)", textureKey: "magic-basket", entityType: "basket-sub" },
  { id: "basket-up", category: "markers", kind: "entity", label: "Basket (Up)", textureKey: "magic-basket", entityType: "basket-up" },
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

// Basket (Down) and Basket (Up) render with the exact same "magic-basket"
// texture (see the PALETTE entries above) — only their pairing (which
// area they teleport to/from, see PlayScene's basketDestination) differs.
// Applied via GameObject.setTint wherever the *default* art renders for
// basket-up specifically — the palette icon, a placed editor marker, and
// the in-game sprite — so "Down" and "Up" read as visually distinct
// without needing a second baked art asset, the same setTint-over-a-
// second-texture choice Checkpoint's own active/inactive bell tint
// already made (see PlayScene's CHECKPOINT_ACTIVE_TINT). A warm gold
// multiply tint rather than a full color replacement (setTintFill) so
// the source art's own shading/depth still reads through, just shifted
// warmer — "Down" (the cooler, unmodified original) stays visually
// paired with descending, "Up" with a golden, ascending/sunlit feel.
// Every call site is responsible for skipping this when a *custom*
// skin is active for basket-up instead (see EntityPlacer.add's own
// check) — a user's own uploaded art shouldn't get an involuntary tint
// forced onto it.
export const UP_BASKET_TINT_COLOR = 0xffc266;
