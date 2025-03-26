// src/controllers/conversation.controller.ts
import { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service';
import { IUser } from '../models/User';
import mongoose from 'mongoose';
import ThreadModel, { IThread } from '../models/Thread';
import ConversationModel, { IConversation } from '../models/Conversation';

interface AuthenticatedRequest extends Request {
  user?: IUser & { userId?: string; id?: string };
}

// Handle user message and return assistant response
export const processMessage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, conversationId } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // Log the incoming message for debugging
    console.log(`Processing user message in conversation ${conversationId || 'new'}: "${message}"`);
    
    // Process the message through the conversation service
    const response = await conversationService.processUserMessage(
      userId, 
      message,
      conversationId
    );
    
    // Log the response for debugging
    console.log(`Response created with thread ID: ${response.threadId || 'none'}`);
    
    // Return the response to the client
    res.status(200).json(response);
  } catch (error) {
    console.error('Error processing conversation message:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process message'
    });
  }
};

// Get conversation history
export const getConversationHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // Get conversation from database
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.findOne({ 
      conversationId, 
      userId 
    });
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Return conversation history
    res.status(200).json({
      conversationId: conversation.conversationId,
      turns: conversation.turns.map((turn: {
        speaker: 'user' | 'assistant';
        content: string;
        timestamp: Date;
      }) => ({
        speaker: turn.speaker,
        content: turn.content,
        timestamp: turn.timestamp
      }))
    });
  } catch (error) {
    console.error('Error getting conversation history:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get conversation history'
    });
  }
};

// List active conversations for a user
export const listUserConversations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // Get user's conversations from database
    const Conversation = require('mongoose').model('Conversation');
    const conversations = await Conversation.find({ 
      userId, 
      isActive: true 
    }).sort({ lastActivityTime: -1 }).select('conversationId startTime lastActivityTime turns');
    
    // Extract relevant info for each conversation
    const conversationList = conversations.map((conv: {
      conversationId: string;
      startTime: Date;
      lastActivityTime: Date;
      turns: Array<{
        speaker: 'user' | 'assistant';
        content: string;
        timestamp: Date;
      }>;
    }) => {
      // Get first and last message for preview
      const firstUserMessage = conv.turns.find(t => t.speaker === 'user')?.content || '';
      const lastTurn = conv.turns.length > 0 ? conv.turns[conv.turns.length - 1] : null;
      
      return {
        conversationId: conv.conversationId,
        startTime: conv.startTime,
        lastActivityTime: conv.lastActivityTime,
        preview: firstUserMessage.substring(0, 50) + (firstUserMessage.length > 50 ? '...' : ''),
        messageCount: conv.turns.length,
        lastMessage: lastTurn ? {
          speaker: lastTurn.speaker,
          content: lastTurn.content.substring(0, 50) + (lastTurn.content.length > 50 ? '...' : ''),
          timestamp: lastTurn.timestamp
        } : null
      };
    });
    
    res.status(200).json(conversationList);
  } catch (error) {
    console.error('Error listing user conversations:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list conversations'
    });
  }
};

// Stream conversation response for real-time interactions
// Get conversation by thread ID
export const getConversationByThread = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // First check if there's an existing conversation associated with this thread
    const ConversationModel = mongoose.model('Conversation');
    let conversation = await ConversationModel.findOne({ 
      threadId, 
      userId 
    });
    
    // If not found, try to create a new conversation based on the thread
    if (!conversation) {
      // Get the thread
      const ThreadModel = mongoose.model('Thread');
      const thread = await ThreadModel.findOne({
        _id: threadId,
        userId
      });
      
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      
      // Create a new conversation from this thread
      try {
        // Generate a unique conversation ID
        const conversationId = new mongoose.Types.ObjectId().toString();
        
        // Transform thread messages to conversation turns
        const turns = thread.messages.map((msg: any) => ({
          speaker: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content,
          timestamp: msg.timestamp
        }));
        
        console.log(`Thread before conversion contains ${thread.messages.length} messages:`);
        console.log('First user message:', thread.messages.find((m: any) => m.sender === 'user')?.content);
        
        // Create the conversation
        conversation = await ConversationModel.create({
          userId,
          threadId,
          conversationId,
          startTime: thread.createdAt,
          lastActivityTime: new Date(),
          turns,
          context: {
            activeEntities: {},
            referencedEvents: [],
            goals: [],
            environmentContext: {
              timezone: 'UTC'
            }
          },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Update the thread with the conversation ID
        await ThreadModel.updateOne(
          { _id: threadId },
          { $set: { conversationId } }
        );
        
        console.log(`Created new conversation ${conversationId} from thread ${threadId}`);
      } catch (error) {
        console.error('Error creating conversation from thread:', error);
        return res.status(500).json({ 
          error: 'Failed to create conversation from thread',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Get the thread to include processing steps
    const thread = await ThreadModel.findById(threadId);
    
    // Now return the conversation details with processing steps
    return res.status(200).json({
      id: conversation.conversationId,
      threadId,
      intent: conversation.context?.intent || 'unknown',
      status: conversation.isActive ? 'active' : 'completed',
      context: conversation.context,
      actions: (conversation.turns
        .filter((turn: any) => turn.action)
        .map((turn: any) => turn.action)) || [],
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      processingSteps: thread?.processingSteps || [] // Include processing steps from thread
    });
  } catch (error) {
    console.error('Error getting conversation by thread:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get conversation'
    });
  }
};

export const streamConversationResponse = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, conversationId } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    // Set up streaming response headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // TODO: Implement streaming version of conversation processing
    // For now, we'll use a simple approach to simulate streaming
    
    // First, send intent recognition as it happens
    res.write(`data: ${JSON.stringify({ type: 'intent_recognition', status: 'processing' })}\n\n`);
    
    // Process the message
    const response = await conversationService.processUserMessage(
      userId, 
      message,
      conversationId
    );
    
    // Convert response to chunks for streaming
    const words = response.content.split(' ');
    const chunks = [];
    let currentChunk = '';
    
    for (const word of words) {
      currentChunk += word + ' ';
      if (currentChunk.length > 10) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    // Send intent recognition result
    res.write(`data: ${JSON.stringify({ 
      type: 'intent_recognition', 
      status: 'completed',
      intent: response.intent
    })}\n\n`);
    
    // Stream response in chunks
    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify({ type: 'content', text: chunk })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate delay
    }
    
    // Send additional information like suggestions
    if (response.suggestions?.length) {
      res.write(`data: ${JSON.stringify({ 
        type: 'suggestions', 
        suggestions: response.suggestions 
      })}\n\n`);
    }
    
    // Send end of stream marker
    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error streaming conversation response:', error);
    
    // Send error in the stream
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      message: error instanceof Error ? error.message : 'Failed to process message' 
    })}\n\n`);
    
    res.end();
  }
};