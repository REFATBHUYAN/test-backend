// testServer.js
import express from 'express';
import cors from 'cors';
import testController from './testController.js'; // Adjust path as needed
import dotenv from "dotenv"
const app = express();
const PORT =  3000;

dotenv.config();

console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', testController);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'LinkedIn Automation Test Server',
    status: 'running',
    endpoints: {
      health: 'GET /api/test/health',
      instructions: 'GET /api/test/linkedin/instructions',
      initialize: 'POST /api/test/linkedin/initialize',
      login: 'POST /api/test/linkedin/login',
      extract: 'POST /api/test/linkedin/extract',
      close: 'POST /api/test/linkedin/close',
      workflow: 'POST /api/test/linkedin/workflow'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    error: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      'GET /',
      'GET /api/test/health',
      'GET /api/test/linkedin/instructions',
      'POST /api/test/linkedin/initialize',
      'POST /api/test/linkedin/login',
      'POST /api/test/linkedin/extract',
      'POST /api/test/linkedin/close',
      'POST /api/test/linkedin/workflow'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 LinkedIn Automation Test Server running on port ${PORT}`);
  console.log(`📋 Instructions: GET http://localhost:${PORT}/api/test/linkedin/instructions`);
  console.log(`🏥 Health Check: GET http://localhost:${PORT}/api/test/health`);
});

export default app;