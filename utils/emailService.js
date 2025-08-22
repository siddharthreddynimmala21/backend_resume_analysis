import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { marked } from 'marked';

// Apply fixed typography and black color to markdown HTML for emails
const styleMarkdownHtml = (html) => {
    if (!html) return html;
    // Ensure bullets render with spacing
    html = html
        .replaceAll('<ul>', '<ul style="list-style-type:disc; list-style-position:outside; padding-left:20px; margin:8px 0; color:#000;">')
        .replaceAll('<ol>', '<ol style="list-style-type:decimal; list-style-position:outside; padding-left:20px; margin:8px 0; color:#000;">')
        .replaceAll('<li>', '<li style="font-size:14px; line-height:1.7; margin:6px 0; color:#000;">');

    // Headings and paragraphs
    html = html
        .replaceAll('<h1>', '<h1 style="font-size:22px; font-weight:700; margin:14px 0 10px; color:#000;">')
        .replaceAll('<h2>', '<h2 style="font-size:18px; font-weight:700; margin:12px 0 8px; color:#000;">')
        .replaceAll('<h3>', '<h3 style="font-size:16px; font-weight:700; margin:10px 0 6px; color:#000;">')
        .replaceAll('<p>', '<p style="font-size:14px; line-height:1.7; margin:8px 0; color:#000;">')
        .replaceAll('<strong>', '<strong style="color:#000;">')
        .replaceAll('<em>', '<em style="color:#000;">');

    return html;
};

// Create a function to get transporter - ensures env variables are loaded
const getTransporter = () => {
    // Gmail SMTP configuration
    return nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // Use SSL
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        },
        debug: process.env.NODE_ENV === 'development', // Enable debug logs only in development
        logger: process.env.NODE_ENV === 'development' // Log to console only in development
    });
};

/**
 * Send a raw PDF Buffer as an email attachment.
 * @param {string} email Recipient
 * @param {string} subject Subject line
 * @param {Buffer} pdfBuffer PDF content
 * @param {string} filename Attachment filename
 * @param {string} htmlBody Optional HTML body; if omitted a default is used
 */
