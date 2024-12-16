// src/controllers/calendar.controller.ts
import { Request, Response } from 'express';
import nlpService from '../services/nlp.service';
import googleCalendarService from '../services/googleCalendar.service';

export const createEventFromText = async (req: Request, res: Response) => {
    try {
        const { command } = req.body;
        
        // Parse the natural language command
        const parsedCommand = await nlpService.parseCommand(command);
        
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
                return res.status(409).json({
                    error: 'Time slot is not available',
                    suggestion: alternativeTime,
                    originalRequest: parsedCommand
                });
            }
            
            return res.status(409).json({
                error: 'Time slot is not available and no alternative found within a week',
                originalRequest: parsedCommand
            });
        }

        // Create the calendar event
        const event = await googleCalendarService.createEvent(parsedCommand);
        
        // Generate human-readable confirmation
        const confirmation = generateConfirmation(event);

        res.status(201).json({
            message: 'Event created successfully',
            confirmation,
            event,
            parsed: parsedCommand
        });
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            details: error instanceof Error ? error.stack : undefined
        });
    }
};

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

export const createEvent = async (req: Request, res: Response) => {
    try {
        const event = await googleCalendarService.createEvent(req.body);
        res.status(201).json(event);
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create event' });
    }
};

export const getEvents = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const events = await googleCalendarService.getEvents(
            startDate ? new Date(startDate as string) : undefined,
            endDate ? new Date(endDate as string) : undefined
        );
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch events' });
    }
};

export const getEvent = async (req: Request, res: Response) => {
    try {
        const event = await googleCalendarService.getEvent(req.params.id);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        res.json(event);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch event' });
    }
};

export const updateEvent = async (req: Request, res: Response) => {
    try {
        const updatedEvent = await googleCalendarService.updateEvent(req.params.id, req.body);
        res.json(updatedEvent);
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update event' });
    }
};

export const deleteEvent = async (req: Request, res: Response) => {
    try {
        await googleCalendarService.deleteEvent(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to delete event' });
    }
};

export const checkAvailability = async (req: Request, res: Response) => {
    try {
        const { startTime, endTime } = req.query;
        const isAvailable = await googleCalendarService.checkAvailability(
            new Date(startTime as string),
            new Date(endTime as string)
        );
        res.json({ available: isAvailable });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to check availability' });
    }
};

export const suggestAlternativeTime = async (req: Request, res: Response) => {
    try {
        const { startTime, duration } = req.query;
        const suggestion = await googleCalendarService.suggestAlternativeTime(
            new Date(startTime as string),
            Number(duration)
        );
        res.json({ suggestion });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to suggest alternative time' });
    }
};
