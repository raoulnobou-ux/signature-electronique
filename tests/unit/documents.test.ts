import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { DocumentConverter } from "@/lib/documents/convert";
import { extensionOf, titleFromFileName } from "@/lib/documents/paths";
import { processDocument, ProcessError } from "@/lib/documents/process";
import { isPublicIp } from "@/lib/net/ip";

const noConverter: DocumentConverter = {
  toPdf: async () => {
    throw Object.assign(new Error("not_configured"), { code: "not_configured" });
  },
};

async function samplePdf(pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

describe("traitement des documents importés", () => {
  it("accepte un PDF et compte ses pages", async () => {
    const result = await processDocument(await samplePdf(3), noConverter);
    expect(result.kind).toBe("pdf");
    expect(result.pageCount).toBe(3);
  });

  it("convertit une photo en PDF A4 d'une page", async () => {
    const png = readFileSync("tests/e2e/fixtures/avatar.png");
    const result = await processDocument(new Uint8Array(png), noConverter);
    expect(result.kind).toBe("image");
    expect(result.pageCount).toBe(1);
    const doc = await PDFDocument.load(result.pdf);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("refuse un fichier dont le contenu n'est pas un format accepté, quelle que soit l'extension", async () => {
    const fake = new TextEncoder().encode("MZ\x90\x00 exécutable renommé en .pdf");
    await expect(processDocument(fake, noConverter)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("refuse un PDF corrompu", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> garbage");
    await expect(processDocument(broken, noConverter)).rejects.toBeInstanceOf(ProcessError);
  });

  it("signale clairement l'absence de service de conversion Word", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", "<w:document/>");
    const docx = await zip.generateAsync({ type: "uint8array" });
    await expect(processDocument(docx, noConverter)).rejects.toMatchObject({
      code: "conversion_unavailable",
    });
  });

  it("utilise le convertisseur pour un document Word", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", "<w:document/>");
    const docx = await zip.generateAsync({ type: "uint8array" });
    const pdf = await samplePdf(1);
    const converter: DocumentConverter = {
      toPdf: async (_bytes, format) => (format === "docx" ? pdf : new Uint8Array()),
    };
    const result = await processDocument(docx, converter);
    expect(result).toMatchObject({ kind: "word", detected: "docx", pageCount: 1 });
  });

  it("refuse un fichier vide", async () => {
    await expect(processDocument(new Uint8Array(), noConverter)).rejects.toMatchObject({
      code: "empty",
    });
  });
});

describe("noms et chemins", () => {
  it("déduit un titre lisible", () => {
    expect(titleFromFileName("Contrat_de_prestation_2026.docx")).toBe("Contrat de prestation 2026");
    expect(titleFromFileName(".pdf")).toBe("Document");
  });
  it("n'utilise que des extensions sûres", () => {
    expect(extensionOf("a.PDF")).toBe("pdf");
    expect(extensionOf("script.php%00.pdf")).toBe("pdf");
    expect(extensionOf("noext")).toBe("bin");
    expect(extensionOf("x.<svg>")).toBe("bin");
  });
});

describe("protection SSRF", () => {
  it.each([
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.5", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["fd12::1", false],
    ["fe80::1", false],
    ["::ffff:127.0.0.1", false],
    ["8.8.8.8", true],
    ["41.202.207.1", true],
    ["2001:4860:4860::8888", true],
  ])("%s → public = %s", (ip, expected) => {
    expect(isPublicIp(ip)).toBe(expected);
  });
});

describe("liens d'import", () => {
  it("bloque les IP internes écrites directement dans le lien", async () => {
    const { assertAllowedUrl } = await import("@/lib/documents/fetch-url");
    for (const bad of [
      "http://127.0.0.1:54321/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/x.pdf",
      "http://localhost/x",
      "file:///etc/passwd",
      "https://user:pass@example.com/",
    ]) {
      expect(() => assertAllowedUrl(new URL(bad)), bad).toThrow();
    }
    expect(() => assertAllowedUrl(new URL("https://example.com/contrat.pdf"))).not.toThrow();
  });

  it("convertit les liens de partage en liens de téléchargement", async () => {
    const { normalizeShareUrl } = await import("@/lib/documents/fetch-url");
    expect(normalizeShareUrl("https://drive.google.com/file/d/AbC123_-x/view?usp=sharing")).toBe(
      "https://drive.google.com/uc?export=download&id=AbC123_-x",
    );
    expect(normalizeShareUrl("https://www.dropbox.com/s/abc/contrat.pdf?dl=0")).toContain("dl=1");
  });
});
