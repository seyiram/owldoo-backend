import express from 'express';
import calendarController from '../controllers/calendar.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// All routes use auth middleware
// router.use(authMiddleware);

// Auth status check
router.get('/auth/status', calendarController.checkAuthStatus);

// Command endpoint
router.post('/command', calendarController.handleCommand);

// Utiity routes for direct API access
router.get('/events', calendarController.getEvents);
router.get('/events/:id', calendarController.getEvent);


export default router;