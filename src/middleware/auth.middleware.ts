import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import googleCalendarService from '../services/googleCalendar.service';
import { createLogger } from '../utils/logger';

// Setup proper logging
const logger = createLogger('auth-middleware');

// Cache with proper typing
interface AuthCacheEntry {
  status: boolean;
  timestamp: number;
  user?: any; // Cache the user object to reduce DB queries
}

const authCache = new Map<string, AuthCacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Define a proper interface for the authenticated request
interface AuthenticatedRequest extends Request {
  user?: any;
  isRefreshingAuth?: boolean;
  session?: any;
}

/**
 * Authentication middleware for protecting routes
 * Verifies Google Calendar authentication and loads user profile
 */
export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Allow public routes to pass through
  if (isPublicRoute(req.path)) {
    return next();
  }

  try {
    // Get userId from session if available
    const sessionUserId = req.session?.userId;
    const now = Date.now();

    // Check if we have a cached authentication result
    if (sessionUserId) {
      const cached = authCache.get(sessionUserId);
      
      if (cached && (now - cached.timestamp < CACHE_DURATION)) {
        if (cached.status) {
          // Set cache headers for better performance
          res.set('Cache-Control', `private, max-age=${Math.floor(CACHE_DURATION / 1000)}`);
          
          // Add cached user to request if available
          if (cached.user) {
            req.user = cached.user;
          }
          
          logger.debug(`Using cached auth for user ${sessionUserId}`);
          return next();
        }
        
        logger.debug(`Cached auth failed for user ${sessionUserId}`);
        return handleAuthFailure(res, 'Session invalid or expired');
      }
    }

    // Validate Google Calendar authentication
    const isCalendarAuth = await googleCalendarService.isUserAuthenticated();
    
    if (!isCalendarAuth) {
      logger.info('Google Calendar authentication required');
      
      // Set a header that the client can use to detect auth issues
      res.set('X-Calendar-Auth-Required', 'true');
      return handleAuthFailure(res, 'Calendar authentication required', 403);
    }

    // Get user profile from Google
    const userProfile = await googleCalendarService.getUserProfile();
    
    if (!userProfile.email) {
      logger.warn('Failed to retrieve email from Google profile');
      return handleAuthFailure(res, 'Unable to verify user identity');
    }

    // Find or create user in database with proper error handling
    let user;
    try {
      user = await User.findOne({ email: userProfile.email });
      
      if (!user) {
        logger.info(`Creating new user for email: ${userProfile.email}`);
        user = await User.create({
          email: userProfile.email,
          googleId: userProfile.id,
          name: userProfile.name || 'User',
          lastLogin: new Date()
        });
      } else {
        // Update last login time
        await User.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } }
        );
      }
    } catch (dbError) {
      logger.error('Database error during user lookup/creation:', dbError);
      return handleAuthFailure(res, 'User verification failed', 500);
    }

    // Attach user to request
    req.user = user;
    
    // Store user ID in session for future requests
    if (req.session) {
      req.session.userId = user._id.toString();
    }

    // Cache the authentication result
    authCache.set(user._id.toString(), {
      status: true,
      timestamp: now,
      user // Cache the user object to reduce DB queries
    });

    logger.debug(`Authentication successful for ${userProfile.email}`);
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    // Clear cache if there was an error
    if (req.user?.id) {
      authCache.delete(req.user.id);
    }
    
    if (req.session) {
      // Clear session on auth failure
      req.session.destroy((err: Error | null) => {
        if (err) logger.error('Error destroying session:', err);
      });
    }

    // Handle specific Google API errors
    if (error instanceof Error) {
      if (error.message.includes('invalid_grant') || 
          error.message.includes('Invalid Credentials')) {
        res.set('X-Calendar-Auth-Required', 'true');
        return handleAuthFailure(res, 'Google authorization expired', 401);
      }
    }
    
    handleAuthFailure(res, 'Authentication failed');
  }
};

/**
 * Helper to handle authentication failures
 */
function handleAuthFailure(res: Response, message: string, statusCode: number = 401) {
  return res.status(statusCode).json({ 
    success: false,
    error: message,
    authRequired: true
  });
}

/**
 * Check if a route should bypass authentication
 */
function isPublicRoute(path: string): boolean {
  const publicPaths = [
    '/auth/',
    '/public/',
    '/health',
    '/api/docs'
  ];
  
  return publicPaths.some(prefix => path.startsWith(prefix));
}