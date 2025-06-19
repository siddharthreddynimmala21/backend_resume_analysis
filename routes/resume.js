import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import multer from 'multer';
import { PDFExtract } from 'pdf.js-extract';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
    fieldSize: 10 * 1024 * 1024 // 10MB field size limit
  }
});

const pdfExtract = new PDFExtract();

// Initialize Gemini AI
console.log('Initializing Gemini AI...');
console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
console.log('GEMINI_API_KEY length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY environment variable is not set!');
  console.error('Please check your .env file and ensure GEMINI_API_KEY is properly configured.');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    generationConfig: {
        temperature: 0.3, // Lower temperature for more consistent structured output
        topP: 0.95,
        topK: 64,
    },
    model: "gemini-1.5-flash",
    safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
    ],
});

/**
 * Middleware to log detailed request information
 */
const logRequestDetails = (req, res, next) => {
  console.log('=== Resume Parse Request ===');
  console.log('Request Method:', req.method);
  console.log('Request Path:', req.path);
  console.log('Request Headers:', req.headers);
  console.log('Request Origin:', req.get('origin'));
  console.log('Request Host:', req.get('host'));
  
  // Log request body if it exists
  if (req.body) {
    console.log('Request Body:', req.body);
  }
  
  next();
};

/**
 * Timeout middleware for large file uploads
 */
const timeout = (req, res, next) => {
  req.setTimeout(30000); // 30 seconds
  res.setTimeout(30000);
  next();
};

/**
 * Test endpoint to verify the resume route is working
 */
