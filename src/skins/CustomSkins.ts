export interface CustomSkinRecord {
  imageData: string;
  uploadedBy: string;
  updatedAt: string;
}

/** All custom skins live in one shared Drive file, keyed by the Brush id
 * (see Palette.ts) they reskin — see skinStorage.ts's docstring for why
 * this is a single consolidated file rather than one Drive file per skin,
 * and why it's deliberately not scoped to any one profile. */
export type CustomSkinsFile = Record<string, CustomSkinRecord>;
