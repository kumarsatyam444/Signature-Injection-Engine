/**
 * COORDINATE TRANSFORMATION ENGINE
 * 
 * Converts frontend CSS pixels (origin: top-left) to PDF points (origin: bottom-left)
 * NO hard-coded values. NO assumptions. Deterministic math only.
 */

const A4_WIDTH_POINTS = 595.275591; // 210mm in points (72 DPI)
const A4_HEIGHT_POINTS = 841.889764; // 297mm in points (72 DPI)
const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;

/**
 * Normalize frontend coordinates to PDF-relative coordinates
 * 
 * @param {Object} frontendCoords - { x, y, width, height } in CSS pixels
 * @param {Object} containerSize - { width, height } in CSS pixels (viewport)
 * @param {Object} pdfPageSize - { width, height } in points (actual PDF page)
 * @returns {Object} Normalized coordinates relative to PDF page (0-1 scale)
 */
function normalizeFrontendCoordinates(frontendCoords, containerSize, pdfPageSize) {
  if (!frontendCoords || !containerSize || !pdfPageSize) {
    throw new Error('Missing required parameters for coordinate normalization');
  }

  const { x: frontendX, y: frontendY, width: frontendW, height: frontendH } = frontendCoords;
  const { width: containerWidth, height: containerHeight } = containerSize;
  const { width: pdfWidth, height: pdfHeight } = pdfPageSize;

  // Calculate PDF aspect ratio
  const pdfAspectRatio = pdfWidth / pdfHeight;
  
  // Calculate container aspect ratio
  const containerAspectRatio = containerWidth / containerHeight;

  // Determine scaling factor based on fit strategy (fit to width or height)
  let scaleFactor;
  let offsetX = 0;
  let offsetY = 0;

  if (pdfAspectRatio > containerAspectRatio) {
    // PDF is wider - scale by width
    scaleFactor = containerWidth / pdfWidth;
    offsetY = (containerHeight - pdfHeight * scaleFactor) / 2;
  } else {
    // PDF is taller - scale by height
    scaleFactor = containerHeight / pdfHeight;
    offsetX = (containerWidth - pdfWidth * scaleFactor) / 2;
  }

  // Convert pixel coordinates to PDF points
  const normalizedX = (frontendX - offsetX) / scaleFactor / pdfWidth;
  const normalizedY = (frontendY - offsetY) / scaleFactor / pdfHeight;
  const normalizedWidth = frontendW / scaleFactor / pdfWidth;
  const normalizedHeight = frontendH / scaleFactor / pdfHeight;

  // Clamp to valid range [0, 1]
  return {
    x: Math.max(0, Math.min(1, normalizedX)),
    y: Math.max(0, Math.min(1, normalizedY)),
    width: Math.max(0, Math.min(1, normalizedWidth)),
    height: Math.max(0, Math.min(1, normalizedHeight))
  };
}

/**
 * Convert normalized coordinates to PDF points (origin: bottom-left)
 * 
 * @param {Object} normalized - { x, y, width, height } in 0-1 scale
 * @param {Object} pdfPageSize - { width, height } in points
 * @returns {Object} PDF coordinates in points with correct origin
 */
function normalizedToPDFPoints(normalized, pdfPageSize) {
  const { x, y, width, height } = normalized;
  const { width: pdfWidth, height: pdfHeight } = pdfPageSize;

  // Convert from 0-1 scale to points
  const pointX = x * pdfWidth;
  const pointWidth = width * pdfWidth;
  const pointHeight = height * pdfHeight;

  // Convert Y from top-left origin to bottom-left origin
  // In normalized coords, Y=0 is top. In PDF, we need distance from bottom
  const pointY = pdfHeight - ((y + height) * pdfHeight);

  return {
    x: pointX,
    y: pointY,
    width: pointWidth,
    height: pointHeight
  };
}

