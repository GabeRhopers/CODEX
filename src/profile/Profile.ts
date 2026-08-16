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

const PROFILE_KEY = "rhopers:profile";
/** The key this lived under before the app's 2026-08-16 rename — checked
 * as a fallback in loadActiveProfile so a device that already picked a
 * profile isn't sent back through the picker just because the storage key
 * changed underneath it. */
const LEGACY_PROFILE_KEY = "spellbound:profile";

export function isProfile(value: string): value is Profile {
  return (PROFILES as readonly string[]).includes(value);
}

/** Which of the 3 profiles is active on this device — tiny, so unaffected
 * by the localStorage-quota problem the rest of persistence moved off of. */
export function loadActiveProfile(): Profile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (raw && isProfile(raw)) return raw;

  const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
  if (legacy && isProfile(legacy)) {
    localStorage.setItem(PROFILE_KEY, legacy);
    return legacy;
  }
  return null;
}

export function saveActiveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, profile);
}

export function clearActiveProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
  // Also clear the legacy key — otherwise the next loadActiveProfile call
  // would just migrate it right back in, silently undoing this "Switch
  // profile" click.
  localStorage.removeItem(LEGACY_PROFILE_KEY);
}
