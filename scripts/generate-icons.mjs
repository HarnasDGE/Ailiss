// Generuje ikony public/icon/{16,32,48,128}.png bez zależności (PNG przez zlib).
// Motyw: zaokrąglony kwadrat z „zwiniętym” postem — pełny pasek u góry i przerywane linie pod nim.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling

const BG = [51, 65, 85]; // slate
const FG = [255, 255, 255];
const ACCENT = [251, 191, 36]; // amber

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Kolor w punkcie (u, v ∈ [0,1]) albo null (przezroczyste). */
function sample(u, v) {
  const r = 0.2; // promień zaokrąglenia
  const dx = Math.max(r - u, 0, u - (1 - r));
  const dy = Math.max(r - v, 0, v - (1 - r));
  if (dx * dx + dy * dy > r * r) return null;
  const inRect = (x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
  // Zwinięty pasek (akcent) + linie treści.
  if (inRect(0.18, 0.22, 0.82, 0.36)) return ACCENT;
  if (inRect(0.18, 0.5, 0.82, 0.58)) return FG;
  if (inRect(0.18, 0.68, 0.6, 0.76)) return FG;
  return BG;
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  writeFileSync(join(OUT, `${size}.png`), png(size, pixels));
}
console.log(`Ikony zapisane w ${OUT}`);
