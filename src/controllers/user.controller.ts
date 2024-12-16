import { Request, Response } from 'express';
import { User, UserPreferences } from '../models';
import { IUser } from '../models/User';



type AuthRequest = Request & { user?: IUser };

export const getUserProfile = async (req: Request & { user?: IUser }, res: Response) => {
    try {
        const userId = req.user?.id; 
        const user = await User.findById(userId).select('-accessToken -refreshToken');
        const preferences = await UserPreferences.findOne({ userId });

        res.json({ user, preferences });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch user profile'
        });
    }
};

export const updateUserPreferences = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const updates = req.body;

        const preferences = await UserPreferences.findOneAndUpdate(
            { userId },
            { ...updates },
            { new: true, upsert: true }
        );

        res.json(preferences);
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to update preferences'
        });
    }
};

export const updateUserTokens = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { accessToken, refreshToken, tokenExpiryDate } = req.body;

        const user = await User.findByIdAndUpdate(
            userId,
            { accessToken, refreshToken, tokenExpiryDate },
            { new: true }
        ).select('-accessToken -refreshToken');

        res.json(user);
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to update tokens'
        });
    }
};

export const getWorkingHours = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const preferences = await UserPreferences.findOne({ userId })
            .select('workingHours timeZone');

        res.json(preferences);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch working hours'
        });
    }
};

export const getMeetingPreferences = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const preferences = await UserPreferences.findOne({ userId })
            .select('defaultMeetingDuration defaultReminders defaultLocation preferredMeetingTimes avoidMeetingTimes');

        res.json(preferences);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch meeting preferences'
        });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        await Promise.all([
            User.findByIdAndDelete(userId),
            UserPreferences.findOneAndDelete({ userId })
        ]);

        res.status(204).send();
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to delete user'
        });
    }
};