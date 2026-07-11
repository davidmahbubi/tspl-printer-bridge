# @davidmahbubi/tspl-bridge-sdk

Browser SDK for **TSPL Print Bridge** — print labels on TSPL/TSPL2 thermal printers
(TSC, Xprinter, HPRT, and compatibles) directly from a web application.

The SDK talks to the TSPL Print Bridge desktop app (or the standalone bridge server)
running on the user's machine over HTTP. It has no dependencies and works in any
browser with `fetch` support.

```
Your web app ──HTTP──► TSPL Print Bridge (localhost:9123) ──► thermal printer
```

## Requirements

- The [TSPL Print Bridge](../../README.md) desktop app installed and running on the
  machine the printer is connected to.
- The bridge API key, shown in the desktop app.

## Installation

```bash
npm install @davidmahbubi/tspl-bridge-sdk
# or from a GitHub mirror of this package:
npm install github:<owner>/tspl-bridge-sdk
```

The published package ships compiled JavaScript with type declarations; no build
step or bundler configuration is required.

## Quick start

```ts
import { TsplBridge } from "@davidmahbubi/tspl-bridge-sdk";

const bridge = new TsplBridge({ apiKey: "your-api-key" });

if (!(await bridge.isAvailable())) {
  // Bridge is not running — tell the user to start the desktop app.
  return;
}

await bridge.print({
  label: { width: 78, height: 100, gap: 3, tear: true },
  elements: [
    { type: "text", x: 24, y: 28, content: "Arabica Coffee 250g", scale: 2 },
    { type: "barcode", x: 24, y: 100, content: "8991234567890", height: 100 },
    { type: "qrcode", x: 24, y: 260, content: "https://example.com/p/123", cellWidth: 5 },
  ],
});
```

## Coordinates and units

Label dimensions (`label.width`, `label.height`, `gap`, `offset`) are in **millimeters**.
Element positions and sizes are in **dots**: at 203 dpi, 8 dots = 1 mm; at 300 dpi,
12 dots = 1 mm. A label 78 mm wide is 624 dots across on a 203 dpi printer.

## API

### `new TsplBridge(options)`

| Option   | Type     | Description                                          |
|----------|----------|------------------------------------------------------|
| `apiKey` | `string` | Required. API key from the bridge app.               |
| `url`    | `string` | Bridge URL. Defaults to `http://127.0.0.1:9123`.     |

### `bridge.isAvailable(): Promise<boolean>`

Returns `true` if the bridge is reachable. Does not require the API key — use it to
decide whether to show printing UI at all.

### `bridge.printers(): Promise<{ printers: string[]; default: string | null }>`

Lists printers available on the user's machine and the default printer configured
in the bridge app.

### `bridge.print(request): Promise<void>`

Prints a label described declaratively. The request contains:

- `label` — label configuration (see below)
- `elements` — array of elements to draw
- `printer` — optional printer name, overriding the bridge's default

#### Label configuration

| Field       | Type                  | Description                                        |
|-------------|-----------------------|----------------------------------------------------|
| `width`     | `number`              | Label width in mm. Required.                       |
| `height`    | `number`              | Label height in mm. Required.                      |
| `gap`       | `number`              | Gap between labels in mm. Default `2`.             |
| `tear`      | `boolean`             | Stop at the label boundary after printing.         |
| `cut`       | `number \| "batch"`   | Cut every *n* labels, or once at the end of the job. Requires a cutter. |
| `offset`    | `number`              | Shift the stop/tear position in mm (calibration).  |
| `density`   | `number`              | Print density, `0`–`15`.                           |
| `direction` | `0 \| 1`              | Print direction. Default `1`.                      |
| `copies`    | `number`              | Number of copies. Default `1`.                     |

#### Elements

Every element has a `type` and a position (`x`, `y`, in dots).

| Type      | Purpose            | Key fields                                                    |
|-----------|--------------------|---------------------------------------------------------------|
| `text`    | Single line of text | `content`, `font`, `scale` (or `xScale`/`yScale`), `rotation` |
| `block`   | Multi-line text in an area | `content`, `width`, `height`, `font`, `scale`          |
| `barcode` | 1D barcode         | `content`, `barcodeType` (default Code 128), `height`, `humanReadable`, `narrow`, `wide` |
| `qrcode`  | QR code            | `content`, `ecc`, `cellWidth`, `mode`                          |
| `box`     | Rectangle outline  | `xEnd`, `yEnd`, `thickness`                                    |
| `bar`     | Filled rectangle   | `width`, `height`                                              |
| `image`   | PNG image (logo)   | `data`, `width`, `threshold`, `mode`                           |

##### Printing an image

The `image` element prints a PNG as a 1-bit monochrome bitmap — the usual way to put
a logo on a label. `data` is the PNG file encoded as base64; a data URL
(`data:image/png;base64,...`) is accepted as-is, which makes canvas output directly
usable:

```ts
const canvas = document.querySelector("canvas");

await bridge.print({
  label: { width: 40, height: 30 },
  elements: [
    { type: "image", x: 16, y: 16, data: canvas.toDataURL("image/png"), width: 160 },
    { type: "text", x: 16, y: 130, content: "Product A" },
  ],
});
```

- `width` (optional) resizes the image to that many dots wide, preserving aspect
  ratio. The printer does no scaling of its own, so size the image here: 160 dots
  = 20 mm at 203 dpi.
- `threshold` (optional, `0`–`255`, default `128`) is the luminance below which a
  pixel prints black. Transparent pixels stay white.
- `mode` (optional) controls how the bitmap combines with the label buffer:
  `0` overwrite (default), `1` OR, `2` XOR.

Thermal printers reproduce hard black-and-white artwork best; grayscale and
photographic images lose detail at print time.

### `bridge.printRaw(tspl, printer?): Promise<void>`

Sends a raw TSPL command string for full control over the printer:

```ts
await bridge.printRaw('SIZE 40 mm,30 mm\r\nCLS\r\nTEXT 16,16,"3",0,1,1,"Hi"\r\nPRINT 1\r\n');
```

## Error handling

All methods throw `TsplBridgeError` on failure. `error.status` carries the HTTP
status code when the bridge responded (`401` invalid API key, `400` invalid payload,
`502` printer unreachable); it is `undefined` when the bridge could not be reached
at all.

```ts
import { TsplBridge, TsplBridgeError } from "@davidmahbubi/tspl-bridge-sdk";

try {
  await bridge.print(request);
} catch (err) {
  if (err instanceof TsplBridgeError && err.status === undefined) {
    // Bridge not running
  } else {
    // Bad payload, auth failure, or printer error — err.message has details
  }
}
```

## Notes on the API key

The key authenticates requests to the bridge on the *user's own machine* — it is not
a secret from that user. Typical setups let the user paste the key from the bridge
app into your web app's settings screen and store it in `localStorage`.
