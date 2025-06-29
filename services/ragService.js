import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

class RAGService {
  constructor() {
    // Use in-memory storage instead of ChromaDB for simplicity
    this.collections = new Map();
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
      modelName: 'embedding-001',
    });
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    // Ensure storage directory exists
    this.storageDir = './vector_storage';
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  async initializeCollection(userId) {
    try {
      const collectionName = `resume_${userId}`;
      
      // Check if collection exists in memory
      if (!this.collections.has(collectionName)) {
        // Try to load from file storage
        const filePath = path.join(this.storageDir, `${collectionName}.json`);
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.collections.set(collectionName, data);
        } else {
          // Create new collection
          this.collections.set(collectionName, {
            name: collectionName,
            documents: [],
            embeddings: [],
            metadata: [],
            ids: []
          });
        }
      }
      
      return this.collections.get(collectionName);
    } catch (error) {
      console.error('Error initializing collection:', error);
      throw error;
    }
  }

  async processAndStoreResume(userId, resumeText) {
    try {
      const collection = await this.initializeCollection(userId);
      
      // Split text into chunks
      const chunks = await this.textSplitter.createDocuments([resumeText]);
      
      // Clear existing data
      collection.documents = [];
      collection.embeddings = [];
      collection.metadata = [];
      collection.ids = [];
      
      // Process chunks and generate embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const id = uuidv4();
        const embedding = await this.embeddings.embedDocuments([chunk.pageContent]);
        
        collection.ids.push(id);
        collection.documents.push(chunk.pageContent);
        collection.embeddings.push(embedding[0]);
        collection.metadata.push({ 
          source: 'resume',
          index: i,
          chunkSize: chunk.pageContent.length
        });
      }
      
      // Save to file
      const filePath = path.join(this.storageDir, `resume_${userId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(collection, null, 2));
      
      return { chunksStored: chunks.length };
    } catch (error) {
      console.error('Error processing resume:', error);
      throw error;
    }
  }

  async queryResume(userId, question, conversationHistory = []) {
    try {
      const collection = await this.initializeCollection(userId);
      
      if (collection.documents.length === 0) {
        return {
          success: false,
          message: "Please upload your resume first"
        };
      }
      
      // Generate embedding for the question
      const questionEmbedding = await this.embeddings.embedDocuments([question]);
      
      // Calculate similarity with stored embeddings
      const similarities = collection.embeddings.map((embedding, index) => {
        const similarity = this.cosineSimilarity(questionEmbedding[0], embedding);
        return { index, similarity, document: collection.documents[index] };
      });
      
      // Sort by similarity and take top 3
      const topResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);
      
      // Combine relevant chunks
      const context = topResults.map(result => result.document).join('\n\n');
      
      // Build conversation context if available
      let conversationContext = '';
      if (conversationHistory.length > 0) {
        conversationContext = '\n\nPrevious conversation:\n' + 
          conversationHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
      }
      
      // Generate answer using Gemini with conversation context
      const prompt = `Based on the following resume information and conversation history, please answer the question: "${question}"

Resume Information:
${context}${conversationContext}

Please provide a helpful and accurate answer based on the resume information and conversation context. If this is a follow-up question, consider the previous conversation to provide a more contextual response.`;
      
      const result = await this.model.generateContent(prompt);
      const answer = result.response.text();
      
      return {
        success: true,
        answer,
        relevantChunks: topResults.map(result => ({
          content: result.document,
          similarity: result.similarity
        })),
        confidence: topResults[0]?.similarity || 0
      };
    } catch (error) {
      console.error('Error querying resume:', error);
      throw error;
    }
  }

  // Helper method for cosine similarity calculation
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async deleteUserData(userId) {
    try {
      const collectionName = `resume_${userId}`;
      const filePath = path.join(this.storageDir, `${collectionName}.json`);
      
      // Remove from memory
      this.collections.delete(collectionName);
      
      // Remove file if exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      return { success: true, message: 'User data deleted successfully' };
    } catch (error) {
      console.error('Error deleting user data:', error);
      throw error;
    }
  }

  async hasUserResume(userId) {
    try {
      const collection = await this.initializeCollection(userId);
      return { 
        hasResume: collection.documents.length > 0, 
        chunksCount: collection.documents.length 
      };
    } catch (error) {
      console.error('Error checking user resume:', error);
      return { hasResume: false, chunksCount: 0 };
    }
  }
}

export default RAGService;