import express from 'express';
import auth from '../middleware/auth.js';
import { generatePDFBufferFromHTML } from '../utils/pdfService.js';
import { sendPDFBufferEmail } from '../utils/emailService.js';

const router = express.Router();

/**
 * POST /api/report/download
 * Body: { html: string, subject?: string, fileName?: string }
 * Requires auth. Generates a high-fidelity PDF from provided HTML and emails it to the authenticated user.
 */
router.post('/download', auth, async (req, res) => {
  try {
    const { html, subject = 'Your AI Interview Report (PDF)', fileName = 'interview_report.pdf' } = req.body || {};

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'Missing required field: html (string)' });
    }

    // Generate PDF from styled HTML
    const pdfBuffer = await generatePDFBufferFromHTML(html);

    // Email to authenticated user
    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ error: 'Authenticated user email not found' });
    }

    const sent = await sendPDFBufferEmail(
      email,
      subject,
      pdfBuffer,
      fileName,
      '<p>Your AI Interview report is attached as a PDF.</p>'
    );

    if (!sent) {
      return res.status(500).json({ error: 'Failed to send report via email' });
    }

    return res.status(200).json({ message: 'Report generated and emailed successfully' });
  } catch (err) {
    console.error('Error in /api/report/download:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

export default router;
