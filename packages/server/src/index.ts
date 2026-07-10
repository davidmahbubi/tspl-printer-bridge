export {
  createBridgeServer,
  listPrinters,
  BRIDGE_VERSION,
} from "./server";
export type {
  BridgeConfig,
  BridgeServer,
  LogEntry,
  PrintTarget,
} from "./server";
export { buildTspl, validatePrintPayload, ValidationError } from "./schema";
export type {
  DeclarativePayload,
  RawPayload,
  PrintPayload,
  LabelConfig,
  Element,
} from "./schema";

// Standalone runner (dev/test): bun run packages/server/src/index.ts
if (import.meta.main) {
  const { createBridgeServer } = await import("./server");
  const server = createBridgeServer({
    port: Number(process.env.PORT ?? 9123),
    apiKey: process.env.API_KEY ?? "dev-key",
    printer: process.env.PRINTER,
    corsOrigins: process.env.CORS_ORIGINS ?? "*",
  });
  server.onLog((entry) => console.log(`[${entry.level}] ${entry.message}`));
  const { port } = await server.start();
  console.log(`TSPL Bridge (standalone) di http://127.0.0.1:${port} — API key: ${process.env.API_KEY ?? "dev-key"}`);
}
