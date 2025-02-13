import express from 'express';
import calendarController from '../controllers/calendar.controller';
import * as authController from '../controllers/auth.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// All routes use auth middleware
// router.use(authMiddleware);

// Auth routes
router.get('/auth/url', authController.initiateGoogleAuth);
router.get('/auth/callback', authController.handleGoogleCallback);
router.get("/auth/status", authController.getAuthStatus);

// Auth status check
router.get('/auth/status', calendarController.checkAuthStatus);

// Command endpoint
router.post('/command', calendarController.handleCommand);

// Utiity routes for direct API access
router.get('/events', calendarController.getEvents);
router.get('/events/:id', calendarController.getEvent);


export default router;