# AI Interview Report System

## Overview

The AI Interview Report System automatically generates and emails comprehensive interview reports to candidates after they complete their AI interview sessions. The system provides detailed analysis, feedback, and improvement suggestions based on their performance across all interview rounds.

## Features

### 📊 Comprehensive Report Generation
- **Round-wise Analysis**: Detailed breakdown of performance in each round
- **MCQ Analysis**: Question-by-question analysis with correct answers and explanations
- **Descriptive Feedback**: AI-powered feedback on descriptive answers with scoring
- **Overall Performance**: Aggregate scoring and verdict across all rounds
- **Improvement Suggestions**: Personalized recommendations for skill development

### 📧 Automated Email Delivery
- **Professional HTML Email**: Beautifully formatted email with charts and analysis
- **Plain Text Fallback**: Accessible plain text version for all email clients
- **JSON Attachment**: Complete report data in JSON format for further analysis
- **Automatic Triggering**: Reports sent automatically when interview is complete

### 🎯 Smart Completion Detection
- **Technical Round Failure**: Report sent if candidate fails Technical Round 1 or 2
- **Managerial Completion**: Report sent after Managerial Round (regardless of score)
- **Full Completion**: Report sent after completing all 4 rounds
- **Manual Trigger**: Users can request reports manually via UI button

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend       │    │  Email Service  │
│                 │    │                  │    │                 │
│ • UI Components │───▶│ • Report Routes  │───▶│ • Nodemailer    │
│ • Auto Trigger  │    │ • Report Gen.    │    │ • HTML Template │
│ • Manual Button │    │ • Completion     │    │ • SMTP Config   │
└─────────────────┘    │   Detection      │    └─────────────────┘
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │    Database      │
                       │                  │
                       │ • Interview Data │
                       │ • Validation     │
                       │ • Report Status  │
                       └──────────────────┘
```

## API Endpoints

### 1. Send Interview Report
```http
POST /api/interview-report/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "user123-1703123456789-uuid",
  "userEmail": "candidate@example.com",
  "userName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Interview report sent successfully",
  "messageId": "email-message-id",
  "reportSummary": {
    "sessionId": "user123-1703123456789-uuid",
    "overallScore": "15/24",
    "overallPercentage": 62,
    "verdict": "Good Performance",
    "roundsCompleted": 4
  }
}
```

### 2. Generate Report (No Email)
```http
GET /api/interview-report/generate/:sessionId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "report": {
    "sessionId": "user123-1703123456789-uuid",
    "interviewDate": "2024-01-15T10:30:00.000Z",
    "totalRounds": 4,
    "roundReports": [...],
    "overallAnalysis": {...},
    "improvementSuggestions": {...}
  }
}
```

### 3. Check Completion Status
```http
POST /api/interview-report/check-completion
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "user123-1703123456789-uuid",
  "userEmail": "candidate@example.com",
  "userName": "John Doe"
}
```

## Report Structure

### Round Reports
Each round includes:
- **Round Information**: Name, completion date, overall score
- **MCQ Analysis**: Question-by-question breakdown with correct answers
- **Descriptive Analysis**: AI feedback with scoring and suggestions
- **Performance Metrics**: Score, percentage, verdict

### Overall Analysis
- **Total Score**: Aggregate score across all rounds
- **Performance Verdict**: Excellent/Good/Average/Needs Improvement
- **Strengths**: Areas where candidate performed well
- **Weaknesses**: Areas needing improvement
- **Round-by-Round Summary**: Pass/fail status for each round

### Improvement Suggestions
- **Immediate Actions**: Things to do right away
- **Short-term Goals**: 1-3 month development plan
- **Long-term Development**: 3+ month career growth
- **Recommended Resources**: Books, courses, practice platforms

## Email Configuration

### Environment Variables
```bash
# Email Service Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### Gmail Setup
1. Enable 2-Factor Authentication
2. Generate App Password
3. Use App Password in EMAIL_PASSWORD

### Other SMTP Services
```javascript
// Custom SMTP Configuration
this.transporter = nodemailer.createTransporter({
  host: 'your-smtp-host.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});
```

## Frontend Integration

### Automatic Report Sending
```javascript
const checkInterviewCompletion = (validationData, round) => {
  const isInterviewComplete = 
    round === 4 || // Completed all rounds
    (round <= 2 && validationData.verdict === 'Fail') || // Failed technical round
    round === 3; // Completed managerial round

  if (isInterviewComplete) {
    sendInterviewReport().catch(console.error);
  }
};
```

### Manual Report Request
```javascript
const sendInterviewReport = async () => {
  const userEmail = prompt('Enter your email for the report:');
  if (!userEmail) return;

  const response = await fetch('/api/interview-report/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      sessionId,
      userEmail,
      userName: 'Candidate'
    }),
  });

  if (response.ok) {
    toast.success('Report sent to your email!');
  }
};
```

## Database Schema Updates

### Interview Session Model
```javascript
{
  userId: ObjectId,
  interviews: [{
    sessionId: String,
    reportSentAt: Date,        // New field
    reportSentTo: String,      // New field
    rounds: [{
      round: Number,
      questions: Mixed,
      answers: Object,
      validation: Object,
      createdAt: Date,
      submittedAt: Date,
      validatedAt: Date
    }]
  }]
}
```

## Completion Criteria

### Technical Rounds (1 & 2)
- **Pass**: Score ≥ 60% → Continue to next round
- **Fail**: Score < 60% → Interview ends, report sent

### Managerial Round (3)
- **Any Score**: Can proceed to HR round or end interview
- **Completion**: Report can be sent after this round

### HR Round (4)
- **Final Round**: Interview complete, report sent automatically

## Error Handling

### Email Delivery Failures
- Logged but don't block interview completion
- User can manually request report later
- Retry mechanism for temporary failures

### Report Generation Failures
- Fallback to basic report structure
- Error logging for debugging
- Graceful degradation of features

## Security Considerations

### Authentication
- JWT token required for all endpoints
- User can only access their own reports
- Session ID validation

### Email Privacy
- Reports only sent to user-provided email
- No storage of email addresses
- Secure SMTP connection

### Data Protection
- Reports contain sensitive performance data
- Secure transmission via HTTPS
- No caching of report content

## Monitoring and Analytics

### Report Metrics
- Reports generated per day
- Email delivery success rate
- User engagement with reports

### Performance Tracking
- Report generation time
- Email sending latency
- Error rates by component

## Future Enhancements

### Advanced Features
- **PDF Reports**: Generate PDF versions of reports
- **Report History**: Store and retrieve past reports
- **Comparative Analysis**: Compare performance across attempts
- **Skill Tracking**: Track improvement over time

### Integration Options
- **Calendar Integration**: Schedule follow-up interviews
- **Learning Platform**: Direct links to recommended courses
- **HR Systems**: Integration with applicant tracking systems

## Troubleshooting

### Common Issues

1. **Email Not Received**
   - Check spam folder
   - Verify email address
   - Check SMTP configuration

2. **Report Generation Fails**
   - Verify interview data completeness
   - Check database connectivity
   - Review error logs

3. **Authentication Errors**
   - Verify JWT token validity
   - Check user permissions
   - Validate session ID

### Debug Commands
```bash
# Test email configuration
node -e "require('./services/emailService.js').default.sendTestEmail()"

# Generate sample report
curl -X GET "http://localhost:3001/api/interview-report/generate/test-session" \
  -H "Authorization: Bearer <token>"

# Check completion status
curl -X POST "http://localhost:3001/api/interview-report/check-completion" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"sessionId": "test-session"}'
```

## Support

For technical support or feature requests, please contact the development team or create an issue in the project repository.