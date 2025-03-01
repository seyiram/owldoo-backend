import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware';
import * as feedbackController from '../controllers/feedback.controller';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Feedback routes
router.post('/', feedbackController.submitFeedback);
router.get('/stats', feedbackController.getFeedbackStats);

export default router;