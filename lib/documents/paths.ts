/** Chemins de stockage : un dossier par utilisateur, puis par document. */
export const documentPaths = {
  folder: (userId: string, documentId: string) => `${userId}/${documentId}`,
  original: (userId: string, documentId: string, ext: string) =>
    `${userId}/${documentId}/original.${ext}`,
  pdf: (userId: string, documentId: string) => `${userId}/${documentId}/document.pdf`,
  thumbnail: (userId: string, documentId: string) => `${userId}/${documentId}/thumbnail.jpg`,
  version: (userId: string, documentId: string, version: number) =>
    `${userId}/${documentId}/v${version}.pdf`,
};

/** Extension déduite du nom d'origine (uniquement pour nommer le fichier stocké). */
export function extensionOf(fileName: string): string {
  if (!fileName.includes(".")) return "bin";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
}

/** Titre par défaut : nom de fichier sans extension. */
export function titleFromFileName(fileName: string): string {
  const title = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim();
  return (title || "Document").slice(0, 200);
}
