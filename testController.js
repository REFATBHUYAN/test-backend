// testController.js
import express from 'express';
import {
  initializeLinkedInAutomation,
  loginLinkedInAutomation,
  extractLinkedInProfileAutomation,
  closeLinkedInAutomation
} from './linkedinAutomation.js'; // Adjust path as needed

const router = express.Router();

// Test endpoint to check if the service is running
router.get('/test/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LinkedIn Automation Test Service is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      initialize: 'POST /api/test/linkedin/initialize',
      login: 'POST /api/test/linkedin/login',
      extract: 'POST /api/test/linkedin/extract',
      close: 'POST /api/test/linkedin/close'
    }
  });
});

// 1. Initialize Browser
router.post('/test/linkedin/initialize', async (req, res) => {
  console.log('🧪 TEST: Initialize LinkedIn Automation');
  console.log('Request body:', req.body);
  
  try {
    await initializeLinkedInAutomation(req, res);
  } catch (error) {
    console.error('❌ TEST ERROR - Initialize:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      testEndpoint: 'initialize'
    });
  }
});

// 2. Login to LinkedIn
router.post('/test/linkedin/login', async (req, res) => {
  console.log('🧪 TEST: LinkedIn Login');
  console.log('Request body (credentials hidden):', { 
    hasEmail: !!req.body.email,
    hasPassword: !!req.body.password 
  });
  
  try {
    await loginLinkedInAutomation(req, res);
  } catch (error) {
    console.error('❌ TEST ERROR - Login:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      testEndpoint: 'login'
    });
  }
});

// 3. Extract LinkedIn Profile
router.post('/test/linkedin/extract', async (req, res) => {
  console.log('🧪 TEST: Extract LinkedIn Profile');
  console.log('Request body:', req.body);
  
  try {
    await extractLinkedInProfileAutomation(req, res);
  } catch (error) {
    console.error('❌ TEST ERROR - Extract:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      testEndpoint: 'extract'
    });
  }
});

// 4. Close Browser
router.post('/test/linkedin/close', async (req, res) => {
  console.log('🧪 TEST: Close LinkedIn Automation');
  
  try {
    await closeLinkedInAutomation(req, res);
  } catch (error) {
    console.error('❌ TEST ERROR - Close:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      testEndpoint: 'close'
    });
  }
});

// Test workflow - Run all steps in sequence
router.post('/test/linkedin/workflow', async (req, res) => {
  console.log('🧪 TEST: Complete LinkedIn Workflow');
  
  const { profileUrl, environment = 'development' } = req.body;
  
  if (!profileUrl) {
    return res.status(400).json({
      success: false,
      error: 'profileUrl is required for workflow test',
      example: {
        profileUrl: 'https://www.linkedin.com/in/sample-profile/',
        environment: 'development'
      }
    });
  }

  const workflow = {
    steps: [],
    startTime: new Date(),
    profileUrl,
    environment
  };

  try {
    // Step 1: Initialize
    console.log('🔄 Step 1: Initializing browser...');
    const initReq = { body: { environment } };
    const initRes = {
      status: (code) => ({ json: (data) => ({ statusCode: code, data }) }),
      json: (data) => data
    };
    
    await initializeLinkedInAutomation(initReq, initRes);
    workflow.steps.push({ step: 1, name: 'initialize', status: 'completed' });
    
    // Step 2: Login
    console.log('🔄 Step 2: Logging in...');
    const loginReq = { body: {} }; // Uses hardcoded credentials from your code
    const loginRes = {
      status: (code) => ({ json: (data) => ({ statusCode: code, data }) }),
      json: (data) => data
    };
    
    await loginLinkedInAutomation(loginReq, loginRes);
    workflow.steps.push({ step: 2, name: 'login', status: 'completed' });
    
    // Step 3: Extract Profile
    console.log('🔄 Step 3: Extracting profile...');
    const extractReq = { body: { profileUrl } };
    const extractRes = {
      status: (code) => ({ json: (data) => ({ statusCode: code, data }) }),
      json: (data) => data
    };
    
    await extractLinkedInProfileAutomation(extractReq, extractRes);
    workflow.steps.push({ step: 3, name: 'extract', status: 'completed' });
    
    // Step 4: Close
    console.log('🔄 Step 4: Closing browser...');
    const closeReq = { body: {} };
    const closeRes = {
      status: (code) => ({ json: (data) => ({ statusCode: code, data }) }),
      json: (data) => data
    };
    
    await closeLinkedInAutomation(closeReq, closeRes);
    workflow.steps.push({ step: 4, name: 'close', status: 'completed' });
    
    workflow.endTime = new Date();
    workflow.duration = workflow.endTime - workflow.startTime;
    
    res.status(200).json({
      success: true,
      message: 'LinkedIn automation workflow completed successfully',
      workflow,
      totalSteps: 4,
      completedSteps: workflow.steps.length
    });
    
  } catch (error) {
    console.error('❌ TEST ERROR - Workflow:', error.message);
    
    workflow.endTime = new Date();
    workflow.duration = workflow.endTime - workflow.startTime;
    workflow.error = error.message;
    
    res.status(500).json({
      success: false,
      error: error.message,
      workflow,
      completedSteps: workflow.steps.length
    });
  }
});

// Get test instructions and examples
router.get('/test/linkedin/instructions', (req, res) => {
  res.status(200).json({
    title: 'LinkedIn Automation Testing Instructions',
    baseUrl: 'http://localhost:3000/api', // Adjust your base URL
    testingSequence: [
      {
        step: 1,
        name: 'Health Check',
        method: 'GET',
        endpoint: '/test/health',
        description: 'Check if the service is running'
      },
      {
        step: 2,
        name: 'Initialize Browser',
        method: 'POST',
        endpoint: '/test/linkedin/initialize',
        body: {
          environment: 'development' // or 'production'
        }
      },
      {
        step: 3,
        name: 'Login to LinkedIn',
        method: 'POST',
        endpoint: '/test/linkedin/login',
        body: {
          // Uses hardcoded credentials from your code
          // No need to send email/password
        }
      },
      {
        step: 4,
        name: 'Extract Profile',
        method: 'POST',
        endpoint: '/test/linkedin/extract',
        body: {
          profileUrl: 'https://www.linkedin.com/in/sample-profile/'
        }
      },
      {
        step: 5,
        name: 'Close Browser',
        method: 'POST',
        endpoint: '/test/linkedin/close',
        body: {}
      }
    ],
    alternativeWorkflow: {
      name: 'Complete Workflow Test',
      method: 'POST',
      endpoint: '/test/linkedin/workflow',
      body: {
        profileUrl: 'https://www.linkedin.com/in/sample-profile/',
        environment: 'development'
      },
      description: 'Runs all steps in sequence automatically'
    },
    notes: [
      'Make sure to run steps in order for individual testing',
      'Use development mode to see the browser window',
      'The login step uses hardcoded credentials from your code',
      'Replace sample-profile with actual LinkedIn profile URLs',
      'Close browser after each test session'
    ]
  });
});

export default router;