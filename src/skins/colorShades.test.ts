import { describe, expect, it } from "vitest";
import { formatHex, normalizeHex, parseHex, shadeColor, shadeRamp } from "./colorShades";

describe("parseHex / formatHex", () => {
  it("reads both cases, with and without the #", () => {
    expect(parseHex("#FFF1E8")).toEqual([255, 241, 232]);
    expect(parseHex("1a1c2c")).toEqual([26, 28, 44]);
  });

  it("rejects anything that isn't six hex digits", () => {
    for (const bad of ["", "#fff", "#12345g", "rgb(1,2,3)", "#1234567"]) {
      expect(parseHex(bad), bad).toBeNull();
    }
  });

  it("normalizes case so one colour has one spelling", () => {
    // The bundled palettes genuinely mix cases, so "is this colour already in
    // the list" would be wrong without this.
    expect(normalizeHex("#FFF1E8")).toBe(normalizeHex("#fff1e8"));
  });

  it("pads single-digit channels", () => {
    expect(formatHex([0, 1, 255])).toBe("#0001ff");
  });
});

describe("shadeColor", () => {
  it("mixes toward white and black by the given fraction", () => {
    expect(shadeColor("#000000", 0.25)).toBe("#404040");
    expect(shadeColor("#ffffff", -0.25)).toBe("#bfbfbf");
  });

  it("lightens black, which channel scaling cannot do", () => {
    // 0 x 1.25 is still 0 — the reason this mixes toward white instead.
    expect(shadeColor("#000000", 0.25)).not.toBe("#000000");
  });

  it("never leaves the 00-ff range", () => {
    for (const amount of [1, -1, 5, -5]) {
      const out = shadeColor("#808080", amount)!;
      expect(parseHex(out)!.every((c) => c >= 0 && c <= 255)).toBe(true);
    }
  });

  it("returns null rather than a guess for unparseable input", () => {
    expect(shadeColor("nonsense", 0.25)).toBeNull();
  });
});

describe("shadeRamp", () => {
  it("gives a darker and a lighter neighbour for a mid-tone", () => {
    const ramp = shadeRamp("#008751");
    expect(ramp.base).toBe("#008751");
    expect(ramp.darker).not.toBeNull();
    expect(ramp.lighter).not.toBeNull();
    expect(ramp.darker).not.toBe(ramp.base);
    expect(ramp.lighter).not.toBe(ramp.base);
  });

  it("drops the step that would do nothing at each extreme", () => {
    // A swatch that looks identical to the one beside it and changes nothing
    // when clicked is worse than one swatch fewer.
    expect(shadeRamp("#000000").darker).toBeNull();
    expect(shadeRamp("#000000").lighter).not.toBeNull();
    expect(shadeRamp("#ffffff").lighter).toBeNull();
    expect(shadeRamp("#ffffff").darker).not.toBeNull();
  });

  it("has no base at all for an unparseable colour", () => {
    expect(shadeRamp("").base).toBeNull();
  });
});
