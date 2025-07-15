import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

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

            // Basic rendering – we render the markdown literal text. Headings (#, ##, etc.)
            // will still appear in the PDF. For richer styling we could parse markdown to
            // HTML and render, but this keeps the dependency footprint minimal and is
            // sufficient for a simple report.
            doc.font('Helvetica').fontSize(12).text(markdownContent, {
                lineGap: 4,
                paragraphGap: 8,
                align: 'left'
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
            text: markdownContent, // Fallback
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

export {
    sendOTPEmail,
    sendPDFReportEmail
};
