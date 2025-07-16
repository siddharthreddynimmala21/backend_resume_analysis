import express from 'express';
import jwt from 'jsonwebtoken';
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

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { email } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            if (user.isVerified && user.hasPassword) {
                return res.status(400).json({ message: 'Email already registered' });
            }
        } else {
            user = new User({ email });
        }

        // Generate and send OTP
        const otp = user.generateOTP();
        // Only log OTP in development environment
        if (process.env.NODE_ENV === 'development') {
            console.log('Generated OTP for', email, '(for testing only):', otp);
        }
        await user.save();
        
        if (!await sendOTPEmail(email, otp)) {
            console.error('Failed to send OTP email to:', email);
            return res.status(500).json({ message: 'Failed to send OTP email' });
        }

        return res.status(200).json({ 
            message: 'OTP sent successfully', 
            email,
            isVerified: user.isVerified,
            hasPassword: user.hasPassword
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.verifyOTP(otp)) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Mark user as verified
        user.isVerified = true;
        user.clearOTP();
        await user.save();
        return res.status(200).json({ 
            message: 'OTP verified successfully',
            hasPassword: user.hasPassword,
            isVerified: true
        });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Setup password after OTP verification
router.post('/setup-password', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !user.isVerified) {
            return res.status(400).json({ message: 'User not found or not verified' });
        }

        if (user.hasPassword) {
            return res.status(400).json({ message: 'Password already set' });
        }

        user.password = password;
        await user.save();

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ 
            message: 'Password set successfully',
            token 
        });
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

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(200).json({ 
            token,
            user: {
                email: user.email,
                isVerified: user.isVerified,
                hasPassword: user.hasPassword
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
