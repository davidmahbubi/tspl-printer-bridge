# node-tsp

Toolkit untuk mencetak label ke printer thermal berbahasa **TSPL/TSPL2** (TSC, Xprinter, HPRT, dan yang kompatibel):

- `packages/core` — TSPL command builder + transport (network TCP 9100, CUPS USB, device path)
- `packages/server` — **TSPL Print Bridge**: HTTP server localhost supaya web app bisa print via `fetch()`
- `apps/desktop` — GUI Electron untuk bridge (pilih printer, port, API key, autostart, tray)
- `src/cli.ts` — CLI print label
- `clients/tspl-bridge.ts` — helper client untuk dipakai di web app

## Instalasi

```bash
bun install
```

## TSPL Print Bridge (untuk web app)

Jalankan app desktop, pilih printer default, salin API key, lalu dari web app:

```js
const res = await fetch("http://127.0.0.1:9123/print", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Api-Key": "<key>" },
  body: JSON.stringify({
    label: { width: 78, height: 100, gap: 3, tear: true },
    elements: [
      { type: "text", x: 24, y: 28, content: "Halo", scale: 2 },
      { type: "barcode", x: 24, y: 100, content: "8991234567890", height: 100 },
      { type: "qrcode", x: 24, y: 260, content: "https://example.com", cellWidth: 5 },
    ],
  }),
});
```

Atau pakai helper `clients/tspl-bridge.ts` (salin ke project web app). Endpoint:

| Endpoint | Auth | Fungsi |
|---|---|---|
| `GET /health` | – | Deteksi bridge jalan |
| `GET /printers` | ✓ | Daftar printer + default |
| `POST /print` | ✓ | Print declarative (`label`+`elements`) atau raw (`{raw: "SIZE..."}`) |

Elemen yang didukung: `text`, `block` (teks multi-baris), `barcode`, `qrcode`, `box`, `bar`. Koordinat satuan dot (203 dpi = 8 dot/mm). Demo browser: buka `examples/web-demo.html`.

Menjalankan dari source:

```bash
cd apps/desktop && bun run start      # dev
cd apps/desktop && bun run dist      # build .dmg (macOS)
cd apps/desktop && bun run dist:win  # build installer Windows (NSIS)
```

Server bridge juga bisa jalan tanpa GUI: `PRINTER=CXPrinter_DT_369 API_KEY=rahasia bun run packages/server/src/standalone.ts`

> **Catatan Windows**: printing via nama printer memakai perintah `lp` (CUPS) yang hanya ada di macOS/Linux. Di Windows, untuk saat ini gunakan printer jaringan (field `host` di payload, TCP 9100).

## Pemakaian CLI

```bash
# Printer jaringan (TCP port 9100)
bun run src/cli.ts --host 192.168.1.50 --text "Halo Dunia"

# Printer USB via CUPS (cek nama printer: lpstat -p)
bun run src/cli.ts --printer TSC_TE244 --text "Produk A" --barcode 8991234567890

# Kirim file TSPL mentah
bun run src/cli.ts --host 192.168.1.50 --file label.tspl

# Lihat perintah TSPL tanpa mencetak
bun run src/cli.ts --text "Test" --qrcode "https://example.com" --dry-run

# Opsi ukuran label
bun run src/cli.ts --host 192.168.1.50 --width 58 --height 40 --gap 2 \
  --text "Nama Produk" --barcode 123456789 --copies 3

# Berhenti di pembatas label setelah cetak (tear-off, printer tanpa cutter)
bun run src/cli.ts --printer DT369 --text "Produk A" --tear

# Potong otomatis (printer dengan pisau cutter): tiap 1 label / sekali di akhir
bun run src/cli.ts --printer DT369 --text "Produk A" --cut 1
bun run src/cli.ts --printer DT369 --text "Produk A" --copies 5 --cut batch

# Kalibrasi posisi berhenti/sobek (mm, bisa negatif)
bun run src/cli.ts --printer DT369 --text "Produk A" --tear --offset 2
```

Jalankan `bun run src/cli.ts --help` untuk daftar opsi lengkap.

## Pemakaian sebagai Library

```ts
import { TSPL, NetworkTransport, CupsTransport } from "./src/index";

const label = new TSPL()
  .size(40, 30)        // mm
  .gap(2)
  .direction(1)
  .cls()
  .text("Kopi Arabika 250g", { x: 16, y: 16 })
  .barcode("8991234567890", { x: 16, y: 60, type: "EAN13", height: 80 })
  .qrcode("https://example.com/p/123", { x: 220, y: 60, cellWidth: 4 })
  .setTear(true)       // berhenti di pembatas label (atau .setCutter(1) untuk cutter)
  .print(1, 2);        // 1 set, 2 salinan

// Kirim via jaringan
await new NetworkTransport("192.168.1.50").send(label.toBuffer());

// atau via USB/CUPS (macOS/Linux)
await new CupsTransport("TSC_TE244").send(label.toBuffer());
```

### Contoh label pengiriman

```bash
bun run examples/shipping-label.ts               # dry run
bun run examples/shipping-label.ts 192.168.1.50  # cetak
```

## Catatan koneksi USB (macOS)

Tambahkan printer ke CUPS dengan driver **raw** agar data TSPL diteruskan apa adanya:

```bash
lpadmin -p TSPL_PRINTER -E -v usb://TSC/TE244 -m raw
bun run src/cli.ts --printer TSPL_PRINTER --text "Test"
```

Cari URI perangkat USB dengan `lpinfo -v`.

## Catatan satuan

Koordinat TSPL memakai satuan **dot**: printer 203 dpi = 8 dot/mm, 300 dpi = 12 dot/mm. Label 40 mm lebar pada 203 dpi = 320 dot.
