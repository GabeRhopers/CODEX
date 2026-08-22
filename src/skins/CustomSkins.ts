/** Marks a skin as painted in the Skin Creator's pixel-art canvas (see
 * SkinEditorScene / PixelCanvasOverlay) rather than uploaded as a photo.
 * Skins uploaded the ordinary way (a real photo/image file) simply have
 * no `pixelData` — the Skin Creator's "edit an existing skin" list only
 * ever shows entries that do, since importing an arbitrary photo into a
 * 16-color pixel grid would mean lossy quantization that could badly
 * mangle it.
 *
 * `paletteId` records which palette tab was in use, so re-opening a skin
 * restores it. Colors are never stored as palette indices — the PNG holds
 * literal RGB — so re-editing an old skin still shows its exact original
 * colors even if PIXEL_PALETTES' own definitions change later. */
export interface PixelSkinData {
  paletteId: string;
  /** **Legacy only — no longer written.** Until 2026-08-21 every pixel
   * skin persisted its grid twice: once as this flat, row-major array of
   * hex colors (or `null` for transparent), and again as the `imageData`
   * PNG on the enclosing SkinAsset, which is rendered from exactly the
   * same grid one canvas pixel per cell.
   *
   * The PNG is a lossless, exactly-recoverable copy — verified in a real
   * browser across 32 distinct palette colors, 0 mismatches over all 1024
   * cells — and roughly 11x smaller (842 bytes against 9,506 for the same
   * frame). So the array is pure redundancy, and it's the copy that grows
   * fastest: the whole library is re-read whenever skins resolve.
   *
   * Still read when present, so skins saved before that date keep opening
   * exactly as they did; anything without it is decoded straight from its
   * own PNG (see cellsFromPngDataUrl). Migrates itself away on the next
   * save of each skin — the same read-normalize, write-when-touched
   * approach normalizeSkinsFile already uses for the pre-2026-08-16
   * shape, rather than a risky eager rewrite of everyone's library. */
  cells?: (string | null)[];
}

export interface SkinAsset {
  id: string;
  imageData: string;
  uploadedBy: string;
  updatedAt: string;
  pixelData?: PixelSkinData;
  /**
   * Every painted frame of a multi-frame skin, keyed by frame name (see
   * spriteFrames.ts — "idle"/"walk1"/… for the player character, "0".."3" for
   * an enemy's loop), each a PNG data URL exactly like `imageData`.
   *
   * Absent for every ordinary skin, which is most of them and is also every
   * skin saved before 2026-08-22 — so this is purely additive and nothing
   * needs migrating. `imageData` stays the skin's *representative* frame
   * whether or not this exists (the character's idle, or an enemy's frame 0),
   * which is what lets the browse list, the picker thumbnails and
   * EntityPlacer keep reading one field and needing no changes at all.
   *
   * Deliberately not an array: frames are addressed by meaning, not by
   * position, and a character's poses have no meaningful ordering to be
   * off-by-one about. A missing entry is a frame nobody painted yet, which
   * resolveFrame answers by falling back to this skin's own base frame.
   */
  frames?: Record<string, string>;
}

/** Every skin ever uploaded for a brush, plus which one (if any) is
 * currently active — "active" is global, the same way a single skin
 * always was before 2026-08-16 (see skinStorage.ts's docstring on why
 * skins aren't profile- or level-scoped): whichever one is picked shows
 * up for every profile, in every level, immediately. `activeId: null`
 * means "use the built-in art," not "no skins uploaded" — `items` can be
 * non-empty with nothing active if the picked one was removed, or the
 * uploader just hasn't chosen one yet. */
export interface SkinLibraryEntry {
  activeId: string | null;
  items: SkinAsset[];
}

/** All custom skins live in one shared Drive file, keyed by the Brush id
 * (see Palette.ts) they reskin — see skinStorage.ts's docstring for why
 * this is a single consolidated file rather than one Drive file per skin,
 * and why it's deliberately not scoped to any one profile. */
export type CustomSkinsFile = Record<string, SkinLibraryEntry>;
