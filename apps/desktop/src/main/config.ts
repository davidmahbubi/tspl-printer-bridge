import { app } from "electron";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface AppConfig {
  port: number;
  apiKey: string;
  printer: string;
  corsOrigins: string;
  /** Open the app at OS login */
  autostart: boolean;
  /** Start the server automatically when the app opens */
  autoStartServer: boolean;
  /** Label size for the Test Print button (mm) */
  testLabel: { width: number; height: number };
}

const DEFAULTS: Omit<AppConfig, "apiKey"> = {
  port: 9123,
  printer: "",
  corsOrigins: "*",
  autostart: false,
  autoStartServer: true,
  testLabel: { width: 78, height: 100 },
};

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

export function generateApiKey(): string {
  return randomBytes(24).toString("base64url");
}

export function loadConfig(): AppConfig {
  let stored: Partial<AppConfig> = {};
  try {
    stored = JSON.parse(readFileSync(configPath(), "utf8"));
  } catch {}
  const cfg: AppConfig = {
    ...DEFAULTS,
    apiKey: generateApiKey(),
    ...stored,
    testLabel: { ...DEFAULTS.testLabel, ...stored.testLabel },
  };
  if (!stored.apiKey) saveConfig(cfg);
  return cfg;
}

/** Merge an untrusted settings object into a valid config, field by field. */
export function normalizeConfig(raw: unknown, base: AppConfig): AppConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Not a valid settings file");
  }
  const r = raw as Partial<AppConfig>;
  return {
    port:
      typeof r.port === "number" && r.port >= 1024 && r.port <= 65535
        ? Math.floor(r.port)
        : base.port,
    apiKey:
      typeof r.apiKey === "string" && r.apiKey.trim()
        ? r.apiKey.trim()
        : base.apiKey,
    printer: typeof r.printer === "string" ? r.printer : base.printer,
    corsOrigins:
      typeof r.corsOrigins === "string" && r.corsOrigins.trim()
        ? r.corsOrigins.trim()
        : base.corsOrigins,
    autostart:
      typeof r.autostart === "boolean" ? r.autostart : base.autostart,
    autoStartServer:
      typeof r.autoStartServer === "boolean"
        ? r.autoStartServer
        : base.autoStartServer,
    testLabel: {
      width:
        typeof r.testLabel?.width === "number" && r.testLabel.width > 0
          ? r.testLabel.width
          : base.testLabel.width,
      height:
        typeof r.testLabel?.height === "number" && r.testLabel.height > 0
          ? r.testLabel.height
          : base.testLabel.height,
    },
  };
}

export function saveConfig(cfg: AppConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2));
}
