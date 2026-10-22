// Iconos de la app de escritorio, a partir del icono de rud1 Mail
// (../public/icon.svg, que sale de scripts/generate-icons.mjs de la web).
//
//   npm run icons

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(here, "..", "public", "icon.svg"));
const render = (size) => sharp(svg, { density: 1200 }).resize(size, size).png();

// electron-builder saca de aquí el .ico (Windows), el .icns (macOS) y los de Linux.
await render(1024).toFile(path.join(here, "build", "icon.png"));
await render(256).toFile(path.join(here, "assets", "icon.png"));
await render(32).toFile(path.join(here, "assets", "tray.png"));

// Bandeja de Windows: un .ico con 16, 24 y 32 px para que se vea nítido.
const sizes = [16, 24, 32];
const pngs = await Promise.all(sizes.map((s) => render(s).toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(size, e);
  header.writeUInt8(size, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
await writeFile(path.join(here, "assets", "tray.ico"), Buffer.concat([header, ...pngs]));

// Punto rojo para la barra de tareas de Windows cuando hay correo sin leer.
const dot = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#e5484d" stroke="#ffffff" stroke-width="3"/></svg>',
);
await sharp(dot).resize(32, 32).png().toFile(path.join(here, "assets", "badge.png"));

console.log("Iconos de escritorio generados");
