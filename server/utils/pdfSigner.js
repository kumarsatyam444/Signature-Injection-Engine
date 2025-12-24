/**
 * PDF SIGNATURE BURN-IN ENGINE
 * 
 * Handles overlay of signature images onto PDF with:
 * - Aspect ratio preservation (NO stretching)
 * - Centered positioning within bounding box
 * - Multi-page support
 * - Deterministic coordinate handling
 */

const { PDFDocument, PDFPage, rgb } = require('pdf-lib');
const crypto = require('crypto');
const fs = require('fs').promises;

/**
 * Calculate dimensions to fit image into bounding box while preserving aspect ratio
 * 
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @param {number} boxWidth - Bounding box width in points
 * @param {number} boxHeight - Bounding box height in points
 * @returns {Object} { width, height, offsetX, offsetY } - dimensions and centering offset
 */
function calculateFitDimensions(imageWidth, imageHeight, boxWidth, boxHeight) {
  const imageAspectRatio = imageWidth / imageHeight;
  const boxAspectRatio = boxWidth / boxHeight;

  let fitWidth, fitHeight;

  if (imageAspectRatio > boxAspectRatio) {
    // Image is wider - fit by width
    fitWidth = boxWidth;
    fitHeight = boxWidth / imageAspectRatio;
  } else {
    // Image is taller - fit by height
    fitHeight = boxHeight;
    fitWidth = boxHeight * imageAspectRatio;
  }

  // Center within bounding box
  const offsetX = (boxWidth - fitWidth) / 2;
  const offsetY = (boxHeight - fitHeight) / 2;

  return { width: fitWidth, height: fitHeight, offsetX, offsetY };
}

/**
 * Convert base64 image to Buffer
 * @param {string} base64String - Base64 encoded image
 * @returns {Buffer} Image buffer
 */
function base64ToBuffer(base64String) {
  // Handle data URI format
  const matches = base64String.match(/^data:image\/(\w+);base64,(.*)$/);
  const cleanBase64 = matches ? matches[2] : base64String;
  return Buffer.from(cleanBase64, 'base64');
}

/**
 * Compute SHA-256 hash of buffer
 * @param {Buffer} buffer - Data to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function computeSHA256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Main PDF signing function
 * 
 * @param {Buffer} originalPDFBuffer - Original PDF file
 * @param {Object} signatureData - {
 *   image: Base64 encoded signature image,
 *   x: x coordinate in points,
 *   y: y coordinate in points,
 *   width: width in points,
 *   height: height in points,
 *   pageIndex: page number (0-indexed),
 *   metadata: { timestamp, email, reason, etc. }
 * }
 * @returns {Promise<Object>} {
 *   signedPDFBuffer: Buffer,
 *   originalHash: string,
 *   signedHash: string,
 *   auditLog: Object
 * }
 */
async function signPDF(originalPDFBuffer, signatureData) {
  // Compute original PDF hash
  const originalHash = computeSHA256(originalPDFBuffer);

  // Load PDF
  const pdfDoc = await PDFDocument.load(originalPDFBuffer);
  const totalPages = pdfDoc.getPageCount();

  // Validate page index
  const pageIndex = signatureData.pageIndex || 0;
  if (pageIndex < 0 || pageIndex >= totalPages) {
    throw new Error(`Invalid page index: ${pageIndex}. Document has ${totalPages} pages.`);
  }

  // Get the target page
  const page = pdfDoc.getPage(pageIndex);
  const { width: pageWidth, height: pageHeight } = page.getSize();

  // Extract and decode image
  const imageBuffer = base64ToBuffer(signatureData.image);
  let image;

  try {
    // Determine image type and embed accordingly
    if (signatureData.imageType === 'png' || signatureData.image.includes('png')) {
      image = await pdfDoc.embedPng(imageBuffer);
    } else if (signatureData.imageType === 'jpeg' || signatureData.image.includes('jpeg')) {
      image = await pdfDoc.embedJpeg(imageBuffer);
    } else {
      // Try PNG first, fallback to JPEG
      try {
        image = await pdfDoc.embedPng(imageBuffer);
      } catch {
        image = await pdfDoc.embedJpeg(imageBuffer);
      }
    }
  } catch (error) {
    throw new Error(`Failed to embed signature image: ${error.message}`);
  }

  // Get image dimensions
  const imageDims = image.scale(1);
  const imageWidth = imageDims.width;
  const imageHeight = imageDims.height;

  // Calculate fit dimensions (preserve aspect ratio)
  const { width: fitWidth, height: fitHeight, offsetX, offsetY } = calculateFitDimensions(
    imageWidth,
    imageHeight,
    signatureData.width,
    signatureData.height
  );

  // Draw signature on page
  const signX = signatureData.x + offsetX;
  const signY = signatureData.y + offsetY;

  page.drawImage(image, {
    x: signX,
    y: signY,
    width: fitWidth,
    height: fitHeight
  });

  // Optional: Draw bounding box for verification (remove in production if not needed)
  if (process.env.DEBUG_SIGNATURE_BOX === 'true') {
    page.drawRectangle({
      x: signatureData.x,
      y: signatureData.y,
      width: signatureData.width,
      height: signatureData.height,
      borderColor: rgb(1, 0, 0),
      borderWidth: 1
    });
  }

  // Serialize signed PDF
  const signedPDFBuffer = await pdfDoc.save();

  // Compute signed PDF hash
  const signedHash = computeSHA256(signedPDFBuffer);

  // Audit log
  const auditLog = {
    timestamp: new Date().toISOString(),
    originalHash,
    signedHash,
    pageIndex,
    pageSize: { width: pageWidth, height: pageHeight },
    signatureBox: {
      x: signatureData.x,
      y: signatureData.y,
      width: signatureData.width,
      height: signatureData.height
    },
    imageInfo: {
      originalWidth: imageWidth,
      originalHeight: imageHeight,
      fitWidth,
      fitHeight,
      offsetX,
      offsetY
    },
    metadata: signatureData.metadata || {}
  };

  return {
    signedPDFBuffer,
    originalHash,
    signedHash,
    auditLog
  };
}

/**
 * Add multiple signatures to same PDF
 * 
 * @param {Buffer} originalPDFBuffer - Original PDF
 * @param {Array} signatures - Array of signature data objects
 * @returns {Promise<Object>} Signed PDF and audit trail
 */
async function signPDFMultiple(originalPDFBuffer, signatures) {
  let currentBuffer = originalPDFBuffer;
  const auditTrail = [];

  const originalHash = computeSHA256(originalPDFBuffer);

  for (const sig of signatures) {
    const result = await signPDF(currentBuffer, sig);
    currentBuffer = result.signedPDFBuffer;
    auditTrail.push(result.auditLog);
  }

  const finalHash = computeSHA256(currentBuffer);

  return {
    signedPDFBuffer: currentBuffer,
    originalHash,
    signedHash: finalHash,
    auditTrail
  };
}

module.exports = {
  signPDF,
  signPDFMultiple,
  computeSHA256,
  calculateFitDimensions,
  base64ToBuffer
};
