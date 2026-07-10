import { app } from "electron";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface AppConfig {
  port: number;
  apiKey: string;
  printer: string;
  corsOrigins: string;
  /** Buka aplikasi saat login OS */
  autostart: boolean;
  /** Start server otomatis saat aplikasi dibuka */
  autoStartServer: boolean;
  /** Ukuran label untuk tombol Test Print (mm) */
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
  } catch {
    // belum ada config → pakai default
  }
  const cfg: AppConfig = {
    ...DEFAULTS,
    apiKey: generateApiKey(),
    ...stored,
    testLabel: { ...DEFAULTS.testLabel, ...stored.testLabel },
  };
  if (!stored.apiKey) saveConfig(cfg); // persist key yang baru digenerate
  return cfg;
}

export function saveConfig(cfg: AppConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2));
}
