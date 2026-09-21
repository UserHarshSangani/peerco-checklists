// One-off icon generator for the PeerCo Daybook rebrand — rasterizes a
// simple forest-green "D" monogram at the sizes the manifest/metadata need.
// Not part of the build; run manually with `node scripts/generate-icons.mjs`.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FOREST_GREEN = "#0F4A2E";
const CREAM = "#F6F2EA";

function squareSvg(size, glyphScale) {
  const fontSize = Math.round(size * glyphScale);
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${FOREST_GREEN}"/>
  <text
    x="50%"
    y="54%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-weight="700"
    font-size="${fontSize}"
    fill="${CREAM}"
  >D</text>
</svg>`;
}

const outDir = new URL("../public/icons/", import.meta.url);
mkdirSync(outDir, { recursive: true });

async function render(name, size, glyphScale) {
  const svg = Buffer.from(squareSvg(size, glyphScale));
  await sharp(svg).png().toFile(fileURLToPath(new URL(name, outDir)));
  console.log("wrote", name);
}

await render("icon-192.png", 192, 0.55);
await render("icon-512.png", 512, 0.55);
// Maskable: OS applies a circular/rounded-square mask, so keep the glyph
// well inside the ~80%-diameter safe zone.
await render("icon-maskable.png", 512, 0.4);
await render("apple-touch-icon.png", 180, 0.55);

console.log("done");
