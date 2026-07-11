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
export class TsplBridgeError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
export class TsplBridge {
    constructor(options) {
        this.url = (options.url ?? "http://127.0.0.1:9123").replace(/\/$/, "");
        this.apiKey = options.apiKey;
    }
    async request(path, init) {
        let res;
        try {
            res = await fetch(this.url + path, {
                ...init,
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": this.apiKey,
                    ...init?.headers,
                },
            });
        }
        catch {
            throw new TsplBridgeError("Could not reach TSPL Bridge — make sure the app is running");
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new TsplBridgeError(body.error ?? `HTTP ${res.status}`, res.status);
        }
        return body;
    }
    /** Check whether the bridge is running (no API key needed). */
    async isAvailable() {
        try {
            const res = await fetch(this.url + "/health");
            const body = await res.json();
            return body.service === "tspl-bridge";
        }
        catch {
            return false;
        }
    }
    /** List printers available on the user's computer. */
    async printers() {
        return this.request("/printers");
    }
    /** Print a label using the declarative mode. */
    async print(request) {
        await this.request("/print", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }
    /** Print raw TSPL (full control). */
    async printRaw(tspl, printer) {
        await this.request("/print", {
            method: "POST",
            body: JSON.stringify({ raw: tspl, printer }),
        });
    }
}
