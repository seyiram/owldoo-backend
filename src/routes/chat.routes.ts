
import express from 'express';
import * as chatController from '../controllers/chat.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';
import { chat } from 'googleapis/build/src/apis/chat';

const router = express.Router();

// Create a new chat thread
router.post('/', chatController.createThread);
// Get all threads for the user
router.get('/', chatController.getThreads);
// Get a specific thread
router.get('/:threadId', chatController.getThread);
// Add a message to a thread
router.post('/:threadId/messages', chatController.addMessage);

export default router;