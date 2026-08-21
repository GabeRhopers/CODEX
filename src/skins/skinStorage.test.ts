import { beforeEach, describe, expect, it, vi } from "vitest";

// Both Drive-facing modules are mocked so these tests exercise the caching
// and read-modify-write logic itself, never the network. Hoisted by Vitest
// above the imports below, so skinStorage sees the mocks when it loads.
const getFileContent = vi.fn<(token: string, fileId: string) => Promise<string>>();
const findFileByName = vi.fn();
const updateFileContent = vi.fn();
const createFile = vi.fn();

vi.mock("../drive/googleAuth", () => ({
  getAccessToken: () => Promise.resolve("test-token"),
}));

vi.mock("../drive/driveClient", () => ({
  ensureAppFolder: () => Promise.resolve("folder-id"),
  findFileByName: (...args: unknown[]) => findFileByName(...args),
  getFileContent: (...args: [string, string]) => getFileContent(...args),
  updateFileContent: (...args: unknown[]) => updateFileContent(...args),
  createFile: (...args: unknown[]) => createFile(...args),
}));

const { addCustomSkin, invalidateSkinsCache, listPixelSkins, loadCustomSkins, savePixelSkin, setActiveSkin } =
  await import("./skinStorage");

/** Reads back whatever the most recent write actually serialized to Drive. */
function lastWrittenFile(): Record<string, { activeId: string | null; items: { id: string; pixelData?: { paletteId: string; cells?: unknown } }[] }> {
  // Index arithmetic rather than Array.prototype.at — tsconfig targets
  // ES2020, where `.at` doesn't exist in the lib types.
  const updates = updateFileContent.mock.calls;
  const creates = createFile.mock.calls;
  const usedUpdate = updates.length > 0;
  const call = usedUpdate ? updates[updates.length - 1] : creates[creates.length - 1];
  if (!call) throw new Error("nothing was written");
  // updateFileContent(token, fileId, content, props) / createFile(token, folderId, name, content, props)
  const content = usedUpdate ? call[2] : call[3];
  return JSON.parse(content as string);
}

