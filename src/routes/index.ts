import express from 'express';
import authRoutes from './auth.routes';
import calendarRoutes from './calendar.routes';
import userRoutes from './user.routes';
import threadRoutes from './thread.routes';

const router = express.Router();

// Mount all routes
router.use('/auth', authRoutes);
router.use('/calendar', calendarRoutes);
router.use('/users', userRoutes);
router.use('/threads', threadRoutes);

export default router;