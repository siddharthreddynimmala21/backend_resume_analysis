import express from 'express';
import RAGService from '../services/ragService.js';
import auth from '../middleware/auth.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Use require for pdf-parse to avoid debug mode issue
const pdfParse = require('pdf-parse');
import multer from 'multer';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Upload and process resume for RAG
router.post('/upload-resume', auth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing uploaded resume:', req.file.filename);
    
    // Extract text from PDF
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from PDF' });
    }

    console.log('Extracted text length:', resumeText.length);

    // Process and store in vector database
    const ragService = new RAGService();
    const result = await ragService.processAndStoreResume(req.user.id, resumeText);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: 'Resume uploaded and processed successfully',
      chunksStored: result.chunksStored,
      textLength: resumeText.length
    });

  } catch (error) {
    console.error('Error uploading resume:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ 
      error: 'Failed to process resume',
      details: error.message 
    });
  }
});

// RAG-based chat endpoint
router.post('/query', auth, async (req, res) => {
  try {
    const { question, conversationHistory = [] } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    console.log(`User ${req.user.id} asking: ${question}`);
    if (conversationHistory.length > 0) {
      console.log(`With conversation context: ${conversationHistory.length} messages`);
    }

    // Query the resume using RAG
    const ragService = new RAGService();
    const result = await ragService.queryResume(req.user.id, question, conversationHistory);

    if (!result.success) {
      return res.status(404).json({ 
        error: result.message || 'No resume data found' 
      });
    }

    res.json({
      success: true,
      answer: result.answer,
      relevantChunks: result.relevantChunks,
      confidence: result.confidence
    });

  } catch (error) {
    console.error('Error querying resume:', error);
    res.status(500).json({ 
      error: 'Failed to process question',
      details: error.message 
    });
  }
});

// Delete user's resume data
router.delete('/resume-data', auth, async (req, res) => {
  try {
    const ragService = new RAGService();
    const result = await ragService.deleteUserData(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Error deleting user data:', error);
    res.status(500).json({ 
      error: 'Failed to delete resume data',
      details: error.message 
    });
  }
});

// Check if user has resume data
router.get('/has-resume', auth, async (req, res) => {
  try {
    const ragService = new RAGService();
    const result = await ragService.hasUserResume(req.user.id);
    
    res.json({
      hasResume: result.hasResume,
      chunksCount: result.chunksCount
    });
  } catch (error) {
    console.error('Error checking resume data:', error);
    res.json({
      hasResume: false,
      chunksCount: 0
    });
  }
});

export default router;