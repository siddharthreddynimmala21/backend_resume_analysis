const express = require('express');
const { generateResponse } = require('./GeminiApi');

// Create a new router
const router = express.Router();

// Debugging middleware
router.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.path}`);
    next();
});

// Test route
router.get('/test', (req, res) => {
    console.log('Test route hit');
    res.json({ message: 'Router is working' });
});

// Chat route
router.post('/chat', async (req, res) => {
    try {
        console.log('Chat route hit:', req.body);
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        const response = await generateResponse(prompt);
        res.json({ response });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

// Export the router
module.exports = router;