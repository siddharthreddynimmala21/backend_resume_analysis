import express from 'express';
import multer from 'multer';
import pdf from 'pdf-parse';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB file size limit
  }
});

/**
 * Middleware to log detailed request information
 */
const logRequestDetails = (req, res, next) => {
  console.log('=== Resume Parse Request ===');
  console.log('Request Method:', req.method);
  console.log('Request Path:', req.path);
  console.log('Request Headers:', req.headers);
  
  // Log request body if it exists
  if (req.body) {
    console.log('Request Body:', req.body);
  }
  
  next();
};

/**
 * Route to parse uploaded PDF resume
 * Extracts full text content from the PDF
 */
router.post('/parse', 
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
      const pdfData = await pdf(req.file.buffer);
      extractedText = pdfData.text.trim();
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

export default router; 