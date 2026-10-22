import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Almacén ("bucket") del contenido de los archivos. Cada archivo es un objeto
 * con su id; los nombres, carpetas y permisos van en la base de datos.
 *
 * Hoy vive en el disco del servidor (volumen /files en producción). La
 * interfaz es la de un almacén de objetos: para pasar a uno externo (OVH
 * Object Storage, S3…) solo cambia este archivo.
 */

const ROOT = process.env.FILES_DIR ?? path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "archivos");

/** Dos niveles de carpetas por id: miles de archivos sin una carpeta enorme. */
function objectPath(id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Identificador de archivo no válido");
  return path.join(ROOT, id.slice(0, 2), id.slice(2, 4), id);
}

export class QuotaExceededError extends Error {
  constructor() {
    super("No queda espacio");
    this.name = "QuotaExceededError";
  }
}

/**
 * Guarda el objeto leyendo del flujo, sin pasar de `maxBytes` (si se pasa,
 * no queda nada a medias). Devuelve el tamaño.
 */
export async function putObject(id: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  const target = objectPath(id);
  const partial = `${target}.parcial`;
  await mkdir(path.dirname(target), { recursive: true });
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      if (size > maxBytes) done(new QuotaExceededError());
      else done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), limit, createWriteStream(partial));
    await rename(partial, target);
    return size;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/** Flujo de lectura del objeto (entero o un trozo, para vídeos y reanudar descargas). */
export function getObject(id: string, range?: { start: number; end: number }): Readable {
  return createReadStream(objectPath(id), range ? { start: range.start, end: range.end } : undefined);
}

export async function objectSize(id: string): Promise<number | null> {
  try {
    return (await stat(objectPath(id))).size;
  } catch {
    return null;
  }
}

export async function deleteObject(id: string): Promise<void> {
  await rm(objectPath(id), { force: true });
}
