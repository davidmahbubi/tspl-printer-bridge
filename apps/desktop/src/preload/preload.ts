import { contextBridge, ipcRenderer } from "electron";

const api = {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke("config:save", cfg),
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  serverStatus: () => ipcRenderer.invoke("server:status"),
  startServer: () => ipcRenderer.invoke("server:start"),
  stopServer: () => ipcRenderer.invoke("server:stop"),
  testPrint: () => ipcRenderer.invoke("test:print"),
  regenerateKey: () => ipcRenderer.invoke("key:regenerate"),
  exportSettings: () => ipcRenderer.invoke("config:export"),
  importSettings: () => ipcRenderer.invoke("config:import"),
  getLogs: () => ipcRenderer.invoke("logs:get"),
  onLog: (cb: (entry: unknown) => void) =>
    ipcRenderer.on("bridge-log", (_e, entry) => cb(entry)),
  onStatus: (cb: (status: unknown) => void) =>
    ipcRenderer.on("bridge-status", (_e, status) => cb(status)),
};

contextBridge.exposeInMainWorld("bridge", api);

export type BridgeApi = typeof api;
