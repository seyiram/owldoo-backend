import express from 'express';
import * as agentController from '../controllers/agent.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = express.Router();

// Apply authentication middleware to all agent routes
router.use(authenticateUser);

// Process a query through the agent
router.post('/query', agentController.processQuery);

// Queue a task for asynchronous processing
router.post('/tasks', agentController.queueTask);

// Get personalized suggestions based on calendar data and user history
router.get('/suggestions', agentController.getSuggestions);

export default router;
