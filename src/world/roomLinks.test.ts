import { describe, expect, it } from "vitest";
import {
  destinationFor,
  exitKey,
  oppositeSide,
  parseRoomLinks,
  reachableRooms,
  resolveRoomLinks,
  type RoomExit,
  type RoomLink,
} from "./roomLinks";

const exit = (levelId: string, side: RoomExit["side"]): RoomExit => ({ levelId, side });
const link = (a: RoomExit, b: RoomExit): RoomLink => [a, b];

/** Two rooms side by side: leave A's right edge, arrive at B's left. */
const PAIR: RoomLink[] = [link(exit("a", "right"), exit("b", "left"))];

describe("oppositeSide", () => {
  it("puts the player on the far edge of the next room", () => {
    // The whole illusion of adjacency: leave by the left, come in from the
    // right. Getting this backwards teleports the player across the new room.
    expect(oppositeSide("left")).toBe("right");
    expect(oppositeSide("right")).toBe("left");
    expect(oppositeSide("top")).toBe("bottom");
    expect(oppositeSide("bottom")).toBe("top");
  });

  it("is its own inverse, so a door is the same door from either side", () => {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      expect(oppositeSide(oppositeSide(side))).toBe(side);
    }
  });
});

describe("destinationFor", () => {
  it("finds the other end", () => {
    expect(destinationFor(PAIR, exit("a", "right"))).toEqual(exit("b", "left"));
  });

  it("works walking back the way you came", () => {
    // Load-bearing: a link is stored once, unordered. If this only resolved
    // left-to-right, every door would be a one-way trip and a metroidvania
    // would be unplayable in the direction it is mostly played.
    expect(destinationFor(PAIR, exit("b", "left"))).toEqual(exit("a", "right"));
  });

  it("says nothing for an edge with no door", () => {
    // Most edges of most rooms are walls. Null is the ordinary answer.
    expect(destinationFor(PAIR, exit("a", "left"))).toBeNull();
    expect(destinationFor(PAIR, exit("a", "top"))).toBeNull();
  });

  it("says nothing for a room that has no links at all", () => {
    expect(destinationFor(PAIR, exit("elsewhere", "right"))).toBeNull();
    expect(destinationFor([], exit("a", "right"))).toBeNull();
  });

  it("tells two sides of the same room apart", () => {
    const both = [link(exit("a", "right"), exit("b", "left")), link(exit("a", "left"), exit("c", "right"))];
    expect(destinationFor(both, exit("a", "right"))?.levelId).toBe("b");
    expect(destinationFor(both, exit("a", "left"))?.levelId).toBe("c");
  });
});

describe("resolveRoomLinks", () => {
  it("keeps a link whose rooms are both in the world", () => {
    expect(resolveRoomLinks(PAIR, ["a", "b"])).toEqual(PAIR);
  });

  it("drops a link to a level the world no longer holds", () => {
    // A world references levels by id and owns none of them, so a level can be
    // deleted from the library long after a link to it was written. That is a
    // normal state, not a corrupt file.
    expect(resolveRoomLinks(PAIR, ["a"])).toEqual([]);
    expect(resolveRoomLinks(PAIR, ["b"])).toEqual([]);
  });

  it("drops a door from an edge to itself", () => {
    expect(resolveRoomLinks([link(exit("a", "right"), exit("a", "right"))], ["a"])).toEqual([]);
  });

  it("allows a room to link to itself through two different edges", () => {
    // Odd, but legitimate — walking out the left and back in the right is a
    // loop a person might build on purpose, and nothing about it is broken.
    const loop = [link(exit("a", "left"), exit("a", "right"))];
    expect(resolveRoomLinks(loop, ["a"])).toEqual(loop);
  });

  it("gives an exit to the first link that claims it, not the last", () => {
    // A side is one door. First-wins rather than last-wins so that merely
    // re-saving a world in a different order cannot change where a door goes.
    const contested = [link(exit("a", "right"), exit("b", "left")), link(exit("a", "right"), exit("c", "left"))];
    const resolved = resolveRoomLinks(contested, ["a", "b", "c"]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0][1].levelId).toBe("b");
  });

  it("drops the second claim on the far end too", () => {
    const contested = [link(exit("a", "right"), exit("b", "left")), link(exit("c", "right"), exit("b", "left"))];
    expect(resolveRoomLinks(contested, ["a", "b", "c"])).toHaveLength(1);
  });

  it("survives a world with no links, and undefined links", () => {
    expect(resolveRoomLinks([], ["a"])).toEqual([]);
    expect(resolveRoomLinks(undefined, ["a"])).toEqual([]);
  });

  it("drops malformed entries without taking the good ones with them", () => {
    const mixed = [
      null,
      ["only-one-end"],
      [{ levelId: "a", side: "sideways" }, exit("b", "left")],
      [{ side: "right" }, exit("b", "left")],
      link(exit("a", "right"), exit("b", "left")),
    ] as unknown as RoomLink[];
    expect(resolveRoomLinks(mixed, ["a", "b"])).toEqual(PAIR);
  });
});

