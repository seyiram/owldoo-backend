import express from 'express';
import * as userController from '../controllers/user.controller';
import {authenticateUser as authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();


router.get('/profile', authMiddleware, userController.getUserProfile);
router.put('/preferences', authMiddleware, userController.updateUserPreferences);
router.get('/working-hours', authMiddleware, userController.getWorkingHours);
router.put('/meeting-preferences', authMiddleware, userController.getMeetingPreferences);
router.get('/account', authMiddleware, userController.deleteUser);

export default router;