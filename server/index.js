/**
 * SIGNATURE INJECTION ENGINE - BACKEND SERVER
 * 
 * Express server with MongoDB integration
 * Handles PDF signature burning and audit trail management
 */

const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const signatureRoutes = require('./routes/signatureRoutes');
const AuditSchema = require('./models/auditSchema');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'signature_engine';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: req.app.locals.db ? 'connected' : 'disconnected'
  });
});

// API Routes
app.use('/api', signatureRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

/**
 * Connect to MongoDB and start server
 */
async function startServer() {
  let mongoClient;

  try {
    console.log('Connecting to MongoDB...');
    mongoClient = new MongoClient(MONGODB_URI, {
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000
    });

    await mongoClient.connect();
    console.log('✓ Connected to MongoDB');

    const db = mongoClient.db(MONGODB_DB_NAME);
    app.locals.db = db;

    // Initialize audit schema
    const auditSchema = new AuditSchema(db);
    await auditSchema.initialize();
    console.log('✓ Audit schema initialized');

    // Test database connection
    const adminDb = mongoClient.db('admin');
    await adminDb.command({ ping: 1 });
    console.log('✓ Database ping successful');

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log(`✓ Database: ${MONGODB_DB_NAME}\n`);
    });

  } catch (error) {
    console.error('Failed to start server:', error.message);
    
    // Retry connection after delay
    if (mongoClient) {
      await mongoClient.close();
    }
    
    console.log('Retrying in 5 seconds...');
    setTimeout(startServer, 5000);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
