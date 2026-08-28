import { afterEach, describe, expect, it } from "vitest";
import { MusicTooLargeError, readAudioAsDataUrl } from "./musicUpload";

/**
 * The 4MB guard, which is the *entire* defence on this path.
 *
 * Unlike a background image, an uploaded track is stored byte-for-byte — there
 * is no downscale or re-encode to bring an oversized file back under control
 * (see musicUpload.ts's own docstring), so whether the limit is enforced, and
 * where its boundary sits, is the whole of the module's behaviour.
 *
 * Vitest runs under the node environment (see vite.config.ts), where neither
 * `File` nor `FileReader` exists. The size check runs *before* the reader is
 * touched, so the rejection cases need nothing but an object with a `size`; the
 * accept cases get the three-line stub below. Testing the boundary is the point
 * — `>` versus `>=` is exactly the sort of thing that looks equivalent.
 */

const MAX_BYTES = 4 * 1024 * 1024;

/** Just enough of a File for `readAudioAsDataUrl` — it reads `.size`, and hands
 * the whole object to FileReader, which here is ours. */
function fileOfSize(size: number, dataUrl = "data:audio/wav;base64,AAAA"): File {
  return { size, __dataUrl: dataUrl } as unknown as File;
}

/** Stands in for the browser's FileReader, resolving with whatever data URL the
 * fake file was built with. `error` is only consulted on the failure path. */
function stubFileReader(fail = false): void {
  class FakeFileReader {
    result: string | null = null;
    error: DOMException | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL(file: File): void {
      queueMicrotask(() => {
        if (fail) {
          this.error = new Error("boom") as unknown as DOMException;
          this.onerror?.();
          return;
        }
        this.result = (file as unknown as { __dataUrl: string }).__dataUrl;
        this.onload?.();
      });
    }
  }
  Object.defineProperty(globalThis, "FileReader", { configurable: true, value: FakeFileReader });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "FileReader");
});

describe("readAudioAsDataUrl", () => {
  it("rejects a file over the limit, carrying its size", async () => {
    const size = 5 * 1024 * 1024;
    await expect(readAudioAsDataUrl(fileOfSize(size))).rejects.toBeInstanceOf(MusicTooLargeError);
    // The size travels on the error so a caller could report it differently
    // without re-measuring the file.
    await readAudioAsDataUrl(fileOfSize(size)).then(
      () => expect.unreachable("should have rejected"),
      (err: unknown) => expect((err as MusicTooLargeError).sizeBytes).toBe(size),
    );
  });

  it("names both numbers in the message", async () => {
    // EditorScene.uploadMusic surfaces this string verbatim as the editor's
    // status line, so the wording is user-facing and is asserted on in
    // tests/e2e/music-upload.spec.ts.
    await readAudioAsDataUrl(fileOfSize(5 * 1024 * 1024)).then(
      () => expect.unreachable("should have rejected"),
      (err: unknown) => {
        expect((err as Error).message).toContain("5.0MB");
        expect((err as Error).message).toContain("the limit is 4MB");
      },
    );
  });

  it("accepts a file at exactly the limit", async () => {
    // The boundary is `>`, not `>=`: a file of precisely 4MB is allowed
    // through. Nothing else pins which side of the line it falls on.
    stubFileReader();
    await expect(readAudioAsDataUrl(fileOfSize(MAX_BYTES, "data:audio/wav;base64,RIFF"))).resolves.toBe(
      "data:audio/wav;base64,RIFF",
    );
  });

  it("surfaces a read failure rather than hanging", async () => {
    stubFileReader(true);
    await expect(readAudioAsDataUrl(fileOfSize(1024))).rejects.toThrow("boom");
  });
});
