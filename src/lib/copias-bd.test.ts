import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Guardado de las copias de la base de datos en Archivos (C-21), contra una
 * base SQLite y un almacén temporales. Va con --conditions=react-server (como
 * authoring.test.ts) porque lib/copias-bd.ts es «server-only».
 */

const dir = mkdtempSync(path.join(tmpdir(), "rud1-mail-copias-"));
process.env.DATA_DIR = dir;
process.env.FILES_DIR = path.join(dir, "archivos");
process.env.ADMIN_EMAILS = "owner@rud1.test";
test.after(() => {
  // En Windows la base SQLite sigue abierta hasta que acaba el proceso.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* se queda en la carpeta temporal del sistema */
  }
});

const cfg = { secreto: "s".repeat(40), ips: [], destino: "owner@rud1.test", carpeta: "Backups BD", guardar: 2 };
const cuerpo = (texto: string) => new Blob([texto]).stream() as ReadableStream<Uint8Array>;

test("crea «Backups BD», guarda, sustituye un reintento y deja solo las últimas", async () => {
  const { guardarCopia } = await import("./copias-bd");
  const { listChildren } = await import("./files");
  const { getObject } = await import("./storage");

  const r1 = await guardarCopia(cfg, "rud1-20261105-0330.zip", cuerpo("uno"));
  assert.equal(r1.carpeta, "Backups BD");
  assert.equal(r1.tamano, 3);
  const raiz = listChildren(null, cfg.destino);
  assert.equal(raiz.filter((i) => i.kind === "folder" && i.name === "Backups BD").length, 1);
  const carpeta = raiz.find((i) => i.name === "Backups BD")!;

  // Otra copia del mismo nombre (un reintento): sustituye, no sale «(1)».
  await guardarCopia(cfg, "rud1-20261105-0330.zip", cuerpo("uno bis"));
  let hijos = listChildren(carpeta.id, cfg.destino);
  assert.deepEqual(hijos.map((h) => h.name), ["rud1-20261105-0330.zip"]);
  const chunks: Buffer[] = [];
  for await (const c of getObject(hijos[0].id)) chunks.push(c as Buffer);
  assert.equal(Buffer.concat(chunks).toString(), "uno bis");

  // Un archivo del usuario en la misma carpeta no se toca nunca.
  const { addFile } = await import("./files");
  const { putObject } = await import("./storage");
  const { randomUUID } = await import("node:crypto");
  const mio = randomUUID();
  await putObject(mio, cuerpo("notas"), 1000);
  addFile({ id: mio, owner: cfg.destino, parentId: carpeta.id, name: "mis-notas.txt", size: 5, mime: "text/plain" });

  await guardarCopia(cfg, "rud1-20261106-0330.zip", cuerpo("dos"));
  const r3 = await guardarCopia(cfg, "rud1-20261107-0330.zip", cuerpo("tres"));
  assert.equal(r3.borradas, 1, "con guardar=2 sobra la del día 5");
  hijos = listChildren(carpeta.id, cfg.destino);
  assert.deepEqual(
    hijos.map((h) => h.name).sort(),
    ["mis-notas.txt", "rud1-20261106-0330.zip", "rud1-20261107-0330.zip"],
  );

  // La segunda vez encuentra la misma carpeta, no crea otra.
  assert.equal(listChildren(null, cfg.destino).filter((i) => i.kind === "folder").length, 1);
});
