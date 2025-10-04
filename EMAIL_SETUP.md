# Email Service Configuration Guide

## Overview
The Resume Analyzer feature sends analysis reports to users via email. This requires proper email service configuration.

## Required Environment Variables

Add these variables to your `backend/.env` file:

```env
# Email Service Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password
```

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
# Stop the server (Ctrl+C) and restart
cd backend
npm start
```

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

#### Connection Timeout
- **Cause:** Firewall or network blocking SMTP port 465
- **Solution:** Check firewall settings or try different network

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
