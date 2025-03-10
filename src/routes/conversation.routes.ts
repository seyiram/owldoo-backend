// src/routes/conversation.routes.ts
import express from 'express';
import * as conversationController from '../controllers/conversation.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = express.Router();

// Process messages
router.post('/message', authenticateUser, conversationController.processMessage);

// Stream response for real-time interaction
router.post('/stream', authenticateUser, conversationController.streamConversationResponse);

// Get conversation by thread ID
router.get('/thread/:threadId', authenticateUser, conversationController.getConversationByThread);

// Get conversation history
router.get('/:conversationId', authenticateUser, conversationController.getConversationHistory);

// List user's conversations
router.get('/', authenticateUser, conversationController.listUserConversations);

export default router;