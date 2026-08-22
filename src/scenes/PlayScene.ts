import Phaser from "phaser";
import { VolumeControl } from "../audio/VolumeControl";
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
import { createPlayerInput, isAttackPressed, isJumpPressed, JUMP_VELOCITY, PlayerInputKeys, updatePlayerMovement } from "../gameplay/PlayerController";
import { resolveBackgroundTextureKey } from "../gameplay/backgroundLoader";
import { resolveLevelMusicKey } from "../gameplay/musicLoader";
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
import { TouchControls } from "../gameplay/TouchControls";
import { applyWizardTexture, createWizardAnimState, FRAME_HEIGHT, updateWizardAnimation, WizardAnimState } from "../gameplay/wizardAnimation";
import { BOUNCE_FRAMES, buildRenderGrid, HAZARD_FRAMES, WATER_FRAMES } from "../level/groundAutotile";
import { CANVAS_BACKGROUND_COLOR, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { AreaKey, DEFAULT_ENEMY_SIZE, EnemySize, EntityType, LevelArea, LevelData } from "../level/LevelSchema";
import { getLevelStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
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
// buff-tint convention (see updateBuffVisuals) of a flat setTint rather
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

/** Every item brush's textureKey equals its EntityType (see Palette.ts), so
 * spawning just needs the type list — no separate texture lookup like
 * ENEMY_DEFS needs. Items are collected via a static overlap zone, same
 * pattern as the goal below. */
const ITEM_TYPES: EntityType[] = ["item-coin", "item-heart", "item-speed", "item-feather", "item-thunder-hat", "item-shield", "item-key"];

/** Purely cosmetic — spawned as plain static images with no collision or
 * overlap logic (unlike every other entity list here), so a level looks
 * the same in Play as it does in the editor with zero gameplay effect. */
const DECOR_TYPES: EntityType[] = [
  "decor-bush",
  "decor-tree",
  "decor-cactus",
  "decor-lamp",
  "decor-cloud",
  "decor-snowman",
  "decor-sprout",
  "decor-mushroom",
  "decor-rocks",
  "decor-bat",
];

/** One entry per placeable enemy type — see the enemyDefs loop in create().
 * All four share the exact same patrol/bob movement (EnemyBehaviors.ts);
 * only the texture and whether a from-above hit stomps it (vs. costing the
 * player no matter how it's touched) differ. */
const ENEMY_DEFS: { type: EntityType; textureKey: string; stompable: boolean }[] = [
  { type: "enemy-ghost", textureKey: "enemy-ghost-pillow", stompable: true },
  { type: "enemy-bat", textureKey: "enemy-bat", stompable: true },
  { type: "enemy-spike", textureKey: "enemy-spike-crawler", stompable: false },
  { type: "enemy-golem", textureKey: "enemy-golem", stompable: true },
];

interface ActiveEnemy {
  sprite: Phaser.Physics.Arcade.Sprite;
  state: GhostState;
  stompable: boolean;
}

/** Present only when this level was launched from a World (WorldBrowserScene
 * "Play") rather than a standalone Test Play — see onWin/nextLevel. */
interface WorldPlayContext {
  levelIds: string[];
  index: number;
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

export class PlayScene extends Phaser.Scene {
  private level!: LevelData;
  private world?: WorldPlayContext;
  private returnScene?: string;
  private levelStorage: StorageAdapter = getLevelStorage();
  private player!: Phaser.Physics.Arcade.Sprite;
  // Which of Main/Sub/Up the player is currently in — see "Sub/Up areas"
  // under Art. Set once up front (see startingAreaKey) and again on every
  // basket teleport (see enterArea); everything below that used to
  // describe "the level" (groundLayer/background/music/every spawned
  // sprite) now describes "whichever area is current," torn down and
  // rebuilt by enterArea each time this changes — unlike a fresh Test
  // Play/restart, `stats` (score/hearts/buffs) and `player` itself are
  // deliberately *not* part of that teardown, so a teleport reads as
  // walking through a door in the same level, not starting over.
  private currentAreaKey: AreaKey = "main";
  // Guards enterArea's teardown block (and its player-reuse-vs-create
  // branch) against a real crash: `scene.restart()` (Restart — see
  // restart()) reruns init()/create() on this exact same PlayScene
  // *instance* rather than constructing a fresh one, same reason
  // spritesByBrushId gets explicitly reset in init() rather than relying
  // on a field initializer. Left alone, `groundLayer`/`groundCollider`/
  // `background`/`player` would carry over as stale references to
  // GameObjects Phaser already destroyed tearing down the previous run —
  // e.g. a destroyed TilemapLayer nulls out its own `.tilemap` property,
  // so `this.groundLayer.tilemap.destroy()` throws reading `.destroy` off
  // `undefined`. Reset to false in init() (a fresh run has nothing real to
  // tear down, and needs a new player sprite); set true at the end of
  // enterArea's first successful build. A basket teleport within the same
  // run (see useBasket) always finds this already true, so it correctly
  // tears down and reuses the *live* player rather than skipping either.
  private areaBuilt = false;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
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
  private input$!: PlayerInputKeys;
  private touch!: TouchControls;
  private wizardAnim: WizardAnimState = createWizardAnimState();
  private enemies: ActiveEnemy[] = [];
  // PJ Thunder Hat's live shock bolts — see Bolt.ts and updateBolts(). Not
  // tracked via spritesByBrushId/areaColliders (those are for the area's
  // own fixed-at-build-time content); a bolt is spawned dynamically mid-
  // play and checked/expired manually every frame instead.
  private bolts: Phaser.Physics.Arcade.Sprite[] = [];
  // Edge-detection for the attack input, same shape as jumpWasDown below —
  // the shock should fire once per press, not repeat every frame the key/
  // touch button stays held (the cooldown alone isn't enough: without this,
  // holding the key would still queue a shot the instant the cooldown
  // clears rather than requiring a fresh press).
  private attackWasDown = false;
  // See CAST_FLASH_MS.
  private castFlashUntil = 0;
  private outcome: "playing" | "won" | "lost" = "playing";
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;
  private nextButton!: Phaser.GameObjects.Text;
  private stats: PlayerStats = createPlayerStats();
  private jumpWasDown = false;
  // Optional (not `!`) — a "custom" background's texture is registered
  // async (see backgroundLoader.ts), so update() must not assume this
  // exists on the very first frame or two.
  private background?: StaticBackground;
  // Optional — most levels have no uploaded music at all (see
  // musicLoader.ts), and even when one does, loading it is async.
  private music?: Phaser.Sound.BaseSound;
  private hud!: Phaser.GameObjects.Text;
  private trophy!: Phaser.GameObjects.Image;
  // Chicken Slipper / PJ Thunder Hat equipped-accessory sprites — created
  // once in create() (like hud/toast/trophy above) and repositioned every
  // frame onto the player in updateAccessoryVisuals(), shown only once the
  // matching PlayerStats flag is set. Unlike the item sprites in
  // spritesByBrushId these aren't area-scoped: they follow the same player
  // sprite across a basket teleport, same as the buff tint in
  // updateBuffVisuals.
  private slipperAccessory!: Phaser.GameObjects.Image;
  private hatAccessory!: Phaser.GameObjects.Image;
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
    this.wizardAnim = createWizardAnimState();
    this.enemies = [];
    this.stats = createPlayerStats();
    this.jumpWasDown = false;
    this.bolts = [];
    this.attackWasDown = false;
    // Phaser reuses the scene instance across restart(), so these have to be
    // cleared here rather than relying on their field initialisers — a run
    // that ended while standing on a basket would otherwise start the next
    // one latched.
    this.latchedBasketTile = undefined;
    this.touchedLatchedBasket = false;
    this.characterFrameKeys = undefined;
    this.enemyLoops = new Map();
    this.castFlashUntil = 0;
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
    this.areaZones = [];
    this.areaColliders = [];
    this.areaBuilt = false;
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

    this.input$ = createPlayerInput(this);
    this.touch = new TouchControls(this);

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

    // Positioned for real every frame in updateAccessoryVisuals() once the
    // player exists — (0, 0) here is just a harmless placeholder before
    // enterArea's first build.
    this.slipperAccessory = this.add.image(0, 0, "accessory-slippers").setDepth(6).setVisible(false);
    this.hatAccessory = this.add.image(0, 0, "accessory-hat").setDepth(6).setVisible(false);

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

    const backLabel = this.add
      .text(8, 8, `← Back to ${this.backDestinationLabel()} (Esc)`, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 8, y: 6 },
      })
      .setDepth(30)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    backLabel.on("pointerdown", () => this.backToEditor());

    this.input.keyboard?.on("keydown-ESC", () => this.backToEditor());
    this.input.keyboard?.on("keydown-R", () => this.restart());
    this.input.keyboard?.on("keydown-N", () => void this.nextLevel());

    new VolumeControl(this, this.scale.width / 2 - 90, 20, 180, 30);

    // A checkpoint carried forward by Restart (see CheckpointCoord's
    // docstring) wins outright over startingAreaKey's own Spawn-based
    // guess — that guess only exists for a *fresh* entry (Test Play/
    // World/Template/Next Level), which never carries a checkpoint at
    // all. Without this, restarting after dying in Sub/Up would silently
    // reopen in whichever area Spawn happens to live in (Main, almost
    // always) instead of the area the checkpoint itself remembers —
    // enterArea's own `checkpointHere` resolution only ever finds a match
    // once `currentAreaKey` is already set to that same area.
    this.enterArea(this.checkpoint?.area ?? this.startingAreaKey());
  }

  /** Tears down (if anything's currently built — a no-op the very first
   * call, from create() above) and rebuilds every area-scoped piece of
   * Play state for `key`: background, music, ground tilemap+collider,
   * player position, and every entity sprite/zone (goal/checkpoints/
   * baskets/enemies/items/chest/decor). What deliberately survives a call
   * to this — `stats`/`player` itself/`checkpoint` — is exactly what makes
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

    // A level with no uploaded music (the common case — there's no
    // built-in fallback track the way there is for backgrounds) resolves
    // to null and this is simply a no-op.
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
      const tilesetKey = groundTilesetKey(skin);
      return map.addTilesetImage(tilesetKey, tilesetKey, TILE_SIZE, TILE_SIZE, 0, 0, i * 6)!;
    });
    this.groundLayer = map.createLayer(0, tilesets, GRID_ORIGIN_X, GRID_ORIGIN_Y)!;
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
      this.player.setPosition(spawnX, spawnY);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      // The per-frame pass in update() re-derives tint/angle authoritatively
      // anyway, so this is belt-and-braces — but a reused player carrying a
      // stale treatment into a freshly-built area for even one frame is
      // exactly the kind of thing that only shows up as a flicker later.
      this.player.clearTint();
      this.player.setAngle(0);
    } else {
      this.player = this.physics.add.sprite(spawnX, spawnY, "wizard-idle");
      this.player.setOrigin(0.5, 1);
      applyWizardTexture(this.player, "wizard-idle");
      this.player.setCollideWorldBounds(true);
    }
    this.groundCollider = this.physics.add.collider(this.player, this.groundLayer, (_player, tile) =>
      this.onGroundCollide(tile as Phaser.Tilemaps.Tile),
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
      this.areaColliders.push(this.physics.add.overlap(this.player, goalZone, () => this.onWin()));
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
      this.areaColliders.push(this.physics.add.overlap(this.player, zone, () => this.activateCheckpoint(entity.x, entity.y, bell)));
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
          this.physics.add.overlap(this.player, zone, () => this.useBasket(basketType, { x: entity.x, y: entity.y })),
        );
      }
    }

    // Enemies/Items/Decor have no per-level instance limit (see Palette.ts),
    // so every matching entity spawns, not just the first — unlike the
    // Markers above (player-spawn/goal/chest/checkpoint/basket), which
    // EntityPlacer keeps singleton-per-area and so are looked up with
    // `.find` (except Checkpoint/basket, which are exceptions to that too
    // — see Palette.ts).
    for (const def of ENEMY_DEFS) {
      for (const entity of area.entities.filter((e) => e.type === def.type)) {
        const size = entity.size ?? DEFAULT_ENEMY_SIZE;
        const sprite = createPatrolEnemy(this, entity.x, entity.y, def.textureKey);
        applyEnemySize(sprite, def.type, size);
        // Stashed on the sprite itself (Phaser's own GameObject data store)
        // rather than a parallel map — the skin-resolve pass below needs
        // to know each individual sprite's own size again after a skin
        // swap, and spritesByBrushId only groups by brush id/type, losing
        // which instance had which size once two same-type enemies could
        // differ (this feature's whole point).
        sprite.setData("enemySize", size);
        this.trackSprite(def.type, sprite);
        // Clamped to the area's own left/right edges (not just its spawn
        // point) — see createGhostState's docstring — so an enemy placed
        // near an edge patrols back in, the same edge the player's own
        // setCollideWorldBounds above is held to.
        const state = createGhostState(sprite, areaLeftX, areaRightX);
        this.enemies.push({ sprite, state, stompable: def.stompable });
        this.areaColliders.push(this.physics.add.overlap(this.player, sprite, () => this.onPlayerEnemyOverlap(sprite, def.stompable)));
      }
    }

    for (const type of ITEM_TYPES) {
      for (const entity of area.entities.filter((e) => e.type === type)) {
        const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
        // textureKey === entityType for every item brush (see Palette.ts).
        const icon = this.add.image(x, y, type).setDepth(5);
        this.trackSprite(type, icon);
        this.tweens.add({ targets: icon, y: y - 6, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
        const zone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
        this.physics.add.existing(zone, true);
        this.areaZones.push(zone);
        this.areaColliders.push(this.physics.add.overlap(this.player, zone, () => this.collectItem(type, icon, zone)));
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
      this.areaColliders.push(this.physics.add.overlap(this.player, chestZone, () => this.tryOpenChest(chestSprite, chestZone)));
    }

    // Decoration entities (see DECOR_TYPES) — plain static images, no
    // physics body, no overlap: purely visual, same as they look in the
    // editor. Like Enemies/Items above, every placed instance spawns.
    for (const type of DECOR_TYPES) {
      for (const entity of area.entities.filter((e) => e.type === type)) {
        const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
        this.trackSprite(type, this.add.image(x, y, type).setDepth(3));
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
    void resolveFrameTextureKeys(this, CHARACTER_SKIN_ID).then((keys) => {
      if (this.currentAreaKey !== key) return;
      this.characterFrameKeys = keys ?? undefined;
    });

    void resolveSkinTextureKeys(this).then((skinTextureKeys) => {
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
          if (enemySize) applyEnemySize(sprite as Phaser.Physics.Arcade.Sprite, brushId as EntityType, enemySize);
          else applyDefaultSkinSize(sprite);
        }
      }
    });

    // Animated enemy skins: one resolve per brush that has any sprites in this
    // area, not per sprite, since every ghost shares one skin and one timer.
    for (const brushId of this.spritesByBrushId.keys()) {
      if (!framePlanFor(brushId)) continue;
      void Promise.all([resolveFrameTextureKeys(this, brushId), resolveLoopLength(brushId)]).then(([keys, length]) => {
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

  /** "Editor"/"Worlds"/"Templates" for the top-left back button; see
   * backDestinationPhrase for the lowercase, mid-sentence form used in the
   * win/lose hint text. */
  private backDestinationLabel(): string {
    if (this.world) return "Worlds";
    if (this.returnScene === "Templates") return "Templates";
    return "Editor";
  }

  private backDestinationPhrase(): string {
    if (this.world) return "Worlds";
    if (this.returnScene === "Templates") return "Templates";
    return "the editor";
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

    // Re-arm the latched pad only once the player has actually stepped off
    // it. Arcade Physics runs its overlap callbacks after this method, so the
    // flag read here was set (or not) by the previous frame — "were they
    // still on that pad last frame", which is the question that matters and
    // does not depend on frame rate. See TELEPORT_COOLDOWN_MS for what this
    // replaced and why.
    if (!this.touchedLatchedBasket) this.latchedBasketTile = undefined;
    this.touchedLatchedBasket = false;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const touch = this.touch.get();
    const jumpDown = isJumpPressed(this.input$, touch);
    const justPressedJump = jumpDown && !this.jumpWasDown;
    this.jumpWasDown = jumpDown;

    // Submersion is checked at roughly waist height (half a tile above the
    // bottom-anchored player.y — see the sprite's setOrigin(0.5, 1) above)
    // rather than at the feet, so a player merely standing on a submerged
    // floor (body.blocked.down true) doesn't get floaty swim controls —
    // only genuinely swimming through open water does.
    const waistTile = this.groundLayer.getTileAtWorldXY(this.player.x, this.player.y - TILE_SIZE / 2);
    const inWater = !!waistTile && WATER_FRAMES.has(waistTile.index);
    const swimming = inWater && !body.blocked.down;

    if (body.blocked.down) {
      resetDoubleJump(this.stats);
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
    }

    const attackDown = isAttackPressed(this.input$, touch);
    const justPressedAttack = attackDown && !this.attackWasDown;
    this.attackWasDown = attackDown;
    if (justPressedAttack && canFireThunderHat(this.stats, time)) {
      this.fireThunderBolt(time);
    }

    updatePlayerMovement(this.player, this.input$, touch, speedMultiplierAt(this.stats, time) * (swimming ? SWIM_SPEED_MULTIPLIER : 1));
    // The cast pose used to be re-applied here as a special case *after* the
    // animation had already picked a frame; it's now just one more situation
    // the resolver ranks (see characterState.resolveSituation), so swimming
    // and casting can't fight over the sprite the way an override tacked on
    // afterward could.
    const situation = updateWizardAnimation(this.player, this.wizardAnim, delta, {
      outcome: this.outcome,
      swimming,
      casting: time < this.castFlashUntil,
      frameKeys: this.characterFrameKeys,
    });
    this.updateCharacterVisuals(situation, time);
    this.updateAccessoryVisuals();
    this.updateEnemyAnimation(delta);
    this.background?.update(this.player.x);

    for (const enemy of this.enemies) {
      updateGhostPatrol(enemy.sprite, enemy.state, time);
    }
    this.updateBolts();

    // Lava is a hazard, not solid ground (see the collision exclusion in
    // create()) — standing in it costs a hit exactly like a bad enemy
    // touch, debounced the same way via registerHit's grace period so it
    // doesn't drain multiple hearts per frame of continued contact. Water
    // used to be included here too; it's swimmable now (see above) and
    // never damages the player.
    const footTile = this.groundLayer.getTileAtWorldXY(this.player.x, this.player.y - 2);
    if (footTile && HAZARD_FRAMES.has(footTile.index)) {
      this.takeHit();
    }

    // Falling off the level is unconditional instant-loss, unlike a bad
    // enemy/hazard touch — Hearts and Shield don't apply here, since
    // "bounce back and keep playing" doesn't fit falling the way it fits
    // an on-screen hit.
    if (this.player.y > GRID_ORIGIN_Y + this.area().height * TILE_SIZE + 200) {
      this.onLose();
    }
  }

  /** Bounce blocks are just another ground-layer tile (see groundAutotile's
   * BOUNCE_FRAMES, which covers both the shared and castle looks) — solid
   * collision is already automatic via setCollisionByExclusion, this only
   * adds the extra launch-upward effect on top of it. `body.blocked.down`
   * restricts it to landing on the pad's top face, so bumping one from the
   * side doesn't launch the player. */
  private onGroundCollide(tile: Phaser.Tilemaps.Tile): void {
    if (!BOUNCE_FRAMES.has(tile.index)) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.down) return;
    body.setVelocityY(BOUNCE_VELOCITY_Y);
  }

  private onPlayerEnemyOverlap(enemySprite: Phaser.Physics.Arcade.Sprite, stompable: boolean): void {
    if (this.outcome !== "playing") return;
    if (stompable && isStompFromAbove(this.player, enemySprite)) {
      this.enemies = this.enemies.filter((e) => e.sprite !== enemySprite);
      enemySprite.destroy();
      applyStompBounce(this.player);
    } else {
      this.takeHit();
    }
  }

  /** Spawns one shock bolt ahead of the player, in whichever direction
   * they're currently facing (player.flipX — see wizardAnimation.ts),
   * starts its cooldown, and briefly flashes the "wizard-cast" pose (see
   * CAST_FLASH_MS). The bolt itself is tracked in `bolts` and driven by
   * updateBolts() every frame from here on. */
  private fireThunderBolt(time: number): void {
    fireThunderHat(this.stats, time);
    const direction: 1 | -1 = this.player.flipX ? -1 : 1;
    const x = this.player.x + direction * BOLT_LAUNCH_OFFSET_X;
    const y = this.player.y - BOLT_LAUNCH_OFFSET_Y;
    const bolt = createBolt(this, x, y, direction, "bolt-projectile");
    bolt.setDepth(6);
    this.bolts.push(bolt);
    this.castFlashUntil = time + CAST_FLASH_MS;
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
  private collectItem(type: EntityType, icon: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone): void {
    if (!icon.active) return;
    const now = this.time.now;
    switch (type) {
      case "item-coin":
        collectCoin(this.stats);
        break;
      case "item-heart":
        collectHeart(this.stats);
        break;
      case "item-speed":
        collectSpeed(this.stats, now);
        break;
      case "item-feather":
        collectFeather(this.stats);
        break;
      case "item-thunder-hat":
        collectThunderHat(this.stats);
        break;
      case "item-shield":
        collectShield(this.stats, now);
        break;
      case "item-key":
        collectKey(this.stats);
        break;
      default:
        return;
    }
    // Coins and Keys are collectibles, not power-ups — they change the HUD,
    // not what the character can do, so they don't get the celebratory pose.
    if (type !== "item-coin" && type !== "item-key") {
      this.castFlashUntil = Math.max(this.castFlashUntil, now + POWERUP_FLASH_MS);
    }
    icon.destroy();
    zone.destroy();
    this.updateHud();
  }

  /** Chest is a separate one-off entity, not part of ITEM_TYPES/collectItem
   * — unlike a plain item it doesn't always consume itself on touch, only
   * when a Key is actually held (see openChest's docstring), so it needs
   * its own guard against the sprite being destroyed already. */
  private tryOpenChest(sprite: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone): void {
    if (!sprite.active) return;
    if (openChest(this.stats) !== "opened") return;
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
  private updateCharacterVisuals(situation: CharacterSituation, now: number): void {
    const reason = resolveTint({
      situation,
      hurtFlash: isHurtFlashing(this.stats, now),
      invincible: isInvincible(this.stats, now),
      speedBoosted: speedMultiplierAt(this.stats, now) > 1,
    });
    const color = TINT_COLORS[reason];
    if (color === null) this.player.clearTint();
    else this.player.setTint(color);
    // Arcade Physics bodies stay axis-aligned regardless of the sprite's
    // angle, so this is provably cosmetic — it cannot move the hitbox the
    // 2026-08-19 gravity retune verified every template against.
    this.player.setAngle(angleFor(situation, this.player.flipX));
  }

  /** Freezes the character into a win/lose pose at the moment the run ends.
   * Separate from the per-frame path above because update() stops running
   * entirely once `outcome` changes, so this is the only chance to set it —
   * and because the walk timer must be reset too, or a character caught
   * mid-stride would resume on the wrong foot after Restart. */
  private applyTerminalPose(situation: "win" | "lose"): void {
    this.wizardAnim = createWizardAnimState();
    applyWizardTexture(this.player, frameFor(situation, 0));
    this.updateCharacterVisuals(situation, this.time.now);
  }

  /** Keeps the Chicken Slipper/PJ Thunder Hat accessory sprites glued to
   * the player, visible only once the matching PlayerStats flag is set —
   * see slipperAccessory/hatAccessory's own field docstring. Player origin
   * is (0.5, 1) (bottom-anchored — see wizardAnimation.ts), so player.y is
   * already the feet position for the slippers; the hat subtracts
   * FRAME_HEIGHT to land near the top of the sprite's frame instead. */
  private updateAccessoryVisuals(): void {
    this.slipperAccessory.setVisible(this.stats.hasDoubleJump);
    if (this.stats.hasDoubleJump) {
      this.slipperAccessory.setPosition(this.player.x, this.player.y - 2).setFlipX(this.player.flipX).setDepth(this.player.depth + 1);
    }
    this.hatAccessory.setVisible(this.stats.hasThunderHat);
    if (this.stats.hasThunderHat) {
      this.hatAccessory
        .setPosition(this.player.x, this.player.y - FRAME_HEIGHT + 6)
        .setFlipX(this.player.flipX)
        .setDepth(this.player.depth + 1);
    }
  }

  /** The single entry point for "player touched something bad" outside of
   * the unconditional fall-off-bottom check — see registerHit's docstring
   * for the invincible/absorbed/fatal decision. */
  private takeHit(): void {
    const result = registerHit(this.stats, this.time.now);
    if (result === "fatal") {
      this.onLose();
    } else if (result === "absorbed") {
      applyStompBounce(this.player);
      this.updateHud();
    }
  }

  private onWin(): void {
    if (this.outcome !== "playing") return;
    this.outcome = "won";
    this.player.setVelocity(0, 0);
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
    this.scene.start("Play", { level: nextLevel, world: { levelIds: this.world.levelIds, index: nextIndex } });
  }

  private onLose(): void {
    if (this.outcome !== "playing") return;
    this.outcome = "lost";
    this.player.setVelocity(0, 0);
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
    if (this.world) this.scene.start("WorldBrowser");
    else if (this.returnScene) this.scene.start(this.returnScene);
    else this.scene.resume("Editor");
  }
}
