type Mp4Box = {
  type: string;
  start: number;
  end: number;
  size: number;
  headerSize: number;
  sizeWasZero: boolean;
};

const MAX_MOOV_BYTES = 128 * 1024 * 1024;
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

function unsupported(): never {
  throw new Error('Không thể tối ưu MP4 này để phát nhanh. Hãy xuất lại tệp MP4 chuẩn và thử tải lên.');
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
}

function parseBox(bytes: Uint8Array, start: number, boundary: number): Mp4Box {
  if (start + 8 > boundary) return unsupported();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size32 = view.getUint32(start);
  const headerSize = size32 === 1 ? 16 : 8;
  if (start + headerSize > boundary) return unsupported();
  const size = size32 === 0 ? boundary - start
    : size32 === 1 ? Number(view.getBigUint64(start + 8)) : size32;
  if (!Number.isSafeInteger(size) || size < headerSize || start + size > boundary) return unsupported();
  return { type: boxType(bytes, start), start, end: start + size, size, headerSize, sizeWasZero: size32 === 0 };
}

async function readTopLevelBox(file: Blob, start: number): Promise<Mp4Box> {
  const header = new Uint8Array(await file.slice(start, start + 16).arrayBuffer());
  if (header.length < 8) return unsupported();
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const size32 = view.getUint32(0);
  const headerSize = size32 === 1 ? 16 : 8;
  if (header.length < headerSize) return unsupported();
  const size = size32 === 0 ? file.size - start
    : size32 === 1 ? Number(view.getBigUint64(8)) : size32;
  if (!Number.isSafeInteger(size) || size < headerSize || start + size > file.size) return unsupported();
  return { type: boxType(header, 0), start, end: start + size, size, headerSize, sizeWasZero: size32 === 0 };
}

function patchChunkOffsets(moov: Uint8Array, mediaRanges: Mp4Box[], shift: number): void {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  let tables = 0;
  let chunks = 0;

  const patchTable = (box: Mp4Box) => {
    const width = box.type === 'stco' ? 4 : 8;
    const dataStart = box.start + box.headerSize;
    if (dataStart + 8 > box.end) return unsupported();
    const count = view.getUint32(dataStart + 4);
    const firstOffset = dataStart + 8;
    if (count > Math.floor((box.end - firstOffset) / width)) return unsupported();
    tables++;
    chunks += count;
    for (let index = 0; index < count; index++) {
      const position = firstOffset + index * width;
      const original = width === 4 ? view.getUint32(position) : Number(view.getBigUint64(position));
      if (!Number.isSafeInteger(original)
        || !mediaRanges.some(range => original >= range.start + range.headerSize && original < range.end)) {
        return unsupported();
      }
      const next = original + shift;
      if (!Number.isSafeInteger(next) || (width === 4 && next > 0xffffffff)) return unsupported();
      if (width === 4) view.setUint32(position, next);
      else view.setBigUint64(position, BigInt(next));
    }
  };

  const walk = (start: number, end: number, parent: string, depth: number) => {
    if (depth > 8) return unsupported();
    for (let offset = start; offset < end;) {
      const box = parseBox(moov, offset, end);
      if (box.type === 'cmov' || box.type === 'saio') return unsupported();
      if (box.type === 'stco' || box.type === 'co64') {
        if (parent !== 'stbl') return unsupported();
        patchTable(box);
      } else if (CONTAINERS.has(box.type)) {
        walk(box.start + box.headerSize, box.end, box.type, depth + 1);
      }
      offset = box.end;
    }
  };

  const root = parseBox(moov, 0, moov.length);
  if (root.type !== 'moov' || root.end !== moov.length) return unsupported();
  walk(root.headerSize, root.end, root.type, 0);
  if (tables === 0 || chunks === 0) return unsupported();
}

/** Move MP4 playback metadata ahead of the media without re-encoding the media. */
export async function prepareFastStartMp4(file: File): Promise<Blob> {
  const boxes: Mp4Box[] = [];
  for (let offset = 0; offset < file.size;) {
    const box = await readTopLevelBox(file, offset);
    boxes.push(box);
    offset = box.end;
  }
  const moovs = boxes.filter(box => box.type === 'moov');
  const mediaRanges = boxes.filter(box => box.type === 'mdat');
  if (moovs.length !== 1 || mediaRanges.length === 0) return unsupported();
  const moov = moovs[0];
  if (moov.start < mediaRanges[0].start) return file;
  if (boxes.some(box => box.type === 'moof') || mediaRanges.some(box => box.end > moov.start)
    || moov.size > MAX_MOOV_BYTES) return unsupported();

  const moovBytes = new Uint8Array(await file.slice(moov.start, moov.end).arrayBuffer());
  if (moov.sizeWasZero) new DataView(moovBytes.buffer).setUint32(0, moov.size);
  patchChunkOffsets(moovBytes, mediaRanges, moov.size);

  const insertAt = boxes[0].type === 'ftyp' ? boxes[0].end : 0;
  const result = new Blob([
    file.slice(0, insertAt), moovBytes, file.slice(insertAt, moov.start), file.slice(moov.end),
  ], { type: 'video/mp4' });
  if (result.size !== file.size) return unsupported();
  return result;
}
