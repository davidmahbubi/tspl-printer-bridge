/**
 * TSPL/TSPL2 command builder.
 *
 * Membangun perintah TSPL sebagai buffer teks yang siap dikirim mentah (raw)
 * ke printer label (TSC, Xprinter, HPRT, dsb).
 *
 * Satuan koordinat TSPL adalah dot. Umumnya printer 203 dpi = 8 dot/mm,
 * 300 dpi = 12 dot/mm.
 */

export type Rotation = 0 | 90 | 180 | 270;

export type BarcodeType =
  | "128"
  | "128M"
  | "EAN128"
  | "25"
  | "25C"
  | "39"
  | "39C"
  | "93"
  | "EAN13"
  | "EAN13+2"
  | "EAN13+5"
  | "EAN8"
  | "CODA"
  | "POST"
  | "UPCA"
  | "UPCE"
  | "MSI"
  | "ITF14";

export interface TextOptions {
  x: number;
  y: number;
  /** Nama font internal printer: "1".."8", "TSS24.BF2", "0" (scalable), dll. */
  font?: string;
  rotation?: Rotation;
  xMultiplier?: number;
  yMultiplier?: number;
}

export interface BarcodeOptions {
  x: number;
  y: number;
  type?: BarcodeType;
  /** Tinggi barcode dalam dot */
  height?: number;
  /** 0 = tanpa teks, 1 = teks di bawah barcode */
  humanReadable?: 0 | 1 | 2 | 3;
  rotation?: Rotation;
  narrow?: number;
  wide?: number;
}

export interface QrCodeOptions {
  x: number;
  y: number;
  eccLevel?: "L" | "M" | "Q" | "H";
  /** Ukuran cell 1-10 */
  cellWidth?: number;
  mode?: "A" | "M";
  rotation?: Rotation;
}

/** Escape karakter khusus TSPL di dalam string literal. */
function esc(content: string): string {
  // Tanda kutip ganda di TSPL ditulis sebagai \["]
  return content.replace(/\\/g, "\\\\").replace(/"/g, '\\["]');
}

export class TSPL {
  private commands: string[] = [];

  /** Tambah perintah TSPL mentah. */
  raw(command: string): this {
    this.commands.push(command);
    return this;
  }

  /** Ukuran label dalam mm. */
  size(widthMm: number, heightMm: number): this {
    return this.raw(`SIZE ${widthMm} mm,${heightMm} mm`);
  }

  /** Jarak gap antar label dalam mm (label die-cut). */
  gap(gapMm: number, offsetMm = 0): this {
    return this.raw(`GAP ${gapMm} mm,${offsetMm} mm`);
  }

  /** Untuk media continuous (tanpa gap). */
  gapNone(): this {
    return this.raw("GAP 0,0");
  }

  /** Black mark sensor. */
  bline(heightMm: number, offsetMm = 0): this {
    return this.raw(`BLINE ${heightMm} mm,${offsetMm} mm`);
  }

  /** Arah cetak: 0 atau 1. */
  direction(dir: 0 | 1, mirror: 0 | 1 = 0): this {
    return this.raw(`DIRECTION ${dir},${mirror}`);
  }

  /** Titik referensi koordinat. */
  reference(x: number, y: number): this {
    return this.raw(`REFERENCE ${x},${y}`);
  }

  /** Kepekatan cetak 0-15. */
  density(level: number): this {
    return this.raw(`DENSITY ${level}`);
  }

  /** Kecepatan cetak (inch/detik), tergantung model printer. */
  speed(speed: number): this {
    return this.raw(`SPEED ${speed}`);
  }

  /** Set codepage, mis. "UTF-8", "850", "1252". */
  codepage(page: string): this {
    return this.raw(`CODEPAGE ${page}`);
  }

  /**
   * Berhenti di posisi sobek/pembatas label setelah cetak (tear-off).
   * Printer akan memajukan label ke pembatas, lalu menariknya kembali
   * (backfeed) sebelum mencetak label berikutnya.
   */
  setTear(on: boolean): this {
    return this.raw(`SET TEAR ${on ? "ON" : "OFF"}`);
  }

