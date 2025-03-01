import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import { IUser } from '../models/User';
import googleCalendarService from '../services/googleCalendar.service';

interface AuthenticatedRequest extends Request {
    user?: IUser;
}

export const authenticateUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        // Get user profile from Google Calendar service
        const profile = await googleCalendarService.getUserProfile();
        
        if (!profile.email) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Find or create user
        let user = await User.findOne({ email: profile.email });
        
        if (!user) {
            user = await User.create({
                email: profile.email,
                googleId: profile.id, 
            });
        }

        req.user = user;
        req.user.id = user._id;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};