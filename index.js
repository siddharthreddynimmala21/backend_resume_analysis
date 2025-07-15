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

// Validate critical environment variables
const requiredEnvVars = ['JWT_SECRET', 'EMAIL_USER', 'EMAIL_PASSWORD', 'GEMINI_API_KEY', 'GROQ_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('⚠️ Missing required environment variables:', missingVars.join(', '));
  console.error('Please check your .env file');
  process.exit(1); // Exit if critical API keys are missing
}

// Log API configuration
console.log('Using Gemini API for embeddings and Groq API for text generation');

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

app.use(express.json());

// Enhanced logging middleware for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log('Request Headers:', {
        origin: req.get('origin'),
        host: req.get('host'),
        'user-agent': req.get('user-agent'),
        'content-type': req.get('content-type')
    });
    
    // Log CORS preflight requests
    if (req.method === 'OPTIONS') {
        console.log('CORS preflight request detected');
    }
    
    next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube_project', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB for resume storage');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// AI model initialization is now handled in the respective service files

// Test routes
app.get('/', (req, res) => {
    console.log('Root route hit');
    res.send('Server is working!');
});

app.get('/test', (req, res) => {
    console.log('Test route hit');
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

// Top-level ping route for uptime monitoring
app.get('/ping', (req, res) => {
  res.json({ message: 'server is available' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404
app.use((req, res) => {
    console.log('404 - Route not found:', req.path);
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const port = process.env.PORT || 3001; // Default to 3001 to match frontend expectation
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
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
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed.');
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