describe("reachableRooms", () => {
  it("includes the room you start in, even with no doors", () => {
    expect([...reachableRooms([], "a")]).toEqual(["a"]);
  });

  it("walks a chain of rooms", () => {
    const chain = [link(exit("a", "right"), exit("b", "left")), link(exit("b", "right"), exit("c", "left"))];
    expect([...reachableRooms(chain, "a")].sort()).toEqual(["a", "b", "c"]);
  });

  it("walks backwards as well as forwards", () => {
    const chain = [link(exit("a", "right"), exit("b", "left")), link(exit("b", "right"), exit("c", "left"))];
    expect([...reachableRooms(chain, "c")].sort()).toEqual(["a", "b", "c"]);
  });

  it("leaves out a room nothing connects to", () => {
    // The mistake this exists to catch: a room that is invisible in the editor
    // and obviously unreachable the moment somebody plays.
    const chain = [link(exit("a", "right"), exit("b", "left"))];
    expect(reachableRooms(chain, "a").has("island")).toBe(false);
  });

  it("terminates on a loop rather than walking it forever", () => {
    const loop = [
      link(exit("a", "right"), exit("b", "left")),
      link(exit("b", "right"), exit("a", "left")),
    ];
    expect([...reachableRooms(loop, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("parseRoomLinks", () => {
  it("accepts what it wrote", () => {
    expect(parseRoomLinks(JSON.parse(JSON.stringify(PAIR)))).toEqual(PAIR);
  });

  it("is undefined for anything that is not a list", () => {
    // Absent rather than empty, so parseWorld can spread it away and a world
    // with no links has no `roomLinks` key at all.
    for (const raw of [undefined, null, {}, "links", 7]) {
      expect(parseRoomLinks(raw)).toBeUndefined();
    }
  });

  it("is undefined when every entry was junk", () => {
    expect(parseRoomLinks([null, 1, "x"])).toBeUndefined();
  });

  it("keeps the good entries and drops the rest", () => {
    expect(parseRoomLinks([null, JSON.parse(JSON.stringify(PAIR[0]))])).toEqual(PAIR);
  });

  it("rejects an unknown side rather than passing it through", () => {
    // A side that is not one of the four would reach oppositeSide and come back
    // "top" by the fallthrough, sending the player somewhere nobody authored.
    expect(parseRoomLinks([[{ levelId: "a", side: "up" }, { levelId: "b", side: "left" }]])).toBeUndefined();
  });

  it("rejects an empty level id", () => {
    // A level is minted with id "" and keeps it until its first save, so an
    // exit linked before that would otherwise point at every unsaved level.
    expect(parseRoomLinks([[{ levelId: "", side: "right" }, { levelId: "b", side: "left" }]])).toBeUndefined();
  });
});

describe("exitKey", () => {
  it("tells sides and rooms apart", () => {
    expect(exitKey(exit("a", "left"))).not.toBe(exitKey(exit("a", "right")));
    expect(exitKey(exit("a", "left"))).not.toBe(exitKey(exit("b", "left")));
  });
});
