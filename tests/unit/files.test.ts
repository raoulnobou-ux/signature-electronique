import { describe, expect, it } from "vitest";
import { sanitizeFileName, sniffFileType } from "@/lib/files/sniff";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe("détection du type réel", () => {
  it("reconnaît les formats pris en charge", () => {
    expect(sniffFileType(ascii("%PDF-1.7\n..."))).toBe("pdf");
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffFileType(ascii("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("webp");
    expect(sniffFileType(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("zip");
    expect(sniffFileType(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe("ole");
  });

  it("tolère des octets parasites avant l'en-tête PDF", () => {
    expect(sniffFileType(ascii("\r\n  %PDF-1.4"))).toBe("pdf");
  });

  it("ne se fie pas à l'extension : un exécutable renommé est inconnu", () => {
    expect(sniffFileType(ascii("MZ\u0090\u0000"))).toBe("unknown");
    expect(sniffFileType(ascii("<html><script>"))).toBe("unknown");
  });
});

describe("noms de fichiers", () => {
  it("retire les chemins et caractères dangereux", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\a\\Contrat final.docx")).toBe("Contrat final.docx");
    expect(sanitizeFileName('bad<>:"|?*name.pdf')).toBe("badname.pdf");
    expect(sanitizeFileName("...")).toBe("document");
    expect(sanitizeFileName("Lettre d’annonce — été.pdf")).toBe("Lettre d’annonce — été.pdf");
  });
});
