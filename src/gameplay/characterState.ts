/**
 * Which pose the player character is in right now, and how that pose should
 * be tinted/tilted — kept out of PlayScene so the branching ("does losing
 * beat casting?", "does a fresh hit beat an active Shield?") is unit-testable
 * without a Phaser scene, exactly like PlayerStats.ts. Nothing here touches a
 * GameObject; PlayScene owns applying the result.
 *
 * Deliberately built on the five sprites the character already has (see
 * public/assets/wizard/) rather than new art. Those frames are ~950-1010
 * distinct colors each with roughly a third of their pixels at partial alpha
 * — hand-drawn art, not palette-constrained pixel art — so the Skin Creator's
 * own 32x32/16-color canvas could never reproduce or re-edit them without
 * wrecking them (the same reason CustomSkins.ts's PixelSkinData docstring
 * gives for uploaded photos not being re-editable). Situations the five
 * frames don't literally cover — losing, swimming, being hurt — reuse the
 * closest existing frame plus a visual treatment instead of inventing art
 * that wouldn't match.
 */

/** The five textures BootScene preloads from public/assets/wizard/ — declared
 * here rather than imported from wizardAnimation.ts because this module owns
 * the situation→frame mapping and must not depend on the module that consumes
 * it. wizardAnimation's own WIZARD_FRAME_KEYS array is `satisfies`-checked
 * against this union, so the two can't drift. */
export type WizardFrameKey = "wizard-idle" | "wizard-walk1" | "wizard-walk2" | "wizard-jump" | "wizard-cast";

/** Every distinct thing the character can be *doing*, in priority order (see
 * resolveSituation). Deliberately no separate "fall": it would map to the
 * exact same frame and treatment as "jump", so it would be a branch that
 * encodes nothing — the jump frame already covers the whole airborne arc, as
 * it did before this module existed. */
export type CharacterSituation = "lose" | "win" | "cast" | "swim" | "jump" | "walk" | "idle";

/** Everything resolveSituation needs, gathered by the caller — a plain data
 * snapshot rather than the live Body/Scene, which is what keeps this testable.
 * `casting` covers both firing the PJ Thunder Hat and the brief flash on
 * collecting a power-up (see PlayScene's castFlashUntil); both show the same
 * triumphant pose, so they don't need separate situations. */
export interface CharacterMotion {
  outcome: "playing" | "won" | "lost";
  grounded: boolean;
  movingHorizontally: boolean;
  swimming: boolean;
  casting: boolean;
}

/**
 * The single decision point for "which pose is the character in", mirroring
 * registerHit's shape (one function the caller branches on, rather than the
 * same precedence re-derived at each call site).
 *
 * Order matters and is the whole point: an outcome (won/lost) outranks
 * everything because the run is over and nothing else should overwrite that
 * final pose; casting outranks movement so firing the shock reads even
 * mid-stride; swimming outranks jumping because in water the player is
 * *always* airborne by the grounded check, so the reverse order would make
 * the swim pose unreachable.
 */
export function resolveSituation(motion: CharacterMotion): CharacterSituation {
  if (motion.outcome === "lost") return "lose";
  if (motion.outcome === "won") return "win";
  if (motion.casting) return "cast";
  if (motion.swimming) return "swim";
  if (!motion.grounded) return "jump";
  if (motion.movingHorizontally) return "walk";
  return "idle";
}

/** Which of the five existing textures each situation draws with. Walk is the
 * only situation that alternates (see walkFrame), so it's handled in frameFor
 * rather than here. */
const FRAME_BY_SITUATION: Record<Exclude<CharacterSituation, "walk">, WizardFrameKey> = {
  // Slumping over is conveyed by the treatment (see angleFor/resolveTint), not
  // by a frame — a defeated pose is the one thing the five frames genuinely
  // don't contain.
  lose: "wizard-idle",
  // Unchanged from before this module existed: the cast pose doubles as the
  // victory pose, arms up.
  win: "wizard-cast",
  cast: "wizard-cast",
  // Water already surrounds the player and reads on its own; the tilt in
  // angleFor is what distinguishes swimming from an ordinary jump.
  swim: "wizard-jump",
  jump: "wizard-jump",
  idle: "wizard-idle",
};

export function frameFor(situation: CharacterSituation, walkFrame: 0 | 1): WizardFrameKey {
  if (situation === "walk") return walkFrame === 0 ? "wizard-walk1" : "wizard-walk2";
  return FRAME_BY_SITUATION[situation];
}

/** Why the character is tinted right now — resolved separately from the frame
 * because a tint is a *modifier* on whatever pose is showing (you can be hurt
 * while walking, or speed-boosted while jumping), not a pose of its own. Keeps
 * the split PlayScene's updateBuffVisuals already had. */
export type TintReason = "lose" | "hurt" | "shield" | "speed" | "none";

export const TINT_COLORS: Record<TintReason, number | null> = {
  // Desaturated slate — reads as "the run is over" against every one of this
  // game's backgrounds without being alarming for a kid who just lost.
  lose: 0x8892a6,
  // Red specifically so a *survived* hit stops looking identical to holding a
  // Shield: before this, an absorbed hit set invincibleUntil, so getting hurt
  // and being protected both showed the same cyan for over a second.
  hurt: 0xff6b6b,
  // Both unchanged from updateBuffVisuals' original values.
  shield: 0x66e0ff,
  speed: 0xffe066,
  none: null,
};

export interface CharacterTintInput {
  situation: CharacterSituation;
  /** See PlayerStats.isHurtFlashing — the brief window right after an
   * absorbed hit, a strict subset of the longer invincibility it grants. */
  hurtFlash: boolean;
  invincible: boolean;
  speedBoosted: boolean;
}

/** Shield still outranks speed (the stronger effect, and the two can't be
 * told apart by tint alone — the same reasoning updateBuffVisuals used), but
 * a fresh hit now outranks both so the flash is never swallowed by the very
 * invincibility that hit just granted. */
export function resolveTint(input: CharacterTintInput): TintReason {
  if (input.situation === "lose") return "lose";
  if (input.hurtFlash) return "hurt";
  if (input.invincible) return "shield";
  if (input.speedBoosted) return "speed";
  return "none";
}

/** Toppling-over angle for the lose pose, and the gentler lean that
 * distinguishes swimming from jumping. Applied via setAngle, which in Arcade
 * Physics rotates only what's *drawn* — bodies stay axis-aligned, so no
 * treatment here can change the hitbox. That matters: the 2026-08-19 gravity
 * retune verified every bundled template against a fixed 22x40 body (Desert
 * Canyon's pillar down to roughly a tile of margin), and a cosmetic pose must
 * not be able to invalidate that. */
const LOSE_ANGLE = 18;
const SWIM_ANGLE = 10;

/** Tilts toward the direction the character is facing, so both poses read as
 * falling/leaning *forward* rather than snapping to a fixed side regardless of
 * which way they were going. `facingLeft` is the sprite's own flipX (see
 * updateWizardAnimation), and a positive Phaser angle is clockwise. */
export function angleFor(situation: CharacterSituation, facingLeft: boolean): number {
  const magnitude = situation === "lose" ? LOSE_ANGLE : situation === "swim" ? SWIM_ANGLE : 0;
  // Explicit early return rather than falling through to the negation below:
  // `facingLeft ? -0 : 0` yields negative zero for every upright pose, which
  // renders identically but isn't `Object.is`-equal to 0 — a needless trap for
  // anything comparing angles.
  if (magnitude === 0) return 0;
  return facingLeft ? -magnitude : magnitude;
}