router.get('/test', (req, res) => {
  console.log('Resume test endpoint hit');
  res.json({ 
    message: 'Resume route is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Test endpoint to verify Gemini API key is working
 */
router.get('/test-ai', async (req, res) => {
  try {
    console.log('Testing Gemini API...');
    console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
    console.log('GEMINI_API_KEY length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'API Key Missing',
        message: 'GEMINI_API_KEY environment variable is not set'
      });
    }
    
    // Test with a simple prompt
    const testPrompt = 'Say "Hello, Gemini API is working!" in exactly 5 words.';
    const result = await model.generateContent(testPrompt);
    const response = await result.response;
    const text = response.text();
    
    res.json({ 
      message: 'Gemini API test successful',
      response: text,
      apiKeyExists: !!process.env.GEMINI_API_KEY,
      apiKeyLength: process.env.GEMINI_API_KEY.length
    });
  } catch (error) {
    console.error('Gemini API test failed:', error);
    res.status(500).json({ 
      error: 'Gemini API test failed',
      message: error.message,
      details: error.errorDetails || 'Unknown error'
    });
  }
});

/**
 * Route to parse uploaded PDF resume and extract structured information
 * Uses Gemini AI to extract work experience, education, and skills
 */
router.post('/analyze', 
  timeout,
  logRequestDetails,
  upload.single('resume'), 
  async (req, res) => {
  try {
    console.log('Resume analysis request received');
    console.log('Request file details:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');

    // Check if file was uploaded
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ 
        error: 'No PDF file uploaded',
        message: 'Please select a PDF file to upload' 
      });
    }

    // Validate file type is PDF
    if (req.file.mimetype !== 'application/pdf') {
      console.error('Invalid file type:', req.file.mimetype);
      return res.status(400).json({ 
        error: 'Invalid file type',
        message: 'Only PDF files are allowed' 
      });
    }

    // Ensure buffer is valid
    if (!req.file.buffer || req.file.buffer.length === 0) {
      console.error('Invalid or empty PDF buffer');
      return res.status(400).json({ 
        error: 'Invalid PDF file',
        message: 'The uploaded PDF file is empty or corrupted' 
      });
    }

    // Parse PDF to extract text
    let extractedText = '';
    try {
      console.log('Starting PDF extraction...');
      const pdfData = await pdfExtract.extractBuffer(req.file.buffer);
      extractedText = pdfData.pages.map(page => page.content.map(item => item.str).join(' ')).join('\n').trim();
      console.log('PDF extraction completed successfully');
    } catch (parseError) {
      console.error('PDF Parsing Specific Error:', parseError);
      return res.status(400).json({ 
        error: 'PDF Parsing Failed',
        message: 'Unable to extract text from the PDF',
        details: parseError.message || 'Unknown parsing error' 
      });
    }

    // Validate extracted text
    if (!extractedText) {
      console.error('No text extracted from PDF');
      return res.status(400).json({ 
        error: 'No Text Extracted',
        message: 'No text could be extracted from the PDF' 
      });
    }

    // Use Gemini AI to extract structured information
    console.log('Starting AI analysis...');
    
    // Check if API key is available
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not available for AI analysis');
      return res.status(500).json({ 
        error: 'AI Analysis Unavailable',
        message: 'AI analysis is not configured. Please contact administrator.',
        rawText: extractedText
      });
    }
    
    const analysisPrompt = `
Please analyze the following resume text and extract the work experience, education, and skills in a structured JSON format.

Resume Text:
${extractedText}

Please extract and return ONLY a valid JSON object with the following structure:
{
  "workExperience": [
    {
      "company": "Company Name",
      "position": "Job Title",
      "duration": "Duration (e.g., Jan 2020 - Dec 2022)",
      "description": "Brief description of responsibilities and achievements"
    }
  ],
  "education": [
    {
      "institution": "Institution Name",
      "degree": "Degree/Certification",
      "field": "Field of Study",
      "duration": "Duration (e.g., 2018-2022)",
      "description": "Brief description or achievements"
    }
  ],
  "skills": [
    {
      "category": "Technical Skills",
      "skills": ["Skill 1", "Skill 2", "Skill 3"]
    },
    {
      "category": "Soft Skills", 
      "skills": ["Skill 1", "Skill 2", "Skill 3"]
    }
  ]
}

Important: Return ONLY the JSON object, no additional text or explanations. Ensure the JSON is valid and properly formatted.
`;

    try {
      console.log('Calling Gemini API...');
      const result = await model.generateContent(analysisPrompt);
      const response = await result.response;
      const aiResponse = response.text();
      
      console.log('AI Analysis Response:', aiResponse);
      
      // Try to parse the JSON response
      let structuredData;
      try {
        // Clean the response to extract only JSON
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          structuredData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('JSON Parsing Error:', parseError);
        console.log('Raw AI Response:', aiResponse);
        
        // Fallback: return the raw text with basic structure
        structuredData = {
          workExperience: [],
          education: [],
          skills: [],
          rawText: extractedText,
          error: 'Failed to parse structured data, showing raw text'
        };
      }

      // Return structured data
      res.json({ 
        message: 'Resume analyzed successfully', 
        data: structuredData,
        rawText: extractedText
      });

    } catch (aiError) {
      console.error('AI Analysis Error:', aiError);
      console.error('Error details:', {
        message: aiError.message,
        status: aiError.status,
        statusText: aiError.statusText,
        errorDetails: aiError.errorDetails
      });
      
      return res.status(500).json({ 
        error: 'AI Analysis Failed',
        message: 'Failed to analyze resume with AI. Please try again or use Text Only mode.',
        details: aiError.message,
        rawText: extractedText
      });
    }

  } catch (error) {
    console.error('Resume Analysis Unexpected Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing the resume',
      details: error.message 
    });
  }
});

/**
 * Route to parse uploaded PDF resume
 * Extracts full text content from the PDF (original functionality)
 */
