import express from 'express';
import authRoutes from './auth.routes';
import calendarRoutes from './calendar.routes';
import userRoutes from './user.routes';
import chatRoutes from './chat.routes';
import agentRoutes from './agent.routes';
import feedbackRoutes from './feedback.routes';
import conversationRoutes from './conversation.routes';
import schedulingRoutes from './scheduling.routes';

const router = express.Router();

// Mount all routes
router.use('/auth', authRoutes);
router.use('/calendar', calendarRoutes);
router.use('/users', userRoutes);
router.use('/chat', chatRoutes);
router.use('/agent', agentRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/conversation', conversationRoutes);
router.use('/scheduling', schedulingRoutes);

export default router;