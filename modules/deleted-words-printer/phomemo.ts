// phomemo.ts — a WebBluetooth driver for the Phomemo T02 thermal printer: text
// rasterized, threshold-packed to 1bpp, sent as ESC/POS GS v 0 raster blocks.
// A trimmed copy of a Phomemo T02 printing script.

// ---- Printer constants -------------------------------------------------------

/** T02 print head width in pixels (48 bytes × 8 bits). */
export const PRINT_WIDTH_PX = 384;
/** Bytes per raster line (384 / 8). */
export const BYTES_PER_LINE = 48;
/** Max lines per GS v 0 raster block. */
export const MAX_LINES_PER_BLOCK = 255;
/** BLE write-with-response chunk size. */
export const BLE_CHUNK_SIZE = 100;

// ESC/POS command fragments
export const CMD = {
  INIT: new Uint8Array([0x1b, 0x40]),
  JUSTIFY_CENTER: new Uint8Array([0x1b, 0x61, 0x01]),
  PRE_IMAGE: new Uint8Array([0x1f, 0x11, 0x02, 0x04]),
  FEED: new Uint8Array([0x1b, 0x64, 0x02]),
  CLOSE: new Uint8Array([
    0x1f, 0x11, 0x08,
    0x1f, 0x11, 0x0e,
    0x1f, 0x11, 0x07,
    0x1f, 0x11, 0x09,
  ]),
} as const;

// ---- Types -------------------------------------------------------------------

export interface PrinterConnection {
  readonly device: BluetoothDevice;
  readonly writeChar: BluetoothRemoteGATTCharacteristic;
}

// ---- Connection --------------------------------------------------------------

/**
 * Prompt the user to pick the printer via the WebBluetooth chooser, connect its
 * GATT server, and return the write characteristic. Throws when Bluetooth is
 * unavailable / the user cancels / the device has no GATT server.
 */
export async function connectPrinter(): Promise<PrinterConnection> {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error('Web Bluetooth is not available in this environment.');
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['0000ff00-0000-1000-8000-00805f9b34fb'],
  });
  const server = device.gatt;
  if (!server) throw new Error('Device has no GATT server');
  await server.connect();
  const service = await server.getPrimaryService(0xff00);
  const writeChar = await service.getCharacteristic(0xff02);
  return { device, writeChar };
}

export function disconnectPrinter(connection: PrinterConnection): void {
  connection.device.gatt?.disconnect();
}

// ---- Image processing --------------------------------------------------------

/** Threshold grayscale to 1bpp, MSB-first (bit 7 = leftmost pixel); a 1 bit
 *  burns (black). */
export function thresholdPack(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
): Uint8Array {
  const packed = new Uint8Array((width / 8) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if ((gray[idx] ?? 0) < threshold) {
        const byteIndex = y * (width / 8) + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        packed[byteIndex] |= 1 << bitIndex;
      }
    }
  }
  return packed;
}

/** Convert RGBA ImageData to grayscale luminance (ITU-R BT.601). */
export function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = Math.round(
      0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2],
    );
  }
  return gray;
}

// ---- ESC/POS payload ---------------------------------------------------------

function rasterHeader(bytesPerLine: number, lineCount: number): Uint8Array {
  return new Uint8Array([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerLine & 0xff, (bytesPerLine >> 8) & 0xff,
    lineCount & 0xff, (lineCount >> 8) & 0xff,
  ]);
}

/** The full ESC/POS byte sequence for a packed 1bpp image, split into
 *  ≤255-line raster blocks, each with its own GS v 0 header. */
export function buildPrintPayload(
  packed: Uint8Array,
  width: number,
  height: number,
  preFeedLines = 0,
  feedLines = 2,
): Uint8Array {
  const bytesPerLine = width / 8;
  const parts: Uint8Array[] = [CMD.INIT, CMD.JUSTIFY_CENTER, CMD.PRE_IMAGE];
  for (let i = 0; i < preFeedLines; i++) parts.push(CMD.FEED);

  let linesRemaining = height;
  let offset = 0;
  while (linesRemaining > 0) {
    const n = Math.min(linesRemaining, MAX_LINES_PER_BLOCK);
    const bytes = n * bytesPerLine;
    parts.push(rasterHeader(bytesPerLine, n));
    parts.push(packed.slice(offset, offset + bytes));
    offset += bytes;
    linesRemaining -= n;
  }

  for (let i = 0; i < feedLines; i++) parts.push(CMD.FEED);
  parts.push(CMD.CLOSE);

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** Write in chunks with write-with-response: the printer ACKs each, which is
 *  the only flow control. */
export async function chunkedWrite(
  writeChar: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
  chunkSize = BLE_CHUNK_SIZE,
): Promise<number> {
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, data.length);
    await writeChar.writeValue(data.slice(offset, end));
  }
  return data.length;
}

// ---- Rasterizing sticker text --------------------------------------------------

/** Render lines black-on-white as RGBA, hard-wrapped at `maxCharsPerLine`.
 *  Needs `OffscreenCanvas`, so the tests don't reach it. */
export function rasterizeLines(
  lines: readonly string[],
  width: number = PRINT_WIDTH_PX,
  maxCharsPerLine = 46,
): { data: Uint8ClampedArray; width: number; height: number } {
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length <= maxCharsPerLine) {
      wrapped.push(line);
      continue;
    }
    let rest = line;
    while (rest.length > maxCharsPerLine) {
      wrapped.push(rest.slice(0, maxCharsPerLine));
      rest = rest.slice(maxCharsPerLine);
    }
    if (rest) wrapped.push(rest);
  }

  const fontSize = 24;
  const lineHeight = 32;
  const padding = 12;
  const width2 = Math.max(width, 32);
  const height = padding * 2 + wrapped.length * lineHeight;

  const canvas = new OffscreenCanvas(width2, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context from OffscreenCanvas');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width2, height);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'top';
  wrapped.forEach((line, i) => {
    ctx.fillText(line, padding, padding + i * lineHeight, width2 - padding * 2);
  });

  const imageData = ctx.getImageData(0, 0, width2, height);
  const data = new Uint8ClampedArray(imageData.data);
  return { data, width: width2, height: imageData.height };
}

/** Pad with white on the right to the exact printer width. */
export function padToWidth(
  raster: { data: Uint8ClampedArray; width: number; height: number },
  targetWidth = PRINT_WIDTH_PX,
): { data: Uint8ClampedArray; width: number; height: number } {
  if (raster.width === targetWidth) return raster;
  const out = new Uint8ClampedArray(targetWidth * raster.height * 4);
  out.fill(255);
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const si = (y * raster.width + x) * 4;
      const di = (y * targetWidth + x) * 4;
      for (let k = 0; k < 4; k++) out[di + k] = raster.data[si + k];
    }
  }
  return { data: out, width: targetWidth, height: raster.height };
}

export async function printBanner(
  connection: PrinterConnection,
  lines: readonly string[],
  width: number = PRINT_WIDTH_PX,
): Promise<void> {
  const raster = padToWidth(rasterizeLines(lines, width), width);
  const gray = thresholdPack(toGrayscale(toImageData(raster)), width, raster.height);
  const payload = buildPrintPayload(gray, width, raster.height);
  await chunkedWrite(connection.writeChar, payload);
}

function toImageData(raster: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): ImageData {
  const img = new ImageData(raster.width, raster.height);
  img.data.set(raster.data);
  return img;
}
