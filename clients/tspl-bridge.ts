/**
 * Client helper for TSPL Print Bridge — copy this file into your web app.
 * No dependencies; works in any browser that supports fetch.
 *
 * Example:
 *   const bridge = new TsplBridge({ apiKey: "..." });
 *   if (await bridge.isAvailable()) {
 *     await bridge.print({
 *       label: { width: 78, height: 100, gap: 3, tear: true },
 *       elements: [
 *         { type: "text", x: 24, y: 28, content: "Halo", scale: 2 },
 *         { type: "barcode", x: 24, y: 100, content: "123456", height: 80 },
 *       ],
 *     });
 *   }
 */

export interface TsplBridgeOptions {
  /** Bridge URL, defaults to http://127.0.0.1:9123 */
  url?: string;
  apiKey: string;
}

export interface LabelConfig {
  width: number;
  height: number;
  gap?: number;
  tear?: boolean;
  cut?: number | "batch";
  offset?: number;
  density?: number;
  direction?: 0 | 1;
  copies?: number;
}

export type Element =
  | { type: "text"; x: number; y: number; content: string; font?: string; rotation?: 0 | 90 | 180 | 270; scale?: number; xScale?: number; yScale?: number }
  | { type: "block"; x: number; y: number; width: number; height: number; content: string; font?: string; rotation?: 0 | 90 | 180 | 270; scale?: number }
  | { type: "barcode"; x: number; y: number; content: string; barcodeType?: string; height?: number; humanReadable?: 0 | 1 | 2 | 3; rotation?: 0 | 90 | 180 | 270; narrow?: number; wide?: number }
  | { type: "qrcode"; x: number; y: number; content: string; ecc?: "L" | "M" | "Q" | "H"; cellWidth?: number; mode?: "A" | "M"; rotation?: 0 | 90 | 180 | 270 }
  | { type: "box"; x: number; y: number; xEnd: number; yEnd: number; thickness?: number }
  | { type: "bar"; x: number; y: number; width: number; height: number };

export interface PrintRequest {
  label: LabelConfig;
  elements: Element[];
  /** Override the default printer configured in the bridge app */
  printer?: string;
}

export class TsplBridgeError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export class TsplBridge {
  private url: string;
  private apiKey: string;

  constructor(options: TsplBridgeOptions) {
    this.url = (options.url ?? "http://127.0.0.1:9123").replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private async request(path: string, init?: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await fetch(this.url + path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
          ...init?.headers,
        },
      });
    } catch {
      throw new TsplBridgeError(
        "Could not reach TSPL Bridge — make sure the app is running"
      );
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TsplBridgeError(body.error ?? `HTTP ${res.status}`, res.status);
    }
    return body;
  }

  /** Check whether the bridge is running (no API key needed). */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(this.url + "/health");
      const body = await res.json();
      return body.service === "tspl-bridge";
    } catch {
      return false;
    }
  }

  /** List printers available on the user's computer. */
  async printers(): Promise<{ printers: string[]; default: string | null }> {
    return this.request("/printers");
  }

  /** Print a label using the declarative mode. */
  async print(request: PrintRequest): Promise<void> {
    await this.request("/print", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /** Print raw TSPL (full control). */
  async printRaw(tspl: string, printer?: string): Promise<void> {
    await this.request("/print", {
      method: "POST",
      body: JSON.stringify({ raw: tspl, printer }),
    });
  }
}
