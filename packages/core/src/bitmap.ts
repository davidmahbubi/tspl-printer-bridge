// 1-bit monochrome bitmap helpers for the TSPL BITMAP command.
// TSPL packs 8 pixels per byte, MSB first; bit 0 = black, bit 1 = white.

export interface MonoBitmap {
  /** Row width in bytes (widthDots / 8, rounded up). */
  widthBytes: number;
  /** Height in dots. */
  height: number;
  /** Packed pixel data, widthBytes * height bytes. */
  data: Uint8Array;
}

export interface MonoConvertOptions {
  /** Luminance 0-255 below which a pixel prints black. Default 128. */
  threshold?: number;
}

function pack(
  width: number,
  height: number,
  isBlack: (x: number, y: number) => boolean
): MonoBitmap {
  const widthBytes = Math.ceil(width / 8);
  // Start all-white (0xff): padding bits past the image width must not print.
  const data = new Uint8Array(widthBytes * height).fill(0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlack(x, y)) {
        data[y * widthBytes + (x >> 3)]! &= ~(0x80 >> (x & 7));
      }
    }
  }
  return { widthBytes, height, data };
}

/**
 * Convert RGBA pixels (e.g. canvas ImageData.data) to a 1-bit bitmap.
 * Transparent pixels (alpha < 128) are treated as white.
 */
export function monoFromRGBA(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  opts: MonoConvertOptions = {}
): MonoBitmap {
  if (rgba.length < width * height * 4) {
    throw new Error(
      `RGBA buffer too small: got ${rgba.length} bytes, need ${width * height * 4}`
    );
  }
  const { threshold = 128 } = opts;
  return pack(width, height, (x, y) => {
    const i = (y * width + x) * 4;
    if (rgba[i + 3]! < 128) return false;
    const lum = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    return lum < threshold;
  });
}

/** Convert 8-bit grayscale pixels (one byte per pixel) to a 1-bit bitmap. */
export function monoFromGray(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  opts: MonoConvertOptions = {}
): MonoBitmap {
  if (gray.length < width * height) {
    throw new Error(
      `Grayscale buffer too small: got ${gray.length} bytes, need ${width * height}`
    );
  }
  const { threshold = 128 } = opts;
  return pack(width, height, (x, y) => gray[y * width + x]! < threshold);
}
