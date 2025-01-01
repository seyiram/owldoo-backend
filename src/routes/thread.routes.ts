// src/routes/thread.routes.ts
import express from 'express';
import * as threadController from '../controllers/thread.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/threads', authMiddleware, threadController.createThread);
router.post('/messages', authMiddleware, threadController.addMessage);
router.get('/threads', authMiddleware, threadController.getThreads);
router.get('/threads/:threadId', authMiddleware, threadController.getThread);

export default router;