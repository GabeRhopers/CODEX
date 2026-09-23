import Phaser from "phaser";
import { VolumeControl } from "../audio/VolumeControl";
import { playSfx, playSoundKey, type SfxName } from "../audio/sfx";
import { registerSound, soundKeyFor } from "../audio/soundLoader";
import { GRID_ORIGIN_X, GRID_ORIGIN_Y, TILE_SIZE } from "../config/gameConfig";
import { UP_BASKET_TINT_COLOR } from "../editor/Palette";
import {
  applyDefaultSkinSize,
  applyEnemySize,
  applyStompBounce,
  createGhostState,
  createPatrolEnemy,
  GhostState,
  isStompFromAbove,
  updateGhostPatrol,
} from "../gameplay/EnemyBehaviors";
import { createBolt, isBoltExpired } from "../gameplay/Bolt";
import { angleFor, CharacterSituation, frameFor, resolveTint, TINT_COLORS } from "../gameplay/characterState";
import { connectedPadCount, currentPad, mergePad, NO_PAD, padForPlayer } from "../gameplay/gamepad";
import { installPadNavigation } from "../gameplay/padNavigation";
import { createPlayerInput, isAttackPressed, isJumpPressed, JUMP_VELOCITY, PlayerInputKeys, updatePlayerMovement } from "../gameplay/PlayerController";
import { resolveBackgroundTextureKey } from "../gameplay/backgroundLoader";
import { resolveLevelMusicKey } from "../gameplay/musicLoader";
import { collectAsFor, decorTypes, enemyDefs, itemTypes, soundSpecFor, textureKeyFor } from "../entities/entityRegistry";
import { CustomEntityDef, isCustomEntityId, type PlaceableType } from "../entities/customEntity";
import { loadCustomEntities } from "../entities/customEntityStorage";
import type { GameRunContext } from "./WorldMapScene";
import { StaticBackground } from "../gameplay/StaticBackground";
import {
  canDoubleJump,
  canFireThunderHat,
  collectCoin,
  collectFeather,
  collectHeart,
  collectKey,
  collectShield,
  collectSpeed,
  collectThunderHat,
  createPlayerStats,
  fireThunderHat,
  isHurtFlashing,
  isInvincible,
  openChest,
  PlayerStats,
  registerHit,
  resetDoubleJump,
  speedMultiplierAt,
  useDoubleJump,
} from "../gameplay/PlayerStats";
import { HandheldShell, LEFT_BAND, makeConsoleButton, SCREEN_RECT, VOLUME_CONTROL } from "../gameplay/HandheldShell";
import { recordCompletion } from "../world/worldProgress";
import { TouchControls, TouchControlState } from "../gameplay/TouchControls";
import { applyWizardTexture, createWizardAnimState, FRAME_HEIGHT, updateWizardAnimation, WizardAnimState } from "../gameplay/wizardAnimation";
import { BOUNCE_FRAMES, buildRenderGrid, HAZARD_FRAMES, WATER_FRAMES } from "../level/groundAutotile";
import { buildEdgeGrid, EDGE_GID_BASE, GROUND_EDGE_TEXTURE_KEY } from "../level/groundEdges";
import { CANVAS_BACKGROUND_COLOR, GroundSkin, GROUND_SKINS } from "../level/groundSkins";
import { AreaKey, DEFAULT_ENEMY_SIZE, EnemySize, EntityType, LevelArea, LevelData } from "../level/LevelSchema";
import { getLevelStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { builtInGroundTilesets, composeGroundTilesets } from "../skins/groundTileset";
import { FrameTextureKeys, resolveFrameTextureKeys, resolveLoopLength, resolveSkinTextureKeys } from "../skins/skinLoader";
import { CHARACTER_SKIN_ID, framePlanFor } from "../skins/spriteFrames";
import { advanceLoop, createLoopState, LoopState } from "../gameplay/spriteLoop";

// Raised from -650 alongside GRAVITY_Y's 900→1100 bump (2026-08-19, see
// its own comment in gameConfig.ts) — v scales by sqrt(1100/900) to keep
// the bounce's own apex height (h = v²/2g) exactly what it was before,
// since SPRING_MEADOW's landing platform in templateLevels.ts was placed
// and verified against that specific height. Airtime drops from ~1.4s to
// ~1.3s as a side effect, which only makes the pad feel snappier, not
// less reachable.
const BOUNCE_VELOCITY_Y = -719;
// Swimming (see the water check in update()) sets vertical velocity
// directly every frame rather than fighting gravity, so these aren't
// forces — SWIM_UP_VELOCITY while jump/up is held, SWIM_SINK_VELOCITY
// otherwise, both far gentler than JUMP_VELOCITY/gravity so movement in
// water reads as buoyant control rather than a normal fall/jump.
const SWIM_UP_VELOCITY = -160;
const SWIM_SINK_VELOCITY = 80;
// Applied on top of speedMultiplierAt's own Speed Potion multiplier (see
// update()) — water slows horizontal movement the same way it would in
// any platformer, without needing a second buff-stacking system.
const SWIM_SPEED_MULTIPLIER = 0.6;
// Green reads as "good/active" against every one of this game's built-in
// backgrounds and the bell's own cyan/blue art, matching the existing
// buff-tint convention (see updateCharacterVisuals) of a flat setTint rather
// than a second baked texture — cheap, and it survives a user-uploaded
// skin of any color scheme instead of needing an "activated" variant of
// whatever image they chose.
const CHECKPOINT_ACTIVE_TINT = 0x4ade80;
// How long a toast (see showToast) stays up — shorter than
// EditorUI.setStatus's 2500ms since these fire mid-platforming and
// shouldn't linger over the action.
const CHECKPOINT_TOAST_MS = 1200;
// Text color for showToast's "something didn't happen" case (a basket with
// no matching basket in its paired area — see useBasket) — distinct from
// the Checkpoint toast's green so a warning reads as a warning at a glance.
const WARNING_TOAST_COLOR = "#facc15";
// A basket teleport lands the player standing exactly on top of the
// *destination* area's own matching basket (see enterArea/useBasket) —
// without a guard, that new position immediately overlaps that basket's
// own freshly-rebuilt trigger zone and bounces straight back where they
// came from, forever.
//
// This timer was that guard on its own until 2026-08-22, and it turned out
// not to be enough, because it and the player's movement are measured on
// two different clocks. `this.time.now` follows wall time whatever the
// frame rate (measured: it advanced 783ms across 782ms of wall clock on a
// loaded machine), but the player's position is integrated per physics
// step, so a starved loop moves them a fraction of the usual distance in
// the same 500ms. Reproduced deterministically under 6x CPU throttling:
// they cover ~10px instead of ~100px, are therefore still standing on the
// basket when the timer lapses, and ping-pong between the two areas for
// as long as the direction is held. Real players on slow phones can hit
// this — the game is built for phones — and CI hit it too.
//
// So the actual guard is now `latchedBasketTile`, which asks the
// frame-rate-independent question ("has the player left that pad yet?") and
// is scoped to the one pad they landed on, so a neighbouring basket still
// works. The timer stays as a second line of defence: it keeps an *inert*
// basket from re-toasting every physics frame. Long enough to clear one
// overlap check after landing, short enough that using a different basket
// right after arriving never feels blocked.
const TELEPORT_COOLDOWN_MS = 500;

// How far apart two characters are placed when they arrive somewhere together
// — a fresh start, and every basket teleport. Stacking them on the identical
// pixel is not merely ugly: two Arcade bodies at the same point get pushed
// apart by the separation pass in whichever direction rounding happens to
// favour, which reads as one of them being flung. Half a tile is enough to
// avoid that and still small enough that both are plainly at the same door.
// With one player it multiplies by zero and changes nothing.
const SPAWN_SPACING_X = TILE_SIZE / 2;

// What a character who is not holding the console reads from the on-screen
// controls: nothing. Frozen rather than built per frame so it cannot be
// written into by accident — `mergePad` returns a fresh object anyway.
const NO_TOUCH: TouchControlState = Object.freeze({ left: false, right: false, jump: false, attack: false });

// Player one's `baseTint`. Not a colour so much as the absence of one: see
// updateCharacterVisuals, which turns this exact value back into `clearTint()`
// rather than a white tint, so the solo character is untouched by co-op.
const UNTINTED = 0xffffff;

// Player two wears the same character in a different colour — no second skin,
// no second Skin Creator entry, no second cast in the cut scenes. Warm orange
// because it has to survive being read against four very different backgrounds
// and against the two buff tints it takes turns with: it is nowhere near the
// Shield's cyan or the hurt flash's red, so "which one am I" and "what just
// happened to me" never look like the same signal.
const PLAYER_TWO_TINT = 0xffa24a;

// How long a fallen character stays out before popping back.
//
// The run only ends when *everybody* is down at once, so this is also the
// window the other player has to survive alone. Long enough to feel like a
// consequence and to get clear of whatever did it; short enough that the
// person holding the other half of the keyboard is not sitting and watching.
const RESPAWN_DELAY_MS = 1500;

// PJ Thunder Hat's shock — see Bolt.ts for the projectile itself.
// Launch position is roughly the wizard's chest/hand height, offset ahead
// of the player in whichever direction they're facing (player.flipX).
const BOLT_LAUNCH_OFFSET_X = 16;
const BOLT_LAUNCH_OFFSET_Y = 24;
// How long the "wizard-cast" pose holds when firing a bolt — brief on
// purpose, just long enough to read as a cast rather than a static jump/
// idle/walk frame. Fed into characterState's own situation ranking (see
// update()) rather than stamped over the animation afterward, so it can't
// fight whatever pose the resolver already chose.
const CAST_FLASH_MS = 150;
// The same pose, held a little longer, for the moment a power-up is picked
// up — the cast frame's arms-up stance already reads as "something good
// just happened," so this needs no new art. Distinct from the persistent
// powered-up look, which is the accessory sprites (see
// updateAccessoryVisuals) plus the Speed/Shield tints.
const POWERUP_FLASH_MS = 260;

// The three placeable-entity tables live in entities/builtins.ts and are read
// through entities/entityRegistry.ts, which merges in whatever types the player
// has invented (see entities/customEntity.ts). Built-ins always come first and
// keep their order, so nothing about an existing level's spawn or draw order
// shifts when a custom type exists.

interface ActiveEnemy {
  sprite: Phaser.Physics.Arcade.Sprite;
  state: GhostState;
  stompable: boolean;
  /** Which brush spawned it. Carried so a stomp can find the invented thing's
   * own sound — the overlap handler is otherwise handed a bare sprite and has
   * no way back to the definition. */
  type: PlaceableType;
}

/** Present only when this level was launched from a World (WorldBrowserScene
 * "Play") rather than a standalone Test Play — see onWin/nextLevel. */
interface WorldPlayContext {
  levelIds: string[];
  index: number;
  /** Which world this run belongs to. Needed so a win can be banked against
   * it and Esc can return to *that* world's map rather than the browser —
   * optional so an older launch path (or a test) that only knows the id list
   * still plays, it just lands back on the list. */
  worldId?: string;
  /** Set when this world is being played as part of a game. Carried rather than
   * read: returning to the map restarts that scene, so without passing this
   * back the run would quietly stop being part of a game the moment a level was
   * played. Opaque here — PlayScene never reads inside it. */
  game?: GameRunContext;
}

/** Tile coordinates (plus which area they're in — see "Sub/Up areas"
 * under Art) of the checkpoint the player last touched this play session
 * — see restart()/the checkpoint handling in enterArea for why this rides
 * along in PlaySceneData rather than living only as a private field.
 * `scene.restart()` reruns init()/create() from scratch, discarding every
 * instance field along with it (same reason `world`/`returnScene` are
 * threaded through the same way), so a checkpoint touched before dying
 * would otherwise be forgotten the moment Restart reconstructs the scene.
 * Deliberately never set by a *fresh* entry (Test Play, a World's first
 * level, Templates, Next Level) — only restart() itself carries it
 * forward — so checkpoint progress is scoped to "retrying this same
 * attempt," not persisted across separate play sessions the way the level
 * itself is. */
interface CheckpointCoord {
  area: AreaKey;
  x: number;
  y: number;
}

/** Which area a touched `basket-sub`/`basket-up` teleports *to*, from
 * wherever it's currently touched — see "Sub/Up areas" under Art. Both
 * baskets are two-way doors between Main and their own satellite area;
 * touched anywhere else (e.g. a `basket-sub` placed inside Up, which the
 * editor doesn't prevent but has no defined pairing) they're simply
 * inert, hence the `null` case. */
function basketDestination(basketType: "basket-sub" | "basket-up", from: AreaKey): AreaKey | null {
  const satellite: AreaKey = basketType === "basket-sub" ? "sub" : "up";
  if (from === "main") return satellite;
  if (from === satellite) return "main";
  return null;
}

interface PlaySceneData {
  level: LevelData;
  world?: WorldPlayContext;
  /** Scene key to return to on Esc/loss when there's no `world` context —
   * e.g. "Templates" when launched from TemplateBrowserScene's Play button
   * (a plain scene.start, same as Worlds, not a launch/pause of Editor).
   * Defaults to resuming the paused Editor scene, the original Test Play
   * behavior, when omitted. */
  returnScene?: string;
  checkpoint?: CheckpointCoord;
}

/**
 * One playable character, and everything that is genuinely *theirs*.
 *
 * Everything a character does was already written to take the sprite as an
 * argument — `updatePlayerMovement`, `updateWizardAnimation`, `registerHit`,
 * `applyStompBounce`. What was singular was never the rules, only this scene's
 * bookkeeping: one sprite field, one animation state, one pair of edge-detect
 * flags. This record is that bookkeeping made plural.
 *
 * **Score, hearts and the key are deliberately not here.** They stay on the
 * scene as one shared pool, which is what leaves `collectItem`, `tryOpenChest`,
 * the checkpoint and the entire HUD untouched — and it makes a power-up
 * something the *team* picked up, which is the friendlier reading for a game
 * two people in one room are playing together.
 */
interface CoopPlayer {
  sprite: Phaser.Physics.Arcade.Sprite;
  input: PlayerInputKeys;
  anim: WizardAnimState;
  /** Worn whenever no buff tint is showing. `UNTINTED` for player one, which
   * means literally no tint — see updateCharacterVisuals. */
  baseTint: number;
  /** The on-screen D-pad belongs to player one; there is only one cluster and
   * two people cannot share a phone. */
  usesTouch: boolean;
  jumpWasDown: boolean;
  attackWasDown: boolean;
  /** See CAST_FLASH_MS. Per character rather than per scene, because the pose
   * belongs to whoever pulled the trigger — the *cooldown* behind it lives in
   * the shared `stats` and is deliberately team-wide, like every other buff. */
  castFlashUntil: number;
  /**
   * 0 while playing; otherwise the time this character pops back.
   *
   * A fallen player is hidden with its body disabled rather than destroyed, so
   * every collider that already names it keeps working and there is nothing to
   * re-register when it returns.
   *
   * **This is the field that keeps solo play identical.** "Everybody is down"
   * is true the instant the only player falls, so `onLose` still fires exactly
   * where it always did — for a fatal hit and for falling off the level alike.
   * The delay only ever means anything once there is somebody left standing.
   */
  downUntil: number;
  /** Accessory sprites follow their own character across a basket teleport,
   * the same way the buff tint does. */
  slipper: Phaser.GameObjects.Image;
  hat: Phaser.GameObjects.Image;
}

export class PlayScene extends Phaser.Scene {
  private level!: LevelData;
  private world?: WorldPlayContext;
  private returnScene?: string;
  private get levelStorage(): StorageAdapter {
    return getLevelStorage();
  }
  /**
   * Everyone playing, in join order. Exactly one entry today.
   *
   * Plural before there is anything plural to hold, deliberately: making the
   * scene's ~30 `this.player` sites name *which* character they mean is the
   * whole risk of two-player support, and doing it while there is still only
   * one player means every existing test is a check on the refactor rather
   * than on a new feature at the same time.
   *
   * Nothing in this scene reads `players[0]` any more: every rule takes the
   * character that actually did the thing — the one the collider handed over,
   * the one whose turn of the loop this is. That is the point. A site that
   * silently meant "player one" when it meant "this player" is exactly the bug
   * `onGroundCollide` had.
   */
  private players: CoopPlayer[] = [];

  /**
   * The same sprites as a Phaser Group, and **the reason joining mid-level
   * costs nothing.**
   *
   * Every collider and overlap in the level is registered against this group
   * once, when the area is built. Arcade Physics resolves a group to its live
   * children on every step rather than at registration, so a character added to
   * it afterwards is immediately collided and overlapped by the ground, the
   * goal, the enemies, the baskets and the chest — with no collider to tear
   * down and rebuild, and no risk of rebuilding them slightly differently than
   * `enterArea` did.
   *
   * It is also what makes a *fallen* player free: disabling its body takes it
   * out of every check at once, and re-enabling puts it back.
   */
  private playerGroup!: Phaser.GameObjects.Group;

  /**
   * The tappable invitation to join, and the line that replaces it afterwards.
   *
   * **A button rather than a label, because of the device this is for.** The
   * setup two-player support was built for is a tablet: one person on the
   * on-screen D-pad, one on a controller. A tablet has no Enter key, so a hint
   * that says "press Enter" is an instruction nobody in the room can follow.
   * Enter still works for anyone who has a keyboard.
   */
  private coopButton!: { rect: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text };
  private coopHint!: Phaser.GameObjects.Text;

  /** So the summary is rewritten when a controller arrives or leaves, and not
   * sixty times a second otherwise. -1 is "not asked yet". */
  private lastPadCount = -1;

  /**
   * Player one's key bindings, built in `create()` and handed to `makePlayer`.
   *
   * **Built synchronously, and that is not tidiness — it is the fix for a real
   * bug.** `create()` does not build the area itself; it waits on the ground
   * tilesets and builds it in a callback (see the `composeGroundTilesets` call
   * there). So a player created during that build gets its `Phaser.Input.
   * Keyboard.Key` objects created *after* the scene is already on screen and
   * already receiving events — and a Key learns a button is held only from a
   * keydown *event*, never by asking the keyboard. A key that was already down
   * when the Key was created therefore reads as up until it is released and
   * pressed again.
   *
   * In plain terms: hold right while a level loads, and the character just
   * stands there. It cost two `game-maker.spec.ts` tests, which press the
   * moment the scene goes active — and it was invisible from Test Play, where
   * the tilesets are already warm and the area is built before a test can
   * press anything.
   *
   * Player two's bindings are made on joining, which is fine: joining is itself
   * a keypress, so the scene is long since live, and A/D/W already exist as
   * Key objects from this one (Phaser returns the same Key for a keycode it
   * already tracks).
   */
  private soloInput!: PlayerInputKeys;

  /**
   * Player one's sprite, **for the e2e specs and nothing else.**
   *
   * Eight spec files reach into the live scene through this name to ask where
   * the character is, what it is wearing and how fast it is going — they drive
   * the arrow keys, so player one is unambiguously the character they mean. It
   * is kept as a getter rather than deleted because those specs are the phase
   * gate for this refactor: they have to pass *untouched*, or the refactor
   * changed something it had no business changing.
   *
   * Public, and not because anything in the app calls it — it is public so the
   * compiler stops telling the truth about an unused private member, and so
   * that "this name exists for the harness" is stated rather than implied.
   *
   * **No production code in this file may use it.** Undefined before the first
   * area is built, exactly as the old field was, so `scene.player?.x` in a spec
   * still reads undefined rather than throwing on a scene that is still loading.
   */
  get player(): Phaser.Physics.Arcade.Sprite | undefined {
    return this.players[0]?.sprite;
  }
  // Which of Main/Sub/Up the player is currently in — see "Sub/Up areas"
  // under Art. Set once up front (see startingAreaKey) and again on every
  // basket teleport (see enterArea); everything below that used to
  // describe "the level" (groundLayer/background/music/every spawned
  // sprite) now describes "whichever area is current," torn down and
  // rebuilt by enterArea each time this changes — unlike a fresh Test
  // Play/restart, `stats` (score/hearts/buffs) and the `players` themselves
  // are deliberately *not* part of that teardown, so a teleport reads as
  // walking through a door in the same level, not starting over.
  private currentAreaKey: AreaKey = "main";
  // Guards enterArea's teardown block (and its player-reuse-vs-create
  // branch) against a real crash: `scene.restart()` (Restart — see
  // restart()) reruns init()/create() on this exact same PlayScene
  // *instance* rather than constructing a fresh one, same reason
  // spritesByBrushId gets explicitly reset in init() rather than relying
  // on a field initializer. Left alone, `groundLayer`/`groundCollider`/
  // `background`/the `players` would carry over as stale references to
  // GameObjects Phaser already destroyed tearing down the previous run —
  // e.g. a destroyed TilemapLayer nulls out its own `.tilemap` property,
  // so `this.groundLayer.tilemap.destroy()` throws reading `.destroy` off
  // `undefined`. Reset to false in init() (a fresh run has nothing real to
  // tear down, and needs a new player sprite); set true at the end of
  // enterArea's first successful build. A basket teleport within the same
  // run (see useBasket) always finds this already true, so it correctly
  // tears down and reuses the *live* player rather than skipping either.
  private areaBuilt = false;
  // Which texture each ground skin's tileset strip is drawn from: the four
  // built-in images, or a composed copy carrying this level's painted block
  // skins (see groundTileset.ts). Resolved once in create(), *before* the
  // first enterArea, because enterArea builds the tilemap synchronously and
  // rebuilding it afterwards would mean tearing down a live layer and its
  // collider mid-play.
  private groundTilesetKeys: Record<GroundSkin, string> = builtInGroundTilesets();
  // Bumped by init() on every run (Test Play, Restart, the next level in a
  // world), so create()'s async tileset composition can tell whether the run
  // it belongs to is still the current one. Without it, a Restart landing
  // inside that window would get a second, stale enterArea from the run it
  // replaced — the same guard shape as enterArea's own `currentAreaKey !== key`
  // checks.
  private runToken = 0;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  // Purely visual silhouette above groundLayer (see groundEdges.ts) — no
  // collider of its own, and rebuilt with the tilemap it shares.
  private edgeLayer!: Phaser.Tilemaps.TilemapLayer;
  // Rebuilt alongside groundLayer on every enterArea call — Phaser doesn't
  // automatically drop a collider just because the TilemapLayer it
  // referenced got destroyed, so the old one needs explicit removal
  // before the new one's added, or the player would end up colliding
  // against a stale, already-destroyed layer.
  private groundCollider?: Phaser.Physics.Arcade.Collider;
  // Every zone (goal/checkpoint/basket/item/chest overlap trigger) spawned
  // for the *current* area, destroyed and rebuilt alongside everything
  // else in enterArea — unlike sprites (tracked via spritesByBrushId,
  // which doubles as the skin-resolve pass's index), zones have no other
  // reason to be tracked, so this array exists purely for teardown.
  private areaZones: Phaser.GameObjects.Zone[] = [];
  // Every overlap Collider returned by physics.add.overlap for the
  // *current* area (goal/checkpoint/basket/item/chest/enemy), destroyed
  // explicitly in enterArea's teardown *before* the zones/sprites they
  // reference — Phaser doesn't automatically drop a Collider just because
  // one of its two GameObjects gets destroyed (unlike groundCollider,
  // which is tracked individually since it's rebuilt every time rather
  // than accumulated), so leaving these behind would have the very next
  // physics step process a collider referencing an already-destroyed
  // GameObject.
  private areaColliders: Phaser.Physics.Arcade.Collider[] = [];
  private touch!: TouchControls;
  private enemies: ActiveEnemy[] = [];
  // PJ Thunder Hat's live shock bolts — see Bolt.ts and updateBolts(). Not
  // tracked via spritesByBrushId/areaColliders (those are for the area's
  // own fixed-at-build-time content); a bolt is spawned dynamically mid-
  // play and checked/expired manually every frame instead.
  private bolts: Phaser.Physics.Arcade.Sprite[] = [];
  private outcome: "playing" | "won" | "lost" = "playing";
  /** Start-button pause. Separate from `outcome` because it is reversible
   * and does not end the run — update() short-circuits on either. */
  private paused = false;
  private pauseOverlay!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;
  private nextButton!: Phaser.GameObjects.Text;
  private stats: PlayerStats = createPlayerStats();
  // Optional (not `!`) — a "custom" background's texture is registered
  // async (see backgroundLoader.ts), so update() must not assume this
  // exists on the very first frame or two.
  private background?: StaticBackground;
  // Optional — most levels have no uploaded music at all (see
  // musicLoader.ts), and even when one does, loading it is async.
  private music?: Phaser.Sound.BaseSound;
  private hud!: Phaser.GameObjects.Text;
  private trophy!: Phaser.GameObjects.Image;
  // Tile coords of the last-touched checkpoint this play session, or
  // undefined for "no checkpoint touched yet, respawn at Spawn" — see
  // CheckpointCoord's docstring. Reset fresh (from `data.checkpoint`,
  // itself only ever set by restart()) on every init(), same lifecycle as
  // `world`/`returnScene`.
  private checkpoint?: CheckpointCoord;
  // Whichever checkpoint sprite is currently showing as "active" (tinted
  // — see activateCheckpoint), so touching a *different* one can revert
  // this one's tint without needing to search spritesByBrushId for it.
  // Reconstructed fresh in create() alongside every other sprite; not
  // threaded through restart() the way `checkpoint` itself is, since
  // create() re-derives it from `this.checkpoint` when spawning.
  private activeCheckpointSprite?: Phaser.GameObjects.Image;
  private toast!: Phaser.GameObjects.Text;
  // See TELEPORT_COOLDOWN_MS — set by useBasket, checked at its own top.
  private teleportCooldownUntil = 0;
  // The tile of the one basket that is currently refusing to fire, because
  // the player is still standing on it having just arrived. Scoped to that
  // single pad rather than to baskets in general, so that stepping straight
  // from one onto a neighbouring one still works — the case
  // TELEPORT_COOLDOWN_MS's own comment calls out (basket-sub then
  // immediately basket-up, both in Main). Cleared by update() on the first
  // frame the player is off it. See TELEPORT_COOLDOWN_MS for why a timer
  // alone was not enough.
  /** A custom character skin's frames, once resolved — null while nothing is
   * active (the ordinary case: Grampa's own art) and until the async resolve
   * lands, which update() handles by simply passing undefined through. */
  private characterFrameKeys?: FrameTextureKeys;
  /** Per animated enemy brush: its skin's frames, how many of them actually
   * loop, and one shared timer. Shared per brush rather than per sprite so
   * every ghost in an area flaps together — cheaper, and it reads as
   * deliberate rather than as a crowd out of sync. */
  private enemyLoops = new Map<string, { keys: FrameTextureKeys; length: number; state: LoopState }>();
  private latchedBasketTile?: { x: number; y: number };
  // Set by the basket overlap callbacks, which Arcade Physics runs after
  // update() each frame — so update() reads the previous frame's value,
  // which is exactly the "were they still on that pad last frame" question
  // being asked, and asks it without reference to any clock.
  private touchedLatchedBasket = false;
  // Every goal/chest/enemy/item/decor sprite spawned below, grouped by
  // its Palette brush id (equal to its EntityType for every one of these
  // — only Spawn's id/type differ, "spawn"/"player-spawn", and Spawn has
  // no sprite here at all) — see the resolveSkinTextureKeys call at the
  // end of create(), which patches in any custom skin via setTexture once
  // resolved. Populated by trackSprite as each is created.
  private spritesByBrushId = new Map<string, (Phaser.GameObjects.Image | Phaser.Physics.Arcade.Sprite)[]>();

  // The invented entity types this run knows about (see
  // entities/customEntity.ts). Resolved once in create(), before the first
  // area is built, and then read by every enterArea — a basket teleport must
  // not re-download the library, and must not build an area from a *different*
  // set of definitions than the one before it. Empty until it resolves, and
  // empty forever if Drive is unreachable, which is exactly the deleted-def
  // case: built-ins play normally and invented entities simply do not appear.
  private customEntities: CustomEntityDef[] = [];

  private trackSprite(brushId: string, sprite: Phaser.GameObjects.Image | Phaser.Physics.Arcade.Sprite): void {
    const list = this.spritesByBrushId.get(brushId) ?? [];
    list.push(sprite);
    this.spritesByBrushId.set(brushId, list);
  }

  constructor() {
    super("Play");
  }

  init(data: PlaySceneData): void {
    this.level = data.level;
    this.world = data.world;
    this.returnScene = data.returnScene;
    this.checkpoint = data.checkpoint;
    this.activeCheckpointSprite = undefined;
    this.outcome = "playing";
    this.paused = false;
    // Phaser reruns init()/create() on this same instance for a Restart, so
    // every character from the previous run has already been destroyed with
    // the old display list — dropping them here rather than relying on the
    // field initialiser is the same reason `areaBuilt` is reset below.
    this.players = [];
    this.enemies = [];
    this.stats = createPlayerStats();
    this.bolts = [];
    // Phaser reuses the scene instance across restart(), so these have to be
    // cleared here rather than relying on their field initialisers — a run
    // that ended while standing on a basket would otherwise start the next
    // one latched.
    this.latchedBasketTile = undefined;
    this.touchedLatchedBasket = false;
    this.characterFrameKeys = undefined;
    this.enemyLoops = new Map();
    // Phaser reuses this same PlayScene instance across every Test Play/
    // World/Template run rather than constructing a fresh one each time —
    // create() reruns, but a plain class-field initializer like
    // `= new Map()` only ever runs once, at the very first construction.
    // Without clearing it here, a second Play session would append this
    // run's freshly-created sprites onto the *previous* run's list rather
    // than starting clean — and since scene.stop() (leaving via Esc/win/
    // lose) destroys every sprite from the run before it, that stale list
    // ends up mixing live sprites with already-destroyed ones. Found via
    // exactly that: a real crash ("Cannot read properties of undefined
    // (reading 'sys')" inside setTexture) on a *second* Test Play of a
    // level with a skinned enemy — the skin-resolve pass below iterated
    // the first run's now-destroyed sprite right alongside the new one.
    this.spritesByBrushId = new Map();
    this.customEntities = [];
    this.areaZones = [];
    this.areaColliders = [];
    this.areaBuilt = false;
    this.runToken += 1;
  }

  /** Resolves an AreaKey to its actual data — undefined for "sub"/"up"
   * when the level never got one (see "Sub/Up areas" under Art); "main"
   * always resolves since it's just `this.level` itself. */
  private resolveArea(key: AreaKey): LevelArea | undefined {
    if (key === "sub") return this.level.subArea;
    if (key === "up") return this.level.upArea;
    return this.level;
  }

  /** The area whichever call is currently building — a thin wrapper around
   * resolveArea for the common "the current one" case, asserting non-null
   * since enterArea already confirmed the area it's about to switch
   * `currentAreaKey` to actually exists before calling this. */
  private area(): LevelArea {
    return this.resolveArea(this.currentAreaKey)!;
  }

  /** Which area the level actually starts in — wherever its Spawn marker
   * is, defaulting to Main when none of the three have one (matching
   * every pre-Sub/Up-areas level's own behavior exactly). Checked in a
   * fixed Main-then-Sub-then-Up order: Markers are singleton *per area*,
   * not a true cross-level singleton (see EditorScene's MARKER_TYPES), so
   * a level with Spawn placed in more than one area is possible but not
   * something the editor encourages — this picks one deterministically
   * rather than crashing or picking arbitrarily. */
  private startingAreaKey(): AreaKey {
    const order: AreaKey[] = ["main", "sub", "up"];
    for (const key of order) {
      const area = this.resolveArea(key);
      if (area?.entities.some((e) => e.type === "player-spawn")) return key;
    }
    return "main";
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CANVAS_BACKGROUND_COLOR);

    // Sound objects aren't scene-scoped in Phaser (scene.sound is the
    // game's shared SoundManager), so without this explicit stop+destroy
    // a level's music would keep playing after Esc/win/lose returns to
    // the editor or another level starts.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.music?.stop();
      this.music?.destroy();
    });

    // Both before anything that might build the area. The group is here rather
    // than in a field initialiser because Phaser reuses the scene instance
    // across a Restart; the bindings are here because a Key created later
    // cannot see a button that is already held — see soloInput.
    this.playerGroup = this.add.group();
    this.soloInput = createPlayerInput(this);

    // Body first, controls second: the shell is pure decoration in the bands
    // beside the level, and the controls sit on top of it.
    new HandheldShell(this, { onStart: () => this.togglePause() });
    this.touch = new TouchControls(this);
    this.makeCoopHint();

    this.hud = this.add
      .text(this.scale.width - 12, 8, "", {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0)
      .setDepth(30)
      .setScrollFactor(0);
    this.updateHud();

    this.toast = this.add
      .text(this.scale.width / 2, GRID_ORIGIN_Y + 24, "", {
        fontSize: "14px",
        color: "#4ade80",
        backgroundColor: "#000000aa",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5, 0)
      .setDepth(30)
      .setScrollFactor(0)
      .setAlpha(0);

    this.trophy = this.add
      .image(this.scale.width / 2, this.scale.height / 2 - 62, "trophy")
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.banner = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 20, "", {
        fontSize: "32px",
        color: "#ffffff",
        backgroundColor: "#000000cc",
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.hint = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 30, "", {
        fontSize: "14px",
        color: "#eeeeee",
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    // Tappable equivalents of the R/N/Esc hints above — the hint text is
    // keyboard-only wording, but there's no keyboard on a phone, so the win
    // and lose screens need real buttons too, not just a label.
    this.restartButton = this.makeOverlayButton(this.scale.width / 2 - 74, this.scale.height / 2 + 66, "Restart", () =>
      this.restart(),
    );
    this.nextButton = this.makeOverlayButton(this.scale.width / 2 + 74, this.scale.height / 2 + 66, "Next Level", () =>
      void this.nextLevel(),
    );

    // Moulded like the rest of the console rather than the flat web-panel blue
    // it used to wear. Centred in the left band's top strip, above the D-pad —
    // and the rect is the hit area now, so the whole button is clickable
    // instead of only the glyphs.
    makeConsoleButton(this, {
      x: LEFT_BAND.x + LEFT_BAND.width / 2,
      y: 21,
      width: 164,
      height: 26,
      label: `◀ ${this.backDestinationLabel().toUpperCase()} (ESC)`,
      depth: 30,
      fontSize: "11px",
      onPress: () => this.backToEditor(),
    });

    // Centred on the *screen*, not the canvas — the console's glass is what
    // the message belongs on, and the canvas centre happens to be the same
    // point only because the screen is centred in the shell.
    this.pauseOverlay = this.add
      .text(SCREEN_RECT.x + SCREEN_RECT.width / 2, SCREEN_RECT.y + SCREEN_RECT.height / 2, "PAUSED", {
        fontSize: "40px",
        color: "#ffffff",
        backgroundColor: "#000000bb",
        padding: { x: 24, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.input.keyboard?.on("keydown-P", () => this.togglePause());
    this.input.keyboard?.on("keydown-ESC", () => this.backToEditor());
    this.input.keyboard?.on("keydown-R", () => this.restart());
    this.input.keyboard?.on("keydown-N", () => void this.nextLevel());
    // A second person picks up the other half of the keyboard. Mid-level, with
    // no screen to visit and nothing saved — see addPlayer.
    this.input.keyboard?.on("keydown-ENTER", () => this.addPlayer());

    // The same four actions on a controller. Moving and jumping are not here —
    // those ride along with the on-screen controls via `mergePad` in update(),
    // because they are held rather than pressed. These are the opposite: one
    // press, one action, which is what `installPadNavigation` edge-detects.
    //
    // Confirm is deliberately overloaded and deliberately unambiguous: while
    // you are playing it is jump (handled in update, and this scene's update
    // returns early once the run is over, so the two can never both fire), and
    // once the run is over it is whatever the overlay is offering — forward on
    // a win, another go on a loss. That is the console convention, and it means
    // a whole world can be played without ever reaching for the mouse.
    installPadNavigation(this, {
      onPause: () => this.togglePause(),
      onBack: () => this.backToEditor(),
      onConfirm: () => {
        if (this.outcome === "won") void this.nextLevel();
        else if (this.outcome === "lost") this.restart();
      },
    });

    // Console palette, passed in rather than baked into VolumeControl: the same
    // control is the home page's, and restyling it there was not the ask. The
    // recess it sits in is drawn by HandheldShell, from the same constants.
    new VolumeControl(this, VOLUME_CONTROL.x, VOLUME_CONTROL.y, VOLUME_CONTROL.width, 30, {
      button: "#3a3d55",
      buttonHover: "#5a6088",
      track: 0x14161f,
      fill: 0x4ade80, // the power LED's green, so the console reads as one piece
      fillMuted: 0x4a4e68,
      thumb: 0xc8cbe0,
    });

    // A checkpoint carried forward by Restart (see CheckpointCoord's
    // docstring) wins outright over startingAreaKey's own Spawn-based
    // guess — that guess only exists for a *fresh* entry (Test Play/
    // World/Template/Next Level), which never carries a checkpoint at
    // all. Without this, restarting after dying in Sub/Up would silently
    // reopen in whichever area Spawn happens to live in (Main, almost
    // always) instead of the area the checkpoint itself remembers —
    // enterArea's own `checkpointHere` resolution only ever finds a match
    // once `currentAreaKey` is already set to that same area.
    // Composed *before* the area is built rather than swapped in after: the
    // ground tileset is baked into the tilemap at creation, so a late arrival
    // would mean destroying a live layer and its player collider. Blocks stay
    // built-in and the wait is a single already-cached storage read when the
    // level has no block skins at all.
    // Custom entity definitions are awaited alongside the tilesets for the same
    // reason: enterArea spawns from them, so arriving late would mean an area
    // built without its invented entities and no cheap way to add them after.
    // Both are already-cached reads on every run after the first.
    const token = this.runToken;
    void Promise.all([composeGroundTilesets(this, this.level.skins), loadCustomEntities().catch(() => [])]).then(
      ([keys, defs]) => {
        if (this.runToken !== token) return; // restarted (or a new level started) meanwhile
        this.groundTilesetKeys = keys;
        this.customEntities = defs;
        // Decoded once per run rather than on first use: a decode takes a frame
        // or two, and starting it when the coin is already being collected
        // means the first one of each is silent. Not awaited — a level must not
        // wait on its noises, and anything that fails is simply quiet (see
        // registerSound).
        for (const def of defs) {
          if (def.sound) void registerSound(this, soundKeyFor(def.id), def.sound);
        }
        this.enterArea(this.checkpoint?.area ?? this.startingAreaKey());
      },
    );
  }

  /**
   * Builds one playable character and everything that belongs only to them.
   *
   * Called once per player, from `enterArea`'s first build. It is deliberately
   * the *only* place a character comes into existence, so there is exactly one
   * answer to "what does a player consist of" — the sprite, its bindings, its
   * animation clock, its two accessory sprites. Before this, those four things
   * were created in three different methods, which is precisely why adding a
   * second of each looked harder than it is.
   *
   * The accessories used to be made in `create()`. They are made here now
   * because they belong to a character rather than to the scene; the (0, 0)
   * placeholder position they had is gone with it, since a player now exists
   * by the time its accessories do. They keep `setDepth(6)` for the one frame
   * before `updateAccessoryVisuals` takes over — see that method.
   */
  private makePlayer(index: number, x: number, y: number, input: PlayerInputKeys): CoopPlayer {
    const sprite = this.physics.add.sprite(x, y, "wizard-idle");
    sprite.setOrigin(0.5, 1);
    applyWizardTexture(sprite, "wizard-idle");
    sprite.setCollideWorldBounds(true);
    this.playerGroup.add(sprite);
    return {
      sprite,
      // Handed in rather than made here, because when this runs is not when the
      // keyboard can first be typed at — see soloInput.
      input,
      anim: createWizardAnimState(),
      // White means "no tint at all" — see updateCharacterVisuals, which spells
      // it `clearTint()` so player one is byte-for-byte the solo character.
      baseTint: UNTINTED,
      // The console has one D-pad, and two people cannot share a phone.
      usesTouch: index === 0,
      jumpWasDown: false,
      attackWasDown: false,
      castFlashUntil: 0,
      downUntil: 0,
      slipper: this.add.image(x, y, "accessory-slippers").setDepth(6).setVisible(false),
      hat: this.add.image(x, y, "accessory-hat").setDepth(6).setVisible(false),
    };
  }


  /** The record behind a sprite an Arcade callback handed back. Undefined only
   * if a stale collider fired for a character that no longer exists, which the
   * callers treat as "nothing to do" rather than guessing at player one. */
  private playerFor(sprite: Phaser.GameObjects.GameObject): CoopPlayer | undefined {
    return this.players.find((p) => p.sprite === sprite);
  }

  /** Halfway between the characters — what the parallax background follows,
   * instead of one particular player's x. With one player it is exactly that
   * player's x, so nothing about a solo game moves. */
  private playerFocusX(): number {
    if (this.players.length === 0) return GRID_ORIGIN_X;
    return this.players.reduce((sum, p) => sum + p.sprite.x, 0) / this.players.length;
  }

  /** Tears down (if anything's currently built — a no-op the very first
   * call, from create() above) and rebuilds every area-scoped piece of
   * Play state for `key`: background, music, ground tilemap+collider,
   * player position, and every entity sprite/zone (goal/checkpoints/
   * baskets/enemies/items/chest/decor). What deliberately survives a call
   * to this — `stats`/the `players` themselves/`checkpoint` — is exactly what makes
   * a basket teleport read as walking through a door in the same level
   * rather than starting over; see currentAreaKey's docstring.
   *
   * `landingTile`, when given (a basket teleport — see useBasket), places
   * the player there instead of resolving this area's own checkpoint/
   * Spawn — that resolution only makes sense for "where do I start in
   * this area fresh," not "where do I arrive mid-level." */
  private enterArea(key: AreaKey, landingTile?: { x: number; y: number }): void {
    const area = this.resolveArea(key);
    if (!area) return; // defensive; every caller already confirmed key exists

    // Colliders/overlaps are destroyed *before* the zones/sprites/enemies
    // they reference (see areaColliders' own docstring), then everything
    // else area-scoped follows. groundCollider/background are tracked
    // individually (rebuilt fresh every call, not accumulated); the rest
    // are cleared arrays/maps. Guarded by areaBuilt (see its own
    // docstring) — skipped on the very first call after a fresh create()
    // (a plain Play launch, or Restart's scene.restart()), when
    // groundLayer/groundCollider/background/player are either unset or
    // stale references to GameObjects the *previous* run already tore
    // down, not anything this call is responsible for destroying itself.
    if (this.areaBuilt) {
      // Bolts are area-scoped in practice (they collide against this
      // area's groundLayer/enemies — see updateBolts()) even though
      // they're not tracked in areaColliders/spritesByBrushId, so a bolt
      // still in flight when a basket teleport fires must not survive
      // into the rebuilt area.
      for (const bolt of this.bolts) bolt.destroy();
      this.bolts = [];
      for (const collider of this.areaColliders) collider.destroy();
      this.areaColliders = [];
      this.groundCollider?.destroy();
      this.groundCollider = undefined;
      this.background?.destroy();
      this.background = undefined;
      this.groundLayer.tilemap.destroy();
      for (const zone of this.areaZones) zone.destroy();
      this.areaZones = [];
      for (const sprites of this.spritesByBrushId.values()) {
        for (const sprite of sprites) sprite.destroy();
      }
      this.spritesByBrushId = new Map();
      this.enemies = [];
      this.activeCheckpointSprite = undefined;
    }

    this.currentAreaKey = key;

    // Bounded to the area's actual width, not the (often wider, to fit the
    // editor's side panels) canvas — see StaticBackground's docstring.
    // Async since a "custom" background's texture isn't preloaded by
    // BootScene like every built-in one is — see backgroundLoader.ts.
    // Guarded against a second enterArea landing before this resolves
    // (e.g. basket-sub then immediately basket-up) overwriting the
    // *newer* area's background with a stale result.
    void resolveBackgroundTextureKey(this, area).then((textureKey) => {
      if (this.currentAreaKey !== key) return;
      this.background = new StaticBackground(this, area.width * TILE_SIZE, textureKey);
    });

    // A level whose music is "None" resolves to null and this is simply a
    // no-op. That used to be the common case for want of anything to pick —
    // the picker offered uploads and nothing else — which is what the four
    // built-in tunes fixed on 2026-09-19. It is still a real choice, though,
    // and still not a fallback: nothing lands here by default the way a
    // background lands on Meadow.
    this.music?.stop();
    this.music?.destroy();
    this.music = undefined;
    void resolveLevelMusicKey(this, area).then((musicKey) => {
      if (this.currentAreaKey !== key || !musicKey) return;
      this.music = this.sound.add(musicKey, { loop: true });
      this.music.play();
    });

    // One Tileset per ground skin, each claiming its own 6-wide gid range
    // (grass 0-5, desert 6-11, castle 12-17, snow 18-23 — see
    // groundAutotile.ts) so an area can freely mix all four skins' ground/
    // brick/bounce/hazard blocks on one layer instead of being locked to
    // whichever one tileset a level-wide theme used to pick.
    const map = this.make.tilemap({
      data: buildRenderGrid(area.layers.ground),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tilesets = GROUND_SKINS.map((skin, i) => {
      const tilesetKey = this.groundTilesetKeys[skin];
      return map.addTilesetImage(tilesetKey, tilesetKey, TILE_SIZE, TILE_SIZE, 0, 0, i * 6)!;
    });
    this.groundLayer = map.createLayer(0, tilesets, GRID_ORIGIN_X, GRID_ORIGIN_Y)!;
    // A second layer on the same map, drawing the mass's outline (see
    // groundEdges.ts). Blank then filled rather than data-constructed because
    // the map already took its size from the ground data above.
    const edgeTileset = map.addTilesetImage(
      GROUND_EDGE_TEXTURE_KEY,
      GROUND_EDGE_TEXTURE_KEY,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
      EDGE_GID_BASE,
    )!;
    this.edgeLayer = map.createBlankLayer("ground-edges", edgeTileset, GRID_ORIGIN_X, GRID_ORIGIN_Y)!;
    const edges = buildEdgeGrid(area.layers.ground);
    for (let y = 0; y < edges.length; y++) {
      for (let x = 0; x < edges[y].length; x++) {
        const mask = edges[y][x];
        if (mask !== -1) this.edgeLayer.putTileAt(EDGE_GID_BASE + mask, x, y);
      }
    }
    // Explicit rather than by creation order, which is genuinely wrong here: a
    // basket teleport rebuilds the tilemap while *reusing* the live player, so
    // both layers are appended after it and would draw over it. Nearly
    // invisible for the ground layer alone (the player stands in empty cells),
    // but not once there's an overlay. The background sits at -100 and
    // everything else at 0 or above.
    this.groundLayer.setDepth(-2);
    this.edgeLayer.setDepth(-1);
    // Lava isn't solid — standing in it is an instant hazard (see the
    // per-frame check in update()), not a floor to stand on. Water isn't
    // solid either, but for the opposite reason: it's swimmable, not a
    // hazard at all (see the swim handling in update()) — excluded here
    // via its own WATER_FRAMES set now that it no longer shares
    // HAZARD_FRAMES with lava.
    this.groundLayer.setCollisionByExclusion([-1, ...WATER_FRAMES, ...HAZARD_FRAMES]);

    const spawn = area.entities.find((e) => e.type === "player-spawn");
    // A checkpoint touched earlier this same play session, in this same
    // area (see CheckpointCoord's docstring — a checkpoint touched in a
    // *different* area has no bearing on where this one starts), takes
    // priority over the area's own Spawn marker when there's no explicit
    // `landingTile` (a basket teleport, which always wins outright).
    const checkpointHere = landingTile ? undefined : this.checkpoint?.area === key ? this.checkpoint : undefined;
    const respawnTile = landingTile ?? checkpointHere ?? spawn;
    const spawnX = respawnTile ? GRID_ORIGIN_X + respawnTile.x * TILE_SIZE + TILE_SIZE / 2 : GRID_ORIGIN_X + TILE_SIZE;
    // Bottom-anchored (see below), so Y is where the feet should land — the
    // top of the ground tile one row below the spawn/checkpoint/landing tile.
    const spawnY = GRID_ORIGIN_Y + (respawnTile ? (respawnTile.y + 1) * TILE_SIZE : TILE_SIZE);

    // Left/right only (checkUp/checkDown false below) — the player and
    // enemies must not walk/patrol past where the area's ground and
    // background actually end (see StaticBackground's mask, sized to
    // exactly this same `area.width * TILE_SIZE`), but jumping above the
    // top or falling past the bottom are both already meaningful on their
    // own (a normal jump arc, and the fall-off-the-area loss check in
    // update()) and must stay unobstructed. y/height are irrelevant with
    // both checks off; kept generous only so that stays true regardless.
    const areaLeftX = GRID_ORIGIN_X;
    const areaRightX = GRID_ORIGIN_X + area.width * TILE_SIZE;
    this.physics.world.setBounds(areaLeftX, -100000, areaRightX - areaLeftX, 200000, true, true, false, false);

    if (this.areaBuilt) {
      // **Everyone travels.** A basket teleport rebuilds the tilemap and every
      // collider, so a character left behind would be standing on a level that
      // no longer exists — this is not a preference about how co-op should
      // feel, it is the only coherent answer. They are spread along the row so
      // two do not land inside each other.
      this.players.forEach((player, index) => {
        player.sprite.setPosition(spawnX + index * SPAWN_SPACING_X, spawnY);
        (player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        // The per-frame pass in update() re-derives tint/angle authoritatively
        // anyway, so this is belt-and-braces — but a reused player carrying a
        // stale treatment into a freshly-built area for even one frame is
        // exactly the kind of thing that only shows up as a flicker later.
        if (player.baseTint === UNTINTED) player.sprite.clearTint();
        else player.sprite.setTint(player.baseTint);
        player.sprite.setAngle(0);
      });
    } else {
      this.players = [this.makePlayer(0, spawnX, spawnY, this.soloInput)];
    }
    // One collider per character, and the colliding sprite is *used* rather
    // than discarded. It was `(_player, tile)` until 2026-09-22, reading the
    // scene's one player instead — which with two of them would have meant
    // player two landing on a bounce block and launching player one.
    this.groundCollider = this.physics.add.collider(
      this.playerGroup,
      this.groundLayer,
      (sprite, tile) => this.onGroundCollide(sprite as Phaser.Physics.Arcade.Sprite, tile as Phaser.Tilemaps.Tile),
    );

    const goal = area.entities.find((e) => e.type === "goal");
    if (goal) {
      const goalX = GRID_ORIGIN_X + goal.x * TILE_SIZE + TILE_SIZE / 2;
      const goalY = GRID_ORIGIN_Y + goal.y * TILE_SIZE + TILE_SIZE / 2;
      const goalSprite = this.add.image(goalX, goalY, "goal-portal").setDepth(5);
      this.trackSprite("goal", goalSprite);
      this.tweens.add({
        targets: goalSprite,
        scale: { from: 1, to: 1.08 },
        yoyo: true,
        repeat: -1,
        duration: 900,
        ease: "Sine.easeInOut",
      });
      const goalZone = this.add.zone(goalX, goalY, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(goalZone, true);
      this.areaZones.push(goalZone);
      this.areaColliders.push(this.physics.add.overlap(this.playerGroup, goalZone, () => this.onWin()));
    }

    // Checkpoints have no per-level instance limit, unlike Spawn/Goal/Chest
    // — see Palette.ts's docstring on why Checkpoint is the one Marker
    // that behaves like Enemies/Items/Decor below rather than its Marker
    // siblings. Each spawns its own persistent sprite (unlike an item, a
    // checkpoint is never destroyed on touch — it stays visible, and stays
    // touchable, so backtracking to an earlier one can reactivate it) plus
    // an overlap zone that calls activateCheckpoint. A checkpoint whose
    // tile matches `checkpointHere` (this area's slice of `this.checkpoint`
    // — see above) starts already activated, so respawning after a death,
    // or teleporting back into this area, shows the right bell lit up
    // without needing the player to touch it again.
    for (const entity of area.entities.filter((e) => e.type === "checkpoint")) {
      const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
      const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
      const bell = this.add.image(x, y, "checkpoint-bell").setDepth(5);
      this.trackSprite("checkpoint", bell);
      const alreadyActive = checkpointHere?.x === entity.x && checkpointHere?.y === entity.y;
      if (alreadyActive) {
        bell.setTint(CHECKPOINT_ACTIVE_TINT);
        this.activeCheckpointSprite = bell;
      }
      const zone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(zone, true);
      this.areaZones.push(zone);
      this.areaColliders.push(
        this.physics.add.overlap(this.playerGroup, zone, () => this.activateCheckpoint(entity.x, entity.y, bell)),
      );
    }

    // Baskets (see "Sub/Up areas" under Art) — two-way teleport triggers
    // between Main and their own satellite area. Both types render with
    // the same texture (see Palette.ts) and only differ in which area they
    // pair with (see basketDestination/useBasket) — basket-up gets
    // UP_BASKET_TINT_COLOR (see its own docstring) so the two read as
    // visually distinct in gameplay too, not just the editor; cleared
    // again below if a custom skin ends up overriding this basket's
    // texture, so a player's own uploaded art is never involuntarily
    // recolored.
    for (const basketType of ["basket-sub", "basket-up"] as const) {
      for (const entity of area.entities.filter((e) => e.type === basketType)) {
        const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
        const basketSprite = this.add.image(x, y, "magic-basket").setDepth(5);
        if (basketType === "basket-up") basketSprite.setTint(UP_BASKET_TINT_COLOR);
        this.trackSprite(basketType, basketSprite);
        this.tweens.add({
          targets: basketSprite,
          scale: { from: 1, to: 1.06 },
          yoyo: true,
          repeat: -1,
          duration: 850,
          ease: "Sine.easeInOut",
        });
        const zone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
        this.physics.add.existing(zone, true);
        this.areaZones.push(zone);
        this.areaColliders.push(
          this.physics.add.overlap(this.playerGroup, zone, () => this.useBasket(basketType, { x: entity.x, y: entity.y })),
        );
      }
    }

    // Enemies/Items/Decor have no per-level instance limit (see Palette.ts),
    // so every matching entity spawns, not just the first — unlike the
    // Markers above (player-spawn/goal/chest/checkpoint/basket), which
    // EntityPlacer keeps singleton-per-area and so are looked up with
    // `.find` (except Checkpoint/basket, which are exceptions to that too
    // — see Palette.ts).
    for (const def of enemyDefs(this.customEntities)) {
      for (const entity of area.entities.filter((e) => e.type === def.type)) {
        const size = entity.size ?? DEFAULT_ENEMY_SIZE;
        const sprite = createPatrolEnemy(this, entity.x, entity.y, def.textureKey);
        // `sizeAs`, not `type`: hitbox proportions are keyed by built-in type,
        // and an invented enemy copies the one it is based on rather than
        // falling through to a generic box.
        applyEnemySize(sprite, def.sizeAs, size);
        // Stashed on the sprite itself (Phaser's own GameObject data store)
        // rather than a parallel map — the skin-resolve pass below needs
        // to know each individual sprite's own size again after a skin
        // swap, and spritesByBrushId only groups by brush id/type, losing
        // which instance had which size once two same-type enemies could
        // differ (this feature's whole point).
        sprite.setData("enemySize", size);
        // Same reason as the applyEnemySize call above — the skin-swap pass
        // re-applies the size after a texture change and only has the brush id
        // to go on, which for an invented enemy is not a built-in type.
        sprite.setData("enemySizeAs", def.sizeAs);
        this.trackSprite(def.type, sprite);
        // Clamped to the area's own left/right edges (not just its spawn
        // point) — see createGhostState's docstring — so an enemy placed
        // near an edge patrols back in, the same edge the player's own
        // setCollideWorldBounds above is held to.
        const state = createGhostState(sprite, areaLeftX, areaRightX, def.speedScale);
        this.enemies.push({ sprite, state, stompable: def.stompable, type: def.type });
        this.areaColliders.push(
          this.physics.add.overlap(this.playerGroup, sprite, (playerSprite) =>
            this.onPlayerEnemyOverlap(playerSprite as Phaser.Physics.Arcade.Sprite, sprite, def.stompable, def.type),
          ),
        );
      }
    }

    for (const type of itemTypes(this.customEntities)) {
      // textureKey === entityType for every built-in item brush (see
      // Palette.ts); an invented one wears the art of the item it copies until
      // a skin is drawn for it. The skip is unreachable while the registry
      // holds — it only lists types it could resolve — but this is the one
      // place that would otherwise spawn an image with no texture, so it stays.
      const itemTexture = textureKeyFor(this.customEntities, type);
      if (!itemTexture) continue;
      for (const entity of area.entities.filter((e) => e.type === type)) {
        const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
        const icon = this.add.image(x, y, itemTexture).setDepth(5);
        this.trackSprite(type, icon);
        this.tweens.add({ targets: icon, y: y - 6, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
        const zone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
        this.physics.add.existing(zone, true);
        this.areaZones.push(zone);
        this.areaColliders.push(this.physics.add.overlap(this.playerGroup, zone, () => this.collectItem(type, icon, zone)));
      }
    }

    const chestEntity = area.entities.find((e) => e.type === "chest");
    if (chestEntity) {
      const x = GRID_ORIGIN_X + chestEntity.x * TILE_SIZE + TILE_SIZE / 2;
      const y = GRID_ORIGIN_Y + chestEntity.y * TILE_SIZE + TILE_SIZE / 2;
      const chestSprite = this.add.image(x, y, "chest").setDepth(5);
      this.trackSprite("chest", chestSprite);
      const chestZone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(chestZone, true);
      this.areaZones.push(chestZone);
      this.areaColliders.push(
        this.physics.add.overlap(this.playerGroup, chestZone, () => this.tryOpenChest(chestSprite, chestZone)),
      );
    }

    // Decoration entities — plain static images, no physics body, no overlap:
    // purely visual, same as they look in the editor. Like Enemies/Items
    // above, every placed instance spawns.
    for (const type of decorTypes(this.customEntities)) {
      const decorTexture = textureKeyFor(this.customEntities, type); // see the item loop above
      if (!decorTexture) continue;
      for (const entity of area.entities.filter((e) => e.type === type)) {
        const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
        this.trackSprite(type, this.add.image(x, y, decorTexture).setDepth(3));
      }
    }

    // Custom skins (see "Custom skins" under Art) apply to gameplay too,
    // not just the editor — same async "pop in a moment later" tolerance
    // as the background/music resolves above; every sprite tracked via
    // trackSprite above has its texture swapped in place once this
    // resolves. Also re-normalizes display size (and, for enemies, the
    // physics body) after the swap — a skin can be uploaded at any
    // resolution up to skinUpload.ts's 128px cap, and setTexture alone
    // doesn't touch a sprite's current scale, so without this a skinned
    // enemy/item/decor/goal would render at its *uploaded* image's own
    // native size instead of a tile-appropriate one (a real bug: found
    // while verifying skins actually apply correctly in Test Play, not
    // just in the editor's own palette/grid preview). Guarded the same way
    // as background/music above against a stale result landing after the
    // player has already teleported elsewhere.
    // The character's own skin, resolved separately from the brush pass below
    // because the player isn't a placed entity and so isn't in
    // spritesByBrushId at all — it's the one sprite the whole skin system
    // never reached before this.
    void resolveFrameTextureKeys(this, CHARACTER_SKIN_ID, this.level.skins).then((keys) => {
      if (this.currentAreaKey !== key) return;
      this.characterFrameKeys = keys ?? undefined;
    });

    // `this.level.skins` is what makes a skin choice belong to this level
    // rather than to everyone — see skinSelection.ts. Level-wide, so every area
    // of the level resolves identically and a basket teleport can't change how
    // a ghost looks.
    void resolveSkinTextureKeys(this, this.level.skins).then((skinTextureKeys) => {
      if (this.currentAreaKey !== key) return;
      for (const [brushId, sprites] of this.spritesByBrushId) {
        const skinKey = skinTextureKeys.get(brushId);
        if (!skinKey) continue;
        for (const sprite of sprites) {
          sprite.setTexture(skinKey);
          // A custom skin is the player's own chosen art for this brush —
          // the default-only UP_BASKET_TINT_COLOR (applied above, before
          // this async resolve had a chance to land) shouldn't multiply
          // into it.
          if (brushId === "basket-up") sprite.clearTint();
          const enemySize = sprite.getData("enemySize") as EnemySize | undefined;
          const sizeAs = (sprite.getData("enemySizeAs") as EntityType | undefined) ?? (brushId as EntityType);
          if (enemySize) applyEnemySize(sprite as Phaser.Physics.Arcade.Sprite, sizeAs, enemySize);
          else applyDefaultSkinSize(sprite);
        }
      }
    });

    // Animated enemy skins: one resolve per brush that has any sprites in this
    // area, not per sprite, since every ghost shares one skin and one timer.
    for (const brushId of this.spritesByBrushId.keys()) {
      if (!framePlanFor(brushId)) continue;
      void Promise.all([
        resolveFrameTextureKeys(this, brushId, this.level.skins),
        resolveLoopLength(brushId, this.level.skins),
      ]).then(([keys, length]) => {
        if (this.currentAreaKey !== key || !keys) return;
        this.enemyLoops.set(brushId, { keys, length, state: createLoopState() });
      });
    }

    this.areaBuilt = true;
  }

  /**
   * Steps every animated enemy skin's frame. Only brushes with a resolved
   * multi-frame skin appear in `enemyLoops`, so a level with no custom enemy
   * art does nothing here beyond one empty-map iteration.
   *
   * `setTexture` rather than a Phaser animation, matching how every other
   * sprite in this game changes frame (see spriteLoop.ts for why). No
   * applyEnemySize call afterwards: all of one skin's frames are painted on
   * the same grid, so the frame dimensions this sizes from never change
   * between them — unlike the built-in-to-custom swap in the resolve pass,
   * where they do.
   */
  private updateEnemyAnimation(deltaMs: number): void {
    for (const [brushId, loop] of this.enemyLoops) {
      const frame = advanceLoop(loop.state, deltaMs, loop.length);
      const key = loop.keys.get(String(frame));
      if (!key) continue;
      for (const sprite of this.spritesByBrushId.get(brushId) ?? []) {
        if (sprite.texture.key !== key) sprite.setTexture(key);
      }
    }
  }

  /** Called on overlap with a basket zone (see the loop above) — teleports
   * to wherever the same-type basket sits in the paired area, through the
   * cooldown guard described at TELEPORT_COOLDOWN_MS. Does nothing if the
   * paired area doesn't exist yet, or exists but has no matching basket
   * placed in it (see "Sub/Up areas" under Art) — a level designer hits
   * this every time they place a basket in Main and forget the matching
   * one in Sub/Up (or place the wrong type in either spot, easy to do back
   * when both baskets looked identical — see UP_BASKET_TINT_COLOR), so it
   * surfaces a toast rather than staying fully silent the way this used to
   * (silent no-ops elsewhere, e.g. resolveStaticBackground's own fallback,
   * don't need one — the player never took an action expecting a visible
   * result). The cooldown is claimed up front for *both* outcomes so
   * standing on an inert basket doesn't retrigger the toast every physics
   * frame of continued overlap. */
  private useBasket(basketType: "basket-sub" | "basket-up", tile: { x: number; y: number }): void {
    // Only the pad the player is standing on from a previous teleport is
    // latched; any other basket is free to fire.
    if (this.latchedBasketTile && this.latchedBasketTile.x === tile.x && this.latchedBasketTile.y === tile.y) {
      this.touchedLatchedBasket = true;
      return;
    }
    if (this.time.now < this.teleportCooldownUntil) return;
    const destinationKey = basketDestination(basketType, this.currentAreaKey);
    if (!destinationKey) return;
    this.teleportCooldownUntil = this.time.now + TELEPORT_COOLDOWN_MS;
    // Latched up front for *both* outcomes, same reasoning as the cooldown
    // above: standing on an inert basket should surface the toast once, not
    // once per frame of continued overlap. For a successful teleport the
    // latch is re-pointed at the destination pad below, which is the one the
    // player actually ends up standing on.
    this.latchedBasketTile = tile;
    this.touchedLatchedBasket = true;
    const destinationArea = this.resolveArea(destinationKey);
    const matchingBasket = destinationArea?.entities.find((e) => e.type === basketType);
    if (!destinationArea || !matchingBasket) {
      const areaLabel = destinationKey === "sub" ? "Sub" : "Up";
      this.showToast(`No matching basket in ${areaLabel}`, WARNING_TOAST_COLOR);
      return;
    }
    // Re-point the latch at the pad being landed on, which is the one that
    // would otherwise fire again the instant the destination area's zones are
    // rebuilt underneath the player.
    this.latchedBasketTile = { x: matchingBasket.x, y: matchingBasket.y };
    this.enterArea(destinationKey, { x: matchingBasket.x, y: matchingBasket.y });
  }

  /**
   * Start (and P): freeze the level where it stands.
   *
   * Pauses the physics world as well as short-circuiting update(), because
   * Arcade keeps integrating gravity on its own — without it the player quietly
   * sinks through the floor of a "paused" game. Refuses to engage once the run
   * is over, so a pause overlay can never end up sitting on top of the win or
   * lose screen.
   */
  private togglePause(): void {
    if (this.outcome !== "playing") return;
    this.paused = !this.paused;
    if (this.paused) this.physics.pause();
    else this.physics.resume();
    this.pauseOverlay.setVisible(this.paused);
  }

  /** "Editor"/"Worlds"/"Templates" for the top-left back button; see
   * backDestinationPhrase for the lowercase, mid-sentence form used in the
   * win/lose hint text. */
  private backDestinationLabel(): string {
    if (this.world) return this.world.worldId ? "Map" : "Worlds";
    if (this.returnScene === "Templates") return "Templates";
    return "Editor";
  }

  private backDestinationPhrase(): string {
    if (this.world) return this.world.worldId ? "the map" : "Worlds";
    if (this.returnScene === "Templates") return "Templates";
    return "the editor";
  }

  /**
   * The invitation, and then the reminder.
   *
   * A feature nobody can find is not a feature. This sits in the empty stretch
   * of the left band between the back button and the D-pad — the one part of
   * the console with room for a line of text — wearing the shell's own muted
   * wordmark styling so it reads as moulded into the plastic rather than as a
   * notification.
   *
   * It has two jobs in sequence: before anyone joins it says how, and after
   * somebody has it stops asking and starts answering the next question, which
   * is "wait, which keys are mine?". The toast that fires on joining scrolls
   * away after a couple of seconds; this does not.
   */
  private makeCoopHint(): void {
    // In the empty stretch of the left band between the back button (y 8–34)
    // and the D-pad (CONTROL_ROW_Y), the one part of the console with room.
    this.coopButton = makeConsoleButton(this, {
      x: LEFT_BAND.x + LEFT_BAND.width / 2,
      y: 62,
      // Narrower than the back button above it, which is 164. It cannot match:
      // the power LED and its "ON" label sit at x = SCREEN_RECT.x - 18 = 172
      // (see HandheldShell), and a 164-wide button centred in the band reaches
      // x=177 and swallows them. 140 stops at 165. Tried the matching width for
      // tidiness, looked at it, and put it back — the layout invariants compare
      // only interactive *Text*, so a button sitting on top of a lamp is
      // something only a person looking at the screen will ever notice.
      width: 140,
      height: 26,
      label: "+ PLAYER 2",
      depth: 30,
      fontSize: "11px",
      onPress: () => this.addPlayer(),
    });

    // Sits behind the button and only shows once it is gone, so nothing that
    // looks pressable is inert.
    this.coopHint = this.add
      .text(LEFT_BAND.x + LEFT_BAND.width / 2, 52, "", {
        fontSize: "10px",
        color: "#5a5f85",
        fontStyle: "bold",
        align: "center",
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(30)
      .setVisible(false);
  }

  /**
   * Who is holding what, once two people are playing.
   *
   * Named by *device* rather than by key, because the answer depends on what is
   * plugged in — and on a tablet, which is what this was built for, "ARROWS"
   * and "WASD" name things that are not in the room. Re-read whenever the pad
   * count changes (see update), so plugging a second controller in mid-level
   * corrects the line rather than leaving it lying.
   */
  private coopSummary(): string {
    const pads = connectedPadCount();
    if (pads >= 2) return "P1  CONTROLLER 1\nP2  CONTROLLER 2";
    if (pads === 1) return "P1  SCREEN + ARROWS\nP2  CONTROLLER";
    return "P1  ARROWS + X\nP2  WASD + Q";
  }

  /**
   * What the toast says at the moment of joining.
   *
   * Reads the pad count for the same reason `coopSummary` does, and it is not a
   * nicety: this said "WASD to move, Q to zap" unconditionally, which with a
   * controller plugged in contradicted the line in the left band directly
   * beside it. Two pieces of the same screen telling a child two different
   * things about which buttons are theirs is worse than either one alone.
   */
  private coopJoinMessage(): string {
    const pads = connectedPadCount();
    if (pads >= 2) return "Player 2 joined! The second controller is yours";
    if (pads === 1) return "Player 2 joined! The controller is yours";
    return "Player 2 joined! WASD to move, Q to zap";
  }

  private makeOverlayButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    text.on("pointerdown", onClick);
    return text;
  }

  update(time: number, delta: number): void {
    if (this.outcome !== "playing") return;
    // create() no longer builds the area synchronously (it waits on the ground
    // tileset — see the composeGroundTilesets call there), so Phaser can tick
    // this before there is a player, a ground layer, or anything else below to
    // read.
    if (!this.areaBuilt) return;
    // Physics is paused too (see togglePause) — without that, gravity would
    // keep pulling the player down through a "paused" level.
    if (this.paused) return;

    // Re-arm the latched pad only once the player has actually stepped off
    // it. Arcade Physics runs its overlap callbacks after this method, so the
    // flag read here was set (or not) by the previous frame — "were they
    // still on that pad last frame", which is the question that matters and
    // does not depend on frame rate. See TELEPORT_COOLDOWN_MS for what this
    // replaced and why.
    if (!this.touchedLatchedBasket) this.latchedBasketTile = undefined;
    this.touchedLatchedBasket = false;

    // Keeps the two shock buttons showing whether they can actually do
    // anything — they are drawn either way so the diamond never changes
    // shape, but a faded pair reads as "not yet" rather than as broken. The
    // console has one set of buttons and player one holds it, so this is asked
    // once for the scene rather than once per character.
    this.touch.setAttackEnabled(this.stats.hasThunderHat);

    // Before anybody moves: whoever's time is up comes back. Doing it here
    // rather than inside the loop means a character revived this frame gets a
    // full frame of input like everyone else.
    this.revivePlayers(time);

    // Asked once for the frame rather than once per character: it is the same
    // answer for both, and it is also what keeps the co-op summary honest when
    // a controller is plugged in mid-level.
    const padCount = connectedPadCount();
    if (padCount !== this.lastPadCount) {
      this.lastPadCount = padCount;
      if (this.players.length > 1) this.coopHint.setText(this.coopSummary());
    }

    for (const player of this.players) {
      // A downed character has no body to move and no pose to strike — and
      // without this, updateAccessoryVisuals would helpfully put the slippers
      // and hat back on somebody who is not on screen.
      if (player.downUntil > 0) continue;
      this.updatePlayerFrame(player, time, delta, padCount);
    }

    this.updateEnemyAnimation(delta);
    // Halfway between the characters rather than one of them, so neither is the
    // one the world is "really" about. Identical to the old `player.x` while
    // there is only one — see playerFocusX.
    this.background?.update(this.playerFocusX());

    for (const enemy of this.enemies) {
      updateGhostPatrol(enemy.sprite, enemy.state, time);
    }
    this.updateBolts();

    for (const player of this.players) {
      if (player.downUntil > 0) continue;
      this.checkPlayerFooting(player);
    }
  }

  /**
   * One character's whole frame: read its input, resolve swimming and jumping,
   * move it, and put it in the right pose.
   *
   * Every rule in here was already written to take the sprite as an argument —
   * `updatePlayerMovement`, `updateWizardAnimation`, `resolveTint`. Only this
   * scene's bookkeeping was singular, which is why lifting the body of
   * `update()` into a method that takes a player is the entire change.
   *
   * The shared-pool consequences are real and deliberate: `resetDoubleJump`,
   * `useDoubleJump` and the thunder-hat cooldown all live in the one `stats`,
   * so one character landing re-arms the other's double jump. For a game two
   * people play in the same room that reads as generous rather than wrong, and
   * it is what keeps the HUD — and `collectItem`, and the chest — untouched.
   */
  private updatePlayerFrame(player: CoopPlayer, time: number, delta: number, padCount: number): void {
    const sprite = player.sprite;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    // A controller joins the on-screen buttons rather than replacing them, the
    // same way those already join the keyboard — so there is no input mode to
    // be in and nothing has to guess which device you meant. This one line is
    // the whole of gameplay pad support: everything below reads `touch`, so
    // walking, jumping, swimming and the shock attack all come along. `mergePad`
    // returns a new object; writing into this one would leave an on-screen
    // button lit after the pad let go.
    //
    // Only player one reads the D-pad (see `usesTouch`): there is one cluster
    // on the console and two people cannot share a phone.
    //
    // **Which pad is asked for every frame rather than remembered.** This read
    // `currentPad()` with no argument until 2026-09-23, so both characters were
    // driven by pad 0: one controller moved the pair of them, and a second
    // controller did nothing at all. See padForPlayer for who gets what, and
    // why the count is re-read rather than stored — a controller plugged in
    // mid-level has to just start working.
    const pad = padForPlayer(this.players.indexOf(player), this.players.length, padCount);
    const touch = mergePad(
      player.usesTouch ? this.touch.get() : NO_TOUCH,
      pad === null ? NO_PAD : currentPad(pad),
    );
    const jumpDown = isJumpPressed(player.input, touch);
    const justPressedJump = jumpDown && !player.jumpWasDown;
    player.jumpWasDown = jumpDown;

    // Submersion is checked at roughly waist height (half a tile above the
    // bottom-anchored player.y — see the sprite's setOrigin(0.5, 1) above)
    // rather than at the feet, so a player merely standing on a submerged
    // floor (body.blocked.down true) doesn't get floaty swim controls —
    // only genuinely swimming through open water does.
    const waistTile = this.groundLayer.getTileAtWorldXY(sprite.x, sprite.y - TILE_SIZE / 2);
    const inWater = !!waistTile && WATER_FRAMES.has(waistTile.index);
    const swimming = inWater && !body.blocked.down;

    if (body.blocked.down) {
      resetDoubleJump(this.stats);
      // A grounded jump is applied further down, inside updatePlayerMovement —
      // PlayerController is where the jump lives and it has no business knowing
      // about audio, so the sound mirrors its condition here instead.
      //
      // `jumpDown` rather than `justPressedJump`, because that *is* the
      // condition it uses: holding jump through a landing bunny-hops, and a
      // press-edge test would silently skip the sound for exactly those jumps.
      // It cannot repeat, either — one frame later the player is airborne and
      // `blocked.down` is false.
      if (jumpDown) playSfx(this, "jump");
    } else if (swimming) {
      // Direct per-frame vertical control instead of the normal jump/
      // gravity branches below — held jump/up swims up, released gently
      // sinks, matching updatePlayerMovement's own per-frame
      // setVelocityX pattern rather than fighting gravity with a one-off
      // impulse.
      body.setVelocityY(jumpDown ? SWIM_UP_VELOCITY : SWIM_SINK_VELOCITY);
    } else if (justPressedJump && canDoubleJump(this.stats, body.blocked.down)) {
      body.setVelocityY(JUMP_VELOCITY);
      useDoubleJump(this.stats);
      playSfx(this, "jump");
    }

    const attackDown = isAttackPressed(player.input, touch);
    const justPressedAttack = attackDown && !player.attackWasDown;
    player.attackWasDown = attackDown;
    if (justPressedAttack && canFireThunderHat(this.stats, time)) {
      this.fireThunderBolt(player, time);
    }

    updatePlayerMovement(sprite, player.input, touch, speedMultiplierAt(this.stats, time) * (swimming ? SWIM_SPEED_MULTIPLIER : 1));
    // The cast pose used to be re-applied here as a special case *after* the
    // animation had already picked a frame; it's now just one more situation
    // the resolver ranks (see characterState.resolveSituation), so swimming
    // and casting can't fight over the sprite the way an override tacked on
    // afterward could.
    const situation = updateWizardAnimation(sprite, player.anim, delta, {
      outcome: this.outcome,
      swimming,
      casting: time < player.castFlashUntil,
      frameKeys: this.characterFrameKeys,
    });
    this.updateCharacterVisuals(player, situation, time);
    this.updateAccessoryVisuals(player);
  }

  /** What the ground under one character does to them: lava, and the drop off
   * the bottom of the area. Split out of the per-player pass above so it keeps
   * its original place in the frame — after the bolts have moved, not before —
   * since either branch can end the run. */
  private checkPlayerFooting(player: CoopPlayer): void {
    if (this.outcome !== "playing") return;
    const sprite = player.sprite;
    // Lava is a hazard, not solid ground (see the collision exclusion in
    // create()) — standing in it costs a hit exactly like a bad enemy
    // touch, debounced the same way via registerHit's grace period so it
    // doesn't drain multiple hearts per frame of continued contact. Water
    // used to be included here too; it's swimmable now (see above) and
    // never damages the player.
    const footTile = this.groundLayer.getTileAtWorldXY(sprite.x, sprite.y - 2);
    if (footTile && HAZARD_FRAMES.has(footTile.index)) {
      this.takeHit(player);
    }

    // Falling off the level is unconditional instant-loss, unlike a bad
    // enemy/hazard touch — Hearts and Shield don't apply here, since
    // "bounce back and keep playing" doesn't fit falling the way it fits
    // an on-screen hit.
    if (sprite.y > GRID_ORIGIN_Y + this.area().height * TILE_SIZE + 200) {
      this.knockOut(player);
    }
  }

  /**
   * One character goes down — and the run ends only if that was the last one
   * standing.
   *
   * **With one player this is `onLose()` and nothing else**, on the very same
   * frame, which is what keeps every existing spec honest: `every` over a
   * one-element array is true the moment that element is down. The hiding, the
   * timer and the respawn below are unreachable in a solo game.
   *
   * The sprite is hidden and its body disabled rather than destroyed, so every
   * collider that already names it survives the trip — see `playerGroup`.
   */
  private knockOut(player: CoopPlayer): void {
    if (this.outcome !== "playing" || player.downUntil > 0) return;
    player.downUntil = this.time.now + RESPAWN_DELAY_MS;

    if (this.players.every((p) => p.downUntil > 0)) {
      this.onLose();
      return;
    }

    player.sprite.setVisible(false);
    (player.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    player.slipper.setVisible(false);
    player.hat.setVisible(false);
    this.showToast(`Player ${this.players.indexOf(player) + 1} is down — hang on!`, WARNING_TOAST_COLOR);
  }

  /** Puts a fallen character back on their feet once their time is up, at
   * wherever this area says a player starts — the checkpoint if one has been
   * touched here, otherwise the Spawn marker. They arrive with the shared
   * invincibility already running (see registerHit), so they are not knocked
   * straight back down by whatever they landed in. */
  private revivePlayers(now: number): void {
    for (const player of this.players) {
      if (player.downUntil === 0 || now < player.downUntil) continue;
      player.downUntil = 0;
      const { x, y } = this.respawnPoint();
      player.sprite.setPosition(x, y);
      player.sprite.setVisible(true);
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      body.enable = true;
      body.setVelocity(0, 0);
      player.anim = createWizardAnimState();
    }
  }

  /** Where a character starts in the area they are currently in: the
   * checkpoint they have touched *here* if there is one, else this area's Spawn
   * marker, else the top-left fallback. The same resolution `enterArea` does
   * for a fresh entry, kept in one place so a respawn cannot drift from it. */
  private respawnPoint(): { x: number; y: number } {
    const area = this.area();
    const here = this.checkpoint?.area === this.currentAreaKey ? this.checkpoint : undefined;
    const tile = here ?? area.entities.find((e) => e.type === "player-spawn");
    return {
      x: tile ? GRID_ORIGIN_X + tile.x * TILE_SIZE + TILE_SIZE / 2 : GRID_ORIGIN_X + TILE_SIZE,
      // Bottom-anchored, like enterArea's own spawnY: the feet land on top of
      // the ground tile one row below.
      y: GRID_ORIGIN_Y + (tile ? (tile.y + 1) * TILE_SIZE : TILE_SIZE),
    };
  }

  /**
   * A second person picks up the other half of the keyboard.
   *
   * No screen, no menu, nothing persisted: press Enter mid-level and a second
   * character drops in beside the first. Player one's bindings narrow to the
   * arrows at that moment and not before — a solo game keeps arrows *and* WASD
   * exactly as it always has, so nobody loses a key to a feature they never
   * asked for.
   *
   * The new character is simply added to `playerGroup`, which is all it takes
   * for every collider in the level to start including them — see that field.
   */
  private addPlayer(): void {
    if (this.outcome !== "playing" || !this.areaBuilt) return;
    if (this.players.length >= 2) return;

    const one = this.players[0];
    one.input = createPlayerInput(this, "arrows");

    const spot = this.respawnPoint();
    const two = this.makePlayer(1, spot.x + SPAWN_SPACING_X, spot.y, createPlayerInput(this, "wasd"));
    two.baseTint = PLAYER_TWO_TINT;
    two.sprite.setTint(PLAYER_TWO_TINT);
    // No texture work here: makePlayer starts them on `wizard-idle`, and the
    // very next frame's updateWizardAnimation resolves this level's painted
    // character skin for them exactly as it does for player one. Both wear the
    // one CHARACTER_SKIN_ID skin, which is what keeps the Skin Creator and the
    // cut-scene cast out of co-op entirely.
    this.players.push(two);

    // The invitation has been taken up, so it stops being offered.
    this.coopButton.rect.destroy();
    this.coopButton.text.destroy();
    this.coopHint.setText(this.coopSummary()).setVisible(true);
    this.showToast(this.coopJoinMessage());
  }

  /** Bounce blocks are just another ground-layer tile (see groundAutotile's
   * BOUNCE_FRAMES, which covers both the shared and castle looks) — solid
   * collision is already automatic via setCollisionByExclusion, this only
   * adds the extra launch-upward effect on top of it. `body.blocked.down`
   * restricts it to landing on the pad's top face, so bumping one from the
   * side doesn't launch the player. */
  private onGroundCollide(sprite: Phaser.Physics.Arcade.Sprite, tile: Phaser.Tilemaps.Tile): void {
    if (!BOUNCE_FRAMES.has(tile.index)) return;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.down) return;
    body.setVelocityY(BOUNCE_VELOCITY_Y);
  }

  private onPlayerEnemyOverlap(
    playerSprite: Phaser.Physics.Arcade.Sprite,
    enemySprite: Phaser.Physics.Arcade.Sprite,
    stompable: boolean,
    type: PlaceableType,
  ): void {
    if (this.outcome !== "playing") return;
    const player = this.playerFor(playerSprite);
    if (!player) return;
    if (stompable && isStompFromAbove(playerSprite, enemySprite)) {
      this.enemies = this.enemies.filter((e) => e.sprite !== enemySprite);
      enemySprite.destroy();
      // An invented enemy's own noise replaces the built-in one, exactly as it
      // does for a collected item — same rule, same one-line shape.
      if (!this.playThingSound(type)) playSfx(this, "stomp");
      applyStompBounce(playerSprite);
    } else {
      this.takeHit(player);
    }
  }

  /** Spawns one shock bolt ahead of the player, in whichever direction
   * they're currently facing (player.flipX — see wizardAnimation.ts),
   * starts its cooldown, and briefly flashes the "wizard-cast" pose (see
   * CAST_FLASH_MS). The bolt itself is tracked in `bolts` and driven by
   * updateBolts() every frame from here on. */
  private fireThunderBolt(player: CoopPlayer, time: number): void {
    fireThunderHat(this.stats, time);
    const direction: 1 | -1 = player.sprite.flipX ? -1 : 1;
    const x = player.sprite.x + direction * BOLT_LAUNCH_OFFSET_X;
    const y = player.sprite.y - BOLT_LAUNCH_OFFSET_Y;
    const bolt = createBolt(this, x, y, direction, "bolt-projectile");
    bolt.setDepth(6);
    this.bolts.push(bolt);
    player.castFlashUntil = time + CAST_FLASH_MS;
  }

  /** Advances every live bolt one frame and resolves its fate: expired
   * (out of range — see isBoltExpired), blocked by solid ground (checked
   * via the same groundLayer tile lookup the water/hazard checks in
   * update() use, keyed off Tile.collides so it automatically matches
   * whatever setCollisionByExclusion configured — see its own call site),
   * or touching a live enemy — in which case, unlike a player stomp, *any*
   * enemy dies to it regardless of `stompable` (the confirmed design: the
   * shock is Spike Crawler's first-ever counter). Manual per-frame checks
   * rather than persistent Colliders — see Bolt.ts's own docstring for why. */
  private updateBolts(): void {
    for (const bolt of [...this.bolts]) {
      if (isBoltExpired(bolt)) {
        this.destroyBolt(bolt);
        continue;
      }
      const tile = this.groundLayer.getTileAtWorldXY(bolt.x, bolt.y);
      if (tile?.collides) {
        this.destroyBolt(bolt);
        continue;
      }
      const hitEnemy = this.enemies.find((enemy) => this.physics.overlap(bolt, enemy.sprite));
      if (hitEnemy) {
        this.enemies = this.enemies.filter((e) => e !== hitEnemy);
        hitEnemy.sprite.destroy();
        this.destroyBolt(bolt);
      }
    }
  }

  private destroyBolt(bolt: Phaser.Physics.Arcade.Sprite): void {
    bolt.destroy();
    this.bolts = this.bolts.filter((b) => b !== bolt);
  }

  /** Applies the matching PlayerStats effect for whichever item instance
   * was touched, removes that one sprite and its overlap zone, and
   * refreshes the HUD — a level can have several of the same item type
   * (see Palette.ts), each collected independently. Guarded by
   * `icon.active` since a physics overlap can fire more than once in the
   * same frame pair. */
  /**
   * Plays an invented thing's own noise, and says whether it had one.
   *
   * The return value is what makes a thing's sound *replace* the built-in it
   * borrows rather than layer on top of it: a hand-drawn coin should sound like
   * itself, which is the entire complaint this feature answers. A thing with no
   * sound of its own returns false and the built-in noise plays as before, so
   * nothing goes quiet by accident.
   */
  private playThingSound(type: PlaceableType): boolean {
    const spec = soundSpecFor(this.customEntities, type);
    if (!spec) return false;
    const key = soundKeyFor(isCustomEntityId(type) ? type : String(type));
    // Registered at load; if that decode failed or has not landed yet,
    // playSoundKey no-ops and we still report true — a thing that *has* a sound
    // of its own should not fall back to the coin's just because this one play
    // was too early. Silence is the honest outcome.
    playSoundKey(this, key);
    return true;
  }

  private collectItem(type: PlaceableType, icon: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone): void {
    if (!icon.active) return;
    // An invented item *is* the item it copies, as far as this method is
    // concerned: it resolves to a built-in type and falls straight into the
    // switch below, so there is still exactly one place that knows what a coin
    // does. Anything that fails to resolve is left alone rather than guessed
    // at — it just cannot be picked up.
    const effective = isCustomEntityId(type) ? collectAsFor(this.customEntities, type) : type;
    if (!effective) return;
    const now = this.time.now;
    // An invented thing's own noise replaces the borrowed one entirely. `sfx`
    // below is the built-in fallback, so the switch keeps naming the sound each
    // pickup *means* without having to know whether one will actually play.
    const own = this.playThingSound(type);
    const sfx = (name: SfxName): void => {
      if (!own) playSfx(this, name);
    };
    // One sound per case rather than a single "picked something up" noise: a
    // coin and a heart are different events to the player, and the whole reason
    // for having sound is that you can tell what happened without looking at
    // the HUD. The power-ups share the heart's chime — they are all "something
    // good, and it is not money" — rather than each getting a sound of its own
    // for a distinction nobody would learn.
    switch (effective) {
      case "item-coin":
        collectCoin(this.stats);
        sfx("coin");
        break;
      case "item-heart":
        collectHeart(this.stats);
        sfx("heart");
        break;
      case "item-speed":
        collectSpeed(this.stats, now);
        sfx("heart");
        break;
      case "item-feather":
        collectFeather(this.stats);
        sfx("heart");
        break;
      case "item-thunder-hat":
        collectThunderHat(this.stats);
        sfx("heart");
        break;
      case "item-shield":
        collectShield(this.stats, now);
        sfx("heart");
        break;
      case "item-key":
        collectKey(this.stats);
        sfx("key");
        break;
      default:
        return;
    }
    // Coins and Keys are collectibles, not power-ups — they change the HUD,
    // not what the character can do, so they don't get the celebratory pose.
    if (effective !== "item-coin" && effective !== "item-key") {
      // Everyone cheers, because everyone got it: the power-up went into the
      // one shared `stats`, so the arms-up pose belongs to the team rather than
      // to whichever character happened to walk into the sprite. With one
      // player this is the same single flash it always was.
      for (const player of this.players) {
        player.castFlashUntil = Math.max(player.castFlashUntil, now + POWERUP_FLASH_MS);
      }
    }
    icon.destroy();
    zone.destroy();
    this.updateHud();
  }

  /** Chest is a separate one-off entity, not part of the item list/collectItem
   * — unlike a plain item it doesn't always consume itself on touch, only
   * when a Key is actually held (see openChest's docstring), so it needs
   * its own guard against the sprite being destroyed already. */
  private tryOpenChest(sprite: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone): void {
    if (!sprite.active) return;
    if (openChest(this.stats) !== "opened") return;
    playSfx(this, "chest");
    sprite.destroy();
    zone.destroy();
    this.updateHud();
  }

  /** Called on overlap with any checkpoint bell — makes (tileX, tileY) the
   * respawn point Restart carries forward (see CheckpointCoord's
   * docstring) and gives the touched bell its active tint, reverting
   * whichever bell held that tint before. Guarded against the tile
   * already being the active checkpoint so walking back and forth across
   * an already-lit bell doesn't replay the toast/pulse or do redundant
   * work every physics frame of continued overlap — the same debounce
   * concern collectItem/tryOpenChest handle via `.active`, just keyed on
   * position here since a checkpoint's own sprite never gets destroyed. */
  private activateCheckpoint(tileX: number, tileY: number, sprite: Phaser.GameObjects.Image): void {
    if (this.checkpoint?.area === this.currentAreaKey && this.checkpoint?.x === tileX && this.checkpoint?.y === tileY) return;
    this.activeCheckpointSprite?.clearTint();
    sprite.setTint(CHECKPOINT_ACTIVE_TINT);
    this.activeCheckpointSprite = sprite;
    this.checkpoint = { area: this.currentAreaKey, x: tileX, y: tileY };
    this.tweens.add({ targets: sprite, scale: { from: 1.35, to: 1 }, duration: 260, ease: "Back.easeOut" });
    this.showToast("Checkpoint!");
  }

  /** Brief above-the-grid confirmation/warning — fades in, holds, fades
   * out, matching EditorUI.setStatus's shape (a message that clears itself
   * rather than needing an explicit dismiss) but via tweens instead of a
   * delayed setText("") swap, since this one also animates in rather than
   * just appearing. Restarting the fade-out timer on every call (via
   * killTweensOf) means a second toast firing while the first is still
   * fading doesn't cut it off mid-animation or stack two competing tweens
   * on the same Text object. `color` defaults to the "Checkpoint!" green;
   * pass WARNING_TOAST_COLOR for the "didn't happen" case (see useBasket). */
  private showToast(message: string, color = "#4ade80"): void {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(message).setColor(color).setAlpha(0);
    this.tweens.add({
      targets: this.toast,
      alpha: 1,
      duration: 150,
      yoyo: true,
      hold: CHECKPOINT_TOAST_MS,
      ease: "Sine.easeInOut",
    });
  }

  private updateHud(): void {
    const hearts = "♥".repeat(this.stats.extraHits);
    const key = this.stats.hasKey ? "  [Key]" : "";
    this.hud.setText(`Score: ${this.stats.score}${hearts ? "  " + hearts : ""}${key}`);
  }

  /** Applies whatever tint and tilt the current situation calls for — the
   * treatment half of the pose, with characterState owning the precedence
   * (see resolveTint/angleFor). Replaces the old updateBuffVisuals, which
   * only knew about Shield and Speed: a *survived* hit now flashes red
   * first instead of showing the same cyan a Shield does, and losing gets a
   * slumped, desaturated pose rather than freezing mid-stride.
   *
   * Called every frame while playing, and once directly from onWin/onLose —
   * update() early-returns once the run is over, so a terminal pose has to
   * be applied at the moment the outcome changes or it never lands. */
  private updateCharacterVisuals(player: CoopPlayer, situation: CharacterSituation, now: number): void {
    const reason = resolveTint({
      situation,
      hurtFlash: isHurtFlashing(this.stats, now),
      invincible: isInvincible(this.stats, now),
      speedBoosted: speedMultiplierAt(this.stats, now) > 1,
    });
    const color = TINT_COLORS[reason];
    // With no buff showing, the character wears its own colour — the one line
    // that lets player two be told apart without fighting the hurt flash and the
    // shield glow for the sprite every frame. A buff still wins, which is right:
    // for those few seconds the shield matters more than who is who.
    //
    // White is spelled `clearTint()` rather than `setTint(0xffffff)` even though
    // the two render identically. They are not identical to ask about: a
    // white-tinted sprite reports `isTinted === true`, which is a real
    // difference to anything inspecting the sprite, and it puts the sprite on
    // the tinted render path for no gain. So player one — whose base is white —
    // comes out of this byte-for-byte as it was before there was a second
    // player at all.
    if (color !== null) player.sprite.setTint(color);
    else if (player.baseTint === UNTINTED) player.sprite.clearTint();
    else player.sprite.setTint(player.baseTint);
    // Arcade Physics bodies stay axis-aligned regardless of the sprite's
    // angle, so this is provably cosmetic — it cannot move the hitbox the
    // 2026-08-19 gravity retune verified every template against.
    player.sprite.setAngle(angleFor(situation, player.sprite.flipX));
  }

  /** Freezes the character into a win/lose pose at the moment the run ends.
   * Separate from the per-frame path above because update() stops running
   * entirely once `outcome` changes, so this is the only chance to set it —
   * and because the walk timer must be reset too, or a character caught
   * mid-stride would resume on the wrong foot after Restart. */
  private applyTerminalPose(situation: "win" | "lose"): void {
    for (const player of this.players) {
      player.anim = createWizardAnimState();
      applyWizardTexture(player.sprite, frameFor(situation, 0));
      this.updateCharacterVisuals(player, situation, this.time.now);
    }
  }

  /** Keeps one character's Chicken Slipper/PJ Thunder Hat accessory sprites
   * glued to them, visible only once the matching PlayerStats flag is set.
   * They are the character's own (see CoopPlayer) rather than the scene's, so
   * two players each carry their own pair rather than sharing one that can
   * only be in one place — and they follow their character across a basket
   * teleport, exactly as the buff tint does.
   *
   * Sprite origin is (0.5, 1) (bottom-anchored — see wizardAnimation.ts), so
   * sprite.y is already the feet position for the slippers; the hat subtracts
   * FRAME_HEIGHT to land near the top of the sprite's frame instead.
   *
   * Visibility reads the *shared* stats, which is the deliberate consequence of
   * one pool: a Chicken Slipper picked up by either character puts slippers on
   * both. */
  private updateAccessoryVisuals(player: CoopPlayer): void {
    const sprite = player.sprite;
    player.slipper.setVisible(this.stats.hasDoubleJump);
    if (this.stats.hasDoubleJump) {
      player.slipper.setPosition(sprite.x, sprite.y - 2).setFlipX(sprite.flipX).setDepth(sprite.depth + 1);
    }
    player.hat.setVisible(this.stats.hasThunderHat);
    if (this.stats.hasThunderHat) {
      player.hat
        .setPosition(sprite.x, sprite.y - FRAME_HEIGHT + 6)
        .setFlipX(sprite.flipX)
        .setDepth(sprite.depth + 1);
    }
  }

  /** The single entry point for "player touched something bad" outside of
   * the unconditional fall-off-bottom check — see registerHit's docstring
   * for the invincible/absorbed/fatal decision. */
  private takeHit(player: CoopPlayer): void {
    const result = registerHit(this.stats, this.time.now);
    // Not on every result: "invincible" is what this returns for each physics
    // frame of a hit the i-frames are already absorbing, so playing there would
    // turn one bump into a burst of noise.
    if (result === "fatal") {
      playSfx(this, "hurt");
      this.knockOut(player);
    } else if (result === "absorbed") {
      playSfx(this, "hurt");
      applyStompBounce(player.sprite);
      this.updateHud();
    }
  }

  private onWin(): void {
    if (this.outcome !== "playing") return;
    this.outcome = "won";
    playSfx(this, "goal");
    // Recorded here rather than on the map, because N (next level) skips the
    // map entirely — banking it there would quietly lose every completion of
    // anyone who plays a world straight through. recordCompletion is
    // monotonic, so the map re-reporting the same win is harmless.
    if (this.world?.worldId) recordCompletion(this.world.worldId, this.world.index);
    for (const player of this.players) player.sprite.setVelocity(0, 0);
    this.applyTerminalPose("win");
    this.physics.pause();
    this.trophy.setVisible(true);

    const hasNextLevel = this.world && this.world.index + 1 < this.world.levelIds.length;
    if (hasNextLevel) {
      this.banner.setText("Level Complete!").setVisible(true);
      this.hint.setText("Press N for the next level, R to replay, or Esc for Worlds").setVisible(true);
      this.nextButton.setVisible(true);
    } else if (this.world) {
      this.banner.setText("World Complete!").setVisible(true);
      this.hint.setText("Press R to replay this level, or Esc for Worlds").setVisible(true);
    } else {
      this.banner.setText("You Win!").setVisible(true);
      this.hint.setText(`Press R to play again, or Esc for ${this.backDestinationPhrase()}`).setVisible(true);
    }
    this.restartButton.setVisible(true);
  }

  /** Only reachable once `onWin` has confirmed a next level exists (see the
   * hint text) — a stray N press elsewhere in the world flow, or outside
   * one entirely, is a no-op via the outcome/world guards below. */
  private async nextLevel(): Promise<void> {
    if (this.outcome !== "won" || !this.world) return;
    const nextIndex = this.world.index + 1;
    if (nextIndex >= this.world.levelIds.length) return;

    const nextLevel = await this.levelStorage.load(this.world.levelIds[nextIndex]);
    if (!nextLevel) {
      // The next level was deleted from My Levels after this world was
      // built — end the world here rather than crashing.
      this.banner.setText("World Complete!").setVisible(true);
      this.hint.setText("(the next level was deleted) Press Esc for Worlds").setVisible(true);
      this.nextButton.setVisible(false);
      this.world = undefined;
      return;
    }
    this.scene.start("Play", {
      level: nextLevel,
      world: { levelIds: this.world.levelIds, index: nextIndex, worldId: this.world.worldId, game: this.world.game },
    });
  }

  private onLose(): void {
    if (this.outcome !== "playing") return;
    this.outcome = "lost";
    for (const player of this.players) player.sprite.setVelocity(0, 0);
    this.applyTerminalPose("lose");
    this.physics.pause();
    this.banner.setText("You Lose").setVisible(true);
    this.hint.setText(`Press R to try again, or Esc for ${this.backDestinationPhrase()}`).setVisible(true);
    this.restartButton.setVisible(true);
  }

  private restart(): void {
    this.scene.restart({ level: this.level, world: this.world, returnScene: this.returnScene, checkpoint: this.checkpoint });
  }

  private backToEditor(): void {
    this.scene.stop();
    if (this.world?.worldId) {
      // The index is passed only so the map can walk the marker off the node
      // just beaten; the completion itself was banked in onWin.
      this.scene.start("WorldMap", {
        worldId: this.world.worldId,
        justCompletedIndex: this.outcome === "won" ? this.world.index : undefined,
        game: this.world.game,
      });
    }
    else if (this.world) this.scene.start("WorldBrowser");
    else if (this.returnScene) this.scene.start(this.returnScene);
    else this.scene.resume("Editor");
  }
}
