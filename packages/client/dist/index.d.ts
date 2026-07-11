/**
 * Browser SDK for TSPL Print Bridge (@davidmahbubi/tspl-bridge-sdk).
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
export type Element = {
    type: "text";
    x: number;
    y: number;
    content: string;
    font?: string;
    rotation?: 0 | 90 | 180 | 270;
    scale?: number;
    xScale?: number;
    yScale?: number;
} | {
    type: "block";
    x: number;
    y: number;
    width: number;
    height: number;
    content: string;
    font?: string;
    rotation?: 0 | 90 | 180 | 270;
    scale?: number;
} | {
    type: "barcode";
    x: number;
    y: number;
    content: string;
    barcodeType?: string;
    height?: number;
    humanReadable?: 0 | 1 | 2 | 3;
    rotation?: 0 | 90 | 180 | 270;
    narrow?: number;
    wide?: number;
} | {
    type: "qrcode";
    x: number;
    y: number;
    content: string;
    ecc?: "L" | "M" | "Q" | "H";
    cellWidth?: number;
    mode?: "A" | "M";
    rotation?: 0 | 90 | 180 | 270;
} | {
    type: "box";
    x: number;
    y: number;
    xEnd: number;
    yEnd: number;
    thickness?: number;
} | {
    type: "bar";
    x: number;
    y: number;
    width: number;
    height: number;
}
/** data = PNG as base64 (data URL allowed); width in dots resizes, threshold 0-255 */
 | {
    type: "image";
    x: number;
    y: number;
    data: string;
    width?: number;
    threshold?: number;
    mode?: 0 | 1 | 2;
};
export interface PrintRequest {
    label: LabelConfig;
    elements: Element[];
    /** Override the default printer configured in the bridge app */
    printer?: string;
}
export declare class TsplBridgeError extends Error {
    status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
export declare class TsplBridge {
    private url;
    private apiKey;
    constructor(options: TsplBridgeOptions);
    private request;
    /** Check whether the bridge is running (no API key needed). */
    isAvailable(): Promise<boolean>;
    /** List printers available on the user's computer. */
    printers(): Promise<{
        printers: string[];
        default: string | null;
    }>;
    /** Print a label using the declarative mode. */
    print(request: PrintRequest): Promise<void>;
    /** Print raw TSPL (full control). */
    printRaw(tspl: string, printer?: string): Promise<void>;
}
