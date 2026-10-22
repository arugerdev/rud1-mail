// Genera los iconos de la app instalable a partir del icono de rud1
// (public/favicon.svg) con un sobre en la esquina, para distinguir rud1 Mail
// de la app de escritorio de rud1.
//
//   node scripts/generate-icons.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (name) => path.join(root, "public", name);

const BLUE = "#2f86e8";

const badge = `
  <g id="sobre">
    <circle cx="392" cy="392" r="112" fill="#ffffff"/>
    <circle cx="392" cy="392" r="112" fill="none" stroke="${BLUE}" stroke-opacity="0.18" stroke-width="6"/>
    <rect x="328" y="346" width="128" height="92" rx="16" fill="none" stroke="${BLUE}" stroke-width="16" stroke-linejoin="round"/>
    <path d="M336 356 L392 400 L448 356" fill="none" stroke="${BLUE}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const base = await readFile(pub("favicon.svg"), "utf8");
const icon = base
  .replace(/aria-label="rud1"/, 'aria-label="rud1 Mail"')
  .replace(/<title>rud1<\/title>/, "<title>rud1 Mail</title>")
  .replace(/<\/svg>\s*$/, `${badge}\n</svg>\n`);

await writeFile(pub("icon.svg"), icon);

const svg = Buffer.from(icon);
const png = (size, name) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(pub(name));

await png(512, "icon-512.png");
await png(192, "icon-192.png");
await png(180, "apple-touch-icon.png");
await png(32, "favicon-32x32.png");

// Versión "maskable": el degradado a sangre (sin el recuadro redondeado) y el
// dibujo dentro de la zona segura (80 %), para que Android y Windows lo
// recorten con su propia forma sin cortar nada.
const containerPath = icon.match(/<path id="contenedor"[^>]*\/>/)?.[0];
if (!containerPath) throw new Error("No se encontró el recuadro del icono en favicon.svg");
const maskable = icon
  .replace(containerPath, '<rect width="512" height="512" fill="url(#t512_g)"/><g transform="translate(51.2 51.2) scale(0.8)">')
  .replace(/<\/svg>\s*$/, "</g>\n</svg>\n");
await sharp(Buffer.from(maskable), { density: 384 }).resize(512, 512).png().toFile(pub("icon-maskable-512.png"));

console.log("Iconos generados en public/");
