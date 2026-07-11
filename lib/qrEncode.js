import QRCode from 'qrcode';

// QR code generation for the printable "Trygghetsskilt" case sign
// (pages/backoffice/skilt/[id].js). Correctness (a code that actually scans)
// comes from the well-maintained `qrcode` npm package, which does the real
// work here: Reed-Solomon error correction, mask-pattern selection and the
// dark/light module matrix. This file only turns that matrix into a small,
// crisp SVG string — no PNG/canvas, no external image asset, so the sign
// stays sharp at any print resolution.

// Builds the boolean dark/light module matrix for `text`.
// errorCorrectionLevel 'M' (~15% recovery) is a good default for a sign that
// will be printed, laminated and scanned outdoors; 'H' (~30%) trades a denser
// code for more resilience to dirt/glare/partial damage.
export function buildQrMatrix(text, { errorCorrectionLevel = 'M' } = {}) {
  const value = String(text || '');
  if (!value) throw new Error('buildQrMatrix: text is required');
  const qr = QRCode.create(value, { errorCorrectionLevel });
  const { size } = qr.modules;
  const cells = [];
  for (let row = 0; row < size; row += 1) {
    const line = [];
    for (let col = 0; col < size; col += 1) {
      line.push(qr.modules.get(row, col) === 1);
    }
    cells.push(line);
  }
  return { size, cells };
}

// Renders a QR matrix as a self-contained SVG string: a light background
// plus a single dark <path> built from one rect-per-dark-module. A single
// path (instead of one <rect> per module) keeps the markup compact while
// staying pure vector, so it prints crisp at any size/DPI.
export function qrMatrixToSvg(matrix, {
  moduleSize = 8,
  margin = 4, // quiet zone in modules; the QR spec recommends at least 4
  dark = '#0b1f1a',
  light = '#ffffff',
} = {}) {
  const { size, cells } = matrix;
  const dimension = (size + margin * 2) * moduleSize;
  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (cells[row][col]) {
        const x = (col + margin) * moduleSize;
        const y = (row + margin) * moduleSize;
        path += `M${x} ${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
      }
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" `,
    `width="${dimension}" height="${dimension}" role="img" aria-label="QR-kode til saken">`,
    `<rect width="${dimension}" height="${dimension}" fill="${light}"/>`,
    `<path d="${path}" fill="${dark}" fill-rule="evenodd"/>`,
    '</svg>',
  ].join('');
}

// Convenience one-shot: text in, SVG string out.
export function encodeQrSvg(text, { errorCorrectionLevel, moduleSize, margin, dark, light } = {}) {
  const matrix = buildQrMatrix(text, { errorCorrectionLevel });
  return qrMatrixToSvg(matrix, { moduleSize, margin, dark, light });
}
