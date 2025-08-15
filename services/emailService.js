import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    /**
     * Initialize email transporter
     */
    initializeTransporter() {
        // Configure based on your email service
        // This example uses Gmail, but you can configure for any SMTP service
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'your-email@gmail.com',
                pass: process.env.EMAIL_PASSWORD || 'your-app-password'
            }
        });

        // Alternative configuration for other SMTP services
        // this.transporter = nodemailer.createTransport({
        //   host: process.env.SMTP_HOST || 'smtp.gmail.com',
        //   port: process.env.SMTP_PORT || 587,
        //   secure: false,
        //   auth: {
        //     user: process.env.EMAIL_USER,
        //     pass: process.env.EMAIL_PASSWORD
        //   }
        // });
    }

    /**
     * Send interview report via email
     * @param {string} recipientEmail - Recipient's email address
     * @param {string} recipientName - Recipient's name
     * @param {Object} report - Interview report data
     */
    async sendInterviewReport(recipientEmail, recipientName, report) {
        try {
            const htmlContent = this.generateReportHTML(report, recipientName);
            const textContent = this.generateReportText(report, recipientName);

            const mailOptions = {
                from: {
                    name: 'AI Interview System',
                    address: process.env.EMAIL_USER || 'noreply@aiinterview.com'
                },
                to: recipientEmail,
                subject: `Your AI Interview Report - Session ${report.sessionId.slice(-8)}`,
                text: textContent,
                html: htmlContent,
                attachments: [
                    {
                        filename: 'interview-report.json',
                        content: JSON.stringify(report, null, 2),
                        contentType: 'application/json'
                    }
                ]
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('Interview report email sent successfully:', result.messageId);
            return { success: true, messageId: result.messageId };

        } catch (error) {
            console.error('Error sending interview report email:', error);
            throw error;
        }
    }

    /**
     * Generate HTML content for the email
     * @param {Object} report - Interview report data
     * @param {string} recipientName - Recipient's name
     * @returns {string} HTML content
     */
    generateReportHTML(report, recipientName) {
        const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const getVerdictColor = (verdict) => {
            switch (verdict) {
                case 'Pass': return '#22c55e';
                case 'Fail': return '#ef4444';
                default: return '#6b7280';
            }
        };

        const getPercentageColor = (percentage) => {
            if (percentage >= 80) return '#22c55e';
            if (percentage >= 60) return '#f59e0b';
            if (percentage >= 40) return '#f97316';
            return '#ef4444';
        };

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Interview Report</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8fafc;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
        }
        .summary-card {
            background: white;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .summary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-item {
            text-align: center;
            padding: 15px;
            border-radius: 8px;
            background: #f1f5f9;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #64748b;
            font-size: 0.9em;
        }
        .round-section {
            background: white;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .round-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e2e8f0;
        }
        .round-title {
            font-size: 1.5em;
            font-weight: bold;
            color: #1e293b;
        }
        .verdict-badge {
            padding: 8px 16px;
            border-radius: 20px;
            color: white;
            font-weight: bold;
            font-size: 0.9em;
        }
        .question-item {
            background: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            border-left: 4px solid #e2e8f0;
        }
        .question-item.correct {
            border-left-color: #22c55e;
        }
        .question-item.incorrect {
            border-left-color: #ef4444;
        }
        .question-text {
            font-weight: bold;
            margin-bottom: 10px;
            color: #1e293b;
        }
        .answer-section {
            margin: 10px 0;
        }
        .answer-label {
            font-weight: bold;
            color: #64748b;
            font-size: 0.9em;
        }
        .answer-text {
            margin: 5px 0;
            padding: 8px 12px;
            background: white;
            border-radius: 5px;
            border: 1px solid #e2e8f0;
        }
        .correct-answer {
            background: #dcfce7;
            border-color: #22c55e;
        }
        .incorrect-answer {
            background: #fef2f2;
            border-color: #ef4444;
        }
        .feedback-section {
            background: #f0f9ff;
            border: 1px solid #0ea5e9;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
        }
        .feedback-title {
            font-weight: bold;
            color: #0369a1;
            margin-bottom: 8px;
        }
        .explanation-text {
            line-height: 1.6;
            color: #1e293b;
        }
        .suggestions-section {
            background: white;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .suggestions-category {
            margin-bottom: 20px;
        }
        .suggestions-category h4 {
            color: #1e293b;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        .suggestions-list {
            list-style: none;
            padding: 0;
        }
        .suggestions-list li {
            background: #f8fafc;
            padding: 10px 15px;
            margin-bottom: 8px;
            border-radius: 5px;
            border-left: 3px solid #3b82f6;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #64748b;
            font-size: 0.9em;
        }
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #e2e8f0;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎯 AI Interview Report</h1>
        <p>Comprehensive Analysis for ${recipientName}</p>
        <p>Session ID: ${report.sessionId} | Generated: ${formatDate(report.generatedAt)}</p>
    </div>

    <div class="summary-card">
        <h2>📊 Overall Performance Summary</h2>
        <div class="summary-stats">
            <div class="stat-item">
                <div class="stat-value" style="color: ${getPercentageColor(report.overallAnalysis.overallPercentage)}">
                    ${report.overallAnalysis.overallPercentage}%
                </div>
                <div class="stat-label">Overall Score</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" style="color: #3b82f6">
                    ${report.overallAnalysis.totalScore}/${report.overallAnalysis.maxPossibleScore}
                </div>
                <div class="stat-label">Total Points</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" style="color: #10b981">
                    ${report.overallAnalysis.roundsPassed}/${report.overallAnalysis.roundsCompleted}
                </div>
                <div class="stat-label">Rounds Passed</div>
            </div>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${report.overallAnalysis.overallPercentage}%; background: ${getPercentageColor(report.overallAnalysis.overallPercentage)};"></div>
        </div>
        
        <h3 style="color: ${getPercentageColor(report.overallAnalysis.overallPercentage)}; text-align: center; margin-top: 15px;">
            ${report.overallAnalysis.overallVerdict}
        </h3>
    </div>

    ${report.roundReports.map(round => `
    <div class="round-section">
        <div class="round-header">
            <div class="round-title">${round.roundName}</div>
            <div class="verdict-badge" style="background-color: ${getVerdictColor(round.overallScore.verdict)}">
                ${round.overallScore.verdict} (${round.overallScore.percentage}%)
            </div>
        </div>

        ${round.mcqReport.questions.length > 0 ? `
        <h3>📝 Multiple Choice Questions (${round.mcqReport.score}/${round.mcqReport.maxScore})</h3>
        ${round.mcqReport.questions.map(q => `
        <div class="question-item ${q.isCorrect ? 'correct' : 'incorrect'}">
            <div class="question-text">Q${q.questionNumber}: ${q.question}</div>
            
            <div class="answer-section">
                <div class="answer-label">Your Answer:</div>
                <div class="answer-text ${q.isCorrect ? 'correct-answer' : 'incorrect-answer'}">
                    ${q.userAnswer}
                </div>
            </div>
            
            ${!q.isCorrect ? `
            <div class="answer-section">
                <div class="answer-label">Correct Answer:</div>
                <div class="answer-text correct-answer">
                    ${q.correctAnswerFull || q.correctAnswer}
                </div>
            </div>
            ` : ''}
            
            <div class="feedback-section">
                <div class="feedback-title">Explanation:</div>
                <div class="explanation-text" style="white-space: pre-line;">${q.explanation}</div>
            </div>
        </div>
        `).join('')}
        ` : ''}

        ${round.descriptiveReport.questions.length > 0 ? `
        <h3>✍️ Descriptive Questions (${round.descriptiveReport.score}/${round.descriptiveReport.maxScore})</h3>
        ${round.descriptiveReport.questions.map(q => `
        <div class="question-item">
            <div class="question-text">Q${q.questionNumber}: ${q.question}</div>
            
            <div class="answer-section">
                <div class="answer-label">Your Answer:</div>
                <div class="answer-text">
                    ${q.userAnswer || 'No answer provided'}
                </div>
            </div>
            
            <div class="answer-section">
                <div class="answer-label">Score: ${q.score}/${q.maxScore}</div>
            </div>
            
            <div class="feedback-section">
                <div class="feedback-title">Feedback:</div>
                ${q.feedback}
                
                ${q.suggestions.length > 0 ? `
                <div style="margin-top: 10px;">
                    <strong>Suggestions:</strong>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        ${q.suggestions.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
        </div>
        `).join('')}
        ` : ''}
    </div>
    `).join('')}

    <div class="suggestions-section">
        <h2>🚀 Improvement Recommendations</h2>
        
        ${report.improvementSuggestions.immediate.length > 0 ? `
        <div class="suggestions-category">
            <h4>🔥 Immediate Actions</h4>
            <ul class="suggestions-list">
                ${report.improvementSuggestions.immediate.map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${report.improvementSuggestions.shortTerm.length > 0 ? `
        <div class="suggestions-category">
            <h4>📅 Short-term Goals (1-3 months)</h4>
            <ul class="suggestions-list">
                ${report.improvementSuggestions.shortTerm.map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${report.improvementSuggestions.longTerm.length > 0 ? `
        <div class="suggestions-category">
            <h4>🎯 Long-term Development (3+ months)</h4>
            <ul class="suggestions-list">
                ${report.improvementSuggestions.longTerm.map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${report.improvementSuggestions.resources.length > 0 ? `
        <div class="suggestions-category">
            <h4>📚 Recommended Resources</h4>
            <ul class="suggestions-list">
                ${report.improvementSuggestions.resources.map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
    </div>

    ${report.overallAnalysis.strengths.length > 0 ? `
    <div class="suggestions-section">
        <h2>💪 Your Strengths</h2>
        <ul class="suggestions-list">
            ${report.overallAnalysis.strengths.map(s => `<li style="border-left-color: #22c55e;">${s}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    ${report.overallAnalysis.weaknesses.length > 0 ? `
    <div class="suggestions-section">
        <h2>🎯 Areas for Improvement</h2>
        <ul class="suggestions-list">
            ${report.overallAnalysis.weaknesses.map(s => `<li style="border-left-color: #f59e0b;">${s}</li>`).join('')}
        </ul>
    </div>
    ` : ''}

    <div class="footer">
        <p>This report was generated by the AI Interview System on ${formatDate(report.generatedAt)}</p>
        <p>Keep practicing and improving! Your next interview will be even better. 💪</p>
    </div>
</body>
</html>
    `;
    }

    /**
     * Generate plain text content for the email
     * @param {Object} report - Interview report data
     * @param {string} recipientName - Recipient's name
     * @returns {string} Plain text content
     */
    generateReportText(report, recipientName) {
        const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let text = `
AI INTERVIEW REPORT
===================

Dear ${recipientName},

Thank you for completing your AI interview session. Below is your comprehensive performance report.

SESSION DETAILS
---------------
Session ID: ${report.sessionId}
Interview Date: ${formatDate(report.interviewDate)}
Report Generated: ${formatDate(report.generatedAt)}
Rounds Completed: ${report.totalRounds}

OVERALL PERFORMANCE
-------------------
Total Score: ${report.overallAnalysis.totalScore}/${report.overallAnalysis.maxPossibleScore} (${report.overallAnalysis.overallPercentage}%)
Rounds Passed: ${report.overallAnalysis.roundsPassed}/${report.overallAnalysis.roundsCompleted}
Overall Verdict: ${report.overallAnalysis.overallVerdict}

`;

        // Add round-wise details
        report.roundReports.forEach(round => {
            text += `
${round.roundName.toUpperCase()}
${'='.repeat(round.roundName.length)}
Overall Score: ${round.overallScore.total}/${round.overallScore.maxPossible} (${round.overallScore.percentage}%)
Verdict: ${round.overallScore.verdict}

`;

            if (round.mcqReport.questions.length > 0) {
                text += `Multiple Choice Questions: ${round.mcqReport.score}/${round.mcqReport.maxScore}\n`;
                round.mcqReport.questions.forEach(q => {
                    text += `
Q${q.questionNumber}: ${q.question}
Your Answer: ${q.userAnswer}
${q.isCorrect ? '✓ Correct!' : `✗ Incorrect. Correct Answer: ${q.correctAnswerFull || q.correctAnswer}`}
Explanation: ${q.explanation}
`;
                });
            }

            if (round.descriptiveReport.questions.length > 0) {
                text += `\nDescriptive Questions: ${round.descriptiveReport.score}/${round.descriptiveReport.maxScore}\n`;
                round.descriptiveReport.questions.forEach(q => {
                    text += `
Q${q.questionNumber}: ${q.question}
Your Answer: ${q.userAnswer || 'No answer provided'}
Score: ${q.score}/${q.maxScore}
Feedback: ${q.feedback}
`;
                });
            }
        });

        // Add improvement suggestions
        text += `
IMPROVEMENT RECOMMENDATIONS
===========================

`;

        if (report.improvementSuggestions.immediate.length > 0) {
            text += `Immediate Actions:\n`;
            report.improvementSuggestions.immediate.forEach(s => {
                text += `• ${s}\n`;
            });
            text += '\n';
        }

        if (report.improvementSuggestions.shortTerm.length > 0) {
            text += `Short-term Goals (1-3 months):\n`;
            report.improvementSuggestions.shortTerm.forEach(s => {
                text += `• ${s}\n`;
            });
            text += '\n';
        }

        if (report.improvementSuggestions.longTerm.length > 0) {
            text += `Long-term Development (3+ months):\n`;
            report.improvementSuggestions.longTerm.forEach(s => {
                text += `• ${s}\n`;
            });
            text += '\n';
        }

        if (report.improvementSuggestions.resources.length > 0) {
            text += `Recommended Resources:\n`;
            report.improvementSuggestions.resources.forEach(s => {
                text += `• ${s}\n`;
            });
            text += '\n';
        }

        text += `
Thank you for using our AI Interview System. Keep practicing and improving!

Best regards,
AI Interview Team
`;

        return text;
    }
}

export default new EmailService();