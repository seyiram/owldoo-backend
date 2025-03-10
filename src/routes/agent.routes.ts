import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware';
import * as agentController from '../controllers/agent.controller';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Legacy agent routes
router.post('/tasks', agentController.queueTask);
router.get('/tasks', agentController.getTasks);
router.get('/suggestions', agentController.getSuggestions);
router.post('/suggestions/:suggestionId', agentController.updateSuggestion);
router.get('/insights', agentController.getInsights);
router.get('/stats', agentController.getStats);

// New advanced agent routes
router.post('/execute', agentController.executeTask);
router.post('/stream', agentController.streamTaskExecution);
router.post('/analyze', agentController.analyzeUserInput);
router.post('/respond', agentController.generateResponse);
router.post('/extract', agentController.extractSchedulingParameters);
router.post('/clarify', agentController.generateClarificationQuestion);
router.post('/feedback', agentController.provideFeedback);
router.get('/memory-stats', agentController.getAgentStats);

export default router;