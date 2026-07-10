/**
 * Generate ikon tray sebagai PNG tanpa dependensi eksternal.
 * Output: dist/assets/trayTemplate.png (hitam, macOS template image)
 *         dist/assets/tray-win.png (putih, Windows system tray)
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Glyph printer 16x16 ('#' = pixel terisi)
const ART = [
  "................",
  "....########....",
  "....#......#....",
  "....#......#....",
  "..############..",
  ".#############..",
  ".##############.",
  ".##.########.##.",
  ".##############.",
  "..############..",
  "...#........#...",
  "...#.######.#...",
  "...#........#...",
  "...#.######.#...",
  "...##########...",
  "................",
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(rows: string[], rgb: [number, number, number]): Uint8Array {
  const h = rows.length;
  const w = rows[0]!.length;
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w);
  iv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA

  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4) + 1; // byte pertama tiap scanline = filter 0
    for (let x = 0; x < w; x++) {
      const on = rows[y]![x] === "#";
      const p = rowStart + x * 4;
      raw[p] = rgb[0];
      raw[p + 1] = rgb[1];
      raw[p + 2] = rgb[2];
      raw[p + 3] = on ? 255 : 0;
    }
  }

  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const outDir = join(import.meta.dir, "../dist/assets");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "trayTemplate.png"), png(ART, [0, 0, 0]));
writeFileSync(join(outDir, "tray-win.png"), png(ART, [255, 255, 255]));
console.log("Ikon tray dibuat di", outDir);
