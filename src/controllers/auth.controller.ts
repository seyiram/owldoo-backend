import { Request, Response } from 'express';
import googleCalendarService from '../services/googleCalendar.service';

export const initiateGoogleAuth = async (req: Request, res: Response) => {
    try {
        const authUrl = await googleCalendarService.getAuthUrl();
        res.json({ url: authUrl });
    } catch (error) {
        res.status(500).json({ error: 'Failed to initiate authentication' });
    }
};

export const handleGoogleCallback = async (req: Request, res: Response) => {
    try {
        const { code } = req.query;

        if (!code || typeof code !== 'string') {
            throw new Error('Invalid auth code');
        }


        const tokens = await googleCalendarService.handleAuthCallback(code as string);

        // Return HTML that posts a message to the opener window and closes itself
        res.send(`
            <html>
            <body>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'CALENDAR_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                        window.close();
                    }
                </script>
                <p>Authentication successful! You can close this window.</p>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Auth callback error:', error);
        res.send(`
            <html>
            <body>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'CALENDAR_AUTH_ERROR', error: 'Authentication failed' }, '*');
                        window.close();
                    }
                </script>
                <p>Authentication failed. You can close this window.</p>
            </body>
            </html>
        `);
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
        const isAuthenticated = googleCalendarService.isUserAuthenticated();
        res.json({ isAuthenticated });
    } catch (error) {
        console.error('Auth status check error:', error);
        res.status(500).json({ error: 'Failed to check auth status' });
    }
};