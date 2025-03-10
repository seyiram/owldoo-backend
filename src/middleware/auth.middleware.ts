import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import googleCalendarService from '../services/googleCalendar.service';

// Cache for auth status
const authCache = new Map<string, {
    status: boolean;
    timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface AuthenticatedRequest extends Request {
    user?: any;
}

export const authenticateUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        const now = Date.now();

        // Check cache if we have userId
        if (userId) {
            const cached = authCache.get(userId);
            if (cached && (now - cached.timestamp < CACHE_DURATION)) {
                if (cached.status) {
                    return next();
                }
                throw new Error('Cached auth invalid');
            }
        }

        // Check if Google Calendar auth is valid
        const isCalendarAuth = await googleCalendarService.isUserAuthenticated();
        if (!isCalendarAuth) {
            throw new Error('Calendar authentication required');
        }

        // Get user profile from Google
        const userProfile = await googleCalendarService.getUserProfile();
        if (!userProfile.email) {
            throw new Error('Unable to get user profile');
        }

        // Get or create user
        let user = await User.findOne({ email: userProfile.email });
        if (!user) {
            user = await User.create({
                email: userProfile.email,
                googleId: userProfile.id,
            });
        }

        req.user = user;

        // Cache the result
        if (userId) {
            authCache.set(userId, {
                status: true,
                timestamp: now
            });
        }

        next();
    } catch (error) {
        // Clear cache on error
        if (req.user?.id) {
            authCache.delete(req.user.id);
        }
        res.status(401).json({ error: 'Authentication failed' });
    }
};