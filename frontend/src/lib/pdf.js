// PDF.js helpers: render a chosen page to a PNG blob and extract its text.
// The worker is bundled by Vite via the ?url import.
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export async function loadPdf(file) {
  const buf = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data: buf }).promise
}

// Render a 1-based page number to a compressed PNG blob (off-screen canvas).
export async function renderPageToPng(pdf, pageNumber, scale = 1.5) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob
}

// Extract the page's text content (used to ground the Ask feature / pre-fill).
export async function extractPageText(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent()
  return content.items
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
