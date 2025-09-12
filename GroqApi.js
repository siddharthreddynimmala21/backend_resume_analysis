import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Get the API key from environment variable
const groqApiKey = process.env.GROQ_API_KEY;

if (!groqApiKey) {
    console.error("Error: Groq API key is not available");
    process.exit(1);
}

const groq = new Groq({
    apiKey: groqApiKey,
});

function resolveGroqModel() {
    // Map deprecated/alias model names to supported ones
    const aliasMap = {
        'llama3-70b-8192': 'llama-3.1-70b-versatile',
        'llama3-8b-8192': 'llama-3.1-8b-instant',
        'llama3-70b': 'llama-3.1-70b-versatile',
        'llama3-8b': 'llama-3.1-8b-instant',
    };
    const envModel = process.env.GROQ_MODEL;
    if (envModel) return aliasMap[envModel] || envModel;
    // Default to a current model
    return 'llama-3.1-8b-instant';
}

export async function generateResponse(prompt) {
    try {
        //console.log('Generating response with Groq API...');
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            model: resolveGroqModel(),
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
        });

        return chatCompletion.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("Error generating response with Groq:", error);
        throw error;
    }
}