import { Request, Response } from 'express';
import googleCalendarService from '../services/googleCalendar.service';

export const initiateGoogleAuth = async (req: Request, res: Response) => {
    try {
        console.log('Initiating Google Calendar authentication...');
        const authUrl = await googleCalendarService.getAuthUrl();
        console.log('Auth URL generated:', authUrl);
        res.json({ url: authUrl });
    } catch (error) {
        console.error('Failed to initiate authentication:', error);
        res.status(500).json({ error: 'Failed to initiate authentication', details: error instanceof Error ? error.message : String(error) });
    }
};

export const handleGoogleCallback = async (req: Request, res: Response) => {
    try {
        const { code } = req.query;
        
        if (!code || typeof code !== 'string') {
            throw new Error('Invalid auth code');
        }

        // Get Google OAuth tokens and directly use them
        const tokens = await googleCalendarService.handleAuthCallback(code);
        const userProfile = await googleCalendarService.getUserProfile();

        res.json({
            success: true,
            user: {
                id: userProfile.id,
                email: userProfile.email,
                name: userProfile.name
            }
        });
    } catch (error) {
        console.error('Auth callback error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        googleCalendarService.clearTokens();
        res.status(200).send({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

export const getAuthStatus = async (req: Request, res: Response) => {
    try {
        console.log('Auth status check received:', {
            headers: req.headers,
            cookies: req.cookies
        });

        // Important: await the async method
        const isAuthenticated = await googleCalendarService.isUserAuthenticated();
        console.log('Auth status result:', isAuthenticated);
        res.json({ isAuthenticated });
    } catch (error) {
        console.error('Auth status check error:', error);
        res.status(500).json({ error: 'Failed to check auth status' });
    }
};
