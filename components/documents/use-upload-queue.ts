"use client";

import { useCallback, useRef, useState } from "react";
import {
  finalizeUpload,
  getDocumentFileUrl,
  importFromUrl,
  prepareUpload,
  saveThumbnail,
} from "@/app/(app)/app/documents/actions";
import { compressImage } from "@/lib/images/browser";
import { MAX_UPLOAD_BYTES } from "@/lib/documents/limits";
import { renderThumbnail } from "@/lib/pdf/client";
import { uploadWithProgress } from "@/lib/upload/xhr";

export type UploadStage =
  | "queued"
  | "preparing"
  | "uploading"
  | "processing"
  | "converting"
  | "thumbnail"
  | "done"
  | "error";

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  stage: UploadStage;
  progress: number;
  error?: string;
  documentId?: string;
  source: { type: "file"; file: File } | { type: "url"; url: string };
};

const WORD = /\.(docx?|odt|rtf)$/i;
const IMAGE = /^image\//;

/** Vignette d'une image locale (sans passer par pdf.js). */
async function imageThumbnail(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const width = 360;
  const height = Math.round((bitmap.height / bitmap.width) * width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * File d'import : les fichiers partent un par un (réseaux lents), directement vers le
 * stockage via une URL signée, puis le serveur vérifie, convertit et crée le document.
 */
export function useUploadQueue(folderId: string | null) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(false);
  const queue = useRef<UploadItem[]>([]);

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((all) => all.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const processItem = useCallback(
    async (item: UploadItem) => {
      try {
        let documentId: string;
        let thumbSource: Blob | null = null;

        if (item.source.type === "url") {
          update(item.id, { stage: "processing" });
          const result = await importFromUrl({ url: item.source.url, folderId });
          if (!result.ok) return update(item.id, { stage: "error", error: result.error });
          documentId = result.documentId;
        } else {
          let file: Blob = item.source.file;
          if (IMAGE.test(file.type) && file.type !== "image/png") {
            update(item.id, { stage: "preparing" });
            file = await compressImage(file);
            thumbSource = file;
          } else if (file.type === "image/png") {
            thumbSource = file;
          }
          if (file.size > MAX_UPLOAD_BYTES)
            return update(item.id, { stage: "error", error: "too_large" });

          update(item.id, { stage: "preparing" });
          const fileName =
            IMAGE.test(file.type) && file.type === "image/jpeg"
              ? item.name.replace(/\.\w+$/, ".jpg")
              : item.name;
          const prepared = await prepareUpload({ fileName, size: file.size });
          if (!prepared.ok) return update(item.id, { stage: "error", error: prepared.error });

          update(item.id, { stage: "uploading", progress: 0 });
          await uploadWithProgress(prepared.signedUrl, file, (p) =>
            update(item.id, { progress: p }),
          );

          update(item.id, {
            stage: WORD.test(item.name) ? "converting" : "processing",
            progress: 1,
          });
          const result = await finalizeUpload({
            documentId: prepared.documentId,
            fileName,
            folderId,
          });
          if (!result.ok) return update(item.id, { stage: "error", error: result.error });
          documentId = result.documentId;
          if (result.kind === "pdf" && !thumbSource) thumbSource = file;
        }

        // Vignette : calculée dans le navigateur, envoyée au serveur (≈ 20 Ko).
        update(item.id, { stage: "thumbnail", documentId });
        try {
          let dataUrl: string | null = null;
          if (thumbSource && IMAGE.test(thumbSource.type))
            dataUrl = await imageThumbnail(thumbSource);
          else if (thumbSource) dataUrl = await renderThumbnail(await thumbSource.arrayBuffer());
          else {
            const signed = await getDocumentFileUrl(documentId, "pdf");
            if (signed.ok) dataUrl = await renderThumbnail(signed.url);
          }
          if (dataUrl) await saveThumbnail(documentId, dataUrl);
        } catch (error) {
          console.warn("[import] vignette non générée", error);
        }
        update(item.id, { stage: "done", documentId });
      } catch (error) {
        console.error("[import]", error);
        update(item.id, {
          stage: "error",
          error: error instanceof Error && error.message === "network" ? "network" : "generic",
        });
      }
    },
    [folderId, update],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const next = queue.current.shift()!;
      await processItem(next);
    }
    running.current = false;
  }, [processItem]);

  const enqueue = useCallback(
    (sources: UploadItem["source"][]) => {
      const created = sources.map<UploadItem>((source) => ({
        id: crypto.randomUUID(),
        name:
          source.type === "file"
            ? source.file.name
            : source.url.replace(/^https?:\/\//, "").slice(0, 60),
        size: source.type === "file" ? source.file.size : 0,
        stage: "queued",
        progress: 0,
        source,
      }));
      setItems((all) => [...all, ...created]);
      queue.current.push(...created);
      void run();
    },
    [run],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      update(id, { stage: "queued", error: undefined, progress: 0 });
      queue.current.push({ ...item, stage: "queued" });
      void run();
    },
    [items, run, update],
  );

  const reset = useCallback(() => {
    if (!running.current) setItems([]);
  }, []);

  return {
    items,
    enqueue,
    retry,
    reset,
    busy: items.some((i) => !["done", "error"].includes(i.stage)),
  };
}
