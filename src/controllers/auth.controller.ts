import { NextFunction, Request, Response } from 'express';
import googleCalendarService from '../services/googleCalendar.service';
import { createLogger } from '../utils/logger';

export const initiateGoogleAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('Initiating Google Calendar authentication...');
        const authUrl = await googleCalendarService.getAuthUrl();
        console.log('Auth URL generated:', authUrl);
        res.json({ url: authUrl });
    } catch (error) {
        next(error);
    }
};

export const handleGoogleCallback = async (req: Request, res: Response, next: NextFunction) => {
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

        // Set a session cookie to indicate the user is authenticated
        // This is critical for sharing the authenticated state with the frontend
        res.cookie('auth_session', 'true', {
            httpOnly: false, // Allow JavaScript to read this cookie
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/'
        });

        // Also set a second cookie with auth timestamp and expiry for tracking
        res.cookie('auth_timestamp', Date.now().toString(), {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        // Set an additional cookie with token expiry so frontend can track it
        const expiryDate = tokens.expiry_date || Date.now() + (3600 * 1000);
        res.cookie('auth_expiry', expiryDate.toString(), {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });

        // Get the origin from the referer or a default value
        const origin = (req.headers.referer) ?
            new URL(req.headers.referer).origin :
            'http://localhost:5174'; // Frontend application origin
        
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
                            console.log("Message posted, closing window immediately");
                            
                            // Close after a short delay to ensure message is delivered
                            setTimeout(() => {
                                window.close();
                            }, 500);
                        } else {
                            console.log("No opener window found");
                            document.body.innerHTML += "<p>No opener window found. Please close this window manually and return to the application.</p>";
                        }
                    } catch (err) {
                        console.error("Error in callback script:", err);
                        document.body.innerHTML += "<p>Error: " + (err instanceof Error ? err.message : String(err)) + "</p>";
                    }
                </script>
                <p>Authentication successful! This window will close automatically.</p>
                <p>If it doesn't close, please click the button below:</p>
                <button onclick="window.close()">Close Window</button>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Auth callback error:', error);
        
        // Get the origin from the referer or a default value
        const origin = (req.headers.referer) ?
            new URL(req.headers.referer).origin :
            'http://localhost:5174'; // Frontend application origin
        
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
                            console.log("Error message posted, closing window immediately");
                            
                            // Close after a short delay to ensure message is delivered
                            setTimeout(() => {
                                window.close();
                            }, 500);
                        } else {
                            console.log("No opener window found");
                            document.body.innerHTML += "<p>No opener window found. Please close this window manually and return to the application.</p>";
                        }
                    } catch (err) {
                        console.error("Error in error callback script:", err);
                        document.body.innerHTML += "<p>Error: " + (err instanceof Error ? err.message : String(err)) + "</p>";
                    }
                </script>
                <p>Authentication failed. This window will close automatically.</p>
                <p>Please check the console for more details.</p>
                <button onclick="window.close()">Close Window</button>
            </body>
            </html>
        `);
    }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Clear server-side tokens
        googleCalendarService.clearTokens();
        
        // Clear auth cookies
        res.clearCookie('auth_session', { path: '/' });
        res.clearCookie('auth_timestamp', { path: '/' });
        
        res.status(200).send({ message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('Token refresh request received');
        
        // Check if user is authenticated
        const isAuthenticated = await googleCalendarService.isUserAuthenticated();
        
        if (!isAuthenticated) {
            console.log('Token refresh failed - not authenticated');
            return res.status(401).json({ 
                success: false,
                error: 'Not authenticated',
                authRequired: true
            });
        }
        
        // Get tokens and expiry information
        let expiryDate = 0;
        try {
            const tokens = await googleCalendarService.getTokens();
            expiryDate = tokens.expiry_date || 0;
        } catch (error) {
            console.error('Error getting token expiry:', error);
            // Default to 1 hour from now if we can't get real expiry
            expiryDate = Date.now() + (60 * 60 * 1000);
        }
        
        // Get user profile
        try {
            const userProfile = await googleCalendarService.getUserProfile();
            console.log('Token refresh successful for user:', userProfile.email);
            
            // Refresh the cookie timestamp
            res.cookie('auth_session', 'true', {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/'
            });
            
            res.cookie('auth_timestamp', Date.now().toString(), {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/'
            });
            
            return res.json({
                success: true,
                expiry_date: expiryDate,
                user: {
                    id: userProfile.id,
                    email: userProfile.email,
                    name: userProfile.name
                }
            });
        } catch (profileError) {
            console.error('Error fetching user profile during token refresh:', profileError);
            return res.json({ 
                success: true,
                expiry_date: expiryDate,
                error: 'Unable to fetch user profile'
            });
        }
    } catch (error) {
        console.error('Token refresh error:', error);
        return res.status(401).json({ 
            success: false,
            error: 'Token refresh failed'
        });
    }
};

export const setAuthCookies = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('Setting auth cookies from request');
        
        const { access_token, refresh_token, expiry_date } = req.body;
        
        if (!access_token || !refresh_token) {
            return res.status(400).json({ error: 'Missing required token data' });
        }
        
        // Set authentication state in calendar service
        googleCalendarService.setTokens({
            access_token,
            refresh_token,
            expiry_date: expiry_date || (Date.now() + 3600 * 1000)
        });
        
        // Set session cookie
        res.cookie('auth_session', 'true', {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        // Set timestamp cookie
        res.cookie('auth_timestamp', Date.now().toString(), {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        return res.json({ 
            success: true,
            message: 'Auth cookies set successfully',
            expiry_date: expiry_date || (Date.now() + 3600 * 1000)
        });
    } catch (error) {
        console.error('Error setting auth cookies:', error);
        next(error);
    }
};

export const clearAuthCookies = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('Clearing auth cookies');
        
        // Clear cookies
        res.clearCookie('auth_session', { path: '/' });
        res.clearCookie('auth_timestamp', { path: '/' });
        
        // Clear service tokens
        googleCalendarService.clearTokens();
        
        return res.json({
            success: true,
            message: 'Auth cookies cleared successfully'
        });
    } catch (error) {
        console.error('Error clearing auth cookies:', error);
        next(error);
    }
};

export const getAuthStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('Auth status check received:', {
            headers: req.headers,
            cookies: req.cookies
        });

        // Check if user is authenticated
        const isAuthenticated = await googleCalendarService.isUserAuthenticated();

        console.log('Backend auth check result:', isAuthenticated);

        // If not authenticated, check for auth cookies and clear them if present
        if (!isAuthenticated) {
            if (req.cookies.auth_session) {
                console.log('Found stale auth cookie, clearing it');
                res.clearCookie('auth_session');
                res.clearCookie('auth_timestamp');
            }
            return res.json({ isAuthenticated: false });
        }

        // Get tokens and expiry information
        let expiryDate = 0;
        try {
            // Get token expiry from Google Calendar service
            const tokens = await googleCalendarService.getTokens();
            expiryDate = tokens.expiry_date || 0;
        } catch (error) {
            console.error('Error getting token expiry:', error);
            // Default to 1 hour from now if we can't get real expiry
            expiryDate = Date.now() + (60 * 60 * 1000);
        }

        // For authenticated users, ensure the cookie is set
        if (!req.cookies.auth_session) {
            console.log('User is authenticated but no cookie found, setting cookie');
            res.cookie('auth_session', 'true', {
                httpOnly: false, 
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.cookie('auth_timestamp', Date.now().toString(), {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/'
            });
        }

        try {
            // Get user profile - wrap in try/catch to handle potential errors
            const userProfile = await googleCalendarService.getUserProfile();
            console.log('Successfully retrieved user profile:', userProfile.email);

            console.log('Auth status result:', isAuthenticated);
            return res.json({
                isAuthenticated, 
                expiry_date: expiryDate,
                user: {
                    id: userProfile.id,
                    email: userProfile.email,
                    name: userProfile.name
                }
            });
        } catch (profileError) {
            console.error('Error fetching user profile:', profileError);
            // Still return authenticated status even if profile fetch fails
            return res.json({ 
                isAuthenticated: true,
                expiry_date: expiryDate,
                error: 'Could not fetch user profile'
            });
        }
    } catch (error) {
        console.error('Auth status check error:', error);
        // Log cookies for debugging
        console.log('Cookies in error handler:', req.cookies);
        
        // Clear cookies on error and return not authenticated
        res.clearCookie('auth_session');
        res.clearCookie('auth_timestamp');
        return res.status(401).json({ 
            isAuthenticated: false, 
            error: 'Authentication check failed' 
        });
    }
};
