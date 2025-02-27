import express from 'express';
import {
    initiateGoogleAuth,
    handleGoogleCallback,
    getAuthStatus,
    logout
} from '../controllers/auth.controller';
import {
    authenticateUser
} from '../middleware/auth.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { get } from 'http';


const router = express.Router();

router.get('/google/connect', initiateGoogleAuth);
router.get('/google/callback', handleGoogleCallback);
router.get('/status', getAuthStatus);
router.post('/logout', logout);

// Status check route
router.get('/status', getAuthStatus);

router.use(errorHandler);

export default router;