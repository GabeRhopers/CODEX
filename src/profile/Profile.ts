/**
 * The "simple accounts" the project owner asked for: not real
 * authentication (there's still exactly one Google sign-in behind all
 * three — see googleAuth.ts), just a name-tag that scopes which levels/
 * worlds show up. Picking Mike doesn't grant or deny anything Gabriel or
 * Andressa couldn't also see by switching profiles on the same device;
 * it's a filter, not a security boundary.
 */
export const PROFILES = ["Mike", "Gabriel", "Andressa"] as const;
export type Profile = (typeof PROFILES)[number];

const PROFILE_KEY = "spellbound:profile";

export function isProfile(value: string): value is Profile {
  return (PROFILES as readonly string[]).includes(value);
}

/** Which of the 3 profiles is active on this device — tiny, so unaffected
 * by the localStorage-quota problem the rest of persistence moved off of. */
export function loadActiveProfile(): Profile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw && isProfile(raw) ? raw : null;
}

export function saveActiveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, profile);
}

export function clearActiveProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}
