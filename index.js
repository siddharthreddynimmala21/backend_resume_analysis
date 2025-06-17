// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import resumeRoutes from './routes/resume.js';

// Validate critical environment variables
const requiredEnvVars = ['JWT_SECRET', 'EMAIL_USER', 'EMAIL_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('⚠️ Missing required environment variables:', missingVars.join(', '));
  console.error('Please check your .env file');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-ai', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 64,
    },
    model: "gemini-1.5-flash",
    safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
    ],
});

// Test routes
app.get('/', (req, res) => {
    console.log('Root route hit');
    res.send('Server is working!');
});

app.get('/test', (req, res) => {
    console.log('Test route hit');
    res.json({ message: 'Test endpoint working!' });
});

// Gemini API endpoint
app.post('/api/chat', async (req, res) => {
    try {
        console.log('Chat endpoint hit with body:', req.body);
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log('Generated response:', text);
        res.json({ response: text });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Something went wrong',
            details: error.message 
        });
    }
});

// Routes
import authRouter from './routes/auth.js';
app.use('/api/auth', authRouter);
app.use('/api/resume', resumeRoutes);

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
const port = process.env.PORT || 3000;
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