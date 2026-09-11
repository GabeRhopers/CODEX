import { describe, expect, it } from "vitest";
import { parseAssetList } from "./assetLibrary";
import type { BackgroundAsset } from "../backgrounds/BackgroundLibrary";
import type { MusicAsset } from "../music/MusicLibrary";

const background = (over: Record<string, unknown> = {}): unknown => ({
  id: "bg-1",
  name: "Painted Sky",
  imageData: "data:image/jpeg;base64,AAAA",
  uploadedBy: "Mike",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("reading an asset library", () => {
  it("keeps a well-formed list exactly as it was", () => {
    const raw = [background(), background({ id: "bg-2", name: "Dusk" })];
    const parsed = parseAssetList<BackgroundAsset>(raw, "imageData");
    expect(parsed).toEqual(raw);
  });

  it("is empty for anything that is not a list", () => {
    for (const raw of [null, undefined, {}, "nope", 7]) {
      expect(parseAssetList<BackgroundAsset>(raw, "imageData"), String(raw)).toEqual([]);
    }
  });

  it("drops an entry with no image data and keeps its neighbours", () => {
    // The whole point of dropping rather than rejecting: one corrupt upload must
    // not cost somebody the other nineteen.
    const parsed = parseAssetList<BackgroundAsset>(
      [background({ id: "good-1" }), background({ id: "bad", imageData: undefined }), background({ id: "good-2" })],
      "imageData",
    );
    expect(parsed.map((a) => a.id)).toEqual(["good-1", "good-2"]);
  });

  it("drops an entry whose data is present but empty", () => {
    // An empty string is a string, so a `typeof` check alone would pass it
    // through to a texture registration that silently produces nothing.
    expect(parseAssetList<BackgroundAsset>([background({ imageData: "" })], "imageData")).toEqual([]);
  });

  it("drops an entry with no id, since nothing could ever reference it", () => {
    expect(parseAssetList<BackgroundAsset>([background({ id: "" })], "imageData")).toEqual([]);
    expect(parseAssetList<BackgroundAsset>([background({ id: 42 })], "imageData")).toEqual([]);
  });

  it("survives entries that are not objects at all", () => {
    const parsed = parseAssetList<BackgroundAsset>([null, "x", 3, background({ id: "kept" })], "imageData");
    expect(parsed.map((a) => a.id)).toEqual(["kept"]);
  });

  it("defaults the fields that are not load-bearing rather than dropping the asset", () => {
    // A background with no name renders perfectly well and shows blank in the
    // picker. Losing somebody's upload over a missing timestamp would be a much
    // worse outcome than showing it unlabelled.
    const [asset] = parseAssetList<BackgroundAsset>(
      [{ id: "bg-1", imageData: "data:image/jpeg;base64,AAAA" }],
      "imageData",
    );
    expect(asset.id).toBe("bg-1");
    expect(asset.name).toBe("");
    expect(asset.uploadedBy).toBe("");
    expect(typeof asset.updatedAt).toBe("string");
  });

  it("reads a music library by its own data field", () => {
    // The same parser serves both libraries; the only difference between a
    // MusicAsset and a BackgroundAsset is what the payload field is called, so
    // the field has to be the thing that is checked rather than assumed.
    const track = { id: "m-1", name: "Tune", audioData: "data:audio/wav;base64,AAAA", uploadedBy: "Mike", updatedAt: "x" };
    expect(parseAssetList<MusicAsset>([track], "audioData")).toEqual([track]);
    // ...and a track carrying an *image* payload is not a track.
    expect(parseAssetList<MusicAsset>([background()], "audioData")).toEqual([]);
  });
});
