/**
 * SIGNATURE INJECTION API ROUTES
 * 
 * POST /api/sign-pdf - Burn signature into PDF
 * POST /api/verify-pdf - Verify document integrity
 * GET /api/audit/:documentId - Retrieve audit trail
 */

const express = require('express');
const router = express.Router();
const { signPDF, computeSHA256 } = require('../utils/pdfSigner');
const { transformFrontendToPDF, getPDFPageSize } = require('../utils/coordinateTransform');
const AuditSchema = require('../models/auditSchema');
const fs = require('fs').promises;
const path = require('path');

/**
 * POST /api/sign-pdf
 * 
 * Burns signature into PDF at specified coordinates
 * 
 * Request Body:
 * {
 *   pdfId: string (unique identifier)
 *   pdfBuffer: Buffer (binary PDF data)
 *   signature: {
 *     image: string (base64 encoded signature image)
 *     imageType: 'png' | 'jpeg'
 *   }
 *   coordinates: {
 *     frontend: { x, y, width, height } (CSS pixels)
 *     container: { width, height } (viewport size)
 *     pageIndex: number (0-indexed page)
 *   }
 *   pageSize: { width, height } (in points)
 *   metadata: { email, name, reason, timestamp, ... }
 * }
 */
router.post('/sign-pdf', async (req, res) => {
  try {
    const {
      pdfId,
      pdfBuffer,
      signature,
      coordinates,
      pageSize,
      metadata
    } = req.body;

    console.log('\n=== SIGN PDF REQUEST ===');
    console.log('PDF ID:', pdfId);
    console.log('Has PDF Buffer:', !!pdfBuffer);
    console.log('Has Signature:', !!signature?.image);
    console.log('Frontend Coordinates:', coordinates.frontend);
    console.log('Container Size:', coordinates.container);
    console.log('Page Size:', pageSize);

    // Validate required fields
    if (!pdfId || !pdfBuffer || !signature || !coordinates) {
      console.error('Missing required fields');
      return res.status(400).json({
        error: 'Missing required fields: pdfId, pdfBuffer, signature, coordinates'
      });
    }

    // Decode PDF buffer
    let pdfBuf;
    if (typeof pdfBuffer === 'string') {
      console.log('Decoding base64 PDF buffer...');
      pdfBuf = Buffer.from(pdfBuffer, 'base64');
    } else {
      pdfBuf = pdfBuffer;
    }
    console.log('PDF Buffer size:', pdfBuf.length, 'bytes');

    // Get page size (default A4)
    const finalPageSize = pageSize || { width: 595.275591, height: 841.889764 };

    // Transform frontend coordinates to PDF points
    const pdfCoordinates = transformFrontendToPDF(
      coordinates.frontend,
      coordinates.container,
      finalPageSize
    );

    console.log('PDF Coordinates (transformed):', {
      x: pdfCoordinates.x,
      y: pdfCoordinates.y,
      width: pdfCoordinates.width,
      height: pdfCoordinates.height
    });

    // Prepare signature data for PDF engine
    const signatureData = {
      image: signature.image,
      imageType: signature.imageType || 'png',
      x: pdfCoordinates.x,
      y: pdfCoordinates.y,
      width: pdfCoordinates.width,
      height: pdfCoordinates.height,
      pageIndex: coordinates.pageIndex || 0,
      metadata: {
        ...metadata,
        coordinateTransform: {
          frontend: coordinates.frontend,
          normalized: pdfCoordinates.normalized,
          pdf: {
            x: pdfCoordinates.x,
            y: pdfCoordinates.y,
            width: pdfCoordinates.width,
            height: pdfCoordinates.height
          }
        }
      }
    };

    // Sign PDF
    const signResult = await signPDF(pdfBuf, signatureData);

    // Store audit log
    const db = req.app.locals.db;
    if (db) {
      const auditSchema = new AuditSchema(db);
      await auditSchema.create({
        documentId: pdfId,
        originalHash: signResult.originalHash,
        signedHash: signResult.signedHash,
        pageIndex: signatureData.pageIndex,
        email: metadata?.email || 'unknown',
        signerName: metadata?.name || 'unknown',
        normalizedCoords: pdfCoordinates.normalized,
        pdfCoords: {
          x: pdfCoordinates.x,
          y: pdfCoordinates.y,
          width: pdfCoordinates.width,
          height: pdfCoordinates.height
        },
        containerSize: coordinates.container,
        metadata: metadata || {}
      });
    }

    // Convert signed PDF to base64 for transport
    const signedPDFBase64 = signResult.signedPDFBuffer.toString('base64');

    return res.json({
      success: true,
      documentId: pdfId,
      signedPdf: signedPDFBase64,
      hashes: {
        original: signResult.originalHash,
        signed: signResult.signedHash
      },
      auditLog: signResult.auditLog,
      message: 'PDF signed successfully'
    });

  } catch (error) {
    console.error('Error signing PDF:', error);
    return res.status(500).json({
      error: 'Failed to sign PDF',
      message: error.message
    });
  }
});

/**
 * POST /api/verify-pdf
 * 
 * Verify document integrity against stored hash
 */
router.post('/verify-pdf', async (req, res) => {
  try {
    const { documentId, pdfBuffer } = req.body;

    if (!documentId || !pdfBuffer) {
      return res.status(400).json({
        error: 'Missing required fields: documentId, pdfBuffer'
      });
    }

    // Decode PDF buffer
    let pdfBuf;
    if (typeof pdfBuffer === 'string') {
      pdfBuf = Buffer.from(pdfBuffer, 'base64');
    } else {
      pdfBuf = pdfBuffer;
    }

    // Compute current hash
    const currentHash = computeSHA256(pdfBuf);

    // Verify against audit log
    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const auditSchema = new AuditSchema(db);
    const verificationResult = await auditSchema.verifyIntegrity(documentId, currentHash);

    return res.json(verificationResult);

  } catch (error) {
    console.error('Error verifying PDF:', error);
    return res.status(500).json({
      error: 'Failed to verify PDF',
      message: error.message
    });
  }
});

/**
 * GET /api/audit/:documentId
 * 
 * Retrieve complete audit trail for document
 */
router.get('/audit/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const auditSchema = new AuditSchema(db);
    const auditTrail = await auditSchema.getAuditTrail(documentId);

    if (auditTrail.length === 0) {
      return res.status(404).json({
        error: 'No audit trail found for this document'
      });
    }

    return res.json({
      documentId,
      auditTrail,
      totalSignatures: auditTrail.length
    });

  } catch (error) {
    console.error('Error retrieving audit trail:', error);
    return res.status(500).json({
      error: 'Failed to retrieve audit trail',
      message: error.message
    });
  }
});

/**
 * GET /api/audit/signer/:email
 * 
 * Retrieve all documents signed by specific person
 */
router.get('/audit/signer/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const auditSchema = new AuditSchema(db);
    const signerAudit = await auditSchema.getSignerAuditTrail(email);

    return res.json({
      signer: email,
      documents: signerAudit,
      count: signerAudit.length
    });

  } catch (error) {
    console.error('Error retrieving signer audit trail:', error);
    return res.status(500).json({
      error: 'Failed to retrieve signer audit trail',
      message: error.message
    });
  }
});

module.exports = router;
