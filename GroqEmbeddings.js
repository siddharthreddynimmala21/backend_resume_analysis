import { Groq } from 'groq-sdk';

class GroqEmbeddings {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.modelName = config.modelName || 'llama3-8b-8192';
    this.client = new Groq({
      apiKey: this.apiKey,
    });
  }

  async embedDocuments(texts) {
    try {
      // Since Groq doesn't have a dedicated embeddings API like OpenAI,
      // we'll use the chat API to generate embeddings
      // This is a simplified approach - in production, you might want to use
      // a more sophisticated method or a dedicated embeddings service
      
      const embeddings = [];
      
      for (const text of texts) {
        // Use a prompt that asks the model to represent the text as a vector
        const response = await this.client.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are an embedding generator. Convert the following text into a numerical representation.'
            },
            {
              role: 'user',
              content: text
            }
          ],
          model: this.modelName,
          temperature: 0,
          max_tokens: 100
        });
        
        // Generate a deterministic embedding based on the response
        // This is a simplified approach - not as good as dedicated embedding models
        const responseText = response.choices[0]?.message?.content || "";
        const embedding = this.generateSimpleEmbedding(responseText);
        embeddings.push(embedding);
      }
      
      return embeddings;
    } catch (error) {
      console.error('Error generating embeddings with Groq:', error);
      throw error;
    }
  }
  
  // A simple function to generate pseudo-embeddings
  // This is NOT a production-ready embedding solution
  // In a real application, you would use a proper embedding model
  generateSimpleEmbedding(text) {
    // Create a simple 1024-dimensional embedding
    // This is just a demonstration and not suitable for production use
    const embedding = new Array(1024).fill(0);
    
    // Generate some values based on the text
    for (let i = 0; i < text.length && i < 1024; i++) {
      embedding[i] = text.charCodeAt(i % text.length) / 255;
    }
    
    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / (magnitude || 1));
  }
}

export default GroqEmbeddings;