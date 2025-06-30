import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// MongoDB Schema for Resume Data
const resumeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  resumeId: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  resumeText: { type: String, required: true },
  chunksCount: { type: Number, required: true },
  textLength: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index for efficient queries
resumeSchema.index({ userId: 1, resumeId: 1 });

const Resume = mongoose.model('Resume', resumeSchema);

class RAGService {
  constructor() {
    // Use in-memory storage for vector embeddings (for performance)
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
    
    // Ensure storage directory exists for vector embeddings
    this.storageDir = './vector_storage';
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // Initialize MongoDB connection
    this.initMongoDB();
  }

  async initMongoDB() {
    try {
      if (!mongoose.connection.readyState) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube_project');
        console.log('Connected to MongoDB for resume storage');
      }
    } catch (error) {
      console.error('MongoDB connection error:', error);
    }
  }

  // Build collection name for vector embeddings
  collectionName(userId, resumeId) {
    return `resume_${userId}_${resumeId}`;
  }

  async initializeCollection(userId, resumeId) {
    try {
      const name = this.collectionName(userId, resumeId);
      
      // Check if collection exists in memory
      if (!this.collections.has(name)) {
        // Try to load from file storage (vector embeddings only)
        const filePath = path.join(this.storageDir, `${name}.json`);
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.collections.set(name, data);
        } else {
          // Create new collection
          this.collections.set(name, {
            name,
            documents: [],
            embeddings: [],
            metadata: [],
            ids: []
          });
        }
      }
      
      return this.collections.get(name);
    } catch (error) {
      console.error('Error initializing collection:', error);
      throw error;
    }
  }

  async processAndStoreResume(userId, resumeId, resumeText, fileName) {
    try {
      await this.initMongoDB();
      
      const collection = await this.initializeCollection(userId, resumeId);
      
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
      
      // Save vector embeddings to file
      const filePath = path.join(this.storageDir, `${this.collectionName(userId, resumeId)}.json`);
      fs.writeFileSync(filePath, JSON.stringify(collection, null, 2));
      
      // Store resume text data in MongoDB
      await Resume.findOneAndUpdate(
        { userId, resumeId },
        {
          userId,
          resumeId,
          fileName,
          resumeText,
          chunksCount: chunks.length,
          textLength: resumeText.length,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
      
      return { chunksStored: chunks.length };
    } catch (error) {
      console.error('Error processing resume:', error);
      throw error;
    }
  }

  async queryResume(userId, resumeId, question, conversationHistory = []) {
    try {
      await this.initMongoDB();
      
      const collection = await this.initializeCollection(userId, resumeId);
      
      if (collection.documents.length === 0) {
        return {
          success: false,
          message: "Please upload that resume first"
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

  // Delete a specific resume
  async deleteResume(userId, resumeId) {
    try {
      await this.initMongoDB();
      
      const collectionName = this.collectionName(userId, resumeId);
      const filePath = path.join(this.storageDir, `${collectionName}.json`);
      
      // Remove from memory
      this.collections.delete(collectionName);
      
      // Remove vector embeddings file if exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Remove from MongoDB
      await Resume.deleteOne({ userId, resumeId });
      
      return { success: true, message: `Resume ${resumeId} deleted successfully` };
    } catch (error) {
      console.error('Error deleting resume:', error);
      throw error;
    }
  }

  // Delete all user data
  async deleteUserData(userId) {
    try {
      await this.initMongoDB();
      
      // Get all user resumes from MongoDB
      const userResumes = await Resume.find({ userId });
      
      // Delete each resume's vector embeddings
      for (const resume of userResumes) {
        const collectionName = this.collectionName(userId, resume.resumeId);
        const filePath = path.join(this.storageDir, `${collectionName}.json`);
        
        // Remove from memory
        this.collections.delete(collectionName);
        
        // Remove file if exists
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      
      // Remove all user resumes from MongoDB
      await Resume.deleteMany({ userId });
      
      return { success: true, message: 'All user data deleted successfully' };
    } catch (error) {
      console.error('Error deleting user data:', error);
      throw error;
    }
  }

  // Get all user resumes
  async getUserResumes(userId) {
    try {
      await this.initMongoDB();
      
      const resumes = await Resume.find({ userId })
        .select('resumeId fileName chunksCount textLength createdAt')
        .sort({ createdAt: -1 });
      
      return resumes.map(resume => ({
        id: resume.resumeId,
        fileName: resume.fileName,
        chunksCount: resume.chunksCount,
        textLength: resume.textLength,
        createdAt: resume.createdAt
      }));
    } catch (error) {
      console.error('Error getting user resumes:', error);
      return [];
    }
  }

  // Check if user has any resumes
  async hasUserResume(userId) {
    try {
      await this.initMongoDB();
      
      const count = await Resume.countDocuments({ userId });
      return { 
        hasResume: count > 0, 
        resumeCount: count 
      };
    } catch (error) {
      console.error('Error checking user resume:', error);
      return { hasResume: false, resumeCount: 0 };
    }
  }

  // Get specific resume info
  async getResumeInfo(userId, resumeId) {
    try {
      await this.initMongoDB();
      
      const resume = await Resume.findOne({ userId, resumeId })
        .select('resumeId fileName chunksCount textLength createdAt');
      
      if (!resume) {
        return null;
      }
      
      return {
        id: resume.resumeId,
        fileName: resume.fileName,
        chunksCount: resume.chunksCount,
        textLength: resume.textLength,
        createdAt: resume.createdAt
      };
    } catch (error) {
      console.error('Error getting resume info:', error);
      return null;
    }
  }
}

export default RAGService;