/**
 * Main transformation pipeline: Frontend pixels → PDF points
 * 
 * @param {Object} frontendCoords - { x, y, width, height } in CSS pixels
 * @param {Object} containerSize - { width, height } of viewport in pixels
 * @param {Object} pdfPageSize - { width, height } of PDF page in points
 * @returns {Object} Final PDF coordinates in points
 */
function transformFrontendToPDF(frontendCoords, containerSize, pdfPageSize) {
  // Step 1: Normalize to 0-1 scale relative to PDF
  const normalized = normalizeFrontendCoordinates(
    frontendCoords,
    containerSize,
    pdfPageSize
  );

  // Step 2: Convert to PDF points with correct origin
  const pdfPoints = normalizedToPDFPoints(normalized, pdfPageSize);

  return {
    ...pdfPoints,
    normalized // Include normalized coords for reference/debugging
  };
}

/**
 * Reverse transformation: PDF points → Frontend pixels
 * Used for rendering positions on screen from stored PDF coordinates
 * 
 * @param {Object} pdfCoords - { x, y, width, height } in points
 * @param {Object} containerSize - { width, height } of viewport in pixels
 * @param {Object} pdfPageSize - { width, height } in points
 * @returns {Object} Frontend coordinates in CSS pixels
 */
function transformPDFToFrontend(pdfCoords, containerSize, pdfPageSize) {
  const { x: pdfX, y: pdfY, width: pdfW, height: pdfH } = pdfCoords;
  const { width: containerWidth, height: containerHeight } = containerSize;
  const { width: pdfWidth, height: pdfHeight } = pdfPageSize;

  // Calculate PDF aspect ratio
  const pdfAspectRatio = pdfWidth / pdfHeight;
  const containerAspectRatio = containerWidth / containerHeight;

  // Determine scaling factor (same logic as forward transform)
  let scaleFactor;
  let offsetX = 0;
  let offsetY = 0;

  if (pdfAspectRatio > containerAspectRatio) {
    scaleFactor = containerWidth / pdfWidth;
    offsetY = (containerHeight - pdfHeight * scaleFactor) / 2;
  } else {
    scaleFactor = containerHeight / pdfHeight;
    offsetX = (containerWidth - pdfWidth * scaleFactor) / 2;
  }

  // Convert from PDF points to normalized coordinates
  const normalizedX = pdfX / pdfWidth;
  const normalizedY = pdfHeight - (pdfY + pdfH); // Reverse Y-axis
  const normalizedY_top = normalizedY / pdfHeight;

  // Convert to pixels
  return {
    x: normalizedX * pdfWidth * scaleFactor + offsetX,
    y: normalizedY_top * pdfHeight * scaleFactor + offsetY,
    width: pdfW * scaleFactor,
    height: pdfH * scaleFactor
  };
}

/**
 * Validate coordinate bounds
 * @param {Object} normalized - { x, y, width, height } in 0-1 scale
 * @returns {boolean} True if valid
 */
function isValidNormalizedCoordinate(normalized) {
  const { x, y, width, height } = normalized;
  return (
    x >= 0 && x <= 1 &&
    y >= 0 && y <= 1 &&
    width > 0 && width <= 1 &&
    height > 0 && height <= 1 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

/**
 * Get default PDF page size
 * @param {string} format - 'A4', 'Letter', etc.
 * @returns {Object} { width, height } in points
 */
function getPDFPageSize(format = 'A4') {
  const sizes = {
    'A4': { width: A4_WIDTH_POINTS, height: A4_HEIGHT_POINTS },
    'Letter': { width: 612, height: 792 }
  };
  return sizes[format] || sizes['A4'];
}

module.exports = {
  normalizeFrontendCoordinates,
  normalizedToPDFPoints,
  transformFrontendToPDF,
  transformPDFToFrontend,
  isValidNormalizedCoordinate,
  getPDFPageSize,
  A4_WIDTH_POINTS,
  A4_HEIGHT_POINTS,
  POINTS_PER_INCH,
  MM_PER_INCH
};
