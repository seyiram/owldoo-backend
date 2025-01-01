import express from 'express';
import * as calendarController from '../controllers/calendar.controller';
import { authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Natural language routes
router.post('/events/create-from-text', calendarController.createEventFromText);

// Standard CRUD routes
router.post('/events', calendarController.createEvent);
router.get('/events', calendarController.getEvents);
router.get('/events/:id', calendarController.getEvent);
router.put('/events/:id', calendarController.updateEvent);

router.delete('/events/:id', calendarController.deleteEvent);

// Calendar availability
router.get('/availability', calendarController.checkAvailability);
router.get('/suggest-time', calendarController.suggestAlternativeTime);

export default router;