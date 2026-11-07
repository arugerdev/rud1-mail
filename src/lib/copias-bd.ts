import "server-only";

import { randomUUID } from "node:crypto";

import { copiasABorrar, type ConfigCopiasBd } from "@/lib/copias-bd-reglas";
import { addFile, createFolder, deleteForever, listChildren, quota, type FileItem } from "@/lib/files";
import { deleteObject, putObject } from "@/lib/storage";

/** Una copia no debería pasar de esto; si pasa, algo raro llega. */
const MAX_COPIA_BYTES = 2 * 1024 * 1024 * 1024;

export class SinArchivosError extends Error {
  constructor() {
    super("El buzón de destino no tiene Archivos o no le queda espacio");
    this.name = "SinArchivosError";
  }
}

/** La carpeta de las copias en la raíz de los Archivos del destino; si no está, se crea. */
function carpetaDeCopias(cfg: ConfigCopiasBd): FileItem {
  const nombre = cfg.carpeta.toLowerCase();
  const existente = listChildren(null, cfg.destino).find((i) => i.kind === "folder" && i.name.toLowerCase() === nombre);
  return existente ?? createFolder(cfg.destino, null, cfg.carpeta);
}

/**
 * Guarda una copia en la carpeta y borra las que sobran. Si ya había una con
 * el mismo nombre (un reintento), la nueva la sustituye: no salen duplicados
 * «(1)» que se saltarían la limpieza.
 */
export async function guardarCopia(
  cfg: ConfigCopiasBd,
  nombre: string,
  cuerpo: ReadableStream<Uint8Array>,
): Promise<{ id: string; tamano: number; borradas: number; carpeta: string }> {
  const { used, total } = quota(cfg.destino);
  const libre = Math.max(0, total - used);
  if (libre === 0) throw new SinArchivosError();

  const carpeta = carpetaDeCopias(cfg);
  const id = randomUUID();
  let tamano: number;
  try {
    tamano = await putObject(id, cuerpo, Math.min(libre, MAX_COPIA_BYTES));
  } catch (error) {
    await deleteObject(id).catch(() => undefined);
    throw error;
  }

  const anterior = listChildren(carpeta.id, cfg.destino).find((i) => i.kind === "file" && i.name === nombre);
  if (anterior) await deleteForever(anterior.id);
  addFile({ id, owner: cfg.destino, parentId: carpeta.id, name: nombre, size: tamano, mime: "application/zip" });

  const sobran = copiasABorrar(listChildren(carpeta.id, cfg.destino), cfg.guardar);
  for (const s of sobran) await deleteForever(s);
  return { id, tamano, borradas: sobran.length, carpeta: carpeta.name };
}
