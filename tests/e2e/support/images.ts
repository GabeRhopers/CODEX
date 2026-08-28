import { deflateSync } from "node:zlib";

/**
 * A real PNG, built here rather than checked in as a fixture.
 *
 * The background upload path downscales anything over 1600px on its longest
 * side (see customBackgroundUpload.ts), so a test of that needs an image whose
 * dimensions it chose — and a committed 2400px fixture would be a large binary
 * in the repo for one assertion. Twenty lines of zlib is the cheaper trade, and
 * it keeps the interesting number (the size) visible in the test that cares.
 *
 * Deliberately a flat colour: nothing here tests image *content*, only that the
 * browser decodes it and the pipeline resizes and re-encodes it.
 */

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** The PNG spec's own CRC-32, table built on first use. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** An RGB PNG of exactly `width` x `height`, filled with one colour. */
export function pngBuffer(width: number, height: number, rgb: [number, number, number] = [90, 140, 210]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  // 10-12 are compression/filter/interlace, all 0 — the only combination every
  // decoder is required to support.

  // Each scanline is prefixed with its filter type; 0 ("None") keeps this
  // honest and trivially correct at the cost of a slightly larger deflate.
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      raw[p] = rgb[0];
      raw[p + 1] = rgb[1];
      raw[p + 2] = rgb[2];
    }
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
