// Transports for sending raw TSPL to printers. Deliberately uses only Node
// APIs (no Bun.*) so it can run inside the Electron main process.
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
            `Timed out after ${this.timeoutMs}ms sending to ${this.host}:${this.port}`
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

/** Send through a CUPS queue in raw mode. Printer names: see `lpstat -p`. */
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
        else reject(new Error(`lp failed (exit ${code}): ${stderr.trim()}`));
      });
      proc.stdin.end(data);
    });
  }
}

/** Write directly to a device path, e.g. /dev/usb/lp0 (Linux). */
export class FileTransport implements Transport {
  constructor(private path: string) {}

  async send(data: Uint8Array): Promise<void> {
    await writeFile(this.path, data);
  }
}
