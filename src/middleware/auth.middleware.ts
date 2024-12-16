import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import { IUser } from '../models/User';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

type AuthenticatedRequest = Request & {
    user?: IUser;
    auth?: { userId: string };
}

export const authenticateUser = [
    ClerkExpressRequireAuth(),
    async (req: AuthenticatedRequest & { auth?: { userId: string } }, res: Response, next: NextFunction) => {
        try {
            const clerkUserId = req.auth?.userId;
            if (!clerkUserId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const user = await User.findOne({ clerkId: clerkUserId });
            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }

            req.user = user;
            next();
        } catch (error) {
            res.status(401).json({ error: 'Authentication failed' });
        }
    }
];