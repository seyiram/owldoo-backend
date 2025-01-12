import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { ParsedCommand, CalendarEvent } from '../types/calendar.types';
import fs from 'fs';
import path from 'path';

class GoogleCalendarService {
    private oauth2Client!: OAuth2Client;
    private calendar!: calendar_v3.Calendar;
    private timeZone!: string;
    private isAuthenticated: boolean = false;

    private readonly BUSINESS_HOURS = {
        start: 9,
        end: 17
    };
    private readonly tokenPath: string;
    private readonly credentialsPath: string;

    constructor() {
        this.credentialsPath = path.join(__dirname, '../config/client_secret_743979723001-ba6houcjh052sqjk8e2mumb7jffkdc3f.apps.googleusercontent.com.json');
        this.tokenPath = path.join(__dirname, '../../token.json');
        this.initializeOAuth();
    }

    private initializeOAuth() {
        try {
            const credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf-8'));
            const { client_secret, client_id, redirect_uris } = credentials.web;
            
            this.oauth2Client = new google.auth.OAuth2(
                client_id,
                client_secret,
                redirect_uris[0]
            );

            if (fs.existsSync(this.tokenPath)) {
                const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
                this.oauth2Client.setCredentials(tokens);
                this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
                this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                this.isAuthenticated = true;
            }

            this.oauth2Client.on('tokens', (tokens) => {
                if (tokens.refresh_token) {
                    this.saveTokens({
                        ...JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8')),
                        ...tokens
                    });
                }
            });
        } catch (error) {
            console.error('Error initializing OAuth:', error);
            this.isAuthenticated = false;
        }
    }

    private saveTokens(tokens: any) {
        try {
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
            this.isAuthenticated = true;
        } catch (error) {
            console.error('Error saving tokens:', error);
            this.isAuthenticated = false;
        }
    }

    public isUserAuthenticated(): boolean {
        return this.isAuthenticated;
    }

    private async refreshTokenIfNeeded(): Promise<void> {
        try {
            if (!fs.existsSync(this.tokenPath)) {
                throw new Error('AUTH_REQUIRED');
            }
    
            const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
            
            // Check if token needs refresh
            if (!tokens.expiry_date || tokens.expiry_date < Date.now() + 60000) {
                // Use getAccessToken instead of refreshToken
                const response = await this.oauth2Client.getAccessToken();
                const newTokens = response.res?.data;
                
                if (newTokens) {
                    this.saveTokens({
                        ...tokens,
                        ...newTokens
                    });
                    
                    this.oauth2Client.setCredentials({
                        ...tokens,
                        ...newTokens
                    });
                } else {
                    throw new Error('Failed to refresh token');
                }
            }
        } catch (error) {
            console.error('Error refreshing token:', error);
            this.isAuthenticated = false;
            throw new Error('AUTH_REQUIRED');
        }
    }

    private async executeWithAuth<T>(operation: () => Promise<T>): Promise<T> {
        if (!this.isAuthenticated) {
            throw new Error('AUTH_REQUIRED');
        }

        try {
            await this.refreshTokenIfNeeded();
            return await operation();
        } catch (error: any) {
            if (error?.message === 'AUTH_REQUIRED' || 
                error?.response?.data?.error === 'invalid_grant') {
                this.isAuthenticated = false;
                throw new Error('AUTH_REQUIRED');
            }
            throw error;
        }
    }

