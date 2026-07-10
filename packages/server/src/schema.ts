/**
 * Skema payload /print + validasi manual ringan (tanpa dependensi)
 * dan penyusunan TSPL dari payload declarative.
 */
import { TSPL, type BarcodeType, type Rotation } from "@node-tsp/core";

export interface LabelConfig {
  /** Lebar label dalam mm */
  width: number;
  /** Tinggi label dalam mm */
  height: number;
  /** Gap antar label dalam mm (default 2) */
  gap?: number;
  /** Berhenti di pembatas label setelah cetak */
  tear?: boolean;
  /** Potong tiap n label atau "batch" (printer dengan cutter) */
  cut?: number | "batch";
  /** Geser posisi berhenti/sobek dalam mm */
  offset?: number;
  /** Kepekatan cetak 0-15 */
  density?: number;
  /** Arah cetak (default 1) */
  direction?: 0 | 1;
  /** Jumlah salinan (default 1) */
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
  | { type: "bar"; x: number; y: number; width: number; height: number };

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
  need(el && typeof el === "object", `${at} harus object`);
  need(isStr(el.type), `${at}.type wajib diisi`);

  const needXY = () =>
    need(isNum(el.x) && isNum(el.y), `${at} butuh x dan y (angka, satuan dot)`);

  switch (el.type) {
    case "text":
    case "block":
      needXY();
      need(isStr(el.content), `${at}.content wajib string`);
      if (el.type === "block")
        need(
          isNum(el.width) && isNum(el.height),
          `${at} butuh width dan height`
        );
      break;
    case "barcode":
    case "qrcode":
      needXY();
      need(
        isStr(el.content) && el.content.length > 0,
        `${at}.content wajib string tidak kosong`
      );
      break;
    case "box":
      needXY();
      need(isNum(el.xEnd) && isNum(el.yEnd), `${at} butuh xEnd dan yEnd`);
      break;
    case "bar":
      needXY();
      need(isNum(el.width) && isNum(el.height), `${at} butuh width dan height`);
      break;
    default:
      throw new ValidationError(
        `${at}.type "${el.type}" tidak dikenal (text|block|barcode|qrcode|box|bar)`
      );
  }
}

export function validatePrintPayload(body: any): PrintPayload {
  need(body && typeof body === "object", "Body harus JSON object");

  if ("raw" in body) {
    need(
      isStr(body.raw) && body.raw.trim().length > 0,
      "raw harus string TSPL tidak kosong"
    );
    return body as RawPayload;
  }

  need(
    body.label && typeof body.label === "object",
    'Butuh "raw" (TSPL mentah) atau "label" + "elements" (declarative)'
  );
  need(
    isNum(body.label.width) && isNum(body.label.height),
    "label.width dan label.height wajib angka (mm)"
  );
  if (body.label.density !== undefined)
    need(
      isNum(body.label.density) &&
        body.label.density >= 0 &&
        body.label.density <= 15,
      "label.density harus 0-15"
    );
  if (body.label.copies !== undefined)
    need(
      isNum(body.label.copies) && body.label.copies >= 1,
      "label.copies harus >= 1"
    );
  if (body.label.cut !== undefined)
    need(
      body.label.cut === "batch" || (isNum(body.label.cut) && body.label.cut >= 1),
      'label.cut harus angka >= 1 atau "batch"'
    );

  need(Array.isArray(body.elements), "elements harus array");
  need(body.elements.length > 0, "elements tidak boleh kosong");
  body.elements.forEach(validateElement);

  return body as DeclarativePayload;
}

/** Susun TSPL dari payload declarative. */
export function buildTspl(payload: DeclarativePayload): string {
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

  for (const el of elements) {
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
    }
  }

  tspl.print(1, label.copies ?? 1);
  return tspl.toString();
}