const sendPDFBufferEmail = async (email, subject, pdfBuffer, filename = 'report.pdf', htmlBody = '') => {
    try {
        const transporter = getTransporter();
        await transporter.verify();

        const mailOptions = {
            from: {
                name: 'Resume AI',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject,
            text: 'Your report is attached as a PDF.',
            html: htmlBody || '<p>Your report is attached as a PDF.</p>',
            attachments: [
                {
                    filename,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('PDF buffer email sent:', { messageId: info.messageId });
        return true;
    } catch (error) {
        console.error('Failed to send PDF buffer email:', error);
        return false;
    }
};

const sendOTPEmail = async (email, otp) => {
    try {
        // Get a fresh transporter instance
        const transporter = getTransporter();
        
        // Check if email credentials exist
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
            console.error('Email credentials missing in .env file');
            return false;
        }
        
        // Verify transporter configuration
        try {
            await transporter.verify();
        } catch (verifyError) {
            console.error('Transporter verification failed:', verifyError.message);
            return false;
        }

        // Prepare email data
        const mailOptions = {
            from: {
                name: 'Resume AI',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: 'Email Verification OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color:#000;">
                    <h1 style="color: #000;">Email Verification</h1>
                    <p style="color:#000;">Your OTP for email verification is:</p>
                    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
                        <h2 style="color: #000; margin: 0; font-size: 24px;">${otp}</h2>
                    </div>
                    <p style="color:#000;">This OTP will expire in 10 minutes.</p>
                    <p style="color: #000; font-size: 14px;">If you didn't request this verification, please ignore this email.</p>
                </div>
            `,
            text: `Your OTP for email verification is: ${otp}. This OTP will expire in 10 minutes.`
        };

        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('EMAIL SENDING FAILED:', error.message);
        
        // More specific error handling
        if (error.code === 'EAUTH') {
            console.error('Authentication failed. Check your Gmail App Password - it may be incorrect or expired.');
        } else if (error.code === 'ESOCKET') {
            console.error('Socket error. Check your network connection.');
        } else if (error.responseCode === 535) {
            console.error('Username and password not accepted. Make sure your Gmail App Password is correct.');
        } else if (error.code === 'ECONNECTION') {
            console.error('Connection error. SMTP server may be blocking your connection.');
        }
        
        console.error('EMAIL CONFIG:', {
            host: 'smtp.gmail.com',
            port: 465,
            user: process.env.EMAIL_USER ? process.env.EMAIL_USER : 'NOT SET',
            passwordProvided: process.env.EMAIL_PASSWORD ? 'YES' : 'NO'
        });
        
        return false;
    }
};

const generatePdfBufferFromMarkdown = (markdownContent, email = '') => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // ---------- New rendering logic ----------
            // Extract user's first name from email if provided
            if (email) {
                const firstName = email.split('@')[0].split('.')[0];
                // Capitalize first letter of the name
                const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
                
                // Add greeting with user's name
                doc.font('Helvetica').fontSize(12).text(`Hi ${capitalizedName},`, {
                    align: 'left',
                    paragraphGap: 5
                });
                
                doc.font('Helvetica').fontSize(12).text('Greetings from ResumeRefiner! 👋', {
                    align: 'left',
                    paragraphGap: 5
                });
                
                doc.font('Helvetica').fontSize(12).text('Thank you for using our AI-powered resume optimization tool. We appreciate your patience while we thoroughly analyzed your resume in alignment with your target role.', {
                    align: 'left',
                    paragraphGap: 5
                });
                
                doc.font('Helvetica').fontSize(12).text('We\'re excited to share your Final Career Analysis Report below. This detailed report provides valuable insights into your strengths, skill alignment, and suggestions to help you move closer to your career goals.', {
                    align: 'left',
                    paragraphGap: 5
                });
                
                doc.font('Helvetica').fontSize(12).text('Please find your report below:', {
                    align: 'left',
                    paragraphGap: 10
                });
            }
            
            // Add an intro line so the reader knows what the file contains
            doc.font('Helvetica-Bold').fontSize(14).text('Following is the report:', {
                align: 'left',
                paragraphGap: 10
            });

            // Convert the markdown to a reasonably formatted PDF. We intentionally
            // avoid adding heavy HTML → PDF dependencies and instead handle the
            // most common markdown patterns (headings, lists, plain paragraphs)
            // so that a reader does not see the raw markdown symbols (e.g. #, *, **).

            // Split the markdown into lines so we can handle each individually.
            const lines = markdownContent.split(/\r?\n/);

            lines.forEach((rawLine) => {
                const line = rawLine.trim();

                if (!line) {
                    // Blank line = add some vertical space
                    doc.moveDown(0.5);
                    return;
                }

                // Headings (support up to ###)
                if (line.startsWith('### ')) {
                    doc.font('Helvetica-Bold').fontSize(14).text(line.replace(/^###\s+/, ''), {
                        paragraphGap: 6
                    });
                    // Reset to body font after heading
                    doc.font('Helvetica').fontSize(12);
                    return;
                }
                if (line.startsWith('## ')) {
                    doc.font('Helvetica-Bold').fontSize(16).text(line.replace(/^##\s+/, ''), {
                        paragraphGap: 8
                    });
                    doc.font('Helvetica').fontSize(12);
                    return;
                }
                if (line.startsWith('# ')) {
                    doc.font('Helvetica-Bold').fontSize(20).text(line.replace(/^#\s+/, ''), {
                        paragraphGap: 10
                    });
                    doc.font('Helvetica').fontSize(12);
                    return;
                }

                // Unordered list items (*, -, +)
                if (/^[*\-+]\s+/.test(line)) {
                    const text = line.replace(/^[*\-+]\s+/, '');
                    doc.text(`• ${text}`, {
                        indent: 20,
                        paragraphGap: 2,
                        lineGap: 2
                    });
                    return;
                }

                // Numbered list items (e.g. 1. Foo)
                if (/^\d+\.\s+/.test(line)) {
                    const match = line.match(/^(\d+)\.\s+(.*)$/);
                    if (match) {
                        const [, num, text] = match;
                        doc.text(`${num}. ${text}`, {
                            indent: 20,
                            paragraphGap: 2,
                            lineGap: 2
                        });
                        return;
                    }
                }

                // Bold text (**text**)
                if (/\*\*[\s\S]+\*\*/.test(line)) {
                    const plain = line.replace(/\*\*/g, '');
                    doc.font('Helvetica-Bold').text(plain);
                    doc.font('Helvetica');
                    return;
                }

                // Italic text (*text*) → just render as plain
                const cleaned = line.replace(/\*/g, '');
                doc.text(cleaned);
            });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

/**
 * Send a markdown report as a PDF attachment via email.
 * @param {string} email - Destination email address
 * @param {string} subject - Email subject
 * @param {string} markdownContent - Report content in markdown format
 * @returns {Promise<boolean>}  Whether the email was queued successfully
 */
const sendPDFReportEmail = async (email, subject, markdownContent) => {
    try {
        console.log('Preparing to send PDF report email to:', email);

        // Generate PDF buffer from markdown, passing the email for personalization
        const pdfBuffer = await generatePdfBufferFromMarkdown(markdownContent, email);
        console.log('PDF buffer generated. Size:', pdfBuffer.length, 'bytes');

        // Get transporter instance (fresh each call)
        const transporter = getTransporter();

        // Verify transporter
        await transporter.verify();

        const mailOptions = {
            from: {
                name: 'Resume AI',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject,
            // We purposefully do NOT include the full report in the email body so that
            // users only see the content inside the attached PDF as requested.
            text: 'Your requested report is attached as a PDF. Please find it enclosed.',
            attachments: [
                {
                    filename: 'resume_report.pdf',
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('PDF report email sent:', {
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected
        });
        return true;
    } catch (error) {
        console.error('Failed to send PDF report email:', error);
        return false;
    }
};

/**
 * Send a markdown report as an email body (no attachments).
 * The markdown is converted to HTML so the recipient sees rich formatting.
 * @param {string} email Recipient address
 * @param {string} subject Subject line
 * @param {string} markdownContent Report content in markdown format
 */
const sendMarkdownReportEmail = async (email, subject, markdownContent) => {
    try {
        console.log('Preparing to send Markdown report email to:', email);

        // Get transporter instance
        const transporter = getTransporter();
        await transporter.verify();
        
        // Extract user's first name from email
        const firstName = email.split('@')[0].split('.')[0];
        // Capitalize first letter of the name
        const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
        
        // Create greeting with user's name
        const greetingHtml = `
        <div style="margin-bottom: 20px; color:#000;">
            <p style="color:#000;">Hi ${capitalizedName},</p>
            <p style="color:#000;">Greetings from ResumeRefiner! 👋</p>
            <p style="color:#000;">Thank you for using our AI-powered resume optimization tool. We appreciate your patience while we thoroughly analyzed your resume in alignment with your target role.</p>
            <p style="color:#000;">We're excited to share your Final Career Analysis Report below. This detailed report provides valuable insights into your strengths, skill alignment, and suggestions to help you move closer to your career goals.</p>
            <p style="color:#000;">Please find your report below:</p>
        </div>
        `;
        
        // Convert markdown to HTML, then apply fixed styles and prepend intro line and greeting
        const introHtml = '<p style="font-size:14px; line-height:1.7; margin:8px 0; color:#000;"><strong style="color:#000;">Following is the report:</strong></p>';
        const rawMdHtml = marked.parse(markdownContent);
        const styledMdHtml = styleMarkdownHtml(rawMdHtml);
        const htmlContent = `<div style="color:#000;">${greetingHtml}${introHtml}${styledMdHtml}</div>`;

        const mailOptions = {
            from: {
                name: 'Resume AI',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject,
            text: markdownContent, // Plain-text fallback (still markdown)
            html: htmlContent // Rich HTML version
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Markdown report email sent:', {
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected
        });
        return true;
    } catch (error) {
        console.error('Failed to send Markdown report email:', error);
        return false;
    }
};

export {
    sendOTPEmail,
    sendPDFReportEmail,
    sendMarkdownReportEmail,
    sendPDFBufferEmail
};
