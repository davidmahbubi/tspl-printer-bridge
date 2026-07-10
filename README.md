# node-tsp

Toolkit untuk mencetak label ke printer thermal berbahasa **TSPL/TSPL2** (TSC, Xprinter, HPRT, CXPrinter, dan yang kompatibel).

## Struktur

| Path | Isi |
|---|---|
| `packages/core` | TSPL command builder + transport (TCP 9100, CUPS, device path) |
| `packages/server` | HTTP bridge server untuk print dari web app |
| `apps/desktop` | **TSPL Print Bridge** — aplikasi desktop (Electron) untuk bridge |
| `src/cli.ts` | CLI print label |
| `clients/tspl-bridge.ts` | Helper client untuk web app |
| `examples/` | Contoh label pengiriman + demo web |

## Instalasi

```bash
bun install
```

## TSPL Print Bridge (print dari web app)

Jalankan aplikasi desktop, pilih printer default, salin API key, lalu dari web app:

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

Atau salin `clients/tspl-bridge.ts` ke project web app dan pakai class `TsplBridge`.

### Endpoint

| Endpoint | Auth | Fungsi |
|---|---|---|
| `GET /health` | – | Cek bridge jalan (untuk deteksi dari web app) |
| `GET /printers` | ✓ | Daftar printer + printer default |
| `POST /print` | ✓ | Print declarative (`label` + `elements`) atau raw (`{ "raw": "SIZE..." }`) |

Auth memakai header `X-Api-Key`. Elemen yang didukung: `text`, `block` (teks multi-baris),
`barcode`, `qrcode`, `box`, `bar`. Koordinat memakai satuan **dot** (203 dpi = 8 dot/mm,
300 dpi = 12 dot/mm). Payload bisa menyertakan `printer` (nama printer CUPS) atau
`host`/`port` (printer jaringan) untuk override printer default.

Coba dari browser: buka `examples/web-demo.html`, isi API key, klik Print.

### Menjalankan aplikasi desktop

```bash
cd apps/desktop
bun run start     # development
bun run dist      # build .dmg (macOS)
bun run dist:win  # build installer Windows (NSIS)
```

Server bridge juga bisa jalan tanpa GUI:

```bash
PRINTER=CXPrinter_DT_369 API_KEY=rahasia bun run packages/server/src/standalone.ts
```

> **Catatan Windows**: printing via nama printer memakai `lp` (CUPS) yang hanya ada di
> macOS/Linux. Di Windows gunakan printer jaringan (field `host` di payload, TCP 9100).

## CLI

```bash
# Printer USB via CUPS (cek nama printer: lpstat -p)
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Produk A" --barcode 8991234567890

# Printer jaringan (TCP port 9100)
bun run src/cli.ts --host 192.168.1.50 --text "Halo Dunia"

# Kirim file TSPL mentah
bun run src/cli.ts --printer CXPrinter_DT_369 --file label.tspl

# Lihat perintah TSPL tanpa mencetak
bun run src/cli.ts --text "Test" --qrcode "https://example.com" --dry-run

# Ukuran label + salinan
bun run src/cli.ts --printer CXPrinter_DT_369 --width 78 --height 100 --gap 3 \
  --text "Nama Produk" --barcode 123456789 --copies 3

# Berhenti di pembatas label setelah cetak (tear-off)
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Produk A" --tear

# Printer dengan pisau cutter: potong tiap 1 label / sekali di akhir job
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Produk A" --cut 1
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Produk A" --copies 5 --cut batch

# Kalibrasi posisi berhenti/sobek (mm, bisa negatif)
bun run src/cli.ts --printer CXPrinter_DT_369 --text "Produk A" --tear --offset 2
```

`bun run src/cli.ts --help` untuk daftar opsi lengkap.

## Pemakaian sebagai library

```ts
import { TSPL, NetworkTransport, CupsTransport } from "@node-tsp/core";

const label = new TSPL()
  .size(40, 30)        // mm
  .gap(2)
  .direction(1)
  .cls()
  .text("Kopi Arabika 250g", { x: 16, y: 16 })
  .barcode("8991234567890", { x: 16, y: 60, type: "EAN13", height: 80 })
  .qrcode("https://example.com/p/123", { x: 220, y: 60, cellWidth: 4 })
  .setTear(true)
  .print(1, 2);        // 1 set, 2 salinan

await new CupsTransport("CXPrinter_DT_369").send(label.toBuffer()); // USB via CUPS
await new NetworkTransport("192.168.1.50").send(label.toBuffer()); // jaringan
```

Contoh label pengiriman 78×100 mm:

```bash
bun run examples/shipping-label.ts                              # dry run
bun run examples/shipping-label.ts --printer CXPrinter_DT_369   # cetak via CUPS
bun run examples/shipping-label.ts --host 192.168.1.50          # cetak via jaringan
```

## Catatan printer USB di macOS

- Data dikirim lewat antrian CUPS dengan `lp -o raw`, jadi driver antriannya tidak penting —
  antrian bawaan yang dibuat macOS saat printer dicolok sudah cukup. Cek namanya dengan `lpstat -p`.
- `lpadmin -m raw` **tidak didukung lagi** di macOS versi baru ("Raw queues are no longer
  supported") — tidak perlu dan jangan dipakai.
- Kalau hasil print berupa teks perintah TSPL mentah (bukan label), printer sedang berada di
  mode ESC/POS — pindahkan ke mode TSPL/label lewat tombol atau utilitas vendor printer.
