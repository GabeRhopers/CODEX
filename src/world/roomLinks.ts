/**
 * Which room a door leads to.
 *
 * A metroidvania here is built from one-screen rooms with edge exits — walk off
 * an edge and the next room appears — like the original Zelda dungeons. That is
 * not a stylistic choice: CLAUDE.md fixes the canvas at 1050x468 and says the
 * camera never scrolls, and several features (local co-op needing no split
 * screen, for one) are simple *because* of it. Rooms joined at their edges are
 * how a bigger world is made without moving the camera.
 *
 * **One level is one room** (Gabriel, 2026-10-16). A world is the map of rooms,
 * so links live on the world, beside `layout` — which is also why this file
 * sits next to `worldLayout.ts` and borrows its stance: the stored data is
 * optional and partial by design, and resolving it tolerates anything missing
 * rather than refusing to open the world. A world saved before this existed has
 * no links and opens exactly as it did.
 *
 * Pure, no Phaser, so the rules are unit-testable on their own — the same split
 * `worldLayout.ts`, `worldProgress.ts` and `customEntity.ts` already use.
 */

/**
 * Which edge a room is left by.
 *
 * **An exit is identified by its side, and a room has at most one exit per
 * side.** The alternative — giving every exit an id of its own, as the Song of
 * Zink does with pairs like `["r1:1", "r2:1"]` — buys multiple doors on one
 * edge and costs a new field on `LevelEntity`, an id to mint, and a link that
 * silently dangles when somebody deletes the exit and draws a new one. A side
 * cannot dangle: it is derived from where the exit sits, so moving it along its
 * edge keeps the link, and "the left door of the cave" is also how a person
 * describes it when they are linking two rooms up.
 *
 * Four doors a room is the Zelda shape and is plenty for a first mode. If a
 * room ever needs two doors on one edge, that is the point to add an explicit
 * id — not before, because every link stored under this scheme would have to be
 * migrated to carry one.
 */
export type ExitSide = "left" | "right" | "top" | "bottom";

export const EXIT_SIDES: readonly ExitSide[] = ["left", "right", "top", "bottom"];

/** One end of a link: a room, and the edge you leave it by. */
export interface RoomExit {
  levelId: string;
  side: ExitSide;
}

/**
 * A door, stored as the pair of ends it joins.
 *
 * **Unordered and two-way.** Walking back through the door you just arrived at
 * has to return you, or a room can be a one-way trip by accident, and a
 * metroidvania is mostly about going back through doors you have already used.
 * Storing one pair rather than two directed entries is what makes that true by
 * construction instead of by a second entry somebody has to remember to write.
 */
export type RoomLink = readonly [RoomExit, RoomExit];

/** Where the player comes *in* when they leave by `side`. Leaving by the left
 * edge of one room puts you at the right edge of the next, which is the whole
 * illusion: the two screens read as adjacent. */
export function oppositeSide(side: ExitSide): ExitSide {
  if (side === "left") return "right";
  if (side === "right") return "left";
  if (side === "top") return "bottom";
  return "top";
}

const sameExit = (a: RoomExit, b: RoomExit): boolean => a.levelId === b.levelId && a.side === b.side;

const isExitSide = (value: unknown): value is ExitSide => EXIT_SIDES.includes(value as ExitSide);

const isRoomExit = (value: unknown): value is RoomExit => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const exit = value as Record<string, unknown>;
  return typeof exit.levelId === "string" && exit.levelId !== "" && isExitSide(exit.side);
};

/**
 * The links a world can actually use, given the levels it actually holds.
 *
 * Resolved rather than validated at save time, for the reason `resolveLayout`
 * gives: a world references its levels by id and owns none of them, so a level
 * can be deleted from the library long after a link to it was written. A
 * dangling link is therefore a normal state, not a corrupt file, and the honest
 * response is to ignore that door — the room stays playable with one fewer way
 * out, instead of the world refusing to open.
 *
 * Dropped, in this order, and each for its own reason:
 * - **either end naming a level this world does not hold** — the dangling case
 *   above, and also what a link left behind by removing a level looks like;
 * - **both ends being the same exit** — a door to itself is not a door;
 * - **an exit already spoken for by an earlier link** — a side is one door, so
 *   the first link wins and the rest are a half-finished edit, not a fork.
 *   First-wins rather than last-wins so the result does not change under a
 *   re-save that merely reorders the array.
 */
export function resolveRoomLinks(links: readonly RoomLink[] | undefined, levelIds: readonly string[]): RoomLink[] {
  if (!links || links.length === 0) return [];
  const known = new Set(levelIds);
  const taken = new Set<string>();
  const resolved: RoomLink[] = [];

  for (const link of links) {
    if (!Array.isArray(link) || link.length !== 2) continue;
    const [a, b] = link;
    if (!isRoomExit(a) || !isRoomExit(b)) continue;
    if (!known.has(a.levelId) || !known.has(b.levelId)) continue;
    if (sameExit(a, b)) continue;
    const keyA = exitKey(a);
    const keyB = exitKey(b);
    if (taken.has(keyA) || taken.has(keyB)) continue;
    taken.add(keyA);
    taken.add(keyB);
    resolved.push([a, b]);
  }
  return resolved;
}

/** `"levelId:side"` — an exit's identity as one string, for the Sets and Maps
 * above and below. Not a storage format: links are stored as the pair of
 * objects, so nothing has to parse a string back apart. */
export function exitKey(exit: RoomExit): string {
  return `${exit.levelId}:${exit.side}`;
}

/**
 * The other end of the door at `from`, or null if that edge leads nowhere.
 *
 * Null is an ordinary answer, not a failure: most edges of most rooms are
 * walls, and an exit whose link was dropped by `resolveRoomLinks` reads the
 * same way. The caller's job is to leave the player where they are.
 */
export function destinationFor(links: readonly RoomLink[], from: RoomExit): RoomExit | null {
  for (const [a, b] of links) {
    if (sameExit(a, from)) return b;
    if (sameExit(b, from)) return a;
  }
  return null;
}

/** Every room reachable from `startId` by walking through doors, including
 * itself. The world map's "visited" display will want this, and so will any
 * future check for a room nobody can get to — a mistake that is invisible in
 * the editor and obvious the moment somebody plays. */
export function reachableRooms(links: readonly RoomLink[], startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [a, b] of links) {
      // Each link is two ways out of one room into the other, so both ends are
      // checked against the room being expanded.
      const next = a.levelId === current ? b.levelId : b.levelId === current ? a.levelId : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Shape-checks links coming back out of storage. Anything unrecognisable is
 * dropped rather than rejecting the world, which is the same call
 * `parseWorld` already makes for `layout` and `background`. */
export function parseRoomLinks(raw: unknown): RoomLink[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const links: RoomLink[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [a, b] = entry;
    if (!isRoomExit(a) || !isRoomExit(b)) continue;
    links.push([
      { levelId: a.levelId, side: a.side },
      { levelId: b.levelId, side: b.side },
    ]);
  }
  return links.length > 0 ? links : undefined;
}
