import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import {
  CupsTransport,
  NetworkTransport,
  type Transport,
} from "@node-tsp/core";
import {
  buildTspl,
  validatePrintPayload,
  ValidationError,
  type PrintPayload,
} from "./schema";

export interface BridgeConfig {
  port?: number;
  apiKey: string;
  printer?: string;
  corsOrigins?: string;
  /** Default 127.0.0.1 — jangan bind ke alamat lain kecuali paham risikonya */
  host?: string;
  transportFactory?: (target: PrintTarget) => Transport;
}

export interface PrintTarget {
  printer?: string;
  host?: string;
  port?: number;
}

export interface LogEntry {
  time: string;
  level: "info" | "error";
  message: string;
}

export interface BridgeServer {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  isRunning(): boolean;
  onLog(cb: (entry: LogEntry) => void): void;
}

export const BRIDGE_VERSION = "1.0.0";
const MAX_BODY_BYTES = 1024 * 1024;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function listPrinters(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("lpstat", ["-p"], (err, stdout) => {
      if (err) return resolve([]);
      const names = stdout
        .split("\n")
        .map((line) => line.match(/^printer (\S+)/)?.[1])
        .filter((n): n is string => Boolean(n));
      resolve(names);
    });
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ValidationError("Request body too large (max 1 MB)"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createBridgeServer(config: BridgeConfig): BridgeServer {
  const port = config.port ?? 9123;
  const host = config.host ?? "127.0.0.1";
  const corsOrigins = (config.corsOrigins ?? "*").trim();
  const logListeners: Array<(entry: LogEntry) => void> = [];
  let server: Server | null = null;

  const log = (level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      level,
      message,
    };
    for (const cb of logListeners) cb(entry);
  };

  const makeTransport = (target: PrintTarget): Transport => {
    if (config.transportFactory) return config.transportFactory(target);
    if (target.host) return new NetworkTransport(target.host, target.port ?? 9100);
    const printer = target.printer ?? config.printer;
    if (!printer) {
      throw new ValidationError(
        "No printer selected: set a default printer in the bridge app or include a \"printer\" field in the payload"
      );
    }
    return new CupsTransport(printer);
  };

  const applyCors = (req: IncomingMessage, res: ServerResponse): void => {
    const origin = req.headers.origin;
    if (corsOrigins === "*") {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (origin) {
      const allowed = corsOrigins.split(",").map((s) => s.trim());
      if (allowed.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
  };

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const authorized = (req: IncomingMessage): boolean => {
    const key = req.headers["x-api-key"];
    return typeof key === "string" && safeEqual(key, config.apiKey);
  };

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    applyCors(req, res);
    const path = (req.url ?? "/").split("?")[0];

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && path === "/health") {
      json(res, 200, {
        status: "ok",
        service: "tspl-bridge",
        version: BRIDGE_VERSION,
        printer: config.printer ?? null,
      });
      return;
    }

    if (!authorized(req)) {
      log("error", `${req.method} ${path} → 401 (invalid or missing API key)`);
      json(res, 401, { ok: false, error: "Invalid or missing API key (X-Api-Key header)" });
      return;
    }

    if (req.method === "GET" && path === "/printers") {
      const printers = await listPrinters();
      json(res, 200, { ok: true, printers, default: config.printer ?? null });
      return;
    }

    if (req.method === "POST" && path === "/print") {
      let payload: PrintPayload;
      try {
        const bodyText = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          throw new ValidationError("Request body is not valid JSON");
        }
        payload = validatePrintPayload(parsed);
      } catch (err) {
        if (err instanceof ValidationError) {
          log("error", `POST /print → 400 (${err.message})`);
          json(res, 400, { ok: false, error: err.message });
          return;
        }
        throw err;
      }

      const tspl = "raw" in payload ? payload.raw : buildTspl(payload);
      try {
        const transport = makeTransport(payload);
        await transport.send(new TextEncoder().encode(tspl));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = err instanceof ValidationError ? 400 : 502;
        log("error", `POST /print → ${status} (${message})`);
        json(res, status, { ok: false, error: message });
        return;
      }

      const target = payload.host
        ? `${payload.host}:${payload.port ?? 9100}`
        : payload.printer ?? config.printer;
      log("info", `POST /print → OK (${target}, ${tspl.length} bytes)`);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { ok: false, error: `No such endpoint: ${req.method} ${path}` });
  };

  return {
    start() {
      return new Promise((resolve, reject) => {
        if (server) return resolve({ port });
        const s = createServer((req, res) => {
          handle(req, res).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            log("error", `Internal error: ${message}`);
            if (!res.headersSent) json(res, 500, { ok: false, error: message });
          });
        });
        s.on("error", (err) => {
          server = null;
          reject(err);
        });
        s.listen(port, host, () => {
          server = s;
          log("info", `Server listening at http://${host}:${port}`);
          resolve({ port });
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => {
          server = null;
          log("info", "Server stopped");
          resolve();
        });
        // Putus koneksi keep-alive supaya close tidak menggantung
        server.closeAllConnections?.();
      });
    },
    isRunning() {
      return server !== null;
    },
    onLog(cb) {
      logListeners.push(cb);
    },
  };
}
