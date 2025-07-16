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
            model: 'llama3-8b-8192', // Using llama3-8b-8192 as a good free model
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