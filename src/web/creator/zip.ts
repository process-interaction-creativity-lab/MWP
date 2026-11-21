// A zip archive of text files, stored without compression: enough for a
// module's folder, with no dependency. The format is PKWARE's APPNOTE
// (local headers, then the central directory, then its end record).

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The archive's bytes: each path (with `/` between folders) to its text. */
export function zip(files: ReadonlyMap<string, string>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of files) {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const crc = crc32(data);
    // Version 2.0, UTF-8 names (flag bit 11), stored, no date.
    const local = header(30, name, [
      [4, 0x04034b50], [2, 20], [2, 0x0800], [2, 0], [2, 0], [2, 0x21],
      [4, crc], [4, data.length], [4, data.length], [2, name.length], [2, 0],
    ]);
    central.push(
      header(46, name, [
        [4, 0x02014b50], [2, 20], [2, 20], [2, 0x0800], [2, 0], [2, 0], [2, 0x21],
        [4, crc], [4, data.length], [4, data.length], [2, name.length], [2, 0], [2, 0],
        [2, 0], [2, 0], [4, 0], [4, offset],
      ]),
    );
    chunks.push(local, data);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = header(22, new Uint8Array(), [
    [4, 0x06054b50], [2, 0], [2, 0], [2, files.size], [2, files.size], [4, size], [4, offset], [2, 0],
  ]);
  const out = new Uint8Array(offset + size + end.length);
  let at = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// Little-endian fields, then the name.
function header(length: number, name: Uint8Array, fields: [2 | 4, number][]): Uint8Array {
  const out = new Uint8Array(length + name.length);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const [bytes, value] of fields) {
    if (bytes === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value, true);
    at += bytes;
  }
  out.set(name, length);
  return out;
}
