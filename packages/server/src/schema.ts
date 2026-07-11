import {
  TSPL,
  monoFromPNG,
  type BarcodeType,
  type Rotation,
} from "@davidmahbubi/tspl-bridge-core";

export interface LabelConfig {
  /** Label width in mm */
  width: number;
  /** Label height in mm */
  height: number;
  /** Gap between labels in mm (default 2) */
  gap?: number;
  /** Stop at the label boundary after printing */
  tear?: boolean;
  /** Cut every n labels or "batch" (printers with a cutter) */
  cut?: number | "batch";
  /** Shift the stop/tear position in mm */
  offset?: number;
  /** Print density 0-15 */
  density?: number;
  /** Print direction (default 1) */
  direction?: 0 | 1;
  /** Number of copies (default 1) */
  copies?: number;
}

export type Element =
  | {
      type: "text";
      x: number;
      y: number;
      content: string;
      font?: string;
      rotation?: Rotation;
      scale?: number;
      xScale?: number;
      yScale?: number;
    }
  | {
      type: "block";
      x: number;
      y: number;
      width: number;
      height: number;
      content: string;
      font?: string;
      rotation?: Rotation;
      scale?: number;
      xScale?: number;
      yScale?: number;
    }
  | {
      type: "barcode";
      x: number;
      y: number;
      content: string;
      barcodeType?: BarcodeType;
      height?: number;
      humanReadable?: 0 | 1 | 2 | 3;
      rotation?: Rotation;
      narrow?: number;
      wide?: number;
    }
  | {
      type: "qrcode";
      x: number;
      y: number;
      content: string;
      ecc?: "L" | "M" | "Q" | "H";
      cellWidth?: number;
      mode?: "A" | "M";
      rotation?: Rotation;
    }
  | { type: "box"; x: number; y: number; xEnd: number; yEnd: number; thickness?: number }
  | { type: "bar"; x: number; y: number; width: number; height: number }
  | {
      type: "image";
      x: number;
      y: number;
      /** PNG file content, base64-encoded (data URL prefix allowed) */
      data: string;
      /** Resize to this width in dots (aspect ratio preserved) */
      width?: number;
      /** Luminance 0-255 below which a pixel prints black (default 128) */
      threshold?: number;
      /** 0 = overwrite (default), 1 = OR, 2 = XOR */
      mode?: 0 | 1 | 2;
    };

export interface DeclarativePayload {
  label: LabelConfig;
  elements: Element[];
  printer?: string;
  host?: string;
  port?: number;
}

export interface RawPayload {
  raw: string;
  printer?: string;
  host?: string;
  port?: number;
}

export type PrintPayload = DeclarativePayload | RawPayload;

export class ValidationError extends Error {}

function need(cond: unknown, message: string): asserts cond {
  if (!cond) throw new ValidationError(message);
}

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function validateElement(el: any, i: number): void {
  const at = `elements[${i}]`;
  need(el && typeof el === "object", `${at} must be an object`);
  need(isStr(el.type), `${at}.type is required`);

  const needXY = () =>
    need(isNum(el.x) && isNum(el.y), `${at} requires numeric x and y (in dots)`);

  switch (el.type) {
    case "text":
    case "block":
      needXY();
      need(isStr(el.content), `${at}.content must be a string`);
      if (el.type === "block")
        need(
          isNum(el.width) && isNum(el.height),
          `${at} requires width and height`
        );
      break;
    case "barcode":
    case "qrcode":
      needXY();
      need(
        isStr(el.content) && el.content.length > 0,
        `${at}.content must be a non-empty string`
      );
      break;
    case "box":
      needXY();
      need(isNum(el.xEnd) && isNum(el.yEnd), `${at} requires xEnd and yEnd`);
      break;
    case "bar":
      needXY();
      need(isNum(el.width) && isNum(el.height), `${at} requires width and height`);
      break;
    case "image":
      needXY();
      need(
        isStr(el.data) && el.data.length > 0,
        `${at}.data must be a base64-encoded PNG string`
      );
      if (el.width !== undefined)
        need(isNum(el.width) && el.width >= 1, `${at}.width must be >= 1 (dots)`);
      if (el.threshold !== undefined)
        need(
          isNum(el.threshold) && el.threshold >= 0 && el.threshold <= 255,
          `${at}.threshold must be 0-255`
        );
      if (el.mode !== undefined)
        need(
          el.mode === 0 || el.mode === 1 || el.mode === 2,
          `${at}.mode must be 0 (overwrite), 1 (OR) or 2 (XOR)`
        );
      break;
    default:
      throw new ValidationError(
        `${at}.type "${el.type}" is not recognized (text|block|barcode|qrcode|box|bar|image)`
      );
  }
}

