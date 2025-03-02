import { Request, Response } from 'express';
import nlpService from '../services/nlp.service';
import googleCalendarService from '../services/googleCalendar.service';
import { NLPLog, EventCache } from '../models';
import { INLPLog } from '../models/NLPLog';
import { EnhancedParsedCommand, CalendarEvent } from '../types/calendar.types';
import { IUser } from '../models/User';
import mongoose from 'mongoose';
import { error } from 'console';

interface AuthenticatedRequest extends Request {
    user?: IUser;
}


class CalendarController {


    /**
     * Main handler for processing calendar commands
     */
    handleCommand = async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { command } = req.body;
            const userId = req.user?.id || req.user?._id;

            console.log("Processing command for user: ", userId);

            if (!userId) {
                console.log('Auth debug:', { user: req.user, headers: req.headers });
                return res.status(401).json({ error: 'User not authenticated' });
            }



            // Create initial NLP log
            let nlpLog = await this.createNLPLog(new mongoose.Types.ObjectId(userId), command, false);

            try {
                // Parse the command
                const parsedCommand = await nlpService.parseCommand(command, {
                    previousMessages: req.body.previousMessages,
                    threadId: req.body.threadId,
                });

                console.log("Parsed command: ", parsedCommand);
                nlpLog.parsedCommand = parsedCommand;
                nlpLog.metadata = parsedCommand.metadata;
                await nlpLog.save();

                // Check if clarification is needed
                if (parsedCommand.ambiguityResolution?.clarificationNeeded) {
                    return res.status(300).json({
                        success: false,
                        needsClarification: true,
                        alternativeInterpretations: parsedCommand.ambiguityResolution.alternativeInterpretations,
                        originalRequest: parsedCommand
                    });
                }

                // Handle the operation and get result
                const result = await this.handleEventOperation(parsedCommand, userId);

                // Update NLP log with result
                nlpLog.success = result.status === 200 || result.status === 201;
                if (!nlpLog.success) {
                    nlpLog.errorMessage = result.response.error;
                }
                await nlpLog.save();

                return res.status(result.status).json(result.response);
            } catch (error) {
                nlpLog.success = false;
                nlpLog.errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await nlpLog.save();
                throw error;
            }
        } catch (error) {
            console.error('Error handling command:', error);
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Internal server error',
                metadata: {
                    timestamp: new Date().toISOString(),
                    command: req.body.command
                }
            });
        }
    };

    /**
     * Handle different types of calendar operations
     */
    private handleEventOperation = async (
        parsedCommand: EnhancedParsedCommand,
        userId: mongoose.Types.ObjectId
    ): Promise<{ status: number; response: any }> => {
        try {
            // Handle query operations
            if (parsedCommand.action === 'query') {
                return this.handleQueryOperation(parsedCommand);
            }

            // Handle create/update/delete operations
            const result = await googleCalendarService.handleCommand(parsedCommand);

            if (!result.success) {
                return {
                    status: 409,
                    response: {
                        success: false,
                        error: result.error,
                        suggestion: result.suggestion,
                        originalRequest: parsedCommand,
                        context: parsedCommand.context,
                        confidence: parsedCommand.confidence,
                        assumedDefaults: parsedCommand.ambiguityResolution?.assumedDefaults
                    }
                };
            }

            if (result.event) {
                await this.cacheEvent(result.event, userId);
                const confirmation = this.generateConfirmation(result.event);
                return {
                    status: 201,
                    response: {
                        success: true,
                        message: 'Operation completed successfully',
                        confirmation,
                        event: result.event,
                        context: parsedCommand.context,
                        confidence: parsedCommand.confidence,
                        metadata: parsedCommand.metadata
                    }
                };
            }

            return {
                status: 200,
                response: {
                    success: true,
                    message: 'Operation completed successfully',
                    context: parsedCommand.context,
                    confidence: parsedCommand.confidence
                }
            };
        } catch (error) {
            console.error('Event operation error:', error);
            return {
                status: 500,
                response: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Operation failed',
                    metadata: {
                        timestamp: new Date().toISOString(),
                        commandContext: parsedCommand.context
                    }
                }
            };
        }
    };

    /**
     * Handle query-type operations
     */
    private handleQueryOperation = async (
        parsedCommand: EnhancedParsedCommand
    ): Promise<{ status: number; response: any }> => {
        const result = await googleCalendarService.handleCommand(parsedCommand);

        return {
            status: 200,
            response: {
                success: true,
                action: 'query',
                queryType: parsedCommand.queryType,
                queryTime: parsedCommand.startTime,
                events: result.events || [],
                message: result.message,
                confidence: parsedCommand.confidence,
                context: parsedCommand.context,
                details: result.events?.map(event => ({
                    title: event.summary,
                    start: event.start.dateTime,
                    end: event.end.dateTime,
                    location: event.location,
                    attendees: event.attendees?.map(a => a.email),
                    recurrence: event.recurrence,
                    metadata: {
                        lastModified: event.updated,
                        creator: event.creator,
                        status: event.status
                    }
                }))
            }
        };
    };

    /**
     * Generate human-readable confirmation message
     */
    private generateConfirmation = (event: CalendarEvent): string => {
        const startTime = new Date(event.start.dateTime);
        const endTime = new Date(event.end.dateTime);
        const parts = [
            `${this.getActionVerb(event)}: "${event.summary}"`,
            `on ${startTime.toLocaleDateString()}`,
            `from ${startTime.toLocaleTimeString()} to ${endTime.toLocaleTimeString()}`
        ];

        if (event.location) parts.push(`at ${event.location}`);
        if (event.attendees?.length) {
            parts.push(`with ${this.formatAttendees(event.attendees)}`);
        }
        if (event.recurrence) {
            parts.push(`(${this.formatRecurrenceRule(event.recurrence[0])})`);
        }
        if (event.description) {
            parts.push(`\nDetails: ${event.description}`);
        }

        return parts.join(' ');
    };

    /**
     * Format recurrence rule for human readability
     */
    private formatRecurrenceRule = (rule: string): string => {
        const ruleWithoutPrefix = rule.replace('RRULE:', '');
        const parts = ruleWithoutPrefix.split(';');
        const freq = parts.find(p => p.startsWith('FREQ='))?.split('=')[1];
        const interval = parts.find(p => p.startsWith('INTERVAL='))?.split('=')[1];
        const until = parts.find(p => p.startsWith('UNTIL='))?.split('=')[1];

        let formatted = 'Recurring: ';

        if (freq === 'DAILY') formatted += `Every${interval ? ` ${interval} ` : ' '}day`;
        else if (freq === 'WEEKLY') formatted += `Every${interval ? ` ${interval} ` : ' '}week`;
        else if (freq === 'MONTHLY') formatted += `Every${interval ? ` ${interval} ` : ' '}month`;
        else if (freq === 'YEARLY') formatted += `Every${interval ? ` ${interval} ` : ' '}year`;
        else return ruleWithoutPrefix;

        if (until) {
            const untilDate = new Date(until.replace(/(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3'));
            formatted += ` until ${untilDate.toLocaleDateString()}`;
        }

        return formatted;
    };

    /**
     * Format attendees list for human readability
     */
    private formatAttendees = (attendees: Array<{ email: string; responseStatus?: string }>) => {
        const filteredAttendees = attendees.filter(a => !a.email.includes('calendar.google.com'));
        if (filteredAttendees.length <= 2) {
            return filteredAttendees.map(a => a.email).join(' and ');
        }
        return `${filteredAttendees[0].email} and ${filteredAttendees.length - 1} others`;
    };

    /**
     * Get appropriate action verb based on event status
     */
    private getActionVerb = (event: CalendarEvent): string => {
        if (event.status === 'cancelled') return 'Cancelled';
        if (event.updated && new Date(event.updated) > new Date(event.created || 0)) {
            return 'Updated';
        }
        return 'Created';
    };

    /**
     * Cache event in local database
     */
    private cacheEvent = async (event: CalendarEvent, userId: mongoose.Types.ObjectId) => {
        try {

            if (!userId) {
                throw new Error("User ID is required for caching event");
            }

            const cacheEntry = new EventCache({
                userId: userId.toString(),
                googleEventId: event.id,
                eventData: event,
                lastSynced: new Date()
            });
            await cacheEntry.save();
            return cacheEntry;
        } catch (error) {
            console.error('Error caching event:', error);
            // Continue even if caching fails
        }
    };

    /**
     * Create NLP log entry
     */
    private createNLPLog = async (
        userId: mongoose.Types.ObjectId,
        originalText: string,
        success: boolean = false,
        parsedCommand?: EnhancedParsedCommand,
        errorMessage?: string
    ): Promise<INLPLog> => {
        const log = new NLPLog({
            userId,
            originalText,
            success,
            parsedCommand,
            errorMessage,
            metadata: parsedCommand?.metadata,
            timestamp: new Date()
        });
        await log.save();
        return log;
    };

    /**
     * Utility endpoint to get events
     */
    getEvents = async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { startDate, endDate } = req.query;

            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }
            const userId = req.user.id;

            const events = await this.fetchAndCacheEvents(
                userId,
                startDate as string,
                endDate as string
            );

            return res.json(events);
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to fetch events',
                metadata: {
                    timestamp: new Date().toISOString(),
                    query: req.query
                }
            });
        }
    };

    /**
     * Fetch and cache events
     */
    private fetchAndCacheEvents = async (
        userId: mongoose.Types.ObjectId,
        startDate?: string,
        endDate?: string
    ): Promise<CalendarEvent[]> => {
        // Try to get from cache first
        const cachedEvents = await EventCache.find({
            userId: userId.toString(),
            'eventData.start.dateTime': {
                $gte: startDate ? new Date(startDate) : new Date()
            },
            'eventData.end.dateTime': {
                $lte: endDate ? new Date(endDate) : undefined
            }
        }).sort({ 'eventData.start.dateTime': 1 });

        if (cachedEvents.length > 0) {
            return cachedEvents.map(ce => ce.eventData);
        }

        // If not in cache, fetch from Google Calendar
        const events = await googleCalendarService.getEvents(
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined
        );

        // Cache the fetched events
        await Promise.all(events.map(event => this.cacheEvent(event, userId)));

        return events;
    };

    /**
     * Utility endpoint to get single event
     */
    getEvent = async (req: AuthenticatedRequest, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const userId = req.user.id;
            const event = await this.fetchAndCacheEvent(req.params.id, userId);
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }
            return res.json(event);
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to fetch event',
                metadata: {
                    timestamp: new Date().toISOString(),
                    eventId: req.params.id
                }
            });
        }
    };

    /**
     * Fetch and cache single event
     */
    private fetchAndCacheEvent = async (
        eventId: string,
        userId: mongoose.Types.ObjectId
    ): Promise<CalendarEvent | null> => {
        // Try to get from cache first
        const cachedEvent = await EventCache.findOne({
            googleEventId: eventId,
            userId: userId.toString()
        });

        if (cachedEvent) {
            return cachedEvent.eventData;
        }

        // If not in cache, fetch from Google Calendar
        const event = await googleCalendarService.getEvent(eventId);
        if (!event) {
            return null;
        }

        // Cache the fetched event
        await this.cacheEvent(event, userId);

        return event;
    };

    /**
     * Check authentication status
     */
    checkAuthStatus = async (req: Request, res: Response) => {
        try {
            console.log('Auth status check received:', {
                headers: req.headers,
                cookies: req.cookies
            });
            
            const isAuthenticated = await googleCalendarService.isUserAuthenticated();
            console.log('Auth status result:', isAuthenticated);
            
            return res.json({
                isAuthenticated,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Auth status check error:', error);
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to check auth status',
                metadata: {
                    timestamp: new Date().toISOString()
                }
            });
        }
    };

    /**
     * 
     * Get user profile
     */

    getUserProfile = async (req: Request, res: Response) => {
        try {
            const profile = await googleCalendarService.getUserProfile();
            return res.json(profile);
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to fetch user profile',
                metadata: {
                    timestamp: new Date().toISOString()
                }
            });
        }
    };
}

export default new CalendarController();