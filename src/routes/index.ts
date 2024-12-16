import express from 'express';
import authRoutes from './auth.routes';
import calendarRoutes from './calendar.routes';
import userRoutes from './user.routes';

const router = express.Router();

// Mount all routes
router.use('/auth', authRoutes);
router.use('/calendar', calendarRoutes);
router.use('/users', userRoutes);

export default router;