/** One brush with one skin, in the current (post-2026-08-16) library shape. */
function fileContents(activeId = "skin-1"): string {
  return JSON.stringify({
    "enemy-ghost": {
      activeId,
      items: [{ id: "skin-1", imageData: "data:image/png;base64,AAAA", uploadedBy: "Mike", updatedAt: "2026-01-01T00:00:00.000Z" }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSkinsCache();
  findFileByName.mockResolvedValue({ id: "skins-file-id", name: "skins.json" });
  getFileContent.mockResolvedValue(fileContents());
  updateFileContent.mockResolvedValue(undefined);
  createFile.mockResolvedValue(undefined);
});

describe("loadCustomSkins caching", () => {
  it("hits Drive once, then serves every later read from memory", async () => {
    const first = await loadCustomSkins();
    const second = await loadCustomSkins();
    const third = await loadCustomSkins();

    expect(getFileContent).toHaveBeenCalledTimes(1);
    expect(first["enemy-ghost"].activeId).toBe("skin-1");
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("dedupes concurrent first reads into a single request", async () => {
    // The real trigger: MenuScene fires several resolves without awaiting
    // each other, so caching only the settled result would still let them
    // all race past the check — the same reason driveClient caches its
    // in-flight app-folder promise rather than just the folder id.
    const [a, b, c] = await Promise.all([loadCustomSkins(), loadCustomSkins(), loadCustomSkins()]);

    expect(getFileContent).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("hands every caller an independent copy, so one caller's edits can't corrupt the cache", async () => {
    const mine = await loadCustomSkins();
    mine["enemy-ghost"].activeId = "tampered";
    delete mine["enemy-ghost"].items[0];

    const theirs = await loadCustomSkins();
    expect(theirs["enemy-ghost"].activeId).toBe("skin-1");
    expect(theirs["enemy-ghost"].items).toHaveLength(1);
  });

  it("retries after a failed read rather than replaying the rejection forever", async () => {
    invalidateSkinsCache();
    getFileContent.mockRejectedValueOnce(new Error("offline"));
    await expect(loadCustomSkins()).rejects.toThrow("offline");

    getFileContent.mockResolvedValue(fileContents());
    const recovered = await loadCustomSkins();
    expect(recovered["enemy-ghost"].activeId).toBe("skin-1");
    expect(getFileContent).toHaveBeenCalledTimes(2);
  });

  it("treats a missing skins.json as an empty library without trying to read it", async () => {
    invalidateSkinsCache();
    findFileByName.mockResolvedValue(null);
    expect(await loadCustomSkins()).toEqual({});
    expect(getFileContent).not.toHaveBeenCalled();
  });
});

describe("pixel skins no longer persist a redundant cell grid", () => {
  /** A skin saved before 2026-08-21, carrying both copies of its grid. */
  function legacyFileContents(): string {
    return JSON.stringify({
      "enemy-ghost": {
        activeId: "legacy-1",
        items: [
          {
            id: "legacy-1",
            imageData: "data:image/png;base64,AAAA",
            uploadedBy: "Mike",
            updatedAt: "2026-01-01T00:00:00.000Z",
            pixelData: { paletteId: "gameboy", cells: ["#0f380f", null, "#8bac0f"] },
          },
        ],
      },
    });
  }

  it("writes only the palette marker for a brand new skin", async () => {
    await savePixelSkin("enemy-bat", undefined, "data:image/png;base64,CCCC", { paletteId: "sweetie16" }, "Andressa");

    const written = lastWrittenFile();
    const saved = written["enemy-bat"].items[0];
    expect(saved.pixelData).toEqual({ paletteId: "sweetie16" });
    expect(saved.pixelData).not.toHaveProperty("cells");
  });

  it("still reads a legacy skin's cells, so old skins keep opening as they did", async () => {
    invalidateSkinsCache();
    getFileContent.mockResolvedValue(legacyFileContents());

    const skins = await loadCustomSkins();
    expect(skins["enemy-ghost"].items[0].pixelData?.cells).toEqual(["#0f380f", null, "#8bac0f"]);
    expect(skins["enemy-ghost"].items[0].pixelData?.paletteId).toBe("gameboy");
  });

  it("drops a legacy skin's cells the next time that skin is saved", async () => {
    invalidateSkinsCache();
    getFileContent.mockResolvedValue(legacyFileContents());

    await savePixelSkin("enemy-ghost", "legacy-1", "data:image/png;base64,DDDD", { paletteId: "gameboy" }, "Mike");

    const written = lastWrittenFile();
    const migrated = written["enemy-ghost"].items[0];
    expect(migrated.id).toBe("legacy-1"); // same skin, saved in place
    expect(migrated.pixelData).toEqual({ paletteId: "gameboy" });
    expect(migrated.pixelData).not.toHaveProperty("cells");
  });

  it("never writes cells back even if a caller hands them in", async () => {
    // The storage layer normalizes rather than trusting its caller, so a
    // stale call site can't quietly reintroduce the second copy.
    const withCells = { paletteId: "pico8", cells: ["#000000", null] };
    await savePixelSkin("enemy-bat", undefined, "data:image/png;base64,EEEE", withCells, "Mike");

    expect(lastWrittenFile()["enemy-bat"].items[0].pixelData).toEqual({ paletteId: "pico8" });
  });

  it("keeps pixel-drawn skins distinguishable from uploaded photos after the change", async () => {
    // listPixelSkins identifies them by the presence of pixelData, which
    // survives precisely because the palette marker is still written.
    invalidateSkinsCache();
    getFileContent.mockResolvedValue(
      JSON.stringify({
        "enemy-ghost": {
          activeId: "painted",
          items: [
            { id: "painted", imageData: "data:image/png;base64,AAAA", uploadedBy: "Mike", updatedAt: "x", pixelData: { paletteId: "pico8" } },
            { id: "photo", imageData: "data:image/png;base64,BBBB", uploadedBy: "Mike", updatedAt: "x" },
          ],
        },
      }),
    );

    const painted = await listPixelSkins();
    expect(painted.map((p) => p.asset.id)).toEqual(["painted"]);
  });
});

describe("cache invalidation on write", () => {
  it("serves a write's own result without going back to Drive", async () => {
    await loadCustomSkins();
    expect(getFileContent).toHaveBeenCalledTimes(1);

    await setActiveSkin("enemy-ghost", null);

    const after = await loadCustomSkins();
    expect(after["enemy-ghost"].activeId).toBeNull();
    // Still just the one read: the write updated the cache in place.
    expect(getFileContent).toHaveBeenCalledTimes(1);
  });

  it("keeps a newly added skin visible to the next read", async () => {
    await addCustomSkin("enemy-ghost", "data:image/png;base64,BBBB", "Gabriel");

    const after = await loadCustomSkins();
    expect(after["enemy-ghost"].items).toHaveLength(2);
    expect(after["enemy-ghost"].items[1].uploadedBy).toBe("Gabriel");
    expect(after["enemy-ghost"].activeId).toBe(after["enemy-ghost"].items[1].id);
  });

  it("leaves the cache showing what is actually on Drive when a write fails", async () => {
    await loadCustomSkins();
    updateFileContent.mockRejectedValueOnce(new Error("write failed"));

    await expect(setActiveSkin("enemy-ghost", null)).rejects.toThrow("write failed");

    // The mutation was applied to the caller's own copy before the write was
    // attempted; the cache must not have absorbed it.
    const after = await loadCustomSkins();
    expect(after["enemy-ghost"].activeId).toBe("skin-1");
  });
});
