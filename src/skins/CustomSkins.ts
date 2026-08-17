/** A skin painted in the Skin Creator's pixel-art canvas (see
 * SkinEditorScene / PixelCanvasOverlay) rather than uploaded as a photo —
 * `cells` is the actual editable source of truth (a flat, row-major
 * 32x32 array of hex colors or `null` for transparent); `imageData` on
 * the enclosing SkinAsset is just this same grid rendered once to a PNG,
 * kept in lockstep so every existing consumer (resolveSkinTextureKeys,
 * PlayScene, EntityPlacer) needs zero changes — a pixel-drawn skin is
 * just an ordinary SkinAsset that happens to also carry its own
 * lossless, re-editable source. `paletteId` is only a convenience (which
 * palette tab to preselect on re-open); colors are stored as literal hex
 * strings, not palette indices, so re-editing an old skin still shows
 * its exact original colors even if PIXEL_PALETTES' own definitions
 * change later. Skins uploaded the ordinary way (a real photo/image
 * file) simply have no `pixelData` — the Skin Creator's "edit an
 * existing skin" list only ever shows entries that do, since importing
 * an arbitrary photo into a 5-color pixel grid would mean lossy
 * quantization that could badly mangle it. */
export interface PixelSkinData {
  paletteId: string;
  cells: (string | null)[];
}

export interface SkinAsset {
  id: string;
  imageData: string;
  uploadedBy: string;
  updatedAt: string;
  pixelData?: PixelSkinData;
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
