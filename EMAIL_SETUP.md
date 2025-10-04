# Email Service Configuration Guide

## Overview
The Resume Analyzer feature sends analysis reports to users via email. This requires proper email service configuration.

## Required Environment Variables

Add these variables to your `backend/.env` file (or environment variables in Render/cloud platform):

```env
# Email Service Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password

# Optional: Override default SMTP settings (default: Gmail on port 587)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false  # false for port 587 (STARTTLS), true for port 465 (SSL)
```

**Note for Cloud Deployments (Render, Heroku, etc.):**
- The system uses **port 587 with STARTTLS** by default (cloud-friendly)
- Port 465 is often blocked by cloud providers
- Configure environment variables in your platform's dashboard

## Step-by-Step Setup for Gmail

### 1. Enable 2-Factor Authentication
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled

### 2. Generate App Password
1. Visit [App Passwords](https://myaccount.google.com/apppasswords)
2. Select "Mail" as the app
3. Select "Other" as the device and name it (e.g., "Resume Analyzer")
4. Click **Generate**
5. Copy the 16-character password (shown without spaces)

### 3. Update .env File
```env
EMAIL_USER=15promaxphotos@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # Replace with your generated app password
```

**Note:** Remove spaces from the app password when adding to .env

### 4. Restart the Server
After updating `.env`, restart your Node.js server for changes to take effect:

```bash
# Local Development
cd backend
npm start
```

## Render Deployment Setup

### Setting Environment Variables on Render

1. **Go to your Render Dashboard**
   - Navigate to your web service
   - Click on "Environment" in the left sidebar

2. **Add Environment Variables:**
   ```
   Key: EMAIL_USER
   Value: 15promaxphotos@gmail.com
   
   Key: EMAIL_PASSWORD
   Value: [your 16-character app password]
   ```

3. **Save and Redeploy:**
   - Click "Save Changes"
   - Render will automatically redeploy with new variables

4. **Verify Configuration:**
   - Check logs for: `📧 Email transporter config: { host: 'smtp.gmail.com', port: 587, ... }`
   - Should show `port: 587` (not 465)

### Important for Render Users
- ✅ Port 587 (STARTTLS) is now the default - works on Render
- ❌ Port 465 (SSL) was previously used - often blocked on cloud platforms
- 🔒 Always use environment variables (not .env files) on Render
- ⏱️ Increased timeouts (60s) for cloud network latency

## Testing Email Configuration

### Test via API Endpoint
You can verify email configuration by checking server logs when running a resume analysis:

1. Upload a resume through the UI
2. Check backend console for:
   - ✅ "Report email successfully sent to user@email.com" - Success
   - ❌ "EMAIL CONFIGURATION MISSING!" - Missing credentials
   - ❌ "Email sending failed" - Check credentials or network

### Common Issues

#### Authentication Failed (EAUTH)
- **Cause:** Incorrect app password or 2FA not enabled
- **Solution:** Regenerate app password and verify 2FA is active

#### Connection Timeout (ETIMEDOUT)
- **Cause:** Cloud platform blocking SMTP ports or slow network
- **Solution:** 
  - System now uses port 587 by default (cloud-friendly)
  - Verify EMAIL_USER and EMAIL_PASSWORD are set in Render environment variables
  - Check Render logs for "📧 Email transporter config" to verify settings
  - If still failing, try using a service like SendGrid or AWS SES instead

#### Email Not Received
- **Cause:** Email in spam folder
- **Solution:** Check spam/junk folder, mark as "Not Spam"

## Alternative Email Providers

While Gmail is recommended, you can use other providers by modifying `backend/utils/emailService.js`:

### Outlook/Hotmail
```javascript
const host = 'smtp.office365.com';
const port = 587;
const secure = false; // Use STARTTLS
```

### Custom SMTP Server
```javascript
const host = process.env.SMTP_HOST || 'smtp.yourdomain.com';
const port = Number(process.env.SMTP_PORT || 587);
```

## Security Best Practices

1. **Never commit `.env` file** to version control
2. Use **App Passwords**, not your actual Gmail password
3. Rotate app passwords periodically
4. Use separate email accounts for production vs development
5. Consider using environment-specific credentials

## Troubleshooting

If emails still don't send after configuration:

1. **Verify credentials are loaded:**
   - Backend logs will show "EMAIL_USER: Set" or "NOT SET"
   
2. **Check SMTP connection:**
   - Look for "Transporter verification failed" in logs
   
3. **Test with simple mail client:**
   - Use tools like Nodemailer's test account or Mailtrap

4. **Review email service logs:**
   - Gmail: Check [Recent Security Events](https://myaccount.google.com/notifications)

## Support

For additional help:
- Check backend console logs for detailed error messages
- Review `backend/utils/emailService.js` for email implementation
- Verify network allows SMTP connections on port 465/587

---

**Last Updated:** 2025-10-04
