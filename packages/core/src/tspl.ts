// TSPL/TSPL2 command builder. Coordinate unit: dots (203 dpi = 8 dots/mm).

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
  /** Printer-internal font name: "1".."8", "TSS24.BF2", "0" (scalable), etc. */
  font?: string;
  rotation?: Rotation;
  xMultiplier?: number;
  yMultiplier?: number;
}

export interface BarcodeOptions {
  x: number;
  y: number;
  type?: BarcodeType;
  /** Barcode height in dots */
  height?: number;
  /** 0 = no text, 1 = text below the barcode */
  humanReadable?: 0 | 1 | 2 | 3;
  rotation?: Rotation;
  narrow?: number;
  wide?: number;
}

export interface QrCodeOptions {
  x: number;
  y: number;
  eccLevel?: "L" | "M" | "Q" | "H";
  /** Cell size 1-10 */
  cellWidth?: number;
  mode?: "A" | "M";
  rotation?: Rotation;
}

function esc(content: string): string {
  // Double quotes are written as \["] in TSPL
  return content.replace(/\\/g, "\\\\").replace(/"/g, '\\["]');
}

export class TSPL {
  private commands: string[] = [];

  /** Append a raw TSPL command. */
  raw(command: string): this {
    this.commands.push(command);
    return this;
  }

  /** Label size in mm. */
  size(widthMm: number, heightMm: number): this {
    return this.raw(`SIZE ${widthMm} mm,${heightMm} mm`);
  }

  /** Gap between labels in mm (die-cut labels). */
  gap(gapMm: number, offsetMm = 0): this {
    return this.raw(`GAP ${gapMm} mm,${offsetMm} mm`);
  }

  /** For continuous media (no gap). */
  gapNone(): this {
    return this.raw("GAP 0,0");
  }

  /** Black mark sensor. */
  bline(heightMm: number, offsetMm = 0): this {
    return this.raw(`BLINE ${heightMm} mm,${offsetMm} mm`);
  }

  /** Print direction: 0 or 1. */
  direction(dir: 0 | 1, mirror: 0 | 1 = 0): this {
    return this.raw(`DIRECTION ${dir},${mirror}`);
  }

  /** Coordinate reference point. */
  reference(x: number, y: number): this {
    return this.raw(`REFERENCE ${x},${y}`);
  }

  /** Print density 0-15. */
  density(level: number): this {
    return this.raw(`DENSITY ${level}`);
  }

  /** Print speed (inches/second), depends on the printer model. */
  speed(speed: number): this {
    return this.raw(`SPEED ${speed}`);
  }

  /** Set the codepage, e.g. "UTF-8", "850", "1252". */
  codepage(page: string): this {
    return this.raw(`CODEPAGE ${page}`);
  }

  /**
   * Stop at the tear-off position after printing. The printer feeds the
   * label to the boundary, then backfeeds before printing the next one.
   */
  setTear(on: boolean): this {
    return this.raw(`SET TEAR ${on ? "ON" : "OFF"}`);
  }

  /**
   * Configure the cutter (printers with a blade):
   * - false   → disabled
   * - "batch" → cut once at the end of the job
   * - n       → cut every n labels
   */
  setCutter(mode: false | "batch" | number): this {
    const value =
      mode === false ? "OFF" : mode === "batch" ? "BATCH" : String(mode);
    return this.raw(`SET CUTTER ${value}`);
  }

  /** Cut the paper now (printers with a cutter). */
  cut(): this {
    return this.raw("CUT");
  }

  /** Shift the label stop position in mm (tear/cut position calibration). */
  offset(mm: number): this {
    return this.raw(`OFFSET ${mm} mm`);
  }

  /** Clear the image buffer — required before drawing a new label. */
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

  /** Multi-line text within an area (TSPL2 BLOCK). */
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

  /** Filled line/box. */
  bar(x: number, y: number, width: number, height: number): this {
    return this.raw(`BAR ${x},${y},${width},${height}`);
  }

  /** Outlined box. */
  box(
    x: number,
    y: number,
    xEnd: number,
    yEnd: number,
    thickness = 2
  ): this {
    return this.raw(`BOX ${x},${y},${xEnd},${yEnd},${thickness}`);
  }

  /** Print: sets = number of label sets, copies = copies per set. */
  print(sets = 1, copies = 1): this {
    return this.raw(`PRINT ${sets},${copies}`);
  }

  /** Feed one blank label. */
  formfeed(): this {
    return this.raw("FORMFEED");
  }

  /** Calibrate the gap sensor. */
  gapDetect(): this {
    return this.raw("GAPDETECT");
  }

  /** Print the printer's self-test configuration page. */
  selfTest(): this {
    return this.raw("SELFTEST");
  }

  /** Beep. */
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
