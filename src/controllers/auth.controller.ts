import { Request, Response } from 'express';
import googleCalendarService from '../services/googleCalendar.service';

export const initiateGoogleAuth = async (req: Request, res: Response) => {
    try {
        const authUrl = await googleCalendarService.getAuthUrl();
        res.json({ authUrl });
    } catch (error) {
        res.status(500).json({ error: 'Failed to initiate authentication' });
    }
};

export const handleGoogleCallback = async (req: Request, res: Response) => {
    try {
        const { code } = req.query;
        const tokens = await googleCalendarService.handleAuthCallback(code as string);
        res.json({ tokens });
    } catch (error) {
        res.status(500).json({ error: 'Failed to complete authentication' });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        // Implement logout logic
        res.status(200).send({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to logout' });
    }
};

export const getAuthStatus = async (req: Request, res: Response) => {
    try {
        // Implement auth status check
        res.status(200).send({ isAuthenticated: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check auth status' });
    }
};