
import express from 'express';
import * as chatController from '../controllers/chat.controller';
import { authenticateUser } from '../middleware/auth.middleware';


const router = express.Router();

router.use(authenticateUser);

// Create a new chat thread
router.post('/threads', chatController.createThread);
// Get all threads for the user
router.get('/threads', chatController.getThreads);
// Get a specific thread
router.get('/:threadId', chatController.getThread);
// Add a message to a thread
router.post('/:threadId/messages', chatController.addMessage);
// Stream responses from the bot
router.get('/:threadId/stream', chatController.streamResponse);

export default router;