import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware';
import * as agentController from '../controllers/agent.controller';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Agent task routes
router.post('/tasks', agentController.queueTask);
router.get('/tasks', agentController.getTasks);

// Suggestion routes
router.get('/suggestions', agentController.getSuggestions);
router.post('/suggestions/:suggestionId', agentController.updateSuggestion);

// Insight routes
router.get('/insights', agentController.getInsights);

// Stats route
router.get('/stats', agentController.getStats);

export default router;