import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { EnhancedParsedCommand, CalendarEvent, Context, Recurrence } from '../types/calendar.types';
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




    // Main command handler
    async handleCommand(parsedCommand: EnhancedParsedCommand): Promise<{
        success: boolean;
        event?: CalendarEvent;
        events?: CalendarEvent[];
        message?: string;
        error?: string;
        suggestion?: Date;
    }> {
        return this.executeWithAuth(async () => {
            switch (parsedCommand.action) {
                case 'create':
                    return this.handleCreateCommand(parsedCommand);
                case 'update':
                    return this.handleUpdateCommand(parsedCommand);
                case 'delete':
                    return this.handleDeleteCommand(parsedCommand);
                case 'query':
                    return this.handleQueryCommand(parsedCommand);
                default:
                    throw new Error('Invalid command action');
            }
        });
    }

    private async handleCreateCommand(parsedCommand: EnhancedParsedCommand) {
        const endTime = this.calculateEndTime(parsedCommand.startTime, parsedCommand.duration);
        const isAvailable = await this.checkAvailability(parsedCommand.startTime, endTime);

        if (!isAvailable) {
            const alternativeTime = await this.suggestAlternativeTime(
                parsedCommand.startTime,
                parsedCommand.duration,
                parsedCommand.context
            );
            return {
                success: false,
                error: 'Time slot is not available',
                suggestion: alternativeTime
            };
        }

        const event = await this.createEvent(parsedCommand);
        return { success: true, event };
    }

    private async handleUpdateCommand(parsedCommand: EnhancedParsedCommand) {
        // Get all events for today and tomorrow
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(now);
        dayEnd.setDate(dayEnd.getDate() + 2); // 2 days in the future
        dayEnd.setHours(23, 59, 59, 999);

        // Extract the actual event title from the command
        const titleMatch = parsedCommand.title.match(/(?:change|update|move|reschedule).*(?:for|of)\s+(.+?)\s+to/i);
        const searchTitle = titleMatch ? titleMatch[1] : parsedCommand.title;

        console.log('Searching for events between:', {
            dayStart: dayStart.toISOString(),
            dayEnd: dayEnd.toISOString(),
            searchTitle: parsedCommand.title
        });

        const events = await this.getEvents(dayStart, dayEnd);
        console.log('Found events:', events.map(e => ({
            title: e.summary,
            start: e.start.dateTime,
            end: e.end.dateTime
        })));

        // Find event by title match or time match
        const targetEvent = events.find(event => {
            const eventStart = new Date(event.start.dateTime);
            const titleMatch = event.summary.toLowerCase().includes(searchTitle.toLowerCase());
            const timeMatch = parsedCommand.targetTime ?
                this.compareDates(eventStart, parsedCommand.targetTime) :
                false;
            return titleMatch || timeMatch;
        });

        if (!targetEvent) {
            return {
                success: false,
                error: 'Could not find a matching event to update. Please specify the event title or time more clearly.'
            };
        }

        // Calculate new start and end times
        const originalStart = new Date(targetEvent.start.dateTime);
        const originalEnd = new Date(targetEvent.end.dateTime);
        const duration = parsedCommand.duration ||
            Math.round((originalEnd.getTime() - originalStart.getTime()) / (1000 * 60));

        let newStartTime: Date;
        if (parsedCommand.startTime) {
            // If a specific new time was provided
            newStartTime = new Date(parsedCommand.startTime);
        } else {
            // If only the date was changed, maintain the same time of day
            newStartTime = new Date(now);
            newStartTime.setHours(
                originalStart.getHours(),
                originalStart.getMinutes(),
                originalStart.getSeconds()
            );
        }

        const result = await this.updateEventWithConflictCheck(targetEvent.id, {
            ...parsedCommand,
            startTime: newStartTime,
            duration: duration,
            title: targetEvent.summary // Preserve original title if not specified in update
        });

        return {
            success: result.success,
            event: result.event,
            error: result.message,
            suggestion: result.alternativeSlots?.[0]
        };
    }

    private async handleDeleteCommand(parsedCommand: EnhancedParsedCommand) {
        const timeMin = parsedCommand.targetTime;
        const timeMax = new Date(parsedCommand.targetTime!.getTime() + 24 * 60 * 60 * 1000);
        timeMax.setMinutes(timeMax.getMinutes() + 1);

        const events = await this.getEvents(timeMin, timeMax);
        console.log('Fetched events:', events);
        console.log('Target time:', parsedCommand.targetTime);

        const targetEvent = events.find(event => {
            const eventStart = new Date(event.start.dateTime);
            return this.compareDates(eventStart, parsedCommand.targetTime!);
        });

        if (!targetEvent) {
            return {
                success: false,
                error: 'No event found at the specified time'
            };
        }

        await this.deleteEvent(targetEvent.id);
        return { success: true };
    }

    private async handleQueryCommand(parsedCommand: EnhancedParsedCommand) {
        const endTime = parsedCommand.duration ?
            this.calculateEndTime(parsedCommand.startTime, parsedCommand.duration) :
            this.calculateEndTime(parsedCommand.startTime, 30);

        const events = await this.getEvents(parsedCommand.startTime, endTime);

        if (parsedCommand.queryType === 'availability') {
            const isAvailable = events.length === 0;
            return {
                success: true,
                message: isAvailable ?
                    'The requested time slot is available' :
                    'There are events scheduled during this time',
                events: events
            };
        }

        return {
            success: true,
            message: events.length > 0 ?
                `Found ${events.length} event(s) at the specified time` :
                'No events found at the specified time',
            events: events
        };
    }

    // Event operations
    private createEventResource(
        parsedCommand: EnhancedParsedCommand,
        endTime: Date,
        existingEvent?: calendar_v3.Schema$Event
    ): calendar_v3.Schema$Event {
        const baseEvent = existingEvent || {};
        const context = parsedCommand.context;

        const timeZone = parsedCommand.timezone || this.timeZone;

        const eventResource: calendar_v3.Schema$Event = {
            ...baseEvent,
            summary: this.toTitleCase(parsedCommand.title) || baseEvent.summary,
            description: this.buildDescription(parsedCommand),
            start: {
                dateTime: parsedCommand.startTime?.toISOString() || baseEvent.start?.dateTime,
                timeZone: timeZone,
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: this.timeZone,
            },
            location: parsedCommand.location || baseEvent.location,
            attendees: parsedCommand.attendees?.map(attendee => ({ email: attendee })) || baseEvent.attendees,
            // Handle recurrence
            recurrence: parsedCommand.recurrence ? this.buildRecurrenceRule(parsedCommand.recurrence) : undefined,
            // Handle context-based settings
            transparency: context?.isFlexible ? 'transparent' : 'opaque',
            // Handle priority and status
            status: this.determineEventStatus(context),
            // Enhanced reminders based on priority
            reminders: this.buildReminders(context),
            visibility: 'default',
            // Extended properties for metadata
            extendedProperties: {
                private: {
                    metadata: JSON.stringify(parsedCommand.metadata),
                    contextInfo: JSON.stringify(parsedCommand.context)
                }
            }
        };

        if (parsedCommand.videoLink) {
            eventResource.conferenceData = {
                createRequest: {
                    requestId: uuidv4(),
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet'
                    },
                    status: {
                        statusCode: 'success'
                    }
                },
                entryPoints: [
                    {
                        entryPointType: 'video',
                        uri: parsedCommand.videoLink,
                        label: 'Video call'
                    }
                ]
            };
        }


        return eventResource;
    }

    async createEvent(parsedCommand: EnhancedParsedCommand): Promise<CalendarEvent> {
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
            console.log('Fetching events for:', {
                timeMin: (startDate || new Date()).toISOString(),
                timeMax: endDate?.toISOString()
            });

            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: (startDate || new Date()).toISOString(),
                timeMax: endDate?.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 100
            });

            console.log('Found events:', response.data.items?.length || 0);
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

    async updateEvent(eventId: string, updates: Partial<EnhancedParsedCommand>): Promise<CalendarEvent> {
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
                } as EnhancedParsedCommand,
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

    // Utility methods
    private buildDescription(parsedCommand: EnhancedParsedCommand): string {
        const parts = [parsedCommand.description || ''];

        if (parsedCommand.context?.isUrgent) {
            parts.push('⚠️ High Priority Event');
        }

        if (parsedCommand.context?.timePreference === 'flexible') {
            parts.push('⚡ Flexible Timing');
        }

        if (parsedCommand.location) {
            parts.push(`📍 Location: ${parsedCommand.location}`);
        }

        if (parsedCommand.metadata) {
            parts.push(`Created: ${new Date(parsedCommand.metadata.parseTime).toLocaleString()}`);
        }

        return parts.join('\n\n');
    }

    private buildRecurrenceRule(recurrence: Recurrence): string[] {
        const freq = recurrence.pattern.toUpperCase();
        const rules = [`RRULE:FREQ=${freq};INTERVAL=${recurrence.interval}`];

        if (recurrence.until) {
            rules[0] += `;UNTIL=${new Date(recurrence.until).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
        }

        return rules;
    }

    private determineEventStatus(context?: Context): string {
        if (!context) return 'confirmed';

        if (context.timePreference === 'flexible') {
            return 'tentative';
        }

        return 'confirmed';
    }

    private buildReminders(context?: Context): calendar_v3.Schema$Event['reminders'] {
        const defaultReminders = {
            useDefault: false,
            overrides: [
                { method: 'email', minutes: 24 * 60 },
                { method: 'popup', minutes: 30 }
            ]
        };

        if (!context) return defaultReminders;

        if (context.isUrgent || context.priority === 'high') {
            return {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 60 },
                    { method: 'popup', minutes: 30 },
                    { method: 'popup', minutes: 10 }
                ]
            };
        }

        return defaultReminders;
    }

    private calculateEndTime(startTime: Date, duration: number): Date {
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);
        return endTime;
    }

    private compareDates(date1: Date, date2: Date): boolean {
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate() &&
            date1.getHours() === date2.getHours() &&
            date1.getMinutes() === date2.getMinutes();
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

    async suggestAlternativeTime(
        startTime: Date,
        duration: number,
        context?: Context
    ): Promise<Date | null> {
        return this.executeWithAuth(async () => {
            const alternatives = await this.findAlternativeSlots(startTime, duration, 1, context);
            return alternatives.length > 0 ? alternatives[0] : null;
        });
    }

    private async findAlternativeSlots(
        preferredStart: Date,
        duration: number,
        numberOfSlots: number,
        context?: Context
    ): Promise<Date[]> {
        return this.executeWithAuth(async () => {
            const alternatives: Date[] = [];
            let currentSlot = new Date(preferredStart);
            const twoWeeksFromNow = new Date(preferredStart);
            twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

            while (alternatives.length < numberOfSlots && currentSlot < twoWeeksFromNow) {
                if (!context?.isFlexible && !this.isBusinessHours(currentSlot)) {
                    currentSlot.setHours(currentSlot.getHours() < this.BUSINESS_HOURS.start ?
                        this.BUSINESS_HOURS.start : 24);
                    currentSlot.setMinutes(0);
                    continue;
                }

                const slotEnd = this.calculateEndTime(currentSlot, duration);
                const conflicts = await this.findConflictingEvents(currentSlot, slotEnd);

                if (this.isSlotSuitable(conflicts, context)) {
                    alternatives.push(new Date(currentSlot));
                }

                // Increment based on priority
                const increment = context?.priority === 'high' ? 15 : 30;
                currentSlot.setMinutes(currentSlot.getMinutes() + increment);
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

    private isSlotSuitable(
        conflicts: CalendarEvent[],
        context?: Context
    ): boolean {
        if (conflicts.length === 0) return true;
        if (!context?.isFlexible) return false;

        return conflicts.every(conflict =>
            conflict.transparency === 'transparent' ||
            conflict.status === 'tentative'
        );
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
        updates: Partial<EnhancedParsedCommand>
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

            if (conflictingEvents.length > 0 && !updates.context?.isFlexible) {
                const alternativeSlots = await this.findAlternativeSlots(startTime, duration, 3, updates.context);
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

    private isBusinessHours(date: Date): boolean {
        if (date.getDay() === 0 || date.getDay() === 6) return false; // Weekend
        const hour = date.getHours();
        return hour >= this.BUSINESS_HOURS.start && hour < this.BUSINESS_HOURS.end;
    }

    // Auth methods
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
                let existingTokens = {};
                if (fs.existsSync(this.tokenPath)) {
                    existingTokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
                }
                if (tokens.refresh_token) {
                    this.saveTokens({
                        ...existingTokens,
                        ...tokens
                    });
                }
            });
        } catch (error) {
            console.error('Error initializing OAuth:', error);
            this.isAuthenticated = false;
        }
    }

    private async getAuthenticatedClient(): Promise<OAuth2Client> {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Google Calendar');
        }

        try {
            return this.oauth2Client;
        } catch (error) {
            console.error('Error getting authenticated client:', error);
            throw new Error('Failed to get authenticated client');
        }
    }

    private async refreshTokenIfNeeded(): Promise<void> {
        try {
            if (!fs.existsSync(this.tokenPath)) {
                throw new Error('AUTH_REQUIRED');
            }

            const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));

            if (!tokens.expiry_date || tokens.expiry_date < Date.now() + 60000) {
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

    private saveTokens(tokens: any) {
        try {
            // Ensure the directory exists
            const dir = path.dirname(this.tokenPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
            this.isAuthenticated = true;

            // Initialize calendar after saving tokens
            this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (error) {
            console.error('Error saving tokens:', error);
            this.isAuthenticated = false;
        }
    }


    private async executeWithAuth<T>(operation: () => Promise<T>): Promise<T> {
        await this.getAuthenticatedClient(); // This will throw if not authenticated
        return operation();
    }

    async getUserProfile() {
        return this.executeWithAuth(async () => {
            try {
                console.log('Getting OAuth2 service...');
                const service = google.oauth2('v2');

                console.log('OAuth2 client state:', {
                    credentials: this.oauth2Client.credentials,
                });

                console.log('Fetching user info...');
                const userInfo = await service.userinfo.get({ auth: this.oauth2Client });

                console.log('User info received:', userInfo.data);

                return {
                    name: userInfo.data.name || userInfo.data.email?.split('@')[0] || 'User',
                    email: userInfo.data.email,
                    id: userInfo.data.id
                };
            } catch (error: any) {
                console.error('Detailed error fetching user profile:', {
                    error: error,
                    message: error.message,
                    stack: error.stack,
                    response: error.response?.data
                });
                return { name: 'User', email: null, id: null };
            }
        });
    }

    private toTitleCase(str: string): string {
        return str
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }

    // Public auth methods
    public isUserAuthenticated(): boolean {
        return this.isAuthenticated;
    }

    async getAuthUrl(): Promise<string> {
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email'
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
}

export default new GoogleCalendarService();