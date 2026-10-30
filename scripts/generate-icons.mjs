// Generates the PWA icons (crescent-moon mark) as PNGs into public/icons/.
// Run with: npm run icons
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const BG = [238, 242, 255]; // #EEF2FF
const MOON = [79, 70, 229]; // #4F46E5

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

/**
 * Draw a crescent moon = circle A minus circle B, with a 2px anti-aliased edge.
 * `moonScale` < 1 pulls the mark into the maskable safe zone.
 */
function render(size, { moonScale }) {
  const png = new PNG({ width: size, height: size });
  const edge = 2 / size; // anti-alias ramp, in normalized units
  const A = { x: 0.5, y: 0.5, r: 0.36 * moonScale };
  const B = { x: 0.5 + 0.16 * moonScale, y: 0.5 - 0.13 * moonScale, r: 0.3 * moonScale };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const dA = Math.hypot(u - A.x, v - A.y);
      const dB = Math.hypot(u - B.x, v - B.y);
      const covA = clamp((A.r - dA) / edge + 0.5, 0, 1);
      const covB = clamp((B.r - dB) / edge + 0.5, 0, 1);
      const cov = covA * (1 - covB);
      const idx = (size * y + x) << 2;
      png.data[idx] = lerp(BG[0], MOON[0], cov);
      png.data[idx + 1] = lerp(BG[1], MOON[1], cov);
      png.data[idx + 2] = lerp(BG[2], MOON[2], cov);
      png.data[idx + 3] = 255;
    }
  }
  return png;
}

function save(png, name) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log('wrote', path.relative(process.cwd(), file));
}

save(render(192, { moonScale: 1 }), 'icon-192.png');
save(render(512, { moonScale: 1 }), 'icon-512.png');
save(render(180, { moonScale: 0.9 }), 'apple-touch-icon.png');
save(render(192, { moonScale: 0.8 }), 'icon-maskable-192.png');
save(render(512, { moonScale: 0.8 }), 'icon-maskable-512.png');
