import express from 'express';
import calendarController from '../controllers/calendar.controller';
import * as authController from '../controllers/auth.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// All routes use auth middleware

// Auth routes
router.get('/auth/status', authController.getAuthStatus);
router.get('/auth/url', authController.initiateGoogleAuth);
router.get('/auth/callback', authController.handleGoogleCallback);
router.post('/auth/logout', authController.logout);

// User profile
router.get('/profile', calendarController.getUserProfile);

router.use(authMiddleware);

// Command endpoint
router.post('/command', calendarController.handleCommand);

// Events endpoints
router.get('/events', calendarController.getEvents);
router.get('/events/:id', calendarController.getEvent);

export default router;