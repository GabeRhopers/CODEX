import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampZoomIndex,
  contentSizeFor,
  FIT_INDEX,
  formatZoom,
  panForAnchor,
  stepZoomIndex,
  VIEWPORT_SIZE,
  ZOOM_FACTORS,
  zoomFactorAt,
} from "./canvasZoom";

describe("the zoom ladder", () => {
  it("puts fit — the whole sprite, exactly filling the window — at FIT_INDEX", () => {
    expect(ZOOM_FACTORS[FIT_INDEX]).toBe(1);
    expect(contentSizeFor(VIEWPORT_SIZE, FIT_INDEX)).toBe(VIEWPORT_SIZE);
  });

  it("beats the range it replaces by more than 10x, which is the whole point", () => {
    // The old clamp was [200, 320] — a 1.6x range. Anything less than a big
    // multiple of that is not worth the panning this change costs.
    const range = ZOOM_FACTORS[ZOOM_FACTORS.length - 1] / ZOOM_FACTORS[0];
    expect(range).toBeGreaterThan(16 * 0.9);
  });

  it("magnifies well past the old ceiling and shrinks past the old floor", () => {
    expect(contentSizeFor(VIEWPORT_SIZE, ZOOM_FACTORS.length - 1)).toBeGreaterThan(320);
    expect(contentSizeFor(VIEWPORT_SIZE, 0)).toBeLessThan(200);
  });

  it("rises monotonically, so a Zoom + click never shrinks anything", () => {
    for (let i = 1; i < ZOOM_FACTORS.length; i++) {
      expect(ZOOM_FACTORS[i], `step ${i}`).toBeGreaterThan(ZOOM_FACTORS[i - 1]);
    }
  });

  it("clamps at both ends rather than running off the array", () => {
    expect(stepZoomIndex(0, -5)).toBe(0);
    expect(stepZoomIndex(ZOOM_FACTORS.length - 1, 5)).toBe(ZOOM_FACTORS.length - 1);
    expect(zoomFactorAt(999)).toBe(ZOOM_FACTORS[ZOOM_FACTORS.length - 1]);
  });

  it("falls back to fit for a junk index rather than producing NaN sizes", () => {
    // Reachable through persisted tool state, which is the kind of thing that
    // survives a refactor holding a stale value.
    expect(clampZoomIndex(Number.NaN)).toBe(FIT_INDEX);
    expect(contentSizeFor(VIEWPORT_SIZE, Number.NaN)).toBe(VIEWPORT_SIZE);
  });

  it("reads back as a plain multiplier", () => {
    expect(formatZoom(FIT_INDEX)).toBe("×1");
    expect(formatZoom(0)).toBe("×0.5");
  });
});

describe("clampPan", () => {
  it("centres content that fits, so zooming out leaves the sprite mid-window", () => {
    expect(clampPan(0, 160, 320)).toBe(80);
    expect(clampPan(-500, 160, 320)).toBe(80); // any incoming pan is irrelevant
    expect(clampPan(0, 320, 320)).toBe(0); // exactly fitting is still "fits"
  });

  it("never lets a larger drawing leave a gutter", () => {
    // 640 content in a 320 window: the offset lives in [-320, 0], and either
    // end means one edge of the drawing is flush with one edge of the window.
    expect(clampPan(50, 640, 320)).toBe(0);
    expect(clampPan(-1000, 640, 320)).toBe(-320);
    expect(clampPan(-160, 640, 320)).toBe(-160);
  });

  it("can always reach every edge of the drawing at max zoom", () => {
    const content = contentSizeFor(VIEWPORT_SIZE, ZOOM_FACTORS.length - 1);
    expect(clampPan(Number.POSITIVE_INFINITY, content, VIEWPORT_SIZE)).toBe(0);
    expect(clampPan(Number.NEGATIVE_INFINITY, content, VIEWPORT_SIZE)).toBe(VIEWPORT_SIZE - content);
  });
});

describe("panForAnchor", () => {
  it("keeps the point under the cursor under the cursor", () => {
    // Zooming 2x about the window's middle: the content point that was at the
    // middle has to still be there afterwards.
    const pan = panForAnchor(0, 320, 640, 160, 320);
    expect(pan).toBe(-160);
    // Same content point, checked forwards: it was 0.5 of the way across the
    // drawing before, and it still is.
    expect((160 - pan) / 640).toBeCloseTo((160 - 0) / 320);
  });

  it("holds a corner when you zoom about a corner", () => {
    expect(panForAnchor(0, 320, 640, 0, 320)).toBe(0);
    expect(panForAnchor(0, 320, 640, 320, 320)).toBe(-320);
  });

  it("re-centres rather than drifting when zooming back out to a fitting size", () => {
    // Coming back down past fit, the "keep the anchor fixed" answer would leave
    // the sprite off-centre in a window it no longer fills; clampPan wins.
    expect(panForAnchor(-300, 640, 160, 0, 320)).toBe(80);
  });
});
