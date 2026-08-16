import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { connect, tryReconnectSilently } from "../drive/googleAuth";
import { loadActiveProfile, Profile, PROFILES, saveActiveProfile } from "../profile/Profile";

/**
 * The very first thing a visitor sees (Boot → here → Menu), gating access
 * to the rest of the app behind two things: an active profile (Mike/
 * Gabriel/Andressa — see Profile.ts's docstring on why these aren't real
 * per-person accounts) and a live Google Drive connection (persistence's
 * only backend now — see GoogleDriveStorageAdapter). Re-entered from
 * MenuScene's "Switch profile" link too, not just on first boot.
 *
 * Tries a silent Drive reconnect before rendering anything profile-
 * related, so a returning visitor whose browser still has a valid Google
 * session sails straight through to Menu with no click at all — the
 * "Connect Google Drive" button only ever appears when that silent
 * attempt genuinely needs interaction (first-ever connect, revoked
 * consent, or a browser blocking the silent flow's storage access).
 */
export class ProfileGateScene extends Phaser.Scene {
  constructor() {
    super("ProfileGate");
  }

  create(): void {
    this.renderStatus("Connecting…");
    void this.boot();
  }

  private async boot(): Promise<void> {
    try {
      await tryReconnectSilently();
    } catch {
      // Expected on a first-ever visit or an expired/revoked session —
      // renderConnectPrompt below is exactly the fallback for this.
    }
    this.proceed();
  }

  /** Re-checked after both a profile pick and a Drive connect attempt,
   * not just once at boot — either action alone might still leave the
   * other step outstanding. */
  private proceed(): void {
    const profile = loadActiveProfile();
    if (!profile) {
      this.renderProfilePicker();
      return;
    }
    // tryReconnectSilently's own resolution already tells us whether
    // we're connected — no separate isConnected() re-check needed here
    // since boot() only calls proceed() after that promise settles.
    this.renderConnectPrompt(profile);
  }

  private clearScreen(): void {
    this.children.removeAll(true);
  }

  private renderStatus(message: string): void {
    this.clearScreen();
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, message, { fontSize: "16px", color: "#c8c8e0" })
      .setOrigin(0.5);
  }

  private renderProfilePicker(): void {
    this.clearScreen();
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, GAME_HEIGHT / 2 - 100, "Who's playing?", { fontSize: "24px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5);

    const buttonWidth = 200;
    const gap = 24;
    const totalWidth = PROFILES.length * buttonWidth + (PROFILES.length - 1) * gap;
    const startX = cx - totalWidth / 2;

    PROFILES.forEach((profile, i) => {
      const x = startX + i * (buttonWidth + gap);
      const y = GAME_HEIGHT / 2 - 30;
      const bg = this.add
        .rectangle(x, y, buttonWidth, 64, 0x0f3460)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x + buttonWidth / 2, y + 32, profile, { fontSize: "18px", color: "#ffffff" })
        .setOrigin(0.5);
      bg.on("pointerover", () => bg.setFillStyle(0x3a5a9c));
      bg.on("pointerout", () => bg.setFillStyle(0x0f3460));
      bg.on("pointerdown", () => this.pickProfile(profile));
    });
  }

  private pickProfile(profile: Profile): void {
    saveActiveProfile(profile);
    this.proceed();
  }

  private renderConnectPrompt(profile: Profile, errorMessage?: string): void {
    this.clearScreen();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add.text(cx, cy - 90, `Hi, ${profile}.`, { fontSize: "22px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);
    this.add
      .text(cx, cy - 56, "Levels and worlds are saved to Google Drive — connect to continue.", {
        fontSize: "13px",
        color: "#c8c8e0",
        align: "center",
        wordWrap: { width: 480 },
      })
      .setOrigin(0.5);

    const bg = this.add
      .rectangle(cx - 110, cy - 10, 220, 44, 0x0f3460)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.add.text(cx, cy + 12, "Connect Google Drive", { fontSize: "14px", color: "#ffffff" }).setOrigin(0.5);
    bg.on("pointerover", () => bg.setFillStyle(0x3a5a9c));
    bg.on("pointerout", () => bg.setFillStyle(0x0f3460));
    bg.on("pointerdown", () => void this.doConnect(profile));

    if (errorMessage) {
      this.add
        .text(cx, cy + 60, errorMessage, { fontSize: "12px", color: "#ff8a8a", align: "center", wordWrap: { width: 480 } })
        .setOrigin(0.5);
    }

    this.add
      .text(cx, GAME_HEIGHT - 24, "Not you? Reload the page to pick a different profile.", {
        fontSize: "11px",
        color: "#666688",
      })
      .setOrigin(0.5);
  }

  private async doConnect(profile: Profile): Promise<void> {
    this.renderStatus("Connecting…");
    try {
      await connect();
      this.scene.start("Menu");
    } catch (err) {
      console.error("Google Drive connect failed:", err);
      const message = err instanceof Error ? err.message : "Connection failed — try again.";
      this.renderConnectPrompt(profile, message);
    }
  }
}
