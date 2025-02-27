export interface ParsedCommand {
    action: 'create' | 'update' | 'delete' | 'query';
    title: string;
    startTime: Date;
    duration: number; // in minutes
    description?: string;
    location?: string;
    attendees?: string[];
    targetTime?: Date;
    changes?: Record<string, any>;
    queryType?: 'availability' | 'event_details';
}

export interface ParseCommandOptions {
    previousMessages?: Array<{ role: string; content: string }>;
    threadId?: string;
}


export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    transparency?: 'opaque' | 'transparent';
    status?: 'confirmed' | 'tentative' | 'cancelled';
    updated?: string;
    created?: string;
    creator?: { email: string; displayName?: string };
    location?: string;
    attendees?: { email: string }[];
    recurrence?: string[];
    conferenceData?: any;
}

// export interface CalendarEvent {
//     id?: string;
//     summary: string;
//     description?: string;
//     start: { dateTime: string };
//     end: { dateTime: string };
//     location?: string;
//     attendees?: { email: string }[];
// }

export interface CreateEventRequest {
    title: string;
    description?: string;
    startTime: Date | string;
    duration: number;
    location?: string;
    attendees?: string[];
    isRecurring?: boolean;
    recurringPattern?: string;
    videoConference?: boolean;
}

export interface AmbiguityResolution {
    assumedDefaults: string[];
    clarificationNeeded: boolean;
    alternativeInterpretations: Array<Partial<ParsedCommand>>;
}

export type ClarificationStatus = 'needs_clarification' | 'resolved' | undefined;

export interface TimeDefaults {
    morning: string;
    afternoon: string;
    evening: string;
    defaultTime: string;
    defaultDuration: number;
}

export interface Context {
    isUrgent: boolean;
    isFlexible: boolean;
    priority: 'low' | 'normal' | 'high';
    timePreference: 'exact' | 'approximate' | 'flexible';
}

export interface Recurrence {
    pattern: string;
    interval: number;
    until?: Date;
}

export interface Metadata {
    originalText: string;
    parseTime: Date;
    parserVersion: string;
    confidence: number;
}

export interface EnhancedAmbiguityResolution extends AmbiguityResolution {
    confidenceReasons: string[];
    missingInformation: string[];
}

export interface EnhancedParsedCommand extends ParsedCommand {
    confidence?: number;
    ambiguityResolution?: EnhancedAmbiguityResolution;
    status?: ClarificationStatus;
    clarificationOptions?: Array<Partial<ParsedCommand>>;
    context?: Context;
    recurrence?: Recurrence;
    metadata?: Metadata;
    timeConfidence: number;
    timezone?: string;
    validationDetails?: {
        dayOfWeekMatch: boolean;
        originalDay: string;
        parsedDay: string;
    };
    videoLink?: string;
}