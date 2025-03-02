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
        console.log('Received callback with code:', code ? 'Code present' : 'No code');
        console.log('Full query params:', req.query);

        if (!code || typeof code !== 'string') {
            throw new Error('Invalid auth code');
        }

        console.log('Processing auth callback...');
        const tokens = await googleCalendarService.handleAuthCallback(code);
        console.log('Auth successful, tokens received');

        // Get the origin from the referer or a default value
        const origin = (req.headers.referer) ?
            new URL(req.headers.referer).origin :
            'http://localhost:5173'; // Frontend application origin

        console.log('Using origin for postMessage:', origin);

        // Return HTML that posts a message to the opener window and closes itself
        res.send(`
            <html>
            <body>
                <script>
                    console.log("Auth callback page loaded");
                    try {
                        if (window.opener) {
                            console.log("Posting message to opener");
                            // Safely serialize the tokens
                            const tokenData = ${JSON.stringify(JSON.stringify(tokens))};
                            window.opener.postMessage({ 
                                type: 'CALENDAR_AUTH_SUCCESS', 
                                tokens: JSON.parse(tokenData)
                            }, "${origin}");
                            console.log("Message posted, closing window");
                            setTimeout(() => window.close(), 1000);
                        } else {
                            console.log("No opener window found");
                            document.body.innerHTML += "<p>No opener window found. Please close this window manually.</p>";
                        }
                    } catch (err) {
                        console.error("Error in callback script:", err);
                        document.body.innerHTML += "<p>Error: " + err.message + "</p>";
                    }
                </script>
                <p>Authentication successful! This window will close automatically.</p>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Auth callback error:', error);

        // Get the origin from the referer or a default value
        const origin = (req.headers.referer) ?
            new URL(req.headers.referer).origin :
            'http://localhost:5173'; // Frontend application origin

        res.send(`
            <html>
            <body>
                <script>
                    console.log("Auth error page loaded");
                    try {
                        if (window.opener) {
                            console.log("Posting error message to opener");
                            window.opener.postMessage({ 
                                type: 'CALENDAR_AUTH_ERROR', 
                                error: 'Authentication failed' 
                            }, "${origin}");
                            console.log("Error message posted, closing window");
                            setTimeout(() => window.close(), 1000);
                        } else {
                            console.log("No opener window found");
                            document.body.innerHTML += "<p>No opener window found. Please close this window manually.</p>";
                        }
                    } catch (err) {
                        console.error("Error in error callback script:", err);
                        document.body.innerHTML += "<p>Error: " + err.message + "</p>";
                    }
                </script>
                <p>Authentication failed. This window will close automatically.</p>
                <p>Please check the console for more details.</p>
            </body>
            </html>
        `);
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