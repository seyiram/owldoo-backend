import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/route.types';
import nlpService from '../services/nlp.service';
import googleCalendarService from '../services/googleCalendar.service';
import { NLPLog, EventCache } from '../models';
import { INLPLog as NLPLogType } from '../models/NLPLog';
import { ParsedCommand, CalendarEvent } from '../types/calendar.types';
import mongoose from 'mongoose';

class CalendarController {
    private readonly TEST_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

    getAuthUrl = async (req: Request, res: Response) => {
        try {
            const url = await googleCalendarService.getAuthUrl();
            return res.json({ url });
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to generate auth URL'
            });
        }
    };

    handleAuthCallback = async (req: Request, res: Response) => {
        try {
            const { code } = req.query;
            if (!code || typeof code !== 'string') {
                return res.status(400).json({ error: 'Authorization code is required' });
            }

            await googleCalendarService.handleAuthCallback(code);
            // Redirect to your frontend application
            return res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to handle auth callback'
            });
        }
    };

    checkAuthStatus = async (req: Request, res: Response) => {
        try {
            const isAuthenticated = googleCalendarService.isUserAuthenticated();
            return res.json({ isAuthenticated });
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to check auth status'
            });
        }
    };

    private convertToParsedCommand = (input: any): ParsedCommand => {
        if (input.start && input.end) {
            const startTime = new Date(input.start);
            const endTime = new Date(input.end);
            const duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

            return {
                title: input.summary,
                description: input.description,
                startTime,
                duration,
                location: input.location,
                attendees: input.attendees?.map((a: any) => typeof a === 'string' ? a : a.email),
                isRecurring: !!input.recurrence,
                recurringPattern: input.recurrence?.[0]?.replace('RRULE:', ''),
                videoConference: !!input.conferenceData
            };
        }

        return {
            title: input.title,
            description: input.description,
            startTime: new Date(input.startTime),
            duration: input.duration,
            location: input.location,
            attendees: input.attendees,
            isRecurring: input.isRecurring || false,
            recurringPattern: input.recurringPattern,
            videoConference: input.videoConference || false
        };
    };

    private validateParsedCommand = (command: ParsedCommand): boolean => {
        return !!(command.title &&
            command.startTime &&
            !isNaN(command.startTime.getTime()) &&
            typeof command.duration === 'number' &&
            command.duration > 0);
    };

    private generateConfirmation = (event: CalendarEvent): string => {
        const startTime = new Date(event.start.dateTime);
        const endTime = new Date(event.end.dateTime);
        const parts = [
            `Created: "${event.summary}"`,
            `on ${startTime.toLocaleDateString()}`,
            `from ${startTime.toLocaleTimeString()} to ${endTime.toLocaleTimeString()}`
        ];

        if (event.location) parts.push(`at ${event.location}`);
        if (event.attendees?.length) {
            parts.push(`with ${event.attendees.map((a: any) => a.email).join(', ')}`);
        }
        if (event.recurrence) {
            parts.push(`(Recurring: ${event.recurrence[0].replace('RRULE:', '')})`);
        }

        return parts.join(' ');
    };

    private handleEventCreation = async (
        parsedCommand: ParsedCommand,
        userId: mongoose.Types.ObjectId
    ): Promise<{ status: number; response: any }> => {
        const endTime = new Date(parsedCommand.startTime);
        endTime.setMinutes(endTime.getMinutes() + parsedCommand.duration);

        const isAvailable = await googleCalendarService.checkAvailability(
            parsedCommand.startTime,
            endTime
        );

        if (!isAvailable) {
            const alternativeTime = await googleCalendarService.suggestAlternativeTime(
                parsedCommand.startTime,
                parsedCommand.duration
            );

            if (alternativeTime) {
                return {
                    status: 409,
                    response: {
                        error: 'Time slot is not available',
                        suggestion: alternativeTime,
                        originalRequest: parsedCommand,
                    }
                };
            }

            return {
                status: 409,
                response: {
                    error: 'Time slot is not available and no alternative found within a week',
                    originalRequest: parsedCommand,
                }
            };
        }

        const event = await googleCalendarService.createEvent(parsedCommand);
        await this.cacheEvent(event, userId);
        const confirmation = this.generateConfirmation(event);

        return {
            status: 201,
            response: {
                message: 'Event created successfully',
                confirmation,
                event,
                parsed: parsedCommand,
            }
        };
    };

    private cacheEvent = async (event: CalendarEvent, userId: mongoose.Types.ObjectId) => {
        try {
            await EventCache.create({
                googleEventId: event.id,
                userId: userId.toString(),
                eventData: event,
                lastSynced: new Date(),
            });
        } catch (error) {
            console.error('Error caching event:', error);
            // Continue even if caching fails
        }
    };

    private handleNLPLog = async (
        userId: mongoose.Types.ObjectId,
        originalText: string,
        success: boolean = false,
        parsedCommand?: ParsedCommand,
        errorMessage?: string
    ): Promise<NLPLogType> => {
        const log = new NLPLog({
            userId,
            originalText,
            success,
            parsedCommand,
            errorMessage
        });
        await log.save();
        return log;
    };

    // Public Controller Methods as Arrow Functions
    createEventFromText = async (req: Request, res: Response) => {
        try {
            const { command } = req.body;
            const userId = this.TEST_USER_ID;
            let nlpLog = await this.handleNLPLog(userId, command);

            try {
                const parsedCommand = await nlpService.parseCommand(command);
                nlpLog.parsedCommand = parsedCommand;
                await nlpLog.save();

                const result = await this.handleEventCreation(parsedCommand, userId);

                if (result.status === 201) {
                    nlpLog.success = true;
                } else {
                    nlpLog.errorMessage = result.response.error;
                }
                await nlpLog.save();

                return res.status(result.status).json(result.response);
            } catch (error) {
                nlpLog.success = false;
                nlpLog.errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await nlpLog.save();

                return res.status(400).json({
                    error: error instanceof Error ? error.message : 'Unknown error occurred',
                    details: error instanceof Error ? error.stack : undefined,
                });
            }
        } catch (error) {
            console.error('Unhandled error in createEventFromText:', error);
            return res.status(500).json({
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    createEvent = async (req: Request, res: Response) => {
        try {
            const parsedCommand = this.convertToParsedCommand(req.body);

            if (!this.validateParsedCommand(parsedCommand)) {
                return res.status(400).json({
                    error: 'Invalid event data. Required fields: title, valid startTime, and positive duration'
                });
            }

            const result = await this.handleEventCreation(parsedCommand, this.TEST_USER_ID);
            return res.status(result.status).json(result.response);
        } catch (error) {
            console.error('Create event error:', error);
            return res.status(400).json({
                error: error instanceof Error ? error.message : 'Failed to create event',
                details: error instanceof Error ? error.stack : undefined,
            });
        }
    };

    getEvents = async (req: Request, res: Response) => {
        try {
            const { startDate, endDate } = req.query;
            const userId = this.TEST_USER_ID;

            const cachedEvents = await EventCache.find({
                userId,
                'eventData.start.dateTime': {
                    $gte: startDate ? new Date(startDate as string) : new Date(),
                },
                'eventData.end.dateTime': {
                    $lte: endDate ? new Date(endDate as string) : undefined,
                },
            }).sort({ 'eventData.start.dateTime': 1 });

            if (cachedEvents.length > 0) {
                return res.json(cachedEvents.map(ce => ce.eventData));
            }

            const events = await googleCalendarService.getEvents(
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            await Promise.all(events.map(event => this.cacheEvent(event, userId)));
            return res.json(events);
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to fetch events',
            });
        }
    };

    getEvent = async (req: Request, res: Response) => {
        try {
            const cachedEvent = await EventCache.findOne({
                googleEventId: req.params.id,
                userId: this.TEST_USER_ID,
            });

            if (cachedEvent) {
                return res.json(cachedEvent.eventData);
            }

            const event = await googleCalendarService.getEvent(req.params.id);
            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }

            await this.cacheEvent(event, this.TEST_USER_ID);
            return res.json(event);
        } catch (error) {
            return res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to fetch event',
            });
        }
    };

    updateEvent = async (req: Request, res: Response) => {
        try {
            const result = await googleCalendarService.updateEventWithConflictCheck(
                req.params.id,
                this.convertToParsedCommand(req.body)
            );

            if (!result.success) {
                return res.status(409).json(result);
            }

            await EventCache.findOneAndUpdate(
                { googleEventId: req.params.id, userId: this.TEST_USER_ID },
                {
                    eventData: result.event,
                    lastSynced: new Date(),
                },
                { upsert: true }
            );

            return res.json(result);
        } catch (error) {
            return res.status(400).json({
                error: error instanceof Error ? error.message : 'Failed to update event',
            });
        }
    };

    deleteEvent = async (req: Request, res: Response) => {
        try {
            await googleCalendarService.deleteEvent(req.params.id);
            await EventCache.findOneAndDelete({
                googleEventId: req.params.id,
                userId: this.TEST_USER_ID,
            });
            return res.status(204).send();
        } catch (error) {
            return res.status(400).json({
                error: error instanceof Error ? error.message : 'Failed to delete event',
            });
        }
    };

    checkAvailability = async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { startTime, endTime } = req.query;
            const isAvailable = await googleCalendarService.checkAvailability(
                new Date(startTime as string),
                new Date(endTime as string)
            );
            return res.json({ available: isAvailable });
        } catch (error) {
            return res.status(400).json({
                error: error instanceof Error ? error.message : 'Failed to check availability',
            });
        }
    };

    suggestAlternativeTime = async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { startTime, duration } = req.query;
            const suggestion = await googleCalendarService.suggestAlternativeTime(
                new Date(startTime as string),
                Number(duration)
            );
            return res.json({ suggestion });
        } catch (error) {
            return res.status(400).json({
                error: error instanceof Error ? error.message : 'Failed to suggest alternative time',
            });
        }
    };
}

export default new CalendarController();