import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from "electron";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  createBridgeServer,
  listPrinters,
  type BridgeServer,
  type LogEntry,
} from "@node-tsp/server";
import { TSPL, CupsTransport } from "@node-tsp/core";
import {
  generateApiKey,
  loadConfig,
  saveConfig,
  type AppConfig,
} from "./config";

// Asset paths are resolved from the app path, not __dirname — Bun's bundler
// statically replaces __dirname with the source directory.
const distDir = () => join(app.getAppPath(), "dist");
const iconsDir = () => join(distDir(), "assets/icons");

let config: AppConfig;
let server: BridgeServer | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
const logs: LogEntry[] = [];

function pushLog(entry: LogEntry): void {
  logs.push(entry);
  if (logs.length > 100) logs.shift();
  win?.webContents.send("bridge-log", entry);
}

function makeServer(): BridgeServer {
  const s = createBridgeServer({
    port: config.port,
    apiKey: config.apiKey,
    printer: config.printer || undefined,
    corsOrigins: config.corsOrigins,
  });
  s.onLog(pushLog);
  return s;
}

async function startServer(): Promise<void> {
  if (!server) server = makeServer();
  if (!server.isRunning()) {
    try {
      await server.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushLog({
        time: new Date().toISOString(),
        level: "error",
        message: `Failed to start server: ${message}`,
      });
    }
  }
  refreshTray();
  broadcastStatus();
}

async function stopServer(): Promise<void> {
  await server?.stop();
  refreshTray();
  broadcastStatus();
}

async function applyConfig(next: AppConfig): Promise<void> {
  const wasRunning = server?.isRunning() ?? false;
  config = next;
  saveConfig(config);
  app.setLoginItemSettings({ openAtLogin: config.autostart });
  await server?.stop();
  server = makeServer();
  if (wasRunning) await server.start();
  refreshTray();
  broadcastStatus();
}

function serverStatus() {
  return { running: server?.isRunning() ?? false, port: config.port };
}

function broadcastStatus(): void {
  win?.webContents.send("bridge-status", serverStatus());
}

function createWindow(): void {
  if (win) {
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 520,
    height: 720,
    // Lock the width so only the height is resizable
    minWidth: 520,
    maxWidth: 520,
    minHeight: 520,
    title: "TSPL Print Bridge",
    icon:
      process.platform === "win32"
        ? join(iconsDir(), "windows/icon.ico")
        : join(iconsDir(), "macos/app-512.png"),
    webPreferences: {
      preload: join(distDir(), "preload/preload.cjs"),
      devTools: !app.isPackaged,
    },
  });
  win.loadFile(join(distDir(), "renderer/index.html"));
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win?.hide();
    }
  });
  win.on("closed", () => (win = null));
}

function refreshTray(): void {
  if (!tray) return;
  const running = server?.isRunning() ?? false;
  tray.setToolTip(
    running
      ? `TSPL Print Bridge — running on :${config.port}`
      : "TSPL Print Bridge — stopped"
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: running
          ? `Server running on port ${config.port}`
          : "Server stopped",
        enabled: false,
      },
      { type: "separator" },
      running
        ? { label: "Stop Server", click: () => void stopServer() }
        : { label: "Start Server", click: () => void startServer() },
      { label: "Open Settings", click: createWindow },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createTray(): void {
  let icon: Electron.NativeImage;
  if (process.platform === "win32") {
    icon = nativeImage.createFromPath(join(iconsDir(), "windows/icon.ico"));
  } else {
    icon = nativeImage.createFromPath(join(iconsDir(), "macos/16x16.png"));
    try {
      icon.addRepresentation({
        scaleFactor: 2,
        buffer: readFileSync(join(iconsDir(), "macos/32x32.png")),
      });
    } catch {}
  }
  tray = new Tray(icon);
  tray.on("double-click", createWindow);
  refreshTray();
}

async function testPrint(): Promise<{ ok: boolean; error?: string }> {
  if (!config.printer) {
    return { ok: false, error: "Select a default printer first" };
  }
  const { width, height } = config.testLabel;
  const label = new TSPL()
    .size(width, height)
    .gap(2)
    .direction(1)
    .cls()
    .text("TSPL Bridge OK", { x: 16, y: 16, xMultiplier: 2, yMultiplier: 2 })
    .text(new Date().toLocaleString("id-ID"), { x: 16, y: 80 })
    .qrcode(`http://127.0.0.1:${config.port}/health`, { x: 16, y: 130, cellWidth: 4 })
    .setTear(true)
    .print(1);
  try {
    await new CupsTransport(config.printer).send(label.toBuffer());
    pushLog({
      time: new Date().toISOString(),
      level: "info",
      message: `Test print → ${config.printer}`,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

function registerIpc(): void {
  ipcMain.handle("config:get", () => config);
  ipcMain.handle("config:save", async (_e, next: AppConfig) => {
    await applyConfig(next);
    return serverStatus();
  });
  ipcMain.handle("printers:list", () => listPrinters());
  ipcMain.handle("server:status", () => serverStatus());
  ipcMain.handle("server:start", async () => {
    await startServer();
    return serverStatus();
  });
  ipcMain.handle("server:stop", async () => {
    await stopServer();
    return serverStatus();
  });
  ipcMain.handle("test:print", () => testPrint());
  ipcMain.handle("key:regenerate", async () => {
    await applyConfig({ ...config, apiKey: generateApiKey() });
    return config.apiKey;
  });
  ipcMain.handle("logs:get", () => logs);
}

app.setName("TSPL Print Bridge");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", createWindow);
  app.on("before-quit", () => (quitting = true));
  app.on("window-all-closed", () => {
    // Keep running in the tray — don't quit
  });
  app.on("activate", createWindow);

  void app.whenReady().then(async () => {
    config = loadConfig();
    if (process.platform === "darwin") {
      try {
        app.dock?.setIcon(join(iconsDir(), "macos/app-512.png"));
      } catch {}
    }
    registerIpc();
    createTray();
    createWindow();
    if (config.autoStartServer) await startServer();
  });
}
