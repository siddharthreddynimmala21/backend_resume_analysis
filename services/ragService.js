import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { v4 as uuidv4 } from 'uuid';
import { Groq } from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GeminiEmbeddings from '../GeminiEmbeddings.js';

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

// MongoDB Schema for Chat History
const chatHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  chatId: { type: String, required: true },
  resumeId: { type: String, required: true },
  chatName: { type: String, required: true },
  messages: [{
    text: { type: String, required: true },
    isBot: { type: Boolean, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  messageCount: { type: Number, default: 0 },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound indexes for efficient queries
resumeSchema.index({ userId: 1, resumeId: 1 });
chatHistorySchema.index({ userId: 1, chatId: 1 });
chatHistorySchema.index({ userId: 1, resumeId: 1 });

const Resume = mongoose.model('Resume', resumeSchema);
const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);

class RAGService {
  constructor() {
    // Use in-memory storage for vector embeddings (for performance)
    this.collections = new Map();
    
    // Get API keys from environment
    const groqApiKey = process.env.GROQ_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
      console.error("Error: GEMINI_API_KEY environment variable is not set");
      process.exit(1);
    }
    
    if (!groqApiKey) {
      console.error("Error: GROQ_API_KEY environment variable is not set");
      process.exit(1);
    }
    
    // Initialize Gemini embeddings for production-ready vector embeddings
    this.embeddings = new GeminiEmbeddings({
      apiKey: geminiApiKey,
      modelName: 'embedding-001',
    });
    
    // Initialize Groq client for text generation
    this.groq = new Groq({
      apiKey: groqApiKey,
    });
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    // Ensure storage directory exists for vector embeddings
    // Use absolute path to ensure persistence across code updates
    this.storageDir = path.join(process.cwd(), 'vector_storage');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    console.log('Vector storage directory:', this.storageDir);

    // Initialize MongoDB connection
    this.initMongoDB();
  }

  async initMongoDB() {
    try {
      if (!mongoose.connection.readyState) {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube_project';
        console.log('Connecting to MongoDB at:', mongoUri.replace(/\/\/.+@/, '//***@')); // Hide credentials in logs
        
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
          retryWrites: true,
          retryReads: true
        });
        
        console.log('Successfully connected to MongoDB for resume storage');
      }
    } catch (error) {
      console.error('MongoDB connection error:', error);
      console.error('Please check your MongoDB connection string in .env file');
      // Don't throw here to allow the application to continue without MongoDB
      // This will result in a degraded experience but won't crash the app
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
      console.error('Error in processAndStoreResume:', error);
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
      
      // Generate answer using Groq with conversation context
      const prompt = `Based on the following resume information and conversation history, please answer the question: "${question}"

Resume Information:
${context}${conversationContext}

Please provide a helpful, accurate, and professional answer based on the resume information and conversation context. If this is a follow-up question, consider the previous conversation to provide a more contextual response.`;
      
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an AI-powered Resume Analysis Assistant designed to behave like a professional, experienced, and polite career advisor. Your goal is to provide accurate, helpful, and focused answers only when asked. \nBehavioral Instructions: \nOnly respond to user queries. Do not provide unsolicited feedback or information unless the user explicitly asks for it. \nWhen the user first interacts (e.g., says "Hi" or "Hello"), respond with a warm, brief greeting (e.g., "Hi! How can I assist you with your resume today?"), but don\'t analyze the resume yet. \nYour responses must be: \nDetailed but concise, avoiding long, overwhelming paragraphs. \nPolite and professional, like ChatGPT or a helpful career counselor. \nSubtle and non-critical, always offer suggestions constructively. \nAt the end of every response, ask if the user needs further help (e.g., "Would you like help refining any other section?" or "Do you want feedback on another part?"). \nUse markdown-like formatting if supported: bold for key sections, bullet points for clarity. \nIf the user asks a vague or incomplete question, politely ask for clarification. \nAvoid repeating or summarizing the entire resume in responses. Focus only on what is relevant to the specific user query. \nThe goal is to make the conversation feel human, focused, and helpful—not robotic or over-eager.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'llama3-8b-8192',
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1,
        stream: false,
      });
      
      const answer = chatCompletion.choices[0]?.message?.content || "";
      
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
      console.error('Error in deleteResume:', error);
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
      console.log('RAG Service: Getting resumes for user:', userId);
      await this.initMongoDB();
      
      const resumes = await Resume.find({ userId })
        .select('resumeId fileName chunksCount textLength createdAt')
        .sort({ createdAt: -1 });
      
      console.log('RAG Service: Found raw resumes:', resumes);
      
      const mappedResumes = resumes.map(resume => ({
        id: resume.resumeId,
        fileName: resume.fileName,
        chunksCount: resume.chunksCount,
        textLength: resume.textLength,
        createdAt: resume.createdAt
      }));
      
      console.log('RAG Service: Mapped resumes:', mappedResumes);
      return mappedResumes;
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

  // Chat History Management Methods
  async saveChatHistory(userId, chatId, resumeId, chatName, messages) {
    try {
      await this.initMongoDB();
      
      const chatData = {
        userId,
        chatId,
        resumeId,
        chatName,
        messages: messages.map(msg => ({
          text: msg.text,
          isBot: msg.isBot,
          timestamp: msg.timestamp || new Date()
        })),
        messageCount: messages.length,
        lastActivity: new Date(),
        updatedAt: new Date()
      };

      await ChatHistory.findOneAndUpdate(
        { userId, chatId },
        chatData,
        { upsert: true, new: true }
      );

      return { success: true };
    } catch (error) {
      console.error('Error saving chat history:', error);
      throw error;
    }
  }

  async getChatHistory(userId, chatId) {
    try {
      await this.initMongoDB();
      
      const chat = await ChatHistory.findOne({ userId, chatId });
      return chat ? chat.messages : [];
    } catch (error) {
      console.error('Error getting chat history:', error);
      throw error;
    }
  }

  async getUserChatSessions(userId) {
    try {
      await this.initMongoDB();
      
      const chats = await ChatHistory.find({ userId })
        .select('chatId resumeId chatName messageCount lastActivity createdAt')
        .sort({ lastActivity: -1 });
      
      return chats.map(chat => ({
        id: chat.chatId,
        resumeId: chat.resumeId,
        name: chat.chatName,
        messageCount: chat.messageCount,
        lastActivity: chat.lastActivity,
        createdAt: chat.createdAt
      }));
    } catch (error) {
      console.error('Error getting user chat sessions:', error);
      throw error;
    }
  }

  async deleteChatHistory(userId, chatId) {
    try {
      await this.initMongoDB();
      
      await ChatHistory.deleteOne({ userId, chatId });
      return { success: true };
    } catch (error) {
      console.error('Error deleting chat history:', error);
      throw error;
    }
  }

  async deleteUserChatsByResume(userId, resumeId) {
    try {
      await this.initMongoDB();
      
      await ChatHistory.deleteMany({ userId, resumeId });
      return { success: true };
    } catch (error) {
      console.error('Error deleting user chats by resume:', error);
      throw error;
    }
  }

}

export default RAGService;