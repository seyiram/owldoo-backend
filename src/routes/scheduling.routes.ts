import { Router } from 'express';
import schedulingController from '../controllers/scheduling.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/scheduling/optimizations
 * @desc    Get scheduling optimizations (focus time, buffer recommendations)
 * @access  Private
 */
router.get('/optimizations', authenticateUser, schedulingController.getSchedulingOptimizations);

/**
 * @route   GET /api/scheduling/productivity
 * @desc    Get user productivity patterns
 * @access  Private
 */
router.get('/productivity', authenticateUser, schedulingController.getProductivityPatterns);

/**
 * @route   POST /api/scheduling/feedback
 * @desc    Submit feedback on scheduling suggestions
 * @access  Private
 */
router.post('/feedback', authenticateUser, schedulingController.submitSchedulingFeedback);

/**
 * @route   PUT /api/scheduling/preferences
 * @desc    Update scheduling preferences
 * @access  Private
 */
router.put('/preferences', authenticateUser, schedulingController.updateUserPreferences);

export default router;