export interface SkinAsset {
  id: string;
  imageData: string;
  uploadedBy: string;
  updatedAt: string;
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
