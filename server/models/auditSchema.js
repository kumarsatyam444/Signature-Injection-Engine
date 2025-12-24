/**
 * MONGODB AUDIT TRAIL SCHEMA
 * 
 * Stores document integrity hashes and metadata for non-repudiation
 */

const { MongoClient, Db, Collection } = require('mongodb');

/**
 * Audit Log Document Structure
 * 
 * {
 *   _id: ObjectId (auto-generated)
 *   documentId: string (unique identifier for PDF)
 *   originalHash: string (SHA-256)
 *   signedHash: string (SHA-256)
 *   createdAt: Date
 *   updatedAt: Date
 *   pageIndex: number
 *   signatureCount: number
 *   signer: {
 *     email: string
 *     name: string
 *     timestamp: Date
 *   }
 *   coordinates: {
 *     normalized: { x, y, width, height } (0-1 scale)
 *     pdf: { x, y, width, height } (in points)
 *     container: { width, height } (reference viewport)
 *   }
 *   imageMetadata: {
 *     originalDimensions: { width, height }
 *     fitDimensions: { width, height }
 *     mimeType: string
 *   }
 *   integrityStatus: 'valid' | 'tampered' | 'pending'
 *   verifications: [
 *     {
 *       verifiedAt: Date
 *       verifiedBy: string
 *       status: 'valid' | 'invalid'
 *       hash: string
 *     }
 *   ]
 *   metadata: {
 *     reason: string (signing reason)
 *     location: string
 *     contactInfo: string
 *     customFields: { any }
 *   }
 * }
 */

class AuditSchema {
  constructor(db) {
    this.db = db;
    this.collection = db.collection('audit_logs');
  }

  /**
   * Initialize collection with indexes
   */
  async initialize() {
    // Create indexes for fast querying
    await this.collection.createIndex({ documentId: 1 });
    await this.collection.createIndex({ createdAt: -1 });
    await this.collection.createIndex({ originalHash: 1 });
    await this.collection.createIndex({ signedHash: 1 });
    await this.collection.createIndex({ 'signer.email': 1 });
  }

  /**
   * Create audit log entry
   * 
   * @param {Object} data - Audit log data
   * @returns {Promise<Object>} Created document
   */
  async create(data) {
    const auditEntry = {
      documentId: data.documentId || null,
      originalHash: data.originalHash,
      signedHash: data.signedHash,
      createdAt: new Date(),
      updatedAt: new Date(),
      pageIndex: data.pageIndex || 0,
      signatureCount: data.signatureCount || 1,
      signer: {
        email: data.email || 'unknown',
        name: data.signerName || 'unknown',
        timestamp: new Date()
      },
      coordinates: {
        normalized: data.normalizedCoords || null,
        pdf: data.pdfCoords || null,
        container: data.containerSize || null
      },
      imageMetadata: {
        originalDimensions: data.imageDimensions || null,
        fitDimensions: data.fitDimensions || null,
        mimeType: data.imageType || 'image/png'
      },
      integrityStatus: 'valid',
      verifications: [],
      metadata: data.metadata || {}
    };

    const result = await this.collection.insertOne(auditEntry);
    return { _id: result.insertedId, ...auditEntry };
  }

  /**
   * Verify document integrity
   * 
   * @param {string} documentId - Document to verify
   * @param {string} currentHash - Current PDF hash
   * @returns {Promise<Object>} Verification result
   */
  async verifyIntegrity(documentId, currentHash) {
    const auditEntries = await this.collection
      .find({ documentId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (auditEntries.length === 0) {
      return {
        status: 'not_found',
        message: 'No audit log found for this document'
      };
    }

    const latestEntry = auditEntries[0];
    const isValid = latestEntry.signedHash === currentHash;

    // Record verification
    await this.collection.updateOne(
      { _id: latestEntry._id },
      {
        $push: {
          verifications: {
            verifiedAt: new Date(),
            verifiedBy: 'system',
            status: isValid ? 'valid' : 'invalid',
            hash: currentHash
          }
        },
        $set: {
          integrityStatus: isValid ? 'valid' : 'tampered',
          updatedAt: new Date()
        }
      }
    );

    return {
      status: isValid ? 'valid' : 'tampered',
      message: isValid ? 'Document signature is valid' : 'Document has been tampered with',
      originalHash: latestEntry.originalHash,
      signedHash: latestEntry.signedHash,
      currentHash,
      originalCreated: latestEntry.createdAt,
      verifiedAt: new Date()
    };
  }

  /**
   * Get audit trail for document
   * 
   * @param {string} documentId - Document to retrieve
   * @returns {Promise<Array>} Audit entries
   */
  async getAuditTrail(documentId) {
    return this.collection
      .find({ documentId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Get signer's audit trail
   * 
   * @param {string} email - Signer email
   * @returns {Promise<Array>} Documents signed by this person
   */
  async getSignerAuditTrail(email) {
    return this.collection
      .find({ 'signer.email': email })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Search audit logs
   * 
   * @param {Object} query - MongoDB query object
   * @returns {Promise<Array>} Matching audit entries
   */
  async search(query) {
    return this.collection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
  }
}

module.exports = AuditSchema;
