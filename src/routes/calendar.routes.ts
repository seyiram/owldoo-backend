import express from 'express';
import calendarController from '../controllers/calendar.controller';
import * as authController from '../controllers/auth.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// All routes use auth middleware

// Auth routes
router.get('/auth/url', authController.initiateGoogleAuth);

// Auth status check
router.get('/auth/status', calendarController.checkAuthStatus);

// User profile
router.get('/profile', calendarController.getUserProfile);
// router.get('/auth/callback', authController.handleGoogleCallback);

router.use(authMiddleware);


// Command endpoint
router.post('/command', calendarController.handleCommand);

// Events endpoints
router.get('/events', calendarController.getEvents);
router.get('/events/:id', calendarController.getEvent);


export default router;