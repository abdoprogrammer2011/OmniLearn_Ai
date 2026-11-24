import { transcribeDocumentPages, type DocumentImagePage } from "./omniEngine";

const noSelectableTextMessage = "No readable text found. This PDF may be scanned or image-only.";

async function loadPdf(file: File) {
  const [{ default: workerUrl }, pdfjs] = await Promise.all([
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    import("pdfjs-dist"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}

export async function extractDocumentText(file: File, maxCharacters = Number.POSITIVE_INFINITY): Promise<string> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "pdf") {
    const text = await file.text();
    return text.slice(0, maxCharacters).trim();
  }

  const document = await loadPdf(file);
  const pages: string[] = [];
  let length = 0;
  try {
    for (let index = 1; index <= document.numPages && length < maxCharacters; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(text);
      length += text.length;
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  const extracted = pages.join("\n").trim().slice(0, maxCharacters);
  if (!extracted) throw new Error(noSelectableTextMessage);
  return extracted;
}

export function isScannedPdfError(error: unknown): boolean {
  return error instanceof Error && error.message === noSelectableTextMessage;
}

export async function extractScannedPdfText(
  file: File,
  onProgress?: (completedPages: number, totalPages: number) => void,
  maxCharacters = 40_000,
): Promise<string> {
  const pdf = await loadPdf(file);
  const transcriptions: string[] = [];
  let length = 0;
  try {
    for (let firstPage = 1; firstPage <= pdf.numPages; firstPage += 2) {
      const pages: DocumentImagePage[] = [];
      const lastPage = Math.min(firstPage + 1, pdf.numPages);
      for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const initialViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.25, 1050 / initialViewport.width, 1450 / initialViewport.height);
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser could not prepare scanned PDF pages for reading.");
        await page.render({ canvasContext: context, viewport }).promise;
        let image = canvas.toDataURL("image/jpeg", 0.68);
        if (image.length > 1_800_000) {
          const smallerCanvas = window.document.createElement("canvas");
          smallerCanvas.width = Math.ceil(canvas.width * 0.72);
          smallerCanvas.height = Math.ceil(canvas.height * 0.72);
          const smallerContext = smallerCanvas.getContext("2d", { alpha: false });
          if (!smallerContext) throw new Error("This browser could not compress scanned PDF pages.");
          smallerContext.drawImage(canvas, 0, 0, smallerCanvas.width, smallerCanvas.height);
          image = smallerCanvas.toDataURL("image/jpeg", 0.55);
          smallerCanvas.width = 0;
          smallerCanvas.height = 0;
        }
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        if (image.length > 1_800_000) {
          throw new Error("A scanned PDF page is too complex to send safely. Reduce the page size and try again.");
        }
        pages.push({ pageNumber, image });
      }

      const batchText = await transcribeDocumentPages(pages);
      const nextLength = length + batchText.length;
      if (nextLength > maxCharacters) {
        throw new Error(`OCR found more than ${maxCharacters.toLocaleString()} characters. Split this scanned PDF into smaller files and try again.`);
      }
      transcriptions.push(batchText);
      length = nextLength;
      onProgress?.(lastPage, pdf.numPages);
    }
  } finally {
    await pdf.destroy();
  }

  const extracted = transcriptions.join("\n\n").trim();
  if (!extracted) throw new Error("The AI could not read text from this scanned PDF.");
  return extracted;
}
