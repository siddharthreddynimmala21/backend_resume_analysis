import express from 'express';
import RAGService from '../services/ragService.js';
import auth from '../middleware/auth.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Use require for pdf-parse to avoid debug mode issue
const pdfParse = require('pdf-parse');
import multer from 'multer';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

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

// Get all user resumes
router.get('/resumes', auth, async (req, res) => {
  try {
    const ragService = new RAGService();
    const resumes = await ragService.getUserResumes(req.user.id);
    
    const response = {
      success: true,
      resumes
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting resumes:', error);
    res.status(500).json({ 
      error: 'Failed to get resumes',
      details: error.message 
    });
  }
});

// Upload and process resume for RAG (max 3 resumes)
router.post('/upload-resume', auth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if user already has 3 resumes
    const ragService = new RAGService();
    const existingResumes = await ragService.getUserResumes(req.user.id);
    
    if (existingResumes.length >= 3) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Maximum 3 resumes allowed. Please delete an existing resume first.' 
      });
    }
    
    // Extract text from PDF
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Could not extract text from PDF' });
    }

    // Generate unique resume ID
    const resumeId = uuidv4();

    // Process and store in vector database and MongoDB
    console.log('Chat route: Storing resume with RAG service...');
    const result = await ragService.processAndStoreResume(
      req.user.id, 
      resumeId, 
      resumeText, 
      req.file.originalname
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Get the created resume info
    const resumeInfo = await ragService.getResumeInfo(req.user.id, resumeId);

    const response = {
      success: true,
      message: 'Resume uploaded and processed successfully',
      resume: resumeInfo
    };
    
    res.json(response);

  } catch (error) {
    console.error('Error uploading resume:', {
      userId: req.user.id,
      fileName: req.file?.originalname,
      error: error.message,
      stack: error.stack
    });
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up uploaded file after error');
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError.message);
      }
    }

    // Determine appropriate error response
    let statusCode = 500;
    let errorMessage = 'Failed to process resume';
    
    if (error.message.includes('Maximum resumes')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message.includes('Invalid PDF')) {
      statusCode = 400;
      errorMessage = 'Invalid PDF file. Please upload a valid PDF document.';
    } else if (error.message.includes('File too large')) {
      statusCode = 400;
      errorMessage = 'File size exceeds the 10MB limit.';
    }

    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete a specific resume with enhanced error handling
router.delete('/resumes/:resumeId', auth, async (req, res) => {
  try {
    const { resumeId } = req.params;
    
    if (!resumeId) {
      return res.status(400).json({ 
        success: false,
        error: 'Resume ID is required' 
      });
    }

    const ragService = new RAGService();
    
    // Check if resume exists and belongs to user
    const resumeInfo = await ragService.getResumeInfo(req.user.id, resumeId);
    if (!resumeInfo) {
      return res.status(404).json({ 
        success: false,
        error: 'Resume not found or access denied' 
      });
    }

    // Delete the resume with retry logic
    let deleteResult;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        deleteResult = await ragService.deleteResume(req.user.id, resumeId);
        break; // Success, exit retry loop
      } catch (deleteError) {
        retryCount++;
        console.error(`Delete attempt ${retryCount} failed:`, deleteError.message);
        
        if (retryCount >= maxRetries) {
          throw deleteError; // Re-throw after max retries
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    

    
    res.json({
      success: true,
      message: `Resume "${resumeInfo.fileName}" deleted successfully`,
      deletedResume: {
        id: resumeId,
        fileName: resumeInfo.fileName
      }
    });
  } catch (error) {
    console.error('Error deleting resume:', {
      userId: req.user.id,
      resumeId: req.params.resumeId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete resume',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// RAG-based chat endpoint (now requires resumeId)
router.post('/query', auth, async (req, res) => {
  try {
    const { question, conversationHistory = [], resumeId } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Handle general chats without resume ID
    if (!resumeId) {

      
      // Provide a general response for chats without resume
      const generalResponse = {
        success: true,
        answer: "I'm an AI assistant specialized in resume analysis and career guidance. For the best experience, please upload a resume so I can provide personalized insights about your career profile, skills, and potential improvements. I can help with resume optimization, career advice, and job search strategies when I have your resume to analyze.",
        sources: [],
        metadata: {
          isGeneralChat: true,
          timestamp: new Date().toISOString()
        }
      };
      
      return res.json(generalResponse);
    }



    // Query the specific resume using RAG
    const ragService = new RAGService();
    const result = await ragService.queryResume(req.user.id, resumeId, question, conversationHistory);

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

// Check if user has resume data (legacy endpoint - now returns resume count)
router.get('/has-resume', auth, async (req, res) => {
  try {
    const ragService = new RAGService();
    const result = await ragService.hasUserResume(req.user.id);
    
    res.json({
      hasResume: result.hasResume,
      resumeCount: result.resumeCount
    });
  } catch (error) {
    console.error('Error checking resume data:', error);
    res.json({
      hasResume: false,
      resumeCount: 0
    });
  }
});

// Chat History Management Routes

// Save chat history
router.post('/history', auth, async (req, res) => {
  try {
    const { chatId, resumeId, chatName, messages } = req.body;
    
    if (!chatId || !resumeId || !chatName || !messages) {
      return res.status(400).json({ 
        error: 'Missing required fields: chatId, resumeId, chatName, messages' 
      });
    }

    const ragService = new RAGService();
    const result = await ragService.saveChatHistory(
      req.user.id, 
      chatId, 
      resumeId, 
      chatName, 
      messages
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error saving chat history:', error);
    res.status(500).json({ 
      error: 'Failed to save chat history',
      details: error.message 
    });
  }
});

// Get chat history
router.get('/history/:chatId', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const ragService = new RAGService();
    const messages = await ragService.getChatHistory(req.user.id, chatId);
    
    res.json({ messages });
  } catch (error) {
    console.error('Error getting chat history:', error);
    res.status(500).json({ 
      error: 'Failed to get chat history',
      details: error.message 
    });
  }
});

// Get user's chat sessions
router.get('/sessions', auth, async (req, res) => {
  try {
    const ragService = new RAGService();
    const sessions = await ragService.getUserChatSessions(req.user.id);
    
    res.json({ sessions });
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    res.status(500).json({ 
      error: 'Failed to get chat sessions',
      details: error.message 
    });
  }
});

// Delete chat history
router.delete('/history/:chatId', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const ragService = new RAGService();
    const result = await ragService.deleteChatHistory(req.user.id, chatId);
    
    res.json(result);
  } catch (error) {
    console.error('Error deleting chat history:', error);
    res.status(500).json({ 
      error: 'Failed to delete chat history',
      details: error.message 
    });
  }
});

export default router;