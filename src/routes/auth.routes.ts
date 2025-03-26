import express from 'express';
import {
    initiateGoogleAuth,
    handleGoogleCallback,
    getAuthStatus,
    logout,
    refreshToken,
    setAuthCookies,
    clearAuthCookies
} from '../controllers/auth.controller';
import {
    authenticateUser
} from '../middleware/auth.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { get } from 'http';


const router = express.Router();

router.get('/google/connect', initiateGoogleAuth);
router.get('/google/callback', handleGoogleCallback);
router.post('/logout', logout);

// Add token refresh endpoint
router.post('/refresh', refreshToken);

// Status check route
router.get('/status', getAuthStatus);
router.post('/set-cookies', setAuthCookies);
router.post('/clear-cookies', clearAuthCookies);

router.use(errorHandler);

export default router;