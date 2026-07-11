// PNG → 1-bit MonoBitmap, for printing logos with the BITMAP command.
import { PNG } from "pngjs";
import { monoFromRGBA, type MonoBitmap, type MonoConvertOptions } from "./bitmap";

export interface PngConvertOptions extends MonoConvertOptions {
  /**
   * Resize to this width in dots (nearest-neighbor, aspect ratio preserved).
   * The printer does no scaling: at 203 dpi, 8 dots = 1 mm.
   */
  widthDots?: number;
}

function resizeRGBA(
  src: Uint8Array | Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8Array {
  const dst = new Uint8Array(dstWidth * dstHeight * 4);
  for (let y = 0; y < dstHeight; y++) {
    const sy = Math.min(srcHeight - 1, Math.floor((y * srcHeight) / dstHeight));
    for (let x = 0; x < dstWidth; x++) {
      const sx = Math.min(srcWidth - 1, Math.floor((x * srcWidth) / dstWidth));
      const si = (sy * srcWidth + sx) * 4;
      const di = (y * dstWidth + x) * 4;
      dst[di] = src[si]!;
      dst[di + 1] = src[si + 1]!;
      dst[di + 2] = src[si + 2]!;
      dst[di + 3] = src[si + 3]!;
    }
  }
  return dst;
}

/** Decode a PNG file's bytes into a 1-bit bitmap ready for TSPL.bitmap(). */
export function monoFromPNG(
  png: Uint8Array,
  opts: PngConvertOptions = {}
): MonoBitmap {
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(Buffer.from(png));
  } catch (err) {
    throw new Error(
      `Failed to decode PNG: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let { width, height } = decoded;
  let rgba: Uint8Array = decoded.data;
  if (opts.widthDots !== undefined && opts.widthDots !== width) {
    if (!Number.isFinite(opts.widthDots) || opts.widthDots < 1) {
      throw new Error(`Invalid widthDots: ${opts.widthDots}`);
    }
    const dstWidth = Math.round(opts.widthDots);
    const dstHeight = Math.max(1, Math.round((height * dstWidth) / width));
    rgba = resizeRGBA(rgba, width, height, dstWidth, dstHeight);
    width = dstWidth;
    height = dstHeight;
  }

  return monoFromRGBA(rgba, width, height, opts);
}