router.post('/parse', 
  timeout,
  logRequestDetails,
  upload.single('resume'), 
  async (req, res) => {
  try {
    console.log('Resume upload request received');
    console.log('Request file details:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');

    // Detailed logging of request body and headers
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);

    // Check if file was uploaded
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ 
        error: 'No PDF file uploaded',
        message: 'Please select a PDF file to upload' 
      });
    }

    // Validate file type is PDF
    if (req.file.mimetype !== 'application/pdf') {
      console.error('Invalid file type:', req.file.mimetype);
      return res.status(400).json({ 
        error: 'Invalid file type',
        message: 'Only PDF files are allowed' 
      });
    }

    // Ensure buffer is valid
    if (!req.file.buffer || req.file.buffer.length === 0) {
      console.error('Invalid or empty PDF buffer');
      return res.status(400).json({ 
        error: 'Invalid PDF file',
        message: 'The uploaded PDF file is empty or corrupted' 
      });
    }

    // Parse PDF to extract text
    let extractedText = '';
    try {
      console.log('Starting PDF extraction...');
      const pdfData = await pdfExtract.extractBuffer(req.file.buffer);
      extractedText = pdfData.pages.map(page => page.content.map(item => item.str).join(' ')).join('\n').trim();
      console.log('PDF extraction completed successfully');
    } catch (parseError) {
      console.error('PDF Parsing Specific Error:', parseError);
      return res.status(400).json({ 
        error: 'PDF Parsing Failed',
        message: 'Unable to extract text from the PDF',
        details: parseError.message || 'Unknown parsing error' 
      });
    }

    // Validate extracted text
    if (!extractedText) {
      console.error('No text extracted from PDF');
      return res.status(400).json({ 
        error: 'No Text Extracted',
        message: 'No text could be extracted from the PDF' 
      });
    }

    // Log first 500 characters of extracted text
    console.log('Extracted Resume Text (first 500 chars):', 
      extractedText.substring(0, 500) + '...'
    );

    // Return extracted text
    res.json({ 
      message: 'PDF parsed successfully', 
      text: extractedText 
    });

  } catch (error) {
    console.error('Resume Parsing Unexpected Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing the resume',
      details: error.message 
    });
  }
});

/**
 * Route to match resume skills with job description using Gemini
 */
router.post('/match-skills', 
  timeout,
  logRequestDetails,
  upload.single('resume'), 
  async (req, res) => {
    try {
      // 1. Validate file and job description
      if (!req.file) {
        return res.status(400).json({ error: 'No resume file uploaded' });
      }
      if (!req.body.jobDescription) {
        return res.status(400).json({ error: 'Job description is required' });
      }
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Only PDF files are allowed' });
      }
      if (!req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ error: 'The uploaded PDF file is empty or corrupted' });
      }
      // 2. Extract text from PDF
      let extractedText = '';
      try {
        const pdfData = await pdfExtract.extractBuffer(req.file.buffer);
        extractedText = pdfData.pages.map(page => page.content.map(item => item.str).join(' ')).join('\n').trim();
      } catch (parseError) {
        return res.status(400).json({ error: 'Unable to extract text from the PDF', details: parseError.message });
      }
      if (!extractedText) {
        return res.status(400).json({ error: 'No text could be extracted from the PDF' });
      }
      // 3. Use Gemini to extract skills from resume text
      const skillsPrompt = `Extract a flat, comma-separated list of all skills (technical and soft) mentioned in the following resume text. Only list the skills, no extra text.\n\nResume Text:\n${extractedText}`;
      let skillsList = [];
      try {
        const skillsResult = await model.generateContent(skillsPrompt);
        const skillsResponse = await skillsResult.response;
        const skillsText = skillsResponse.text();
        // Parse comma-separated skills
        skillsList = skillsText.split(/,|\n/).map(s => s.trim()).filter(Boolean);
      } catch (err) {
        return res.status(500).json({ error: 'Failed to extract skills from resume', details: err.message });
      }
      // 4. Prepare the prompt for skill matching
      const jobDescription = req.body.jobDescription;
      const matchPrompt = `Skills: ${skillsList.join(', ')}\n\nJob Description: ${jobDescription}\n\nFollow these instructions strictly:\n1. Match the candidate's skills with the job requirements.\n2. Do not make assumptions about skills not clearly mentioned.\n3. Evaluate only based on the overlap of skills (not years of experience, education, or formatting).\n4. Return:\n   - A neutral and objective match percentage score out of 100.\n   - A list of matching skills.\n   - A list of missing skills (required but not found in the resume).\n   - A short one-line justification for the score.`;
      let matchResult;
      try {
        const matchAIResult = await model.generateContent(matchPrompt);
        const matchAIResponse = await matchAIResult.response;
        matchResult = matchAIResponse.text();
      } catch (err) {
        return res.status(500).json({ error: 'Failed to match skills with job description', details: err.message });
      }
      // 5. Return the result
      res.json({
        message: 'Skill match analysis complete',
        skills: skillsList,
        matchReport: matchResult
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  }
);

export default router; 