export function validatePrintPayload(body: any): PrintPayload {
  need(body && typeof body === "object", "Body must be a JSON object");

  if ("raw" in body) {
    need(
      isStr(body.raw) && body.raw.trim().length > 0,
      "raw must be a non-empty TSPL string"
    );
    return body as RawPayload;
  }

  need(
    body.label && typeof body.label === "object",
    'Provide "raw" (raw TSPL) or "label" + "elements" (declarative)'
  );
  need(
    isNum(body.label.width) && isNum(body.label.height),
    "label.width and label.height must be numbers (mm)"
  );
  if (body.label.density !== undefined)
    need(
      isNum(body.label.density) &&
        body.label.density >= 0 &&
        body.label.density <= 15,
      "label.density must be 0-15"
    );
  if (body.label.copies !== undefined)
    need(
      isNum(body.label.copies) && body.label.copies >= 1,
      "label.copies must be >= 1"
    );
  if (body.label.cut !== undefined)
    need(
      body.label.cut === "batch" || (isNum(body.label.cut) && body.label.cut >= 1),
      'label.cut must be a number >= 1 or "batch"'
    );

  need(Array.isArray(body.elements), "elements must be an array");
  need(body.elements.length > 0, "elements must not be empty");
  body.elements.forEach(validateElement);

  return body as DeclarativePayload;
}

function decodeBase64(data: string, at: string): Uint8Array {
  // Allow a data URL prefix ("data:image/png;base64,....")
  const b64 = data.startsWith("data:") ? (data.split(",")[1] ?? "") : data;
  try {
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    throw new ValidationError(`${at}.data is not valid base64`);
  }
}

export function buildTspl(payload: DeclarativePayload): TSPL {
  const { label, elements } = payload;
  const tspl = new TSPL()
    .size(label.width, label.height)
    .gap(label.gap ?? 2)
    .direction(label.direction ?? 1)
    .cls();

  if (label.density !== undefined) tspl.density(label.density);
  if (label.offset !== undefined) tspl.offset(label.offset);
  if (label.tear) tspl.setTear(true);
  if (label.cut !== undefined) tspl.setCutter(label.cut);

  for (const [i, el] of elements.entries()) {
    switch (el.type) {
      case "text":
        tspl.text(el.content, {
          x: el.x,
          y: el.y,
          font: el.font,
          rotation: el.rotation,
          xMultiplier: el.xScale ?? el.scale ?? 1,
          yMultiplier: el.yScale ?? el.scale ?? 1,
        });
        break;
      case "block":
        tspl.block(el.content, {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          font: el.font,
          rotation: el.rotation,
          xMultiplier: el.xScale ?? el.scale ?? 1,
          yMultiplier: el.yScale ?? el.scale ?? 1,
        });
        break;
      case "barcode":
        tspl.barcode(el.content, {
          x: el.x,
          y: el.y,
          type: el.barcodeType,
          height: el.height,
          humanReadable: el.humanReadable,
          rotation: el.rotation,
          narrow: el.narrow,
          wide: el.wide,
        });
        break;
      case "qrcode":
        tspl.qrcode(el.content, {
          x: el.x,
          y: el.y,
          eccLevel: el.ecc,
          cellWidth: el.cellWidth,
          mode: el.mode,
          rotation: el.rotation,
        });
        break;
      case "box":
        tspl.box(el.x, el.y, el.xEnd, el.yEnd, el.thickness);
        break;
      case "bar":
        tspl.bar(el.x, el.y, el.width, el.height);
        break;
      case "image": {
        const at = `elements[${i}]`;
        const png = decodeBase64(el.data, at);
        let bitmap;
        try {
          bitmap = monoFromPNG(png, {
            widthDots: el.width,
            threshold: el.threshold,
          });
        } catch (err) {
          throw new ValidationError(
            `${at}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        tspl.bitmap(bitmap, { x: el.x, y: el.y, mode: el.mode });
        break;
      }
    }
  }

  tspl.print(1, label.copies ?? 1);
  return tspl;
}
