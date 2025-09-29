import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendOTPEmail } from '../utils/emailService.js';

const router = express.Router();

//just igoner
//just ignore
// Test endpoint for auth routes
router.get('/test', (req, res) => {
    console.log('Auth test endpoint hit');
    res.json({ 
        message: 'Auth routes are working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Helper: create a short-lived JWT carrying signup state without DB persistence
const signSignupToken = (payload, expiresIn) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

// Register (begin signup) - DO NOT persist user yet
router.post('/register', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // If a fully registered user exists, block reuse
    const existing = await User.findOne({ email });
    if (existing && existing.isVerified && existing.hasPassword) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Generate OTP (6-digit) and email it; do not store in DB
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    if (process.env.NODE_ENV === 'development') {
      console.log('Generated OTP for', email, '(for testing only):', otp);
    }
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const tempToken = signSignupToken({ t: 'signup', email, otpHash }, '10m');

    if (!await sendOTPEmail(email, otp)) {
      console.error('Failed to send OTP email to:', email);
      return res.status(500).json({ message: 'Failed to send OTP email' });
    }

    return res.status(200).json({
      message: 'OTP sent successfully',
      email,
      tempToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify OTP without persisting user; return a verifiedToken for next step
router.post('/verify-otp', async (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) return res.status(400).json({ message: 'Missing token or OTP' });
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    if (decoded.t !== 'signup' || !decoded.email || !decoded.otpHash) {
      return res.status(400).json({ message: 'Invalid token payload' });
    }
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    if (hash !== decoded.otpHash) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    const verifiedToken = signSignupToken({ t: 'signup_verified', email: decoded.email }, '30m');
    return res.status(200).json({ message: 'OTP verified successfully', verifiedToken });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Setup password after OTP verification; now persist the user for the first time
router.post('/setup-password', async (req, res) => {
  try {
    const { verifiedToken, password } = req.body;
    if (!verifiedToken || !password) return res.status(400).json({ message: 'Missing token or password' });
    let decoded;
    try {
      decoded = jwt.verify(verifiedToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    if (decoded.t !== 'signup_verified' || !decoded.email) {
      return res.status(400).json({ message: 'Invalid token payload' });
    }

    const email = decoded.email;
    // If a user exists but incomplete from legacy flow, remove it
    const existing = await User.findOne({ email });
    if (existing && !(existing.isVerified && existing.hasPassword)) {
      await User.deleteOne({ _id: existing._id });
    }
    if (existing && existing.isVerified && existing.hasPassword) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = new User({ email, password, isVerified: true });
    await user.save();

    const token = jwt.sign({ userId: user._id, isAdmin: user.isAdmin === true }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.status(200).json({ message: 'Password set successfully', token });
  } catch (error) {
    console.error('Password setup error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !user.canLogin()) {
            return res.status(401).json({ message: 'Invalid credentials or incomplete registration' });
        }

        const isValidPassword = await user.verifyPassword(password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Mark activity timestamps
        try {
            user.lastLoginAt = new Date();
            user.lastActiveAt = new Date();
            await user.save();
        } catch (e) {
            // Non-fatal: still allow login if save fails
            console.warn('Failed to update lastLoginAt/lastActiveAt for', user.email, e?.message || e);
        }

        const token = jwt.sign({ userId: user._id, isAdmin: user.isAdmin === true }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ 
            token,
            user: {
                email: user.email,
                isVerified: user.isVerified,
                hasPassword: user.hasPassword,
                isAdmin: user.isAdmin === true
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const otp = user.generateOTP();
        await user.save();

        if (!await sendOTPEmail(email, otp)) {
            console.error('Failed to send OTP email to:', email);
            return res.status(500).json({ message: 'Failed to send OTP email' });
        }
        res.status(200).json({ 
            message: 'OTP resent successfully',
            email,
            isVerified: user.isVerified,
            hasPassword: user.hasPassword
        });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Forgot Password - Step 1: Send OTP
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Generate and send OTP
        const otp = user.generateOTP();
        await user.save();
        if (!await sendOTPEmail(email, otp)) {
            return res.status(500).json({ message: 'Failed to send OTP email' });
        }
        res.status(200).json({ message: 'OTP sent successfully', email });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Forgot Password - Step 2: Verify OTP
router.post('/verify-reset-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.verifyOTP(otp)) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }
        // Do not clear OTP yet, allow for password reset
        res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Forgot Password - Step 3: Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.verifyOTP(otp)) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }
        user.password = password;
        user.clearOTP();
        await user.save();
        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

export default router;
