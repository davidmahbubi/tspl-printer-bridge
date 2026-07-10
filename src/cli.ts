#!/usr/bin/env bun
/**
 * TSPL label printing CLI.
 *
 * Examples:
 *   bun run src/cli.ts --host 192.168.1.50 --text "Halo Dunia"
 *   bun run src/cli.ts --printer TSC_TE244 --text "Produk A" --barcode 8991234567890
 *   bun run src/cli.ts --host 192.168.1.50 --file label.tspl
 *   bun run src/cli.ts --host 192.168.1.50 --text "Test" --dry-run
 */
import { parseArgs } from "util";
import {
  TSPL,
  CupsTransport,
  FileTransport,
  NetworkTransport,
  type Transport,
} from "@node-tsp/core";

const HELP = `tspl-print — print label ke printer TSPL

Pemakaian:
  tspl-print [koneksi] [konten] [opsi label]

Koneksi (pilih salah satu):
  --host <ip>          Printer jaringan (TCP port 9100)
  --port <n>           Port jaringan (default: 9100)
  --printer <nama>     Printer USB/lokal via CUPS (lihat: lpstat -p)
  --device <path>      Device path, mis. /dev/usb/lp0

Konten:
  --text <teks>        Baris teks (bisa dipakai berulang kali)
  --barcode <data>     Barcode Code 128
  --qrcode <data>      QR code
  --file <path>        Kirim file .tspl mentah (mengabaikan opsi konten lain)

Opsi label:
  --width <mm>         Lebar label mm (default: 40)
  --height <mm>        Tinggi label mm (default: 30)
  --gap <mm>           Gap antar label mm (default: 2)
  --copies <n>         Jumlah salinan (default: 1)
  --density <0-15>     Kepekatan cetak
  --tear               Berhenti di pembatas label setelah cetak (SET TEAR ON)
  --cut <n|batch>      Potong tiap n label, atau "batch" = sekali di akhir job
                       (butuh printer dengan pisau cutter)
  --offset <mm>        Geser posisi berhenti/sobek label (kalibrasi)

Lainnya:
  --dry-run            Tampilkan perintah TSPL tanpa mengirim ke printer
  --help               Tampilkan bantuan ini
`;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    host: { type: "string" },
    port: { type: "string" },
    printer: { type: "string" },
    device: { type: "string" },
    text: { type: "string", multiple: true },
    barcode: { type: "string" },
    qrcode: { type: "string" },
    file: { type: "string" },
    width: { type: "string", default: "40" },
    height: { type: "string", default: "30" },
    gap: { type: "string", default: "2" },
    copies: { type: "string", default: "1" },
    density: { type: "string" },
    tear: { type: "boolean", default: false },
    cut: { type: "string" },
    offset: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

function buildTransport(): Transport | null {
  if (values.host) {
    return new NetworkTransport(values.host, Number(values.port ?? 9100));
  }
  if (values.printer) return new CupsTransport(values.printer);
  if (values.device) return new FileTransport(values.device);
  return null;
}

async function buildPayload(): Promise<Uint8Array> {
  if (values.file) {
    return new Uint8Array(await Bun.file(values.file).arrayBuffer());
  }

  const texts = values.text ?? [];
  if (texts.length === 0 && !values.barcode && !values.qrcode) {
    console.error(
      "Tidak ada konten. Gunakan --text / --barcode / --qrcode / --file. Lihat --help."
    );
    process.exit(1);
  }

  const label = new TSPL()
    .size(Number(values.width), Number(values.height))
    .gap(Number(values.gap))
    .direction(1)
    .cls();

  if (values.density) label.density(Number(values.density));
  if (values.offset) label.offset(Number(values.offset));
  if (values.tear) label.setTear(true);
  if (values.cut) {
    label.setCutter(values.cut === "batch" ? "batch" : Number(values.cut));
  }

  let y = 16;
  for (const t of texts) {
    label.text(t, { x: 16, y });
    y += 32;
  }
  if (values.barcode) {
    label.barcode(values.barcode, { x: 16, y, height: 72 });
    y += 104;
  }
  if (values.qrcode) {
    label.qrcode(values.qrcode, { x: 16, y, cellWidth: 4 });
  }

  label.print(1, Number(values.copies));
  return label.toBuffer();
}

const payload = await buildPayload();

if (values["dry-run"]) {
  console.log(new TextDecoder().decode(payload));
  process.exit(0);
}

const transport = buildTransport();
if (!transport) {
  console.error(
    "Tentukan koneksi printer: --host <ip>, --printer <nama>, atau --device <path>. Lihat --help."
  );
  process.exit(1);
}

await transport.send(payload);
console.log("✓ Label terkirim ke printer.");
