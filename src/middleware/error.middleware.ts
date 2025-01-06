import { Request, Response, NextFunction } from 'express';
import { ErrorLogs } from '../models';

export const errorHandler = async (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        await ErrorLogs.create({
            service: 'API',
            errorType: error.name,
            errorMessage: error.message,
            stackTrace: error.stack,
            context: {
                input: req.body,
                attemptedAction: `${req.method} ${req.path}`
            }
        });

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    } catch (logError) {
        console.error('Error logging failed:', logError);
        res.status(500).json({ error: 'Internal server error' });
    }
};