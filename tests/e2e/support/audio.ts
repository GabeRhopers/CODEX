/**
 * A real WAV, built here rather than checked in as a fixture.
 *
 * The music upload path deliberately does *not* re-encode (see musicUpload.ts:
 * "audio can't be meaningfully downscaled client-side without a real
 * transcoder"), so the only size that matters is the one the file already has —
 * and testing MAX_MUSIC_BYTES needs a file comfortably over 4MB, which is
 * exactly the kind of binary that has no business in a git history. Generating
 * it keeps the interesting number visible in the test that cares.
 *
 * 16-bit PCM specifically: it is what Chromium's decoder handles without
 * question, and it lets `wavBuffer` be arithmetic rather than an encoder.
 * Deliberately silence — nothing here tests audio *content*, only that the
 * browser decodes it and the pipeline stores it unchanged.
 */

const BITS_PER_SAMPLE = 16;

export interface WavOptions {
  sampleRate?: number;
  channels?: number;
}

/** A PCM WAV of exactly `seconds` of silence. */
export function wavBuffer(seconds: number, { sampleRate = 44100, channels = 2 }: WavOptions = {}): Buffer {
  const bytesPerFrame = channels * (BITS_PER_SAMPLE / 8);
  const dataBytes = Math.round(seconds * sampleRate) * bytesPerFrame;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4); // everything after this field
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size for PCM
  header.writeUInt16LE(1, 20); // format 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerFrame, 28); // byte rate
  header.writeUInt16LE(bytesPerFrame, 32); // block align
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);

  // Buffer.alloc zero-fills, and zero *is* silence for signed 16-bit PCM.
  return Buffer.concat([header, Buffer.alloc(dataBytes)]);
}
