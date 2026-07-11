# TSPL Printer Bridge

Toolkit for printing labels on **TSPL/TSPL2** thermal printers (TSC, Xprinter, HPRT, CXPrinter, and compatibles).

## Structure

| Path | Contents |
|---|---|
| `packages/core` | TSPL command builder + transports (TCP 9100, CUPS, device path) |
| `packages/server` | HTTP bridge server for printing from web apps |
| `apps/desktop` | **TSPL Print Bridge** — desktop app (Electron) for the bridge |
| `src/cli.ts` | Label printing CLI |
| `clients/tspl-bridge.ts` | Client helper for web apps |
| `examples/` | Shipping label example + web demo |

## Installation

```bash
bun install
```

## TSPL Print Bridge (printing from a web app)

Run the desktop app, pick a default printer, copy the API key, then from your web app:

```js
const res = await fetch("http://127.0.0.1:9123/print", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Api-Key": "<key>" },
  body: JSON.stringify({
    label: { width: 78, height: 100, gap: 3, tear: true },
    elements: [
      { type: "text", x: 24, y: 28, content: "Hello", scale: 2 },
      { type: "barcode", x: 24, y: 100, content: "8991234567890", height: 100 },
      { type: "qrcode", x: 24, y: 260, content: "https://example.com", cellWidth: 5 },
    ],
  }),
});
```

Or copy `clients/tspl-bridge.ts` into your web app and use the `TsplBridge` class.

### Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | – | Check that the bridge is running (for detection from web apps) |
| `GET /printers` | ✓ | List printers + default printer |
| `POST /print` | ✓ | Declarative print (`label` + `elements`) or raw (`{ "raw": "SIZE..." }`) |

Auth uses the `X-Api-Key` header. Supported elements: `text`, `block` (multi-line text),
`barcode`, `qrcode`, `box`, `bar`. Coordinates are in **dots** (203 dpi = 8 dots/mm,
300 dpi = 12 dots/mm). The payload may include `printer` (CUPS printer name) or
`host`/`port` (network printer) to override the default printer.

Try it from a browser: open `examples/web-demo.html`, enter the API key, click Print.

### Running the desktop app

```bash
cd apps/desktop
bun run start     # development
bun run dist      # build .dmg (macOS)
bun run dist:win  # build Windows installer (NSIS)
```

The bridge server can also run without the GUI:

```bash
PRINTER=CXPrinter_DT_369 API_KEY=secret bun run packages/server/src/standalone.ts
```

> **Windows note**: printing by printer name uses `lp` (CUPS), which only exists on
> macOS/Linux. On Windows, use a network printer (`host` field in the payload, TCP 9100).

## CLI

```bash
# USB printer via CUPS (list printer names: lpstat -p)
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Product A" --barcode 8991234567890

# Network printer (TCP port 9100)
bun run src/cli.ts --host 192.168.1.50 --text "Hello World"

# Send a raw TSPL file
bun run src/cli.ts --printer CXPrinter_DT_369 --file label.tspl

# Preview TSPL commands without printing
bun run src/cli.ts --text "Test" --qrcode "https://example.com" --dry-run

# Label size + copies
bun run src/cli.ts --printer CXPrinter_DT_369 --width 78 --height 100 --gap 3 \
  --text "Product Name" --barcode 123456789 --copies 3

# Stop at the label boundary after printing (tear-off)
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Product A" --tear

# Printers with a cutter: cut every label / once at the end of the job
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Product A" --cut 1
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Product A" --copies 5 --cut batch

# Calibrate the stop/tear position (mm, may be negative)
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Product A" --tear --offset 2
```

Run `bun run src/cli.ts --help` for the full list of options.

## Using as a library

```ts
import { TSPL, NetworkTransport, CupsTransport } from "@node-tsp/core";

const label = new TSPL()
  .size(40, 30)        // mm
  .gap(2)
  .direction(1)
  .cls()
  .text("Arabica Coffee 250g", { x: 16, y: 16 })
  .barcode("8991234567890", { x: 16, y: 60, type: "EAN13", height: 80 })
  .qrcode("https://example.com/p/123", { x: 220, y: 60, cellWidth: 4 })
  .setTear(true)
  .print(1, 2);        // 1 set, 2 copies

await new CupsTransport("CXPrinter_DT_369").send(label.toBuffer()); // USB via CUPS
await new NetworkTransport("192.168.1.50").send(label.toBuffer()); // network
```

78×100 mm shipping label example:

```bash
bun run examples/shipping-label.ts                              # dry run
bun run examples/shipping-label.ts --printer CXPrinter_DT_369   # print via CUPS
bun run examples/shipping-label.ts --host 192.168.1.50          # print via network
```

## USB printer notes (macOS)

- Data is sent through the CUPS queue with `lp -o raw`, so the queue's driver does not
  matter — the queue macOS creates automatically when the printer is plugged in is enough.
  Find its name with `lpstat -p`.
- `lpadmin -m raw` is **no longer supported** on recent macOS ("Raw queues are no longer
  supported") — it is not needed, don't use it.
- If the printout shows raw TSPL commands as text instead of a label, the printer is in
  ESC/POS mode — switch it to TSPL/label mode via the printer's buttons or vendor utility.
