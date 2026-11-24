export async function extractDocumentText(file: File, maxCharacters = Number.POSITIVE_INFINITY): Promise<string> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "pdf") {
    const text = await file.text();
    return text.slice(0, maxCharacters).trim();
  }

  const [{ default: workerUrl }, pdfjs] = await Promise.all([
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    import("pdfjs-dist"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  let length = 0;
  for (let index = 1; index <= document.numPages && length < maxCharacters; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(text);
    length += text.length;
  }
  const extracted = pages.join("\n").trim().slice(0, maxCharacters);
  if (!extracted) throw new Error("No readable text found. This PDF may be scanned or image-only.");
  return extracted;
}
