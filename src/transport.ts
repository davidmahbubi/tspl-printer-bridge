/**
 * Transport untuk mengirim data mentah (raw TSPL) ke printer.
 *
 * - NetworkTransport : printer jaringan via TCP port 9100 (JetDirect/RAW)
 * - CupsTransport    : printer USB/lokal via CUPS (`lp -o raw`) — macOS/Linux
 * - FileTransport    : tulis ke file/device path (mis. /dev/usb/lp0 di Linux)
 */

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
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timeout ${this.timeoutMs}ms saat mengirim ke ${this.host}:${this.port}`
          )
        );
      }, this.timeoutMs);

      Bun.connect({
        hostname: this.host,
        port: this.port,
        socket: {
          open(socket) {
            socket.write(data);
            socket.flush();
            socket.end();
          },
          close() {
            clearTimeout(timer);
            resolve();
          },
          error(_socket, error) {
            clearTimeout(timer);
            reject(error);
          },
          connectError(_socket, error) {
            clearTimeout(timer);
            reject(error);
          },
          data() {},
        },
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

/** Kirim via antrian CUPS dengan mode raw. Nama printer: lihat `lpstat -p`. */
export class CupsTransport implements Transport {
  constructor(private printerName: string) {}

  async send(data: Uint8Array): Promise<void> {
    const proc = Bun.spawn(["lp", "-d", this.printerName, "-o", "raw", "-"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write(data);
    await proc.stdin.end();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`lp gagal (exit ${exitCode}): ${stderr.trim()}`);
    }
  }
}

/** Tulis langsung ke device path, mis. /dev/usb/lp0 (Linux). */
export class FileTransport implements Transport {
  constructor(private path: string) {}

  async send(data: Uint8Array): Promise<void> {
    await Bun.write(this.path, data);
  }
}
