// Profile Management Integration Test
// Run this with: node test-profile-integration.js

import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import profileRouter from './routes/profile.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create test app
const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);

// Test database connection
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/resume-refiner-test';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✅ ${message}`, colors.green);
}

function logError(message) {
    log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
    log(`ℹ️  ${message}`, colors.blue);
}

function logHeader(message) {
    log(`\n${'='.repeat(60)}`, colors.cyan);
    log(`${message}`, colors.cyan);
    log(`${'='.repeat(60)}`, colors.cyan);
}

// Test suite
async function runProfileIntegrationTests() {
    logHeader('Profile Management Backend Integration Tests');

    let testUser;
    let authToken;
    let testResults = {
        total: 0,
        passed: 0,
        failed: 0
    };

    try {
        // Connect to test database
        logInfo('Connecting to test database...');
        await mongoose.connect(MONGODB_TEST_URI);
        logSuccess('Connected to test database');

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

        logSuccess('Test user created and authenticated');

        // Test 1: Profile Retrieval
        testResults.total++;
        try {
            const response = await request(app)
                .get('/api/profile')
                .set('Authorization', `Bearer ${authToken}`);

            if (response.status === 200 &&
                response.body.success === true &&
                response.body.user.email === 'test@example.com' &&
                response.body.user.firstName === 'John' &&
                response.body.user.lastName === 'Doe') {
                logSuccess('Profile retrieval test passed');
                testResults.passed++;
            } else {
                logError(`Profile retrieval test failed: ${JSON.stringify(response.body)}`);
                testResults.failed++;
            }
        } catch (error) {
            logError(`Profile retrieval test error: ${error.message}`);
            testResults.failed++;
        }

        // Test 2: Profile Update
        testResults.total++;
        try {
            const updateData = {
                firstName: 'Jane',
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData);

            if (response.status === 200 &&
                response.body.success === true &&
                response.body.user.firstName === 'Jane' &&
                response.body.user.lastName === 'Smith') {

                // Verify database was updated
                const updatedUser = await User.findById(testUser._id);
                if (updatedUser.firstName === 'Jane' && updatedUser.lastName === 'Smith') {
                    logSuccess('Profile update test passed');
                    testResults.passed++;
                } else {
                    logError('Profile update test failed: Database not updated');
                    testResults.failed++;
                }
            } else {
                logError(`Profile update test failed: ${JSON.stringify(response.body)}`);
                testResults.failed++;
            }
        } catch (error) {
            logError(`Profile update test error: ${error.message}`);
            testResults.failed++;
        }

        // Test 3: Profile Update Validation
        testResults.total++;
        try {
            const invalidData = {
                firstName: '',
                lastName: 'Smith'
            };

            const response = await request(app)
                .put('/api/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidData);

            if (response.status === 400 && response.body.success === false) {
                logSuccess('Profile validation test passed');
                testResults.passed++;
            } else {
                logError(`Profile validation test failed: ${JSON.stringify(response.body)}`);
                testResults.failed++;
            }
        } catch (error) {
            logError(`Profile validation test error: ${error.message}`);
            testResults.failed++;
        }

        // Test 4: Password Change
        testResults.total++;
        try {
            // Reset the user password to the original unhashed version
            // The pre-save hook will hash it properly
            testUser.password = 'testpassword123';
            await testUser.save();

            const passwordData = {
                currentPassword: 'testpassword123',
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData);

            if (response.status === 200 && response.body.success === true) {
                // Verify password was actually changed
                const updatedUser = await User.findById(testUser._id);
                const isNewPasswordValid = await bcrypt.compare('newpassword456', updatedUser.password);
                const isOldPasswordInvalid = await bcrypt.compare('testpassword123', updatedUser.password);

                if (isNewPasswordValid && !isOldPasswordInvalid) {
                    logSuccess('Password change test passed');
                    testResults.passed++;
                } else {
                    logError('Password change test failed: Password not properly updated');
                    testResults.failed++;
                }
            } else {
                logError(`Password change test failed: ${JSON.stringify(response.body)}`);
                testResults.failed++;
            }
        } catch (error) {
            logError(`Password change test error: ${error.message}`);
            testResults.failed++;
        }

        // Test 5: Password Change Validation
        testResults.total++;
        try {
            const invalidPasswordData = {
                currentPassword: 'wrongpassword',
                newPassword: 'newpassword789'
            };

            const response = await request(app)
                .post('/api/profile/change-password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidPasswordData);

            if (response.status === 400 && response.body.success === false) {
                logSuccess('Password validation test passed');
                testResults.passed++;
            } else {
                logError(`Password validation test failed: ${JSON.stringify(response.body)}`);
                testResults.failed++;
            }
        } catch (error) {
            logError(`Password validation test error: ${error.message}`);
            testResults.failed++;
        }

        // Test 6: Unauthorized Access
        testResults.total++;
        try {
            const response = await request(app)
                .get('/api/profile');

            if (response.status === 401 && response.body.message === 'Please authenticate') {
                logSuccess('Unauthorized access test passed');
                testResults.passed++;
            } else {
                logError(`Unauthorized access test failed: ${JSON.stringify(response.body)}`);
                testResults.failed++;
            }
        } catch (error) {
            logError(`Unauthorized access test error: ${error.message}`);
            testResults.failed++;
        }

        // Test 7: Invalid Token
        testResults.total++;
        try {
            const response = await request(app)
                .get('/api/profile')
                .set('Authorization', 'Bearer invalid-token');

            if (response.status === 401 && response.body.message === 'Please authenticate') {
                logSuccess('Invalid token test passed');
                testResults.passed++;
            } else {
                logError(`Invalid token test failed: ${JSON.stringify(response.body)}`);
                testResults.failed++;
            }
        } catch (error) {
            logError(`Invalid token test error: ${error.message}`);
            testResults.failed++;
        }

        // Test 8: Concurrent Updates
        testResults.total++;
        try {
            const promises = [];

            for (let i = 0; i < 5; i++) {
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
            const allSucceeded = responses.every(response =>
                response.status === 200 && response.body.success === true
            );

            if (allSucceeded) {
                logSuccess('Concurrent updates test passed');
                testResults.passed++;
            } else {
                logError('Concurrent updates test failed');
                testResults.failed++;
            }
        } catch (error) {
            logError(`Concurrent updates test error: ${error.message}`);
            testResults.failed++;
        }

    } catch (error) {
        logError(`Test setup error: ${error.message}`);
    } finally {
        // Clean up
        try {
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
            logInfo('Test database cleaned up and connection closed');
        } catch (error) {
            logError(`Cleanup error: ${error.message}`);
        }
    }

    // Print results
    logHeader('Test Results Summary');
    log(`Total Tests: ${testResults.total}`);
    log(`Passed: ${testResults.passed}`, colors.green);
    log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? colors.red : colors.green);
    log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

    if (testResults.failed === 0) {
        logSuccess('🎉 All profile management backend tests passed!');
        logSuccess('✓ Profile retrieval works correctly');
        logSuccess('✓ Profile updates function properly');
        logSuccess('✓ Validation prevents invalid data');
        logSuccess('✓ Password changes work securely');
        logSuccess('✓ Authentication is properly enforced');
        logSuccess('✓ Concurrent operations are handled correctly');
        process.exit(0);
    } else {
        logError('Some tests failed. Please review the output above.');
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    log('\nTest execution interrupted by user', colors.yellow);
    process.exit(1);
});

process.on('SIGTERM', () => {
    log('\nTest execution terminated', colors.yellow);
    process.exit(1);
});

// Run the tests
runProfileIntegrationTests().catch(error => {
    logError(`Unexpected error: ${error.message}`);
    process.exit(1);
});