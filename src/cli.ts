#!/usr/bin/env bun
/**
 * TSPL label printing CLI.
 *
 * Examples:
 *   bun run src/cli.ts --host 192.168.1.50 --text "Hello World"
 *   bun run src/cli.ts --printer TSC_TE244 --text "Product A" --barcode 8991234567890
 *   bun run src/cli.ts --host 192.168.1.50 --file label.tspl
 *   bun run src/cli.ts --host 192.168.1.50 --text "Test" --dry-run
 */
import { parseArgs } from "util";
import {
  TSPL,
  localPrinterTransport,
  FileTransport,
  NetworkTransport,
  monoFromPNG,
  type Transport,
} from "@davidmahbubi/tspl-bridge-core";

const HELP = `tspl-print — print labels to a TSPL printer

Usage:
  tspl-print [connection] [content] [label options]

Connection (pick one):
  --host <ip>          Network printer (TCP port 9100)
  --port <n>           Network port (default: 9100)
  --printer <name>     USB/local printer via CUPS or Windows spooler
  --device <path>      Device path, e.g. /dev/usb/lp0

Content:
  --text <text>        Line of text (can be repeated)
  --barcode <data>     Code 128 barcode
  --qrcode <data>      QR code
  --image <path>       PNG image/logo, printed above the text (1-bit, threshold)
  --image-width <mm>   Resize the image to this width in mm (8 dots/mm)
  --file <path>        Send a raw .tspl file (ignores other content options)

Label options:
  --width <mm>         Label width in mm (default: 40)
  --height <mm>        Label height in mm (default: 30)
  --gap <mm>           Gap between labels in mm (default: 2)
  --copies <n>         Number of copies (default: 1)
  --density <0-15>     Print density
  --tear               Stop at the label boundary after printing (SET TEAR ON)
  --cut <n|batch>      Cut every n labels, or "batch" = once at the end of the job
                       (requires a printer with a cutter)
  --offset <mm>        Shift the stop/tear position (calibration)

Other:
  --dry-run            Show the TSPL commands without sending to the printer
  --help               Show this help
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
    image: { type: "string" },
    "image-width": { type: "string" },
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
  if (values.printer) return localPrinterTransport(values.printer);
  if (values.device) return new FileTransport(values.device);
  return null;
}

interface Payload {
  data: Uint8Array;
  /** Readable form for --dry-run (bitmap payloads shown as a placeholder). */
  preview: string;
}

async function buildPayload(): Promise<Payload> {
  if (values.file) {
    const data = new Uint8Array(await Bun.file(values.file).arrayBuffer());
    return { data, preview: new TextDecoder().decode(data) };
  }

  const texts = values.text ?? [];
  if (texts.length === 0 && !values.barcode && !values.qrcode && !values.image) {
    console.error(
      "No content. Use --text / --barcode / --qrcode / --image / --file. See --help."
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
  if (values.image) {
    const png = new Uint8Array(await Bun.file(values.image).arrayBuffer());
    const widthDots = values["image-width"]
      ? Math.round(Number(values["image-width"]) * 8)
      : undefined;
    const logo = monoFromPNG(png, { widthDots });
    label.bitmap(logo, { x: 16, y });
    y += logo.height + 8;
  }
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
  return { data: label.toBuffer(), preview: label.toString() };
}

const payload = await buildPayload();

if (values["dry-run"]) {
  console.log(payload.preview);
  process.exit(0);
}

const transport = buildTransport();
if (!transport) {
  console.error(
    "Specify a printer connection: --host <ip>, --printer <name>, or --device <path>. See --help."
  );
  process.exit(1);
}

await transport.send(payload.data);
console.log("✓ Label sent to printer.");
