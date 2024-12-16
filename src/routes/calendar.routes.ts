import express from 'express';
import * as calendarController from '../controllers/calendar.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Natural language routes
router.post('/events/create-from-text', authMiddleware, calendarController.createEventFromText);

// Standard CRUD routes
router.post('/events', authMiddleware, calendarController.createEvent);
router.get('/events', authMiddleware, calendarController.getEvents);
router.get('/events/:id', authMiddleware, calendarController.getEvent);
router.put('/events/:id', authMiddleware, calendarController.updateEvent);
router.delete('/events/:id', authMiddleware, calendarController.deleteEvent);

// Calendar availability
router.get('/availability', authMiddleware, calendarController.checkAvailability);
router.get('/suggest-time', authMiddleware, calendarController.suggestAlternativeTime);

export default router;