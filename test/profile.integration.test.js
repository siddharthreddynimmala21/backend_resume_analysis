import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import profileRouter from '../routes/profile.js';
import auth from '../middleware/auth.js';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);

// Test database connection
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/resume-refiner-test';

describe('Profile API Integration Tests', () => {
    let testUser;
    let authToken;

    beforeAll(async () => {
        // Connect to test database
        await mongoose.connect(MONGODB_TEST_URI);
    });

    afterAll(async () => {
        // Clean up and close connection
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        // Clean up existing test data
        await User.deleteMany({});

        // Create a test user
        const hashedPassword = await bcrypt.hash('testpassword123', 10);
        testUser = new User({
            email: 'test@example.com',
            password: hashedPassword,
            firstName: 'John',
            lastName: 'Doe',
            isVerified: true
        });
        await testUser.save();

        // Generate auth token
        authToken = jwt.sign(
            { userId: testUser._id },
            process.env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );
    });

    describe('GET /api/profile - Profile Retrieval', () => {
        it('should successfully retrieve user profile', async () => {
            const response = await request(app)
                .get('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                user: {
                    email: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe'
                }
            });
        });

        it('should return 401 for unauthenticated requests', async () => {
            const response = await request(app)
                .get('/api/profile')
                .expect(401);

            expect(response.body).toEqual({
                success: false,
                message: 'Access denied. No token provided.'
            });
        });

        it('should return 401 for invalid token', async () => {
            const response = await request(app)
                .get('/api/profile')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);

            expect(response.body).toEqual({
                success: false,
                message: 'Invalid token.'
            });
        });

        it('should return 404 if user not found', async () => {
            // Delete the user but keep the token
            await User.findByIdAndDelete(testUser._id);

            const response = await request(app)
                .get('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body).toEqual({
                success: false,
                message: 'User not found.'
            });
        });
    });

    describe('PUT /api/profile - Profile Update', () => {
        it('should successfully update user profile', async () => {
            const updateData = {
                firstName: 'Jane',
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                message: 'Profile updated successfully',
                user: {
                    email: 'test@example.com',
                    firstName: 'Jane',
                    lastName: 'Smith'
                }
            });

            // Verify database was updated
            const updatedUser = await User.findById(testUser._id);
            expect(updatedUser.firstName).toBe('Jane');
            expect(updatedUser.lastName).toBe('Smith');
        });

        it('should trim whitespace from input fields', async () => {
            const updateData = {
                firstName: '  Jane  ',
                lastName: '  Smith  '
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.user.firstName).toBe('Jane');
            expect(response.body.user.lastName).toBe('Smith');
        });

        it('should return 400 for missing firstName', async () => {
            const updateData = {
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('First name is required');
        });

        it('should return 400 for missing lastName', async () => {
            const updateData = {
                firstName: 'Jane'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Last name is required');
        });

        it('should return 400 for empty firstName after trimming', async () => {
            const updateData = {
                firstName: '   ',
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('First name cannot be empty');
        });

        it('should return 400 for empty lastName after trimming', async () => {
            const updateData = {
                firstName: 'Jane',
                lastName: '   '
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Last name cannot be empty');
        });

        it('should return 401 for unauthenticated requests', async () => {
            const updateData = {
                firstName: 'Jane',
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .send(updateData)
                .expect(401);

            expect(response.body).toEqual({
                success: false,
                message: 'Access denied. No token provided.'
            });
        });

        it('should return 404 if user not found', async () => {
            // Delete the user but keep the token
            await User.findByIdAndDelete(testUser._id);

            const updateData = {
                firstName: 'Jane',
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(404);

            expect(response.body).toEqual({
                success: false,
                message: 'User not found.'
            });
        });
    });

    describe('POST /api/profile/change-password - Password Change', () => {
        it('should successfully change password', async () => {
            const passwordData = {
                currentPassword: 'testpassword123',
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                message: 'Password changed successfully'
            });

            // Verify password was actually changed
            const updatedUser = await User.findById(testUser._id);
            const isNewPasswordValid = await bcrypt.compare('newpassword456', updatedUser.password);
            const isOldPasswordInvalid = await bcrypt.compare('testpassword123', updatedUser.password);

            expect(isNewPasswordValid).toBe(true);
            expect(isOldPasswordInvalid).toBe(false);
        });

        it('should return 400 for missing currentPassword', async () => {
            const passwordData = {
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Current password is required');
        });

        it('should return 400 for missing newPassword', async () => {
            const passwordData = {
                currentPassword: 'testpassword123'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('New password is required');
        });

        it('should return 400 for short newPassword', async () => {
            const passwordData = {
                currentPassword: 'testpassword123',
                newPassword: '123'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('New password must be at least 6 characters long');
        });

        it('should return 400 for incorrect current password', async () => {
            const passwordData = {
                currentPassword: 'wrongpassword',
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Current password is incorrect');

            // Verify password was not changed
            const unchangedUser = await User.findById(testUser._id);
            const isOriginalPasswordValid = await bcrypt.compare('testpassword123', unchangedUser.password);
            expect(isOriginalPasswordValid).toBe(true);
        });

        it('should return 401 for unauthenticated requests', async () => {
            const passwordData = {
                currentPassword: 'testpassword123',
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .send(passwordData)
                .expect(401);

            expect(response.body).toEqual({
                success: false,
                message: 'Access denied. No token provided.'
            });
        });

        it('should return 404 if user not found', async () => {
            // Delete the user but keep the token
            await User.findByIdAndDelete(testUser._id);

            const passwordData = {
                currentPassword: 'testpassword123',
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(404);

            expect(response.body).toEqual({
                success: false,
                message: 'User not found.'
            });
        });
    });

    describe('Error Scenarios and Edge Cases', () => {
        it('should handle database connection errors gracefully', async () => {
            // Temporarily close the database connection
            await mongoose.connection.close();

            const response = await request(app)
                .get('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Server error');

            // Reconnect for other tests
            await mongoose.connect(MONGODB_TEST_URI);
        });

        it('should handle malformed JSON in request body', async () => {
            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'application/json')
                .send('{"firstName": "Jane", "lastName":}') // Malformed JSON
                .expect(400);

            expect(response.body).toBeDefined();
        });

        it('should handle very long input strings', async () => {
            const longString = 'a'.repeat(1000);
            const updateData = {
                firstName: longString,
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.user.firstName).toBe(longString);
        });

        it('should handle special characters in names', async () => {
            const updateData = {
                firstName: "José-María",
                lastName: "O'Connor"
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.user.firstName).toBe("José-María");
            expect(response.body.user.lastName).toBe("O'Connor");
        });
    });

    describe('Security Tests', () => {
        it('should not allow updating other user profiles', async () => {
            // Create another user
            const hashedPassword = await bcrypt.hash('otherpassword123', 10);
            const otherUser = new User({
                email: 'other@example.com',
                password: hashedPassword,
                firstName: 'Other',
                lastName: 'User',
                isVerified: true
            });
            await otherUser.save();

            // Try to update with original user's token
            const updateData = {
                firstName: 'Hacker',
                lastName: 'Attempt'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            // Should update the authenticated user, not the other user
            expect(response.body.user.email).toBe('test@example.com');

            // Verify other user was not affected
            const unchangedOtherUser = await User.findById(otherUser._id);
            expect(unchangedOtherUser.firstName).toBe('Other');
            expect(unchangedOtherUser.lastName).toBe('User');
        });

        it('should not expose sensitive information in responses', async () => {
            const response = await request(app)
                .get('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            // Should not include password or other sensitive fields
            expect(response.body.user.password).toBeUndefined();
            expect(response.body.user._id).toBeUndefined();
            expect(response.body.user.__v).toBeUndefined();
        });

        it('should require strong passwords', async () => {
            const weakPasswords = ['123', 'abc', 'password', '12345'];

            for (const weakPassword of weakPasswords) {
                const passwordData = {
                    currentPassword: 'testpassword123',
                    newPassword: weakPassword
                };

                const response = await request(app)
                    .post('/api/profile/change-password')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(passwordData)
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.message).toContain('New password must be at least 6 characters long');
            }
        });
    });

    describe('Performance and Load Tests', () => {
        it('should handle multiple concurrent profile updates', async () => {
            const promises = [];

            for (let i = 0; i < 10; i++) {
                const updateData = {
                    firstName: `John${i}`,
                    lastName: `Doe${i}`
                };

                promises.push(
                    request(app)
                        .put('/api/profile')
                        .set('Authorization', `Bearer ${authToken}`)
                        .send(updateData)
                );
            }

            const responses = await Promise.all(promises);

            // All requests should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });

            // The last update should be the final state
            const finalUser = await User.findById(testUser._id);
            expect(finalUser.firstName).toMatch(/^John\d$/);
            expect(finalUser.lastName).toMatch(/^Doe\d$/);
        });

        it('should handle rapid password changes', async () => {
            let currentPassword = 'testpassword123';

            for (let i = 0; i < 5; i++) {
                const newPassword = `newpassword${i}`;
                const passwordData = {
                    currentPassword,
                    newPassword
                };

                const response = await request(app)
                    .post('/api/profile/change-password')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send(passwordData)
                    .expect(200);

                expect(response.body.success).toBe(true);
                currentPassword = newPassword;
            }

            // Verify final password is correct
            const finalUser = await User.findById(testUser._id);
            const isFinalPasswordValid = await bcrypt.compare('newpassword4', finalUser.password);
            expect(isFinalPasswordValid).toBe(true);
        });
    });
});