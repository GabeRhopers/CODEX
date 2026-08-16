import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from "../config/googleDrive";

/** Minimal shape of what Google Identity Services' token client hands
 * back — not the full GIS type surface, just the fields this file reads.
 * @types/google.accounts isn't installed (one more dependency for a
 * handful of fields); `window.google` itself is declared as `any` below
 * for the same reason. */
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (opts: { prompt: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

const GIS_LOAD_TIMEOUT_MS = 10_000;

let gisReady: Promise<void> | null = null;

/** Loads Google Identity Services' script once, however many times this
 * gets called — every caller below goes through it before touching
 * `window.google`. A bare `<script>` tag has no built-in timeout of its
 * own (only a definitive network error fires `onerror` — a stalled
 * connection just never calls back at all), which would otherwise leave
 * ProfileGateScene's "Connecting…" spinning forever on a bad connection;
 * GIS_LOAD_TIMEOUT_MS bounds that. On failure the cached promise is
 * cleared rather than left permanently rejected, so a later retry (the
 * "Connect Google Drive" button, or the next page load) gets a fresh
 * attempt instead of instantly replaying the same failure forever. */
function loadGis(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error("Timed out reaching Google Sign-In — check your connection and try again"));
    }, GIS_LOAD_TIMEOUT_MS);
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Couldn't load Google Sign-In — check your connection"));
    };
    document.head.appendChild(script);
  });
  gisReady.catch(() => {
    gisReady = null;
  });
  return gisReady;
}

let tokenClient: TokenClient | null = null;
// In-memory only, deliberately never persisted: an access token is a live
// credential, not app state — writing it to localStorage would leave it
// sitting around after the tab closes for no benefit (GIS's own silent-
// renewal, tried first on every fresh page load, already covers "I signed
// in earlier and don't want to click again" — see requestToken below).
let tokenState: { accessToken: string; expiresAt: number } | null = null;

function ensureTokenClient(): TokenClient {
  if (tokenClient) return tokenClient;
  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {}, // replaced per-call below; initTokenClient requires *some* callback up front
  });
  return tokenClient;
}

function requestToken(interactive: boolean): Promise<string> {
  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const client = ensureTokenClient();
        client.callback = (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error ?? "Sign-in failed"));
            return;
          }
          // 60s margin so a save that starts right as the token's about to
          // expire doesn't get a request rejected mid-flight.
          const expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000;
          tokenState = { accessToken: response.access_token, expiresAt };
          resolve(response.access_token);
        };
        // "" asks for a token silently (reuses an existing Google session +
        // prior consent, no popup) — used for the automatic reconnect
        // attempt on every fresh page load. "consent" is the explicit
        // "Connect Google Drive" button's interactive fallback when that
        // silent attempt fails (first-ever connect, revoked consent, or a
        // browser blocking the silent flow's third-party storage access).
        client.requestAccessToken({ prompt: interactive ? "consent" : "" });
      }),
  );
}

/** True only while a token obtained this page load is still within its
 * lifetime — never implies anything about whether Drive access was ever
 * granted before (see tryReconnectSilently for that). */
export function isConnected(): boolean {
  return tokenState !== null && Date.now() < tokenState.expiresAt;
}

/** Returns a currently-valid access token, transparently renewing first if
 * the cached one has expired. Throws if that renewal needs interaction
 * (expected: it means whoever's using it needs to hit "Connect Google
 * Drive" again — see ProfileGateScene, the only place that should ever
 * catch this). */
export async function getAccessToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt) return tokenState.accessToken;
  return requestToken(false);
}

/** The interactive "Connect Google Drive" button's call — always shows
 * Google's consent UI (unlike getAccessToken's silent renewal attempt). */
export function connect(): Promise<string> {
  return requestToken(true);
}

/** Tried once on boot (see ProfileGateScene) before ever showing a
 * "Connect Google Drive" button — succeeds without any UI if this
 * browser already has a live Google session and previously granted this
 * app access, so a returning visitor mostly never sees the button at all. */
export function tryReconnectSilently(): Promise<string> {
  return requestToken(false);
}

export function disconnect(): void {
  if (tokenState && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(tokenState.accessToken, () => {});
  }
  tokenState = null;
}
