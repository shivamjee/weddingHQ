// Generates PLACEHOLDER PWA icons into /public using sharp (already a Next dep).
// Replace with real artwork later — just drop in new PNGs at the same paths/sizes,
// or edit the SVG below and re-run:  node scripts/generate-icons.mjs
import sharp from "sharp";

// A white heart on a rose gradient. Full-bleed background (required for maskable)
// with the heart kept inside the central safe zone so masks don't clip it.
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fb7185"/>
      <stop offset="1" stop-color="#e11d48"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <path d="M256 412 C150 332 84 274 84 196 C84 138 128 100 178 100 C214 100 242 122 256 152 C270 122 298 100 334 100 C384 100 428 138 428 196 C428 274 362 332 256 412 Z" fill="#fff5f5"/>
</svg>`;

const targets = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/icon-maskable-512.png", 512],
  ["public/apple-touch-icon.png", 180],
];

for (const [path, size] of targets) {
  await sharp(Buffer.from(svg(size))).png().toFile(path);
  console.log("wrote", path);
}
