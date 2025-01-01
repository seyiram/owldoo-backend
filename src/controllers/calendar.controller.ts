import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/route.types';
import nlpService from '../services/nlp.service';
import googleCalendarService from '../services/googleCalendar.service';
import { NLPLog, EventCache } from '../models';
import { ParsedCommand } from '../types/calendar.types';
import mongoose from 'mongoose';


const TEST_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001'); // For testing purposes only


// Helper function to convert API input to ParsedCommand format
const convertToParsedCommand = (input: any): ParsedCommand => {
    if (input.start && input.end) {
        // Calculate duration from start and end times
        const startTime = new Date(input.start);
        const endTime = new Date(input.end);
        const duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

        return {
            title: input.summary,
            description: input.description,
            startTime: startTime,
            duration: duration,
            location: input.location,
            attendees: input.attendees?.map((a: any) =>
                typeof a === 'string' ? a : a.email
            ),
            isRecurring: !!input.recurrence,
            recurringPattern: input.recurrence?.[0]?.replace('RRULE:', ''),
            videoConference: !!input.conferenceData
        };
    }

    // If input is already in ParsedCommand format
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


// Validate the parsed command
const validateParsedCommand = (command: ParsedCommand): boolean => {
    if (!command.title || !command.startTime || !command.duration) {
        return false;
    }

    if (isNaN(command.startTime.getTime())) {
        return false;
    }

    if (typeof command.duration !== 'number' || command.duration <= 0) {
        return false;
    }

    return true;
};



// Natural language event creation
// Natural language event creation
export const createEventFromText = async (req: Request, res: Response) => {
    try {
        const { command } = req.body;
        const userId = TEST_USER_ID;

        let nlpLog;
        try {
            // Log the NLP request
            nlpLog = new NLPLog({
                userId,
                originalText: command,
                success: false,
            });
            await nlpLog.save();
        } catch (logError) {
            console.error('Error creating NLP log:', logError);
            return res.status(500).json({
                error: 'Internal server error while logging request',
                details: logError instanceof Error ? logError.message : 'Unknown error'
            });
        }

        try {
            // Parse the natural language command
            const parsedCommand = await nlpService.parseCommand(command);
            nlpLog.parsedCommand = parsedCommand;
            await nlpLog.save();

            // Check availability
            const endTime = new Date(parsedCommand.startTime);
            endTime.setMinutes(endTime.getMinutes() + parsedCommand.duration);

            const isAvailable = await googleCalendarService.checkAvailability(
                parsedCommand.startTime,
                endTime
            );

            if (!isAvailable) {
                // Try to find alternative time
                const alternativeTime = await googleCalendarService.suggestAlternativeTime(
                    parsedCommand.startTime,
                    parsedCommand.duration
                );

                if (alternativeTime) {
                    nlpLog.errorMessage = 'Time slot not available, alternative suggested';
                    await nlpLog.save();

                    return res.status(409).json({
                        error: 'Time slot is not available',
                        suggestion: alternativeTime,
                        originalRequest: parsedCommand,
                    });
                }

                nlpLog.errorMessage = 'No alternative time slots found';
                await nlpLog.save();

                return res.status(409).json({
                    error: 'Time slot is not available and no alternative found within a week',
                    originalRequest: parsedCommand,
                });
            }

            // Create the calendar event
            const event = await googleCalendarService.createEvent(parsedCommand);

            // Cache the event
            try {
                await EventCache.create({
                    googleEventId: event.id,
                    userId: userId.toString(),
                    eventData: event,
                    lastSynced: new Date(),
                });
            } catch (cacheError) {
                console.error('Error caching event:', cacheError);
                // Continue even if caching fails
            }

            // Update NLP log with success
            nlpLog.success = true;
            await nlpLog.save();

            // Generate human-readable confirmation
            const confirmation = generateConfirmation(event);
            return res.status(201).json({
                message: 'Event created successfully',
                confirmation,
                event,
                parsed: parsedCommand,
            });
        } catch (processError) {
            // Update log with error
            if (nlpLog) {
                nlpLog.success = false;
                nlpLog.errorMessage = processError instanceof Error ? processError.message : 'Unknown error';
                await nlpLog.save().catch(console.error);
            }

            return res.status(400).json({
                error: processError instanceof Error ? processError.message : 'Unknown error occurred',
                details: processError instanceof Error ? processError.stack : undefined,
            });
        }
    } catch (error) {
        // Final error handler
        console.error('Unhandled error in createEventFromText:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

// Standard CRUD operations
export const createEvent = async (req: Request, res: Response) => {
    try {
        const userId = TEST_USER_ID;

        // Convert input to ParsedCommand format
        const parsedCommand = convertToParsedCommand(req.body);

        // Validate the parsed command
        if (!validateParsedCommand(parsedCommand)) {
            return res.status(400).json({
                error: 'Invalid event data. Required fields: title, valid startTime, and positive duration'
            });
        }

        // Check availability
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
                return res.status(409).json({
                    error: 'Time slot is not available',
                    suggestion: alternativeTime,
                    originalRequest: parsedCommand,
                });
            }

            return res.status(409).json({
                error: 'Time slot is not available and no alternative found within a week',
                originalRequest: parsedCommand,
            });
        }

        // Create the event
        const event = await googleCalendarService.createEvent(parsedCommand);

        // Cache the event
        await EventCache.create({
            googleEventId: event.id,
            userId,
            eventData: event,
            lastSynced: new Date(),
        });

        // Generate human-readable confirmation
        const confirmation = generateConfirmation(event);

        res.status(201).json({
            message: 'Event created successfully',
            confirmation,
            event,
            parsed: parsedCommand,
        });
    } catch (error) {
        console.error('Create event error:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to create event',
            details: error instanceof Error ? error.stack : undefined,
        });
    }
};

export const getEvents = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const userId = TEST_USER_ID;

        // Try to get events from cache first
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
            return res.json(cachedEvents.map((ce) => ce.eventData));
        }

        // If not in cache, fetch from Google Calendar
        const events = await googleCalendarService.getEvents(
            startDate ? new Date(startDate as string) : undefined,
            endDate ? new Date(endDate as string) : undefined
        );

        // Update cache
        await Promise.all(
            events.map((event) =>
                EventCache.create({
                    googleEventId: event.id,
                    userId,
                    eventData: event,
                    lastSynced: new Date(),
                })
            )
        );

        res.json(events);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch events',
        });
    }
};

