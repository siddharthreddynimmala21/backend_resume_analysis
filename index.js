// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
// Import necessary modules
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import resumeRoutes from './routes/resume.js';
import aiInterviewRouter from './routes/aiInterview.js';
import aiInterviewSubmitRouter from './routes/aiInterviewSubmit.js';
import aiInterviewValidateRouter from './routes/aiInterviewValidate.js';
import reportRouter from './routes/report.js';

// Validate critical environment variables
const requiredEnvVars = ['JWT_SECRET', 'EMAIL_USER', 'EMAIL_PASSWORD', 'GEMINI_API_KEY', 'GROQ_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please check your .env file');
  process.exit(1); // Exit if critical API keys are missing
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware - Simplified CORS configuration
app.use(cors({
    origin: true, // Allow all origins for now
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false // Set to false to avoid CORS issues
}));

app.use(express.json({ limit: '5mb' }));

// Enhanced logging middleware for debugging
app.use((req, res, next) => {
    //console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    
    // Only log CORS preflight requests in development
    if (req.method === 'OPTIONS' && process.env.NODE_ENV === 'development') {
        //console.log('CORS preflight request detected');
    }
    
    next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube_project', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// AI model initialization is now handled in the respective service files

// Test routes
app.get('/', (req, res) => {
    res.send('Server is working!');
});

app.get('/test', (req, res) => {
    res.json({ message: 'Test endpoint working!' });
});

// Note: Chat routes are handled by the chatRouter mounted at /api/chat

// Routes
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import pythonRouter from './routes/python.js';
app.use('/api/auth', authRouter);
app.use('/api/resume', resumeRoutes);
app.use('/api/chat', chatRouter);
app.use('/api/python', pythonRouter);
app.use('/api/ai-interview', aiInterviewRouter);
app.use('/api/ai-interview', aiInterviewSubmitRouter);
app.use('/api/ai-interview', aiInterviewValidateRouter);
app.use('/api/report', reportRouter);

// Top-level ping route for uptime monitoring
app.get('/ping', (req, res) => {
  return res.status(200).json({ message: 'pong' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const port = process.env.PORT || 3001; // Default to 3001 to match frontend expectation
const server = app.listen(port, () => {
    // Server started successfully
    // console.log('\nAvailable endpoints:');
    // console.log(`1. GET  http://localhost:${port}/      -> Test server`);
    // console.log(`2. GET  http://localhost:${port}/test  -> Test endpoint`);
    // console.log(`3. POST http://localhost:${port}/api/chat -> Gemini AI chat\n`);
    // console.log('To test the chat endpoint in Postman:');
    // console.log('1. Set method to POST');
    // console.log('2. Use URL: http://localhost:3000/api/chat');
    // console.log('3. Set Headers: Content-Type: application/json');
    // console.log('4. Set Body (raw JSON):');
    // console.log('   {');
    // console.log('      "prompt": "Who is Virat Kohli?"');
    // console.log('   }');
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Handle process termination
process.on('SIGTERM', () => {
    server.close(() => {
        process.exit(0);
    });
});

// Keep the process running
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

// Prevent the process from exiting on unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});