/**
 * Contoh: label pengiriman 78x100 mm dengan barcode resi + QR code.
 *
 * Jalankan:
 *   bun run examples/shipping-label.ts                              # dry run
 *   bun run examples/shipping-label.ts --host 192.168.1.50          # printer jaringan
 *   bun run examples/shipping-label.ts --printer CXPrinter_DT_369   # printer USB/CUPS
 */
import { parseArgs } from "util";
import {
  TSPL,
  NetworkTransport,
  CupsTransport,
  type Transport,
} from "@node-tsp/core";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    host: { type: "string" },
    port: { type: "string" },
    printer: { type: "string" },
  },
});

// Label 78 x 100 mm @ 203 dpi (8 dot/mm) = 624 x 800 dot
const label = new TSPL()
  .size(78, 100)
  .gap(3)
  .direction(1)
  .density(8)
  .cls()
  .box(8, 8, 616, 792, 3)
  .text("TOKO MAJU JAYA", { x: 24, y: 28, font: "3", xMultiplier: 2, yMultiplier: 2 })
  .bar(8, 92, 608, 3)
  .text("Penerima:", { x: 24, y: 112 })
  .text("Budi Santoso", { x: 24, y: 148, xMultiplier: 2, yMultiplier: 2 })
  .block("Jl. Merdeka No. 123, RT 04/RW 02, Kel. Sukamaju, Bandung, Jawa Barat 40123", {
    x: 24, y: 210, width: 576, height: 120,
  })
  .bar(8, 344, 608, 3)
  .text("No. Resi:", { x: 24, y: 364 })
  .barcode("JNE1234567890123", { x: 24, y: 400, height: 100, humanReadable: 1 })
  .bar(8, 566, 608, 3)
  .text("COD: Rp 150.000", { x: 24, y: 600, xMultiplier: 2, yMultiplier: 2 })
  .qrcode("https://tracking.example.com/JNE1234567890123", { x: 440, y: 596, cellWidth: 5 })
  .setTear(true)
  .print(1);

let transport: Transport | null = null;
if (values.host) {
  transport = new NetworkTransport(values.host, Number(values.port ?? 9100));
} else if (values.printer) {
  transport = new CupsTransport(values.printer);
}

if (!transport) {
  console.log("— Dry run (pakai --host <ip> atau --printer <nama> untuk mencetak) —\n");
  console.log(label.toString());
} else {
  await transport.send(label.toBuffer());
  console.log("✓ Label terkirim ke printer.");
}
