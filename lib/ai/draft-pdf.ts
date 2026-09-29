import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { encodableText } from "@/lib/pdf/stamp";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 64;

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = encodableText(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/**
 * Met en page un texte rédigé par l'assistant : « # » titre, « ## » sous-titre, « - » liste,
 * ligne vide = nouveau paragraphe. A4, marges larges, prêt à signer.
 */
export async function renderDraftPdf(title: string, body: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;
  let page = pdf.addPage(A4);
  let y = A4[1] - MARGIN;

  const write = (text: string, font: PDFFont, size: number, indent = 0, gapAfter = 0) => {
    for (const line of wrap(font, text, size, width - indent)) {
      if (y - size < MARGIN) {
        page = pdf.addPage(A4);
        y = A4[1] - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN + indent,
        y: y - size,
        size,
        font,
        color: rgb(0.07, 0.09, 0.13),
      });
      y -= size * 1.45;
    }
    y -= gapAfter;
  };

  const lines = body.replace(/\r/g, "").split("\n");
  const startsWithTitle = /^#\s/.test(lines.find((l) => l.trim()) ?? "");
  if (!startsWithTitle) write(title, bold, 18, 0, 12);
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      y -= 8;
      continue;
    }
    if (line.startsWith("## ")) write(line.slice(3), bold, 13, 0, 4);
    else if (line.startsWith("# ")) write(line.slice(2), bold, 18, 0, 10);
    else if (/^\s*[-*•]\s+/.test(line))
      write(`•  ${line.replace(/^\s*[-*•]\s+/, "")}`, regular, 11, 12);
    else write(line.replace(/\*\*(.+?)\*\*/g, "$1"), regular, 11);
  }
  pdf.setTitle(title);
  pdf.setProducer("QuickSign");
  pdf.setCreator("QuickSign Copilot");
  return pdf.save();
}
