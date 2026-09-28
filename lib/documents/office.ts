import JSZip from "jszip";

/**
 * Identifie un document bureautique à partir de son contenu :
 * DOCX (Office Open XML), ODT (OpenDocument), DOC (OLE), RTF.
 */
export type OfficeFormat = "docx" | "odt" | "doc" | "rtf";

export async function detectZipOffice(bytes: Uint8Array): Promise<"docx" | "odt" | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    if (zip.file("[Content_Types].xml") && zip.file(/^word\//).length > 0) return "docx";
    const mimetype = await zip.file("mimetype")?.async("string");
    if (mimetype?.trim() === "application/vnd.oasis.opendocument.text") return "odt";
    return null;
  } catch {
    return null;
  }
}

export function isRtf(head: Uint8Array): boolean {
  return String.fromCharCode(...head.subarray(0, 5)) === "{\\rtf";
}