    private createEventResource(
        parsedCommand: ParsedCommand,
        endTime: Date,
        existingEvent?: calendar_v3.Schema$Event
    ): calendar_v3.Schema$Event {
        const baseEvent = existingEvent || {};
        
        const eventResource: calendar_v3.Schema$Event = {
            ...baseEvent,
            summary: parsedCommand.title || baseEvent.summary,
            description: parsedCommand.description || baseEvent.description,
            start: {
                dateTime: parsedCommand.startTime?.toISOString() || baseEvent.start?.dateTime,
                timeZone: this.timeZone,
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: this.timeZone,
            },
            location: parsedCommand.location || baseEvent.location,
            attendees: parsedCommand.attendees?.map(attendee => ({ email: attendee })) || baseEvent.attendees,
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 30 }
                ]
            },
            transparency: 'opaque',
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

        return eventResource;
    }

    private calculateEndTime(startTime: Date, duration: number): Date {
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);
        return endTime;
    }

    private isBusinessHours(date: Date): boolean {
        const hour = date.getHours();
        return hour >= this.BUSINESS_HOURS.start && hour < this.BUSINESS_HOURS.end;
    }

    // Auth methods
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
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            this.saveTokens(tokens);
            this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            this.isAuthenticated = true;
            return tokens;
        } catch (error) {
            console.error('Error handling auth callback:', error);
            this.isAuthenticated = false;
            throw new Error('Failed to authenticate with Google Calendar');
        }
    }

    // Calendar Operations
    async createEvent(parsedCommand: ParsedCommand): Promise<CalendarEvent> {
        return this.executeWithAuth(async () => {
            const endTime = this.calculateEndTime(parsedCommand.startTime, parsedCommand.duration);
            const eventResource = this.createEventResource(parsedCommand, endTime);

            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                requestBody: eventResource,
                conferenceDataVersion: 1,
                sendUpdates: 'all'
            });

            return response.data as CalendarEvent;
        });
    }

    async getEvents(startDate?: Date, endDate?: Date): Promise<CalendarEvent[]> {
        return this.executeWithAuth(async () => {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: (startDate || new Date()).toISOString(),
                timeMax: endDate?.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 100
            });

            return response.data.items as CalendarEvent[];
        });
    }

    async getEvent(eventId: string): Promise<CalendarEvent> {
        return this.executeWithAuth(async () => {
            const response = await this.calendar.events.get({
                calendarId: 'primary',
                eventId
            });

            return response.data as CalendarEvent;
        });
    }

    async updateEvent(eventId: string, updates: Partial<ParsedCommand>): Promise<CalendarEvent> {
        return this.executeWithAuth(async () => {
            const currentEvent = await this.getEvent(eventId);
            const startTime = updates.startTime || new Date(currentEvent.start.dateTime);
            const duration = updates.duration ||
                Math.round((new Date(currentEvent.end.dateTime).getTime() -
                    new Date(currentEvent.start.dateTime).getTime()) / (1000 * 60));

            const endTime = this.calculateEndTime(startTime, duration);
            const eventResource = this.createEventResource(
                {
                    title: currentEvent.summary,
                    startTime: new Date(currentEvent.start.dateTime),
                    duration: duration,
                    ...updates
                } as ParsedCommand,
                endTime,
                currentEvent
            );

            const response = await this.calendar.events.update({
                calendarId: 'primary',
                eventId,
                requestBody: eventResource,
                sendUpdates: 'all'
            });

            return response.data as CalendarEvent;
        });
    }

    async deleteEvent(eventId: string): Promise<void> {
        return this.executeWithAuth(async () => {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId,
                sendUpdates: 'all'
            });
        });
    }

    async checkAvailability(startTime: Date, endTime: Date): Promise<boolean> {
        return this.executeWithAuth(async () => {
            const response = await this.calendar.freebusy.query({
                requestBody: {
                    timeMin: startTime.toISOString(),
                    timeMax: endTime.toISOString(),
                    items: [{ id: 'primary' }],
                },
            });

            const busySlots = response.data.calendars?.primary?.busy || [];
            return busySlots.length === 0;
        });
    }

    async suggestAlternativeTime(startTime: Date, duration: number): Promise<Date | null> {
        return this.executeWithAuth(async () => {
            const alternatives = await this.findAlternativeSlots(startTime, duration, 1);
            return alternatives.length > 0 ? alternatives[0] : null;
        });
    }

    private async findAlternativeSlots(
        preferredStart: Date,
        duration: number,
        numberOfSlots: number
    ): Promise<Date[]> {
        return this.executeWithAuth(async () => {
            const alternatives: Date[] = [];
            let currentSlot = new Date(preferredStart);
            const twoWeeksFromNow = new Date(preferredStart);
            twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

            while (alternatives.length < numberOfSlots && currentSlot < twoWeeksFromNow) {
                if (!this.isBusinessHours(currentSlot)) {
                    currentSlot.setHours(currentSlot.getHours() < this.BUSINESS_HOURS.start ?
                        this.BUSINESS_HOURS.start : 24);
                    currentSlot.setMinutes(0);
                    continue;
                }

                const slotEnd = this.calculateEndTime(currentSlot, duration);
                const conflicts = await this.findConflictingEvents(currentSlot, slotEnd);

                if (conflicts.length === 0) {
                    alternatives.push(new Date(currentSlot));
                }

                currentSlot.setMinutes(currentSlot.getMinutes() + 30);
            }

            return alternatives;
        });
    }

    private async findConflictingEvents(
        startTime: Date,
        endTime: Date,
        excludeEventId?: string
    ): Promise<CalendarEvent[]> {
        return this.executeWithAuth(async () => {
            const events = await this.getEvents(startTime, endTime);
            return events.filter(event =>
                event.id !== excludeEventId &&
                this.eventsOverlap(
                    new Date(event.start.dateTime),
                    new Date(event.end.dateTime),
                    startTime,
                    endTime
                )
            );
        });
    }

    private eventsOverlap(
        start1: Date,
        end1: Date,
        start2: Date,
        end2: Date
    ): boolean {
        return start1 < end2 && end1 > start2;
    }

    async updateEventWithConflictCheck(
        eventId: string,
        updates: Partial<ParsedCommand>
    ): Promise<{
        success: boolean;
        event?: CalendarEvent;
        conflicts?: CalendarEvent[];
        alternativeSlots?: Date[];
        message?: string;
    }> {
        return this.executeWithAuth(async () => {
            const currentEvent = await this.getEvent(eventId);

            if (currentEvent.recurrence) {
                return {
                    success: false,
                    message: 'This is a recurring event. Would you like to update just this instance or all future events?',
                    event: currentEvent
                };
            }

            const startTime = updates.startTime || new Date(currentEvent.start.dateTime);
            const duration = updates.duration ||
                Math.round((new Date(currentEvent.end.dateTime).getTime() -
                    new Date(currentEvent.start.dateTime).getTime()) / (1000 * 60));

            const endTime = this.calculateEndTime(startTime, duration);
            const conflictingEvents = await this.findConflictingEvents(startTime, endTime, eventId);

            if (conflictingEvents.length > 0) {
                const alternativeSlots = await this.findAlternativeSlots(startTime, duration, 3);
                return {
                    success: false,
                    conflicts: conflictingEvents,
                    alternativeSlots,
                    message: 'Conflicts found with existing events',
                    event: currentEvent
                };
            }

            const updatedEvent = await this.updateEvent(eventId, updates);
            return {
                success: true,
                event: updatedEvent,
                message: 'Event updated successfully'
            };
        });
    }
}

export default new GoogleCalendarService();