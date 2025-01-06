
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { ParsedCommand, CalendarEvent } from '../types/calendar.types';
import fs from 'fs';
import path from 'path';

class GoogleCalendarService {
    private oauth2Client: OAuth2Client;
    private calendar: calendar_v3.Calendar;
    private timeZone: string;

    constructor() {
        // this.oauth2Client = new google.auth.OAuth2(
        //     process.env.GOOGLE_CLIENT_ID,
        //     process.env.GOOGLE_CLIENT_SECRET,
        //     process.env.GOOGLE_REDIRECT_URI
        // );

        const credentialsPath = path.join(__dirname, '../config/client_secret_743979723001-ba6houcjh052sqjk8e2mumb7jffkdc3f.apps.googleusercontent.com.json');
        const tokenPath = path.join(__dirname, '../../token.json');

        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
        const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));

        const { client_secret, client_id, redirect_uris } = credentials.web;
        this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        //set the credentials
        this.oauth2Client.setCredentials(token);


        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
        this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    async setCredentials(credentials: any) {
        this.oauth2Client.setCredentials(credentials);
    }

    async getAuthUrl(): Promise<string> {
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
        });
    }

    async handleAuthCallback(code: string) {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        return tokens;
    }



    async createEvent(parsedCommand: ParsedCommand): Promise<CalendarEvent> {
        const endTime = new Date(parsedCommand.startTime);
        endTime.setMinutes(endTime.getMinutes() + parsedCommand.duration);

        const eventResource: calendar_v3.Schema$Event = {
            summary: parsedCommand.title,
            description: parsedCommand.description,
            start: {
                dateTime: parsedCommand.startTime.toISOString(),
                timeZone: this.timeZone,
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: this.timeZone,
            },
            location: parsedCommand.location,
            attendees: parsedCommand.attendees?.map(attendee => ({ email: attendee })),
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 30 }
                ]
            },
            transparency: 'opaque', // Show as busy
            visibility: 'default'
        };

        if (parsedCommand.isRecurring && parsedCommand.recurringPattern) {
            eventResource.recurrence = [`RRULE:${parsedCommand.recurringPattern}`];
        }

        if (parsedCommand.videoConference) {
            eventResource.conferenceData = {
                createRequest: {
                    requestId: `${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            };
        }

        try {
            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                requestBody: eventResource,
                conferenceDataVersion: 1,
                sendUpdates: 'all' // Send emails to attendees
            });

            return response.data as CalendarEvent;
        } catch (error) {
            console.error('Error creating calendar event:', error);
            throw new Error('Failed to create calendar event');
        }
    }

    async getEvents(startDate?: Date, endDate?: Date): Promise<CalendarEvent[]> {
        try {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: (startDate || new Date()).toISOString(),
                timeMax: endDate?.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 100
            });

            return response.data.items as CalendarEvent[];
        } catch (error) {
            console.error('Error fetching events:', error);
            throw new Error('Failed to fetch calendar events');
        }
    }

    async getEvent(eventId: string): Promise<CalendarEvent> {
        try {
            const response = await this.calendar.events.get({
                calendarId: 'primary',
                eventId: eventId
            });

            return response.data as CalendarEvent;
        } catch (error) {
            console.error('Error fetching event:', error);
            throw new Error('Failed to fetch calendar event');
        }
    }

    async updateEvent(eventId: string, updates: Partial<ParsedCommand>): Promise<CalendarEvent> {
        try {
            const currentEvent = await this.getEvent(eventId);

            const endTime = updates.startTime ? new Date(updates.startTime) : new Date(currentEvent.end.dateTime);
            if (updates.duration) {
                endTime.setMinutes(endTime.getMinutes() + updates.duration);
            }

            const eventResource: calendar_v3.Schema$Event = {
                ...currentEvent,
                summary: updates.title || currentEvent.summary,
                description: updates.description || currentEvent.description,
                start: {
                    dateTime: updates.startTime?.toISOString() || currentEvent.start.dateTime,
                    timeZone: this.timeZone,
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: this.timeZone,
                },
                location: updates.location || currentEvent.location,
            };

            if (updates.attendees) {
                eventResource.attendees = updates.attendees.map(attendee => ({ email: attendee }));
            }

            const response = await this.calendar.events.update({
                calendarId: 'primary',
                eventId: eventId,
                requestBody: eventResource,
                sendUpdates: 'all'
            });

            return response.data as CalendarEvent;
        } catch (error) {
            console.error('Error updating event:', error);
            throw new Error('Failed to update calendar event');
        }
    }

    async deleteEvent(eventId: string): Promise<void> {
        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId,
                sendUpdates: 'all'
            });
        } catch (error) {
            console.error('Error deleting event:', error);
            throw new Error('Failed to delete calendar event');
        }
    }

    async checkAvailability(startTime: Date, endTime: Date): Promise<boolean> {
        try {
            const response = await this.calendar.freebusy.query({
                requestBody: {
                    timeMin: startTime.toISOString(),
                    timeMax: endTime.toISOString(),
                    items: [{ id: 'primary' }],
                },
            });

            const busySlots = response.data.calendars?.primary?.busy || [];
            return busySlots.length === 0;
        } catch (error) {
            console.error('Error checking availability:', error);
            throw new Error('Failed to check calendar availability');
        }
    }

    async suggestAlternativeTime(startTime: Date, duration: number): Promise<Date | null> {
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);

        const weekFromNow = new Date(startTime);
        weekFromNow.setDate(weekFromNow.getDate() + 7);

        try {
            const response = await this.calendar.freebusy.query({
                requestBody: {
                    timeMin: startTime.toISOString(),
                    timeMax: weekFromNow.toISOString(),
                    items: [{ id: 'primary' }],
                    timeZone: this.timeZone
                },
            });

            const busySlots = response.data.calendars?.primary?.busy || [];
            let currentSlot = new Date(startTime);

            // Only check during business hours (9 AM to 5 PM)
            while (currentSlot < weekFromNow) {
                const slotEnd = new Date(currentSlot);
                slotEnd.setMinutes(slotEnd.getMinutes() + duration);

                // Skip non-business hours
                const hour = currentSlot.getHours();
                if (hour < 9 || hour >= 17) {
                    currentSlot.setHours(hour < 9 ? 9 : 24);
                    currentSlot.setMinutes(0);
                    continue;
                }

                const isSlotBusy = busySlots.some(busy =>
                    busy.start && busy.end &&
                    new Date(busy.start) < slotEnd &&
                    new Date(busy.end) > currentSlot
                );

                if (!isSlotBusy) {
                    return currentSlot;
                }

                // Move to next 30-minute slot
                currentSlot.setMinutes(currentSlot.getMinutes() + 30);
            }

            return null;
        } catch (error) {
            console.error('Error finding alternative time:', error);
            throw new Error('Failed to find alternative time slot');
        }
    }
}

export default new GoogleCalendarService();