export {}; // jadikan module supaya declare global valid

interface AppConfig {
  port: number;
  apiKey: string;
  printer: string;
  corsOrigins: string;
  autostart: boolean;
  autoStartServer: boolean;
  testLabel: { width: number; height: number };
}
interface ServerStatus { running: boolean; port: number }
interface LogEntry { time: string; level: "info" | "error"; message: string }

declare global {
  interface Window {
    bridge: {
      getConfig(): Promise<AppConfig>;
      saveConfig(cfg: AppConfig): Promise<ServerStatus>;
      listPrinters(): Promise<string[]>;
      serverStatus(): Promise<ServerStatus>;
      startServer(): Promise<ServerStatus>;
      stopServer(): Promise<ServerStatus>;
      testPrint(): Promise<{ ok: boolean; error?: string }>;
      regenerateKey(): Promise<string>;
      getLogs(): Promise<LogEntry[]>;
      onLog(cb: (entry: LogEntry) => void): void;
      onStatus(cb: (status: ServerStatus) => void): void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const portInput = $<HTMLInputElement>("port");
const apiKeyInput = $<HTMLInputElement>("api-key");
const corsInput = $<HTMLInputElement>("cors");
const printerSelect = $<HTMLSelectElement>("printer");
const testWidth = $<HTMLInputElement>("test-width");
const testHeight = $<HTMLInputElement>("test-height");
const autostartCheck = $<HTMLInputElement>("autostart");
const autoStartServerCheck = $<HTMLInputElement>("auto-start-server");
const logPre = $<HTMLPreElement>("log");
const saveNote = $<HTMLSpanElement>("save-note");

function renderStatus(status: ServerStatus): void {
  const el = $("status");
  el.classList.toggle("running", status.running);
  el.classList.toggle("stopped", !status.running);
  $("status-text").textContent = status.running
    ? `Jalan di :${status.port}`
    : "Berhenti";
  $<HTMLButtonElement>("btn-toggle").textContent = status.running
    ? "Stop Server"
    : "Start Server";
  $("server-url").textContent = status.running
    ? `http://127.0.0.1:${status.port}`
    : "";
}

function appendLog(entry: LogEntry): void {
  const line = document.createElement("span");
  line.textContent = `${entry.time.slice(11, 19)} ${entry.message}\n`;
  if (entry.level === "error") line.className = "err";
  logPre.appendChild(line);
  while (logPre.childNodes.length > 100) logPre.removeChild(logPre.firstChild!);
  logPre.scrollTop = logPre.scrollHeight;
}

async function loadPrinters(selected: string): Promise<void> {
  const printers = await window.bridge.listPrinters();
  printerSelect.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "— pilih printer —";
  printerSelect.appendChild(empty);
  for (const name of printers) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    printerSelect.appendChild(opt);
  }
  printerSelect.value = printers.includes(selected) ? selected : "";
}

function collectConfig(base: AppConfig): AppConfig {
  return {
    ...base,
    port: Number(portInput.value) || 9123,
    printer: printerSelect.value,
    corsOrigins: corsInput.value.trim() || "*",
    autostart: autostartCheck.checked,
    autoStartServer: autoStartServerCheck.checked,
    testLabel: {
      width: Number(testWidth.value) || 78,
      height: Number(testHeight.value) || 100,
    },
  };
}

function note(text: string, isError = false): void {
  saveNote.textContent = text;
  saveNote.style.color = isError ? "var(--err)" : "var(--muted)";
  setTimeout(() => {
    if (saveNote.textContent === text) saveNote.textContent = "";
  }, 4000);
}

async function init(): Promise<void> {
  let config = await window.bridge.getConfig();

  portInput.value = String(config.port);
  apiKeyInput.value = config.apiKey;
  corsInput.value = config.corsOrigins;
  testWidth.value = String(config.testLabel.width);
  testHeight.value = String(config.testLabel.height);
  autostartCheck.checked = config.autostart;
  autoStartServerCheck.checked = config.autoStartServer;
  await loadPrinters(config.printer);
  renderStatus(await window.bridge.serverStatus());
  for (const entry of await window.bridge.getLogs()) appendLog(entry);

  window.bridge.onLog(appendLog);
  window.bridge.onStatus(renderStatus);

  $("btn-toggle").addEventListener("click", async () => {
    const status = await window.bridge.serverStatus();
    renderStatus(
      status.running
        ? await window.bridge.stopServer()
        : await window.bridge.startServer()
    );
  });

  $("btn-save").addEventListener("click", async () => {
    config = collectConfig(config);
    renderStatus(await window.bridge.saveConfig(config));
    note("Tersimpan ✓");
  });

  $("btn-copy-key").addEventListener("click", () => {
    navigator.clipboard.writeText(apiKeyInput.value);
    note("API key disalin");
  });

  $("btn-regen-key").addEventListener("click", async () => {
    if (!confirm("Generate API key baru? Web app yang memakai key lama akan berhenti bisa print.")) return;
    apiKeyInput.value = await window.bridge.regenerateKey();
    config.apiKey = apiKeyInput.value;
    note("API key baru dibuat");
  });

  $("btn-refresh-printers").addEventListener("click", () =>
    loadPrinters(printerSelect.value)
  );

  $("btn-test-print").addEventListener("click", async () => {
    // Simpan dulu supaya printer & ukuran label test terpakai
    config = collectConfig(config);
    renderStatus(await window.bridge.saveConfig(config));
    const result = await window.bridge.testPrint();
    note(result.ok ? "Test print terkirim ✓" : `Gagal: ${result.error}`, !result.ok);
  });
}

void init();
