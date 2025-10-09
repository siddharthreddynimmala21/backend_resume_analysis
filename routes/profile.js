import express from 'express';
import { body, validationResult } from 'express-validator';
import auth from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/profile - Retrieve current user profile information
router.get('/', auth, async (req, res) => {
    try {
        const user = req.user;

        // Return profile data (excluding sensitive information)
        res.status(200).json({
            success: true,
            user: {
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName
            }
        });
    } catch (error) {
        console.error('Profile retrieval error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while retrieving profile'
        });
    }
});

// PUT /api/profile - Update user profile information
router.put('/',
    auth,
    [
        body('firstName')
            .trim()
            .notEmpty()
            .withMessage('First name is required')
            .isLength({ min: 1, max: 50 })
            .withMessage('First name must be between 1 and 50 characters'),
        body('lastName')
            .trim()
            .notEmpty()
            .withMessage('Last name is required')
            .isLength({ min: 1, max: 50 })
            .withMessage('Last name must be between 1 and 50 characters')
    ],
    async (req, res) => {
        try {
            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { firstName, lastName } = req.body;
            const user = req.user;

            // Update user profile
            user.firstName = firstName.trim();
            user.lastName = lastName.trim();
            user.lastActiveAt = new Date();

            await user.save();

            res.status(200).json({
                success: true,
                message: 'Profile updated successfully',
                user: {
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName
                }
            });
        } catch (error) {
            console.error('Profile update error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while updating profile'
            });
        }
    }
);

// POST /api/profile/change-password - Change user password
router.post('/change-password',
    auth,
    [
        body('currentPassword')
            .notEmpty()
            .withMessage('Current password is required'),
        body('newPassword')
            .isLength({ min: 6 })
            .withMessage('New password must be at least 6 characters long')
    ],
    async (req, res) => {
        try {
            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { currentPassword, newPassword } = req.body;
            const user = req.user;

            // Verify current password
            const isCurrentPasswordValid = await user.verifyPassword(currentPassword);
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Update password (will be hashed by the pre-save middleware)
            user.password = newPassword;
            user.lastActiveAt = new Date();

            await user.save();

            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            console.error('Password change error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while changing password'
            });
        }
    }
);

export default router;