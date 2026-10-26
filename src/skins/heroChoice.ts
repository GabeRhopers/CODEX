// Type-only, exactly as spriteFrames.ts imports it and for the same reason:
// keying the pose table by CharacterSituation makes adding a situation to the
// game a compile error here rather than a hero who silently reverts to Grampa
// the first time he swims. No runtime edge from the skins layer to the gameplay
// one, so this module still unit-tests without a `window`.
import type { CharacterSituation } from "../gameplay/characterState";

/**
 * Which **built-in** character a level is played as.
 *
 * There are two now, and the second one is the whole of this file. Grampa is a
 * wizard in a platformer; the metroidvania rooms needed a face of their own, so
 * a level can say it is played as Zink.
 *
 * **A hero is still a skin, and this does not change that.** PlayScene has
 * always asked `resolveFrameTextureKeys(this, CHARACTER_SKIN_ID, level.skins)`
 * for a `slot key → texture key` map and handed it to `situationTextureKey`;
 * a painted character works because that map exists. Zink is nothing more than
 * the same map, filled in from textures BootScene preloaded rather than from
 * art somebody painted — so he rides machinery that already exists and is
 * already tested, and nothing in the runtime had to learn a second way to be a
 * character.
 *
 * That is also the resolution order, and the order matters: **a painted skin
 * beats `level.hero`, which beats Grampa.** A child who drew their own hero
 * keeps them inside a room.
 */
export const BUILT_IN_HEROES = ["grampa", "zink"] as const;
export type BuiltInHeroId = (typeof BUILT_IN_HEROES)[number];

/** What a level with no `hero` field is played as — every level ever saved.
 * Stored nowhere: absent *is* Grampa, the same way absent `isRoom` is an
 * ordinary level. */
export const DEFAULT_HERO_ID: BuiltInHeroId = "grampa";

/** Who a level becomes when it is turned into a room. See
 * `heroWhenRoomTurnedOn`, which is the rule rather than this constant. */
export const ROOM_HERO_ID: BuiltInHeroId = "zink";

/**
 * Zink's six textures, preloaded by BootScene from `public/assets/zink/`.
 *
 * Same six poses and the same 48px frame height as `WIZARD_FRAME_KEYS`, which
 * is not a coincidence — `applyWizardTexture` offsets the physics body by
 * `FRAME_HEIGHT - BODY_HEIGHT`, so art of that height drops into the body
 * geometry the 2026-08-19 gravity retune was verified against and nothing about
 * the physics has to know which hero is on screen.
 */
export const ZINK_FRAME_KEYS = [
  "zink-idle",
  "zink-walk1",
  "zink-walk2",
  "zink-jump",
  "zink-cast",
  "zink-lose",
] as const;
export type ZinkFrameKey = (typeof ZINK_FRAME_KEYS)[number];

/** Where BootScene loads them from, beside the key list so the two cannot
 * drift into naming different files. */
export const ZINK_ASSET_DIR = "assets/zink";

/**
 * Which of Zink's textures each situation plays, in order.
 *
 * Deliberately the same shape of answer `characterState.ts` gives for Grampa —
 * one still per situation, two for a walk, the cast pose doing double duty as
 * the victory pose — because the two sets of art were drawn to the same brief.
 * Swimming borrows the jump pose for the reason recorded there: the water
 * already reads, and the tilt is what distinguishes the two.
 *
 * The mapping is spelled out rather than derived from `FRAME_BY_SITUATION`
 * because that table is private to the gameplay layer and this module must not
 * reach into it; `heroChoice.test.ts` pins the two against each other instead.
 */
const ZINK_POSES: Record<CharacterSituation, readonly ZinkFrameKey[]> = {
  idle: ["zink-idle"],
  walk: ["zink-walk1", "zink-walk2"],
  jump: ["zink-jump"],
  swim: ["zink-jump"],
  cast: ["zink-cast"],
  win: ["zink-cast"],
  lose: ["zink-lose"],
};

/**
 * `"walk.1"` — the slot key a painted skin's frames are registered under, and
 * the key `situationTextureKey` looks up.
 *
 * Written here rather than imported for the same reason `wizardAnimation.ts`
 * writes its own copy: neither module may depend on the other, and the test
 * pins them together. If a hero's frames were keyed any other way the lookup
 * would miss and every pose would fall back to Grampa — which is exactly the
 * failure `heroChoice.test.ts` asserts against.
 */
const slotKey = (situation: CharacterSituation, index: number): string => `${situation}.${index}`;

const ZINK_FRAME_MAP: ReadonlyMap<string, string> = new Map(
  Object.entries(ZINK_POSES).flatMap(([situation, keys]) =>
    keys.map((key, index) => [slotKey(situation as CharacterSituation, index), key] as const),
  ),
);

export function isBuiltInHeroId(value: unknown): value is BuiltInHeroId {
  return typeof value === "string" && (BUILT_IN_HEROES as readonly string[]).includes(value);
}

/**
 * The frame map for a level's `hero` field, or `null` for "use the built-in
 * art as it has always been".
 *
 * Takes `string | undefined` and not `BuiltInHeroId | undefined` on purpose.
 * `deserializeLevel` casts rather than validates every fixed-enum field (see
 * its own note on why only `skins` is sanitized), so an id that is misspelt,
 * hand-edited or saved by a future build arrives here as an ordinary string —
 * and lands on Grampa, which is the one answer that is never wrong. There is no
 * sanitizer for `hero` because this *is* the sanitizer.
 *
 * Grampa returns null rather than a map of `wizard-*` keys so his path through
 * `situationTextureKey` is byte-for-byte the one every level has always taken.
 * A map would be equivalent today and a second thing to keep in step forever.
 */
export function heroFrameKeys(hero: string | undefined): ReadonlyMap<string, string> | null {
  return hero === "zink" ? ZINK_FRAME_MAP : null;
}

/** His face, for anywhere that shows a hero rather than animating one — the
 * editor's hero picker. The companion to spriteFrames' HERO_TEXTURE_KEY, which
 * is Grampa's. */
export function heroTextureKey(hero: BuiltInHeroId): string {
  return hero === "zink" ? "zink-idle" : "wizard-idle";
}

/** What to call him on a button. */
export function heroName(hero: BuiltInHeroId): string {
  return hero === "zink" ? "Zink" : "Grampa";
}

/**
 * The level's `hero` after "Room: On" is tapped — **the rule the toggle asks
 * for**, rather than a line of logic inside a scene method.
 *
 * Turning a level into a room makes it a metroidvania room, and a metroidvania
 * room is Zink's. But only when nobody has said otherwise: a level that already
 * names a hero keeps it, and so does one that has pinned the built-in art
 * (`skinChoice === null`, which is a child explicitly asking for Grampa) or
 * chosen a painted character (`skinChoice` a skin id, which outranks this
 * field anyway). Only the untouched state — no hero, no skin choice — is
 * claimed.
 *
 * Turning Room **off** does not call this at all. A hero is left alone exactly
 * as already-placed doors are, and for the same reason: undoing a child's
 * character because they tapped a toggle is the worse of the two surprises.
 */
export function heroWhenRoomTurnedOn(
  current: BuiltInHeroId | undefined,
  skinChoice: string | null | undefined,
): BuiltInHeroId | undefined {
  if (current !== undefined) return current;
  if (skinChoice !== undefined) return current;
  return ROOM_HERO_ID;
}
