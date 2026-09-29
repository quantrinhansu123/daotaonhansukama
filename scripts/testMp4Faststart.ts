import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { prepareFastStartMp4 } from '../lib/mp4-faststart';

const folder = mkdtempSync(join(tmpdir(), 'mp4-faststart-test-'));

function runFfmpeg(args: string[]) {
  if (!ffmpeg) throw new Error('ffmpeg-static is missing');
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  for (let index = 0; index < 4; index++) bytes[index + 4] = type.charCodeAt(index);
  bytes.set(payload, 8);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

function topLevel(bytes: Uint8Array): Array<{ type: string; start: number; end: number }> {
  const boxes = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length;) {
    const size = view.getUint32(offset);
    assert.ok(size >= 8 && offset + size <= bytes.length);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    boxes.push({ type, start: offset, end: offset + size });
    offset += size;
  }
  return boxes;
}

async function main() {
  const originalPath = join(folder, 'original.mp4');
  const optimizedPath = join(folder, 'optimized.mp4');
  const alreadyFastPath = join(folder, 'already-fast.mp4');
  runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=24', '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264',
    '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', originalPath]);
  runFfmpeg(['-i', originalPath, '-c', 'copy', '-movflags', '+faststart', '-y', alreadyFastPath]);

  const source = new File([new Uint8Array(readFileSync(originalPath))], 'original.mp4', { type: 'video/mp4' });
  const originalBytes = new Uint8Array(readFileSync(originalPath));
  const originalBoxes = topLevel(originalBytes);
  assert.ok(originalBoxes.findIndex(item => item.type === 'moov') > originalBoxes.findIndex(item => item.type === 'mdat'));

  const prepared = await prepareFastStartMp4(source);
  const optimizedBytes = new Uint8Array(await prepared.arrayBuffer());
  const optimizedBoxes = topLevel(optimizedBytes);
  assert.equal(prepared.size, source.size);
  assert.ok(optimizedBoxes.findIndex(item => item.type === 'moov') < optimizedBoxes.findIndex(item => item.type === 'mdat'));
  const originalMedia = originalBoxes.find(item => item.type === 'mdat')!;
  const optimizedMedia = optimizedBoxes.find(item => item.type === 'mdat')!;
  assert.deepEqual(optimizedBytes.slice(optimizedMedia.start, optimizedMedia.end),
    originalBytes.slice(originalMedia.start, originalMedia.end));
  writeFileSync(optimizedPath, optimizedBytes);
  runFfmpeg(['-ss', '3', '-i', optimizedPath, '-frames:v', '1', '-f', 'null', '-']);

  const fast = new File([new Uint8Array(readFileSync(alreadyFastPath))], 'fast.mp4', { type: 'video/mp4' });
  assert.equal(await prepareFastStartMp4(fast), fast);

  const ftyp = box('ftyp', new Uint8Array([105, 115, 111, 109, 0, 0, 0, 0]));
  const mdat = box('mdat', new Uint8Array(32));
  const table = new Uint8Array(16);
  new DataView(table.buffer).setUint32(4, 1);
  new DataView(table.buffer).setBigUint64(8, BigInt(ftyp.length + 8));
  const moov = box('moov', box('trak', box('mdia', box('minf', box('stbl', box('co64', table))))));
  const synthetic = new File([concat(ftyp, mdat, moov)], 'co64.mp4', { type: 'video/mp4' });
  const moved = new Uint8Array(await (await prepareFastStartMp4(synthetic)).arrayBuffer());
  const movedBoxes = topLevel(moved);
  assert.deepEqual(movedBoxes.map(item => item.type), ['ftyp', 'moov', 'mdat']);
  const relocatedOffset = new DataView(moved.buffer).getBigUint64(ftyp.length + 8 * 6 + 8);
  assert.equal(relocatedOffset, BigInt(ftyp.length + moov.length + 8));

  await assert.rejects(prepareFastStartMp4(new File([new Uint8Array([1, 2, 3])], 'bad.mp4')));
  process.stdout.write('MP4 faststart: playback, seek, media bytes, already-fast, co64, malformed input PASS\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  rmSync(folder, { recursive: true, force: true });
});
