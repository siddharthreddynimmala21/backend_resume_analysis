import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiEmbeddings {
  constructor(config) {
    this.apiKey = config.apiKey;
    // Use current embeddings model; allow override
    this.modelName = config.modelName || 'text-embedding-004';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.embeddingModel = this.genAI.getGenerativeModel({ model: this.modelName });
  }

  async embedDocuments(texts) {
    try {
      const embeddings = [];
      for (const text of texts) {
        // Basic retry to mitigate transient rate limits
        let attempts = 0;
        let lastErr;
        while (attempts < 3) {
          try {
            const result = await this.embeddingModel.embedContent({
              content: { parts: [{ text }] },
            });
            const embedding = result.embedding.values;
            embeddings.push(embedding);
            lastErr = undefined;
            break;
          } catch (err) {
            lastErr = err;
            attempts += 1;
            if (attempts < 3) {
              await new Promise(r => setTimeout(r, 300 * attempts));
            }
          }
        }
        if (lastErr) throw lastErr;
      }
      return embeddings;
    } catch (error) {
      console.error('Error generating embeddings with Gemini:', error);
      throw error;
    }
  }
}

export default GeminiEmbeddings;