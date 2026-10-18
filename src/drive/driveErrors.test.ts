import { describe, expect, it } from "vitest";
import { DriveAuthError, isDriveAuthError, RECONNECT_MESSAGE, saveFailureMessage, STORAGE_MESSAGE } from "./driveErrors";

/**
 * One decision, and it is worth a test because getting it wrong is invisible:
 * both branches produce a plausible-looking sentence in a status line, and only
 * a person who happens to know why their save failed would ever notice it was
 * the wrong one.
 */

describe("saveFailureMessage", () => {
  it("names the real cause when the Drive grant has lapsed", () => {
    // The weekly case. See config/googleDrive.ts: a Testing-status consent
    // screen's grant expires after about seven days, and no amount of clearing
    // browser storage will help.
    expect(saveFailureMessage(new DriveAuthError())).toBe(RECONNECT_MESSAGE);
  });

  it("promises the work is kept, which the catch blocks must keep true", () => {
    // Pinned as text rather than left to the constant alone: this sentence is
    // only honest because EditorScene and WorldMakerScene write a draft in the
    // same catch that shows it. If the promise is ever removed from the message
    // this fails and points at why.
    expect(RECONNECT_MESSAGE).toContain("Your work is kept here");
  });

  it("falls back to storage for anything it cannot identify", () => {
    // Deliberately not a third, vaguer sentence for the unknown case: this
    // narrows a wrong message to the one cause it can actually name.
    expect(saveFailureMessage(new Error("Drive request failed (500)"))).toBe(STORAGE_MESSAGE);
    expect(saveFailureMessage(new DOMException("QuotaExceededError"))).toBe(STORAGE_MESSAGE);
    expect(saveFailureMessage("not an error at all")).toBe(STORAGE_MESSAGE);
    expect(saveFailureMessage(null)).toBe(STORAGE_MESSAGE);
    expect(saveFailureMessage(undefined)).toBe(STORAGE_MESSAGE);
  });
});

describe("isDriveAuthError", () => {
  it("recognises one of ours", () => {
    expect(isDriveAuthError(new DriveAuthError("signed out"))).toBe(true);
  });

  it("recognises one by name, not only by identity", () => {
    // Load-bearing: `instanceof` fails across two copies of this module (a
    // bundler splitting it) or an error that crossed a structured-clone
    // boundary, and the symptom would be the wrong sentence — the exact thing
    // this file exists to prevent.
    expect(isDriveAuthError({ name: "DriveAuthError", message: "whatever" })).toBe(true);
  });

  it("says no to everything else, including nothing at all", () => {
    expect(isDriveAuthError(new Error("Drive request failed (503)"))).toBe(false);
    expect(isDriveAuthError({ name: "DriveApiError" })).toBe(false);
    expect(isDriveAuthError(null)).toBe(false);
    expect(isDriveAuthError(undefined)).toBe(false);
  });

  it("keeps a message when it is given one, and has a sensible one when not", () => {
    expect(new DriveAuthError("Sign-in failed").message).toBe("Sign-in failed");
    expect(new DriveAuthError().message).toContain("reconnect");
  });
});
