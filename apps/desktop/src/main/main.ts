import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from "electron";
import { join } from "node:path";
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
        message: `Gagal start server: ${message}`,
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

/** Terapkan config baru: restart server bila sedang jalan. */
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
    resizable: true,
    title: "TSPL Print Bridge",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
    },
  });
  win.loadFile(join(__dirname, "../renderer/index.html"));
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win?.hide(); // tetap jalan di tray
    }
  });
  win.on("closed", () => (win = null));
}

function refreshTray(): void {
  if (!tray) return;
  const running = server?.isRunning() ?? false;
  tray.setToolTip(
    running ? `TSPL Bridge — jalan di :${config.port}` : "TSPL Bridge — berhenti"
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: running ? `Server jalan di port ${config.port}` : "Server berhenti",
        enabled: false,
      },
      { type: "separator" },
      running
        ? { label: "Stop Server", click: () => void stopServer() }
        : { label: "Start Server", click: () => void startServer() },
      { label: "Buka Pengaturan", click: createWindow },
      { type: "separator" },
      {
        label: "Keluar",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createTray(): void {
  const iconFile =
    process.platform === "win32" ? "tray-win.png" : "trayTemplate.png";
  const icon = nativeImage.createFromPath(join(__dirname, "../assets", iconFile));
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.on("double-click", createWindow);
  refreshTray();
}

async function testPrint(): Promise<{ ok: boolean; error?: string }> {
  if (!config.printer) {
    return { ok: false, error: "Pilih printer default dulu" };
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

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", createWindow);
  app.on("before-quit", () => (quitting = true));
  app.on("window-all-closed", () => {
    // Tetap jalan di tray — jangan quit
  });
  app.on("activate", createWindow);

  void app.whenReady().then(async () => {
    config = loadConfig();
    registerIpc();
    createTray();
    createWindow();
    if (config.autoStartServer) await startServer();
  });
}
