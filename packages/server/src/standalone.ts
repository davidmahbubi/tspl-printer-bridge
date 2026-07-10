// Standalone runner (dev/test): bun run packages/server/src/standalone.ts
import { createBridgeServer } from "./server";

const apiKey = process.env.API_KEY ?? "dev-key";
const server = createBridgeServer({
  port: Number(process.env.PORT ?? 9123),
  apiKey,
  printer: process.env.PRINTER,
  corsOrigins: process.env.CORS_ORIGINS ?? "*",
});
server.onLog((entry) => console.log(`[${entry.level}] ${entry.message}`));
const { port } = await server.start();
console.log(`TSPL Bridge (standalone) di http://127.0.0.1:${port} — API key: ${apiKey}`);
