// Transports for sending raw TSPL to printers. Deliberately uses only Node
// APIs (no Bun.*) so it can run inside the Electron main process.
import { Socket } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// PowerShell script that spools a file to a printer in RAW mode via winspool.
// P/Invoke through Add-Type keeps this dependency-free (no native npm modules,
// no node-gyp), which matters for the Electron app and for `bun build` output.
const RAW_PRINT_PS1 = `param(
  [Parameter(Mandatory=$true)][string]$Printer,
  [Parameter(Mandatory=$true)][string]$Path
)
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool OpenPrinter(string name, out IntPtr hPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOW di);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);

  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("OpenPrinter failed for '" + printer + "' (error " + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "TSPL label";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di))
        throw new Exception("StartDocPrinter failed (error " + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h))
          throw new Exception("StartPagePrinter failed (error " + Marshal.GetLastWin32Error() + ")");
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        EndPagePrinter(h);
        if (!ok || written != data.Length)
          throw new Exception("WritePrinter failed (error " + Marshal.GetLastWin32Error() + ", wrote " + written + "/" + data.Length + " bytes)");
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
[RawPrinter]::Send($Printer, [System.IO.File]::ReadAllBytes($Path))
`;

/** Send raw bytes through the Windows print spooler (winspool RAW datatype). */
export class WindowsSpoolerTransport implements Transport {
  constructor(private printerName: string) {}

  async send(data: Uint8Array): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "tspl-"));
    const scriptPath = join(dir, "raw-print.ps1");
    const dataPath = join(dir, "payload.bin");
    try {
      await writeFile(scriptPath, RAW_PRINT_PS1, "utf8");
      await writeFile(dataPath, data);
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            scriptPath,
            "-Printer",
            this.printerName,
            "-Path",
            dataPath,
          ],
          { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
        );
        let stderr = "";
        proc.stderr.on("data", (chunk) => (stderr += chunk));
        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else
            reject(
              new Error(`Raw print failed (exit ${code}): ${stderr.trim()}`)
            );
        });
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/** Transport for a locally installed printer, chosen for the current OS. */
export function localPrinterTransport(printerName: string): Transport {
  return process.platform === "win32"
    ? new WindowsSpoolerTransport(printerName)
    : new CupsTransport(printerName);
}
