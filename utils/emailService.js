import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { marked } from 'marked';

// Create a function to get transporter - ensures env variables are loaded
const getTransporter = () => {
    console.log('Creating email transporter with user:', process.env.EMAIL_USER);
    
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
        debug: true, // Enable debug logs
        logger: true // Log to console
    });
};

const sendOTPEmail = async (email, otp) => {
    try {
        console.log('Starting email send process to:', email);
        
        // Get a fresh transporter instance
        const transporter = getTransporter();
        
        // Check if email credentials exist
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
            console.error('Email credentials missing in .env file');
            return false;
        }
        
        // Verify transporter configuration
        console.log('Verifying transporter configuration...');
        try {
            await transporter.verify();
            console.log('Transporter verification successful');
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
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #2563eb;">Email Verification</h1>
                    <p>Your OTP for email verification is:</p>
                    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
                        <h2 style="color: #1f2937; margin: 0; font-size: 24px;">${otp}</h2>
                    </div>
                    <p>This OTP will expire in 10 minutes.</p>
                    <p style="color: #6b7280; font-size: 14px;">If you didn't request this verification, please ignore this email.</p>
                </div>
            `,
            text: `Your OTP for email verification is: ${otp}. This OTP will expire in 10 minutes.`
        };

        console.log('Sending email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });
        
        return true;    } catch (error) {
        console.error('⚠️ EMAIL SENDING FAILED ⚠️');
        console.error('Error details:', {
            errorName: error.name,
            errorMessage: error.message,
            errorCode: error.code,
            errorCommand: error.command,
            responseCode: error.responseCode,
            response: error.response
        });
        
        // More specific error handling
        if (error.code === 'EAUTH') {
            console.error('Authentication failed. Check your Gmail App Password - it may be incorrect or expired.');
            console.error('Make sure 2FA is enabled on your Google account and you\'re using an App Password, NOT your regular password.');
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

const generatePdfBufferFromMarkdown = (markdownContent) => {
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

        // Generate PDF buffer from markdown
        const pdfBuffer = await generatePdfBufferFromMarkdown(markdownContent);
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

        // Convert markdown to HTML and prepend intro line
        const introHtml = '<p><strong>Following is the report:</strong></p>';
        const htmlContent = introHtml + marked.parse(markdownContent);

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
    sendMarkdownReportEmail
};
