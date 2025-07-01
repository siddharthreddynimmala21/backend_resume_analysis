import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiEmbeddings {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.modelName = config.modelName || 'embedding-001';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.embeddingModel = this.genAI.getGenerativeModel({ model: this.modelName });
  }

  async embedDocuments(texts) {
    try {
      const embeddings = [];
      
      // Process texts in batches to avoid rate limiting
      for (const text of texts) {
        const result = await this.embeddingModel.embedContent(text);
        const embedding = result.embedding.values;
        embeddings.push(embedding);
      }
      
      return embeddings;
    } catch (error) {
      console.error('Error generating embeddings with Gemini:', error);
      throw error;
    }
  }
}

export default GeminiEmbeddings;