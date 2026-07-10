/**
 * Transport untuk mengirim data mentah (raw TSPL) ke printer.
 *
 * - NetworkTransport : printer jaringan via TCP port 9100 (JetDirect/RAW)
 * - CupsTransport    : printer USB/lokal via CUPS (`lp -o raw`) — macOS/Linux
 * - FileTransport    : tulis ke file/device path (mis. /dev/usb/lp0 di Linux)
 *
 * Hanya memakai API Node (node:net, node:child_process, node:fs) supaya
 * bisa jalan di Bun maupun Electron main process.
 */
import { Socket } from "node:net";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

export interface Transport {
  send(data: Uint8Array): Promise<void>;
}

export class NetworkTransport implements Transport {
  constructor(
    private host: string,
    private port = 9100,
    private timeoutMs = 5000
  ) {}

  async send(data: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(err);
      };

      socket.setTimeout(this.timeoutMs, () =>
        fail(
          new Error(
            `Timeout ${this.timeoutMs}ms saat mengirim ke ${this.host}:${this.port}`
          )
        )
      );
      socket.on("error", fail);
      socket.on("close", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      socket.connect(this.port, this.host, () => {
        socket.end(data);
      });
    });
  }
}

/** Kirim via antrian CUPS dengan mode raw. Nama printer: lihat `lpstat -p`. */
export class CupsTransport implements Transport {
  constructor(private printerName: string) {}

  async send(data: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("lp", ["-d", this.printerName, "-o", "raw", "-"], {
        stdio: ["pipe", "ignore", "pipe"],
      });
      let stderr = "";
      proc.stderr.on("data", (chunk) => (stderr += chunk));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`lp gagal (exit ${code}): ${stderr.trim()}`));
      });
      proc.stdin.end(data);
    });
  }
}

/** Tulis langsung ke device path, mis. /dev/usb/lp0 (Linux). */
export class FileTransport implements Transport {
  constructor(private path: string) {}

  async send(data: Uint8Array): Promise<void> {
    await writeFile(this.path, data);
  }
}
