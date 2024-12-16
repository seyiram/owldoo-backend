export interface ParsedCommand {
    title: string;
    startTime: Date;
    duration: number; // in minutes
    description?: string;
    location?: string;
    attendees?: string[];
    isRecurring?: boolean;
    recurringPattern?: string;
    videoConference?: boolean;
}

export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    location?: string;
    attendees?: { email: string }[];
    recurrence?: string[];
    conferenceData?: any;
}