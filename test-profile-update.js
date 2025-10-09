import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import profileRouter from './routes/profile.js';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);

// Test the profile update endpoint
async function testProfileUpdate() {
    try {
        console.log('Testing Profile Update Endpoint...');

        // Connect to test database
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube_project_test', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // Clean up any existing test user first
        await User.deleteOne({ email: 'test-profile-update@example.com' });

        // Create a test user
        const testUser = new User({
            email: 'test-profile-update@example.com',
            firstName: 'John',
            lastName: 'Doe',
            password: 'testpassword123',
            isVerified: true,
            hasPassword: true
        });

        await testUser.save();

        // Generate JWT token for the test user
        const token = jwt.sign({ userId: testUser._id }, process.env.JWT_SECRET || 'test-secret');

        // Test successful profile update
        const response = await request(app)
            .put('/api/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({
                firstName: 'Jane',
                lastName: 'Smith'
            });

        console.log('Response status:', response.status);
        console.log('Response body:', response.body);

        if (response.status === 200 && response.body.success) {
            console.log('✅ Profile update endpoint working correctly!');
            console.log('Updated user:', response.body.user);
        } else {
            console.log('❌ Profile update endpoint failed');
        }

        // Test validation errors
        const validationResponse = await request(app)
            .put('/api/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({
                firstName: '',
                lastName: ''
            });

        console.log('\nValidation test status:', validationResponse.status);
        console.log('Validation test body:', validationResponse.body);

        if (validationResponse.status === 400) {
            console.log('✅ Validation working correctly!');
        } else {
            console.log('❌ Validation not working as expected');
        }

        // Clean up
        await User.deleteOne({ _id: testUser._id });
        await mongoose.connection.close();

    } catch (error) {
        console.error('Test error:', error);
        process.exit(1);
    }
}

// Run the test
testProfileUpdate();