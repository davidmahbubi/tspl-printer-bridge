# TSPL Printer Bridge

Toolkit for printing labels on **TSPL/TSPL2** thermal printers (TSC, Xprinter, HPRT, CXPrinter, and compatibles).

## Structure

| Path | Contents |
|---|---|
| `packages/core` | TSPL command builder + transports (TCP 9100, CUPS, device path) |
| `packages/server` | HTTP bridge server for printing from web apps |
| `apps/desktop` | **TSPL Print Bridge** — desktop app (Electron) for the bridge |
| `src/cli.ts` | Label printing CLI |
| `packages/client` | **@davidmahbubi/tspl-bridge-sdk** — browser SDK for web apps (zero dependencies) |
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

Or use the **@davidmahbubi/tspl-bridge-sdk** SDK (`packages/client`, zero dependencies):

```ts
import { TsplBridge } from "@davidmahbubi/tspl-bridge-sdk";

const bridge = new TsplBridge({ apiKey: "<key>" });
if (await bridge.isAvailable()) {
  await bridge.print({
    label: { width: 78, height: 100, gap: 3, tear: true },
    elements: [
      { type: "image", x: 24, y: 16, data: pngBase64, width: 160 },
      { type: "text", x: 24, y: 120, content: "Hello", scale: 2 },
    ],
  });
}
```

Distributing the SDK to clients: publish `packages/client` to npm (`cd packages/client
&& npm publish`), or mirror it to its own GitHub repo so it can be installed with a
plain `github:` dependency (`dist/` is committed, so no build step is needed):

```bash
# one-time: create an empty repo, e.g. <you>/tspl-bridge-sdk, then from this repo:
git subtree push --prefix packages/client git@github.com:<you>/tspl-bridge-sdk.git main
# clients then install with:
#   "@davidmahbubi/tspl-bridge-sdk": "github:<you>/tspl-bridge-sdk"
```

> Don't point clients at this monorepo itself (`github:<you>/node-tsp`) — git
> dependencies always fetch the whole repo, and the root package's `workspace:*`
> dependencies don't resolve outside the workspace.

### Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | – | Check that the bridge is running (for detection from web apps) |
| `GET /printers` | ✓ | List printers + default printer |
| `POST /print` | ✓ | Declarative print (`label` + `elements`) or raw (`{ "raw": "SIZE..." }`) |

Auth uses the `X-Api-Key` header. Supported elements: `text`, `block` (multi-line text),
`barcode`, `qrcode`, `box`, `bar`, `image` (PNG logo — `data` is the PNG as base64 or a
data URL; optional `width` in dots resizes it, `threshold` 0-255 sets the black/white
cutoff). Coordinates are in **dots** (203 dpi = 8 dots/mm,
300 dpi = 12 dots/mm). The payload may include `printer` (CUPS printer name) or
`host`/`port` (network printer) to override the default printer.

Try it from a browser: open `examples/web-demo.html`, enter the API key, click Print.

### Running the desktop app

```bash
cd apps/desktop
bun run start     # development
```

### Building the desktop app (per platform)

Builds are produced with **electron-builder**; the output lands in `apps/desktop/release/`.

**macOS** (.dmg, Apple Silicon/arm64):

```bash
cd apps/desktop
bun run dist
# → release/TSPL Print Bridge-<version>-arm64.dmg
```

The build is unsigned by default — on other Macs, right-click → Open (or clear the
quarantine flag with `xattr -dr com.apple.quarantine "/Applications/TSPL Print Bridge.app"`).
For a notarized build, configure your Developer ID identity via electron-builder's
standard `CSC_LINK`/`CSC_KEY_PASSWORD` env vars.

**Windows** (NSIS installer, x64):

```bash
cd apps/desktop
bun run dist:win
# → release/TSPL Print Bridge Setup <version>.exe
```

Can be built from macOS/Linux too — electron-builder downloads the NSIS tooling
automatically (no Wine needed). Code signing, if wanted, must be configured separately.

**Linux** (AppImage + .deb, x64):

```bash
cd apps/desktop
bun run dist:linux
# → release/TSPL Print Bridge-<version>.AppImage and release/tspl-bridge-desktop_<version>_amd64.deb
```

Printing by printer name uses CUPS (`lp`), which works on Linux out of the box.

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

# Print a PNG logo above the text (resized to 20 mm wide)
bun run src/cli.ts --printer CXPrinter_DT_369 --image logo.png --image-width 20 --text "Product A"

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
import { TSPL, NetworkTransport, CupsTransport } from "@davidmahbubi/tspl-bridge-core";

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

### Printing a logo / image

TSPL prints 1-bit monochrome bitmaps via the `BITMAP` command. Convert pixels with
`monoFromRGBA` (canvas `ImageData`-compatible) or `monoFromGray`, then place the
result with `.bitmap()`:

```ts
import { TSPL, monoFromRGBA } from "@davidmahbubi/tspl-bridge-core";

// rgba: Uint8Array of RGBA pixels, e.g. from a canvas (ctx.getImageData(...).data)
// or a PNG decoder like pngjs. Pixels darker than `threshold` print black;
// transparent pixels stay white.
const logo = monoFromRGBA(rgba, width, height, { threshold: 128 });

const label = new TSPL()
  .size(40, 30)
  .gap(2)
  .cls()
  .bitmap(logo, { x: 16, y: 16 }) // mode: 0 = overwrite (default), 1 = OR, 2 = XOR
  .text("Arabica Coffee 250g", { x: 16, y: 16 + height + 8 })
  .print(1);
```

Sizing tip: at 203 dpi, 8 dots = 1 mm, so a 160-pixel-wide logo prints 20 mm wide.
Resize/threshold the image before converting — the printer does no scaling. Logos
with hard black/white contrast print best; `toString()` shows bitmap payloads as a
`<n bytes>` placeholder, use `toBuffer()` for the real bytes.

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