  /**
   * Atur cutter (untuk printer yang punya pisau pemotong):
   * - false   → nonaktif
   * - "batch" → potong sekali di akhir job
   * - n       → potong setiap n label
   */
  setCutter(mode: false | "batch" | number): this {
    const value =
      mode === false ? "OFF" : mode === "batch" ? "BATCH" : String(mode);
    return this.raw(`SET CUTTER ${value}`);
  }

  /** Potong kertas sekarang (printer dengan cutter). */
  cut(): this {
    return this.raw("CUT");
  }

  /** Geser posisi berhenti label dalam mm (kalibrasi posisi sobek/potong). */
  offset(mm: number): this {
    return this.raw(`OFFSET ${mm} mm`);
  }

  /** Bersihkan image buffer — wajib sebelum menggambar label baru. */
  cls(): this {
    return this.raw("CLS");
  }

  text(content: string, opts: TextOptions): this {
    const {
      x,
      y,
      font = "TSS24.BF2",
      rotation = 0,
      xMultiplier = 1,
      yMultiplier = 1,
    } = opts;
    return this.raw(
      `TEXT ${x},${y},"${font}",${rotation},${xMultiplier},${yMultiplier},"${esc(content)}"`
    );
  }

  /** Teks multi-baris dalam area tertentu (TSPL2 BLOCK). */
  block(
    content: string,
    opts: TextOptions & { width: number; height: number }
  ): this {
    const {
      x,
      y,
      width,
      height,
      font = "TSS24.BF2",
      rotation = 0,
      xMultiplier = 1,
      yMultiplier = 1,
    } = opts;
    return this.raw(
      `BLOCK ${x},${y},${width},${height},"${font}",${rotation},${xMultiplier},${yMultiplier},"${esc(content)}"`
    );
  }

  barcode(content: string, opts: BarcodeOptions): this {
    const {
      x,
      y,
      type = "128",
      height = 80,
      humanReadable = 1,
      rotation = 0,
      narrow = 2,
      wide = 2,
    } = opts;
    return this.raw(
      `BARCODE ${x},${y},"${type}",${height},${humanReadable},${rotation},${narrow},${wide},"${esc(content)}"`
    );
  }

  qrcode(content: string, opts: QrCodeOptions): this {
    const {
      x,
      y,
      eccLevel = "M",
      cellWidth = 5,
      mode = "A",
      rotation = 0,
    } = opts;
    return this.raw(
      `QRCODE ${x},${y},${eccLevel},${cellWidth},${mode},${rotation},"${esc(content)}"`
    );
  }

  /** Garis/kotak isi penuh. */
  bar(x: number, y: number, width: number, height: number): this {
    return this.raw(`BAR ${x},${y},${width},${height}`);
  }

  /** Kotak outline. */
  box(
    x: number,
    y: number,
    xEnd: number,
    yEnd: number,
    thickness = 2
  ): this {
    return this.raw(`BOX ${x},${y},${xEnd},${yEnd},${thickness}`);
  }

  /** Cetak: sets = jumlah set label, copies = salinan per set. */
  print(sets = 1, copies = 1): this {
    return this.raw(`PRINT ${sets},${copies}`);
  }

  /** Umpan satu label kosong. */
  formfeed(): this {
    return this.raw("FORMFEED");
  }

  /** Kalibrasi gap sensor. */
  gapDetect(): this {
    return this.raw("GAPDETECT");
  }

  /** Test print konfigurasi printer. */
  selfTest(): this {
    return this.raw("SELFTEST");
  }

  /** Suara beep. */
  sound(level = 2, intervalMs = 100): this {
    return this.raw(`SOUND ${level},${intervalMs}`);
  }

  toString(): string {
    return this.commands.join("\r\n") + "\r\n";
  }

  toBuffer(): Uint8Array {
    return new TextEncoder().encode(this.toString());
  }
}