export const getEvent = async (req: Request, res: Response) => {
    try {
        const userId = TEST_USER_ID;
        const eventId = req.params.id;

        // Try to get from cache first
        const cachedEvent = await EventCache.findOne({
            googleEventId: eventId,
            userId,
        });

        if (cachedEvent) {
            return res.json(cachedEvent.eventData);
        }

        // If not in cache, fetch from Google Calendar
        const event = await googleCalendarService.getEvent(eventId);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        // Update cache
        await EventCache.create({
            googleEventId: eventId,
            userId,
            eventData: event,
            lastSynced: new Date(),
        });

        res.json(event);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch event',
        });
    }
};

export const updateEvent = async (req: Request, res: Response) => {
    try {
        const userId = TEST_USER_ID;
        const eventId = req.params.id;
        const updatedEvent = await googleCalendarService.updateEvent(eventId, req.body);

        // Update cache
        await EventCache.findOneAndUpdate(
            { googleEventId: eventId, userId },
            {
                eventData: updatedEvent,
                lastSynced: new Date(),
            },
            { upsert: true }
        );

        res.json(updatedEvent);
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to update event',
        });
    }
};

export const deleteEvent = async (req: Request, res: Response) => {
    try {
        const userId = TEST_USER_ID;
        await googleCalendarService.deleteEvent(req.params.id);

        // Remove from cache
        await EventCache.findOneAndDelete({
            googleEventId: req.params.id,
            userId,
        });

        res.status(204).send();
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to delete event',
        });
    }
};

// Calendar availability
export const checkAvailability = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { startTime, endTime } = req.query;
        const isAvailable = await googleCalendarService.checkAvailability(
            new Date(startTime as string),
            new Date(endTime as string)
        );

        res.json({ available: isAvailable });
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to check availability',
        });
    }
};

export const suggestAlternativeTime = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { startTime, duration } = req.query;
        const suggestion = await googleCalendarService.suggestAlternativeTime(
            new Date(startTime as string),
            Number(duration)
        );

        res.json({ suggestion });
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to suggest alternative time',
        });
    }
};

// Helper function to generate human-readable confirmation
function generateConfirmation(event: any): string {
    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);

    let confirmation = `Created: "${event.summary}" on ${startTime.toLocaleDateString()} `;
    confirmation += `from ${startTime.toLocaleTimeString()} to ${endTime.toLocaleTimeString()}`;

    if (event.location) {
        confirmation += ` at ${event.location}`;
    }

    if (event.attendees?.length) {
        confirmation += ` with ${event.attendees.map((a: any) => a.email).join(', ')}`;
    }

    if (event.recurrence) {
        confirmation += ` (Recurring: ${event.recurrence[0].replace('RRULE:', '')})`;
    }

    return confirmation;
}