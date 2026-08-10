import { BOUNCE_TILE, BRICK_TILE, EMPTY_TILE, EntityType, GROUND_TILE } from "../level/LevelSchema";
import { groundIconKey } from "../level/themes";

export type BrushKind = "tile" | "entity";

export interface Brush {
  id: string;
  kind: BrushKind;
  label: string;
  textureKey: string;
  tileIndex?: number;
  entityType?: EntityType;
}

/**
 * Palette is data, not branching code: adding a new tile type or entity in
 * a later milestone means adding an entry here (plus a texture and, for
 * entities, a spawn case in PlayScene) — not new if/else logic in the
 * pointer handlers.
 */
export const PALETTE: Brush[] = [
  { id: "ground", kind: "tile", label: "Ground", textureKey: groundIconKey("grass"), tileIndex: GROUND_TILE },
  { id: "brick", kind: "tile", label: "Brick", textureKey: "tile-brick-icon", tileIndex: BRICK_TILE },
  { id: "bounce", kind: "tile", label: "Bounce", textureKey: "tile-bounce-icon", tileIndex: BOUNCE_TILE },
  { id: "eraser", kind: "tile", label: "Erase", textureKey: "tile-eraser", tileIndex: EMPTY_TILE },
  { id: "spawn", kind: "entity", label: "Spawn", textureKey: "marker-spawn", entityType: "player-spawn" },
  { id: "goal", kind: "entity", label: "Goal", textureKey: "goal-portal", entityType: "goal" },
  { id: "enemy-ghost", kind: "entity", label: "Ghost", textureKey: "enemy-ghost-pillow", entityType: "enemy-ghost" },
  { id: "enemy-spike", kind: "entity", label: "Spike", textureKey: "enemy-spike-crawler", entityType: "enemy-spike" },
  { id: "enemy-bat", kind: "entity", label: "Bat", textureKey: "enemy-bat", entityType: "enemy-bat" },
];
