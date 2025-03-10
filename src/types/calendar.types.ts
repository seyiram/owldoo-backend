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
    userId?: string;
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
    recurringEventId?: string;
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
    // Core scheduling flexibility
    isUrgent: boolean;
    isFlexible: boolean;
    priority: 'low' | 'normal' | 'high';
    timePreference: 'exact' | 'approximate' | 'flexible';
    isWorkSchedule?: boolean;
    
    // Enhanced context features
    eventType?: 'work' | 'personal' | 'meeting' | 'appointment' | 'travel' | 'exercise' | 'meal' | 'deadline' | 'other';
    importance?: number; // 1-10 scale
    intentSource?: 'llm' | 'rule-based' | 'user' | string;
    
    // Time context
    timeConstraints?: {
        earliestStart?: Date;
        latestStart?: Date;
        preferredTime?: Date;
        alternativeTimes?: Date[];
        mustEnd?: Date;
        preferredDuration?: number; // minutes
        minimumDuration?: number; // minutes
        isWorkHours?: boolean;
    };
    
    // Attendee context
    attendeeContext?: {
        required: string[];
        optional: string[];
        preferredMeetingTimeForAttendees?: boolean;
        facilitator?: string;
    };
    
    // User-specific context
    userState?: {
        energy?: 'low' | 'medium' | 'high';
        concentration?: 'focused' | 'distracted';
        location?: 'home' | 'office' | 'traveling' | 'other';
        busynessLevel?: 'light' | 'moderate' | 'heavy';
        preferredDaysForMeetingType?: Record<string, string[]>; 
    };
    
    // Environmental/external context
    environmentalFactors?: {
        weather?: 'good' | 'bad';
        trafficConditions?: 'light' | 'moderate' | 'heavy';
        specialDay?: boolean;
    };
    
    // Recurrence patterns
    recurrenceContext?: {
        isFirstOccurrence?: boolean;
        hasExceptions?: boolean;
        modifiesAllFutureOccurrences?: boolean;
    };
    
    // Related events
    relatedEvents?: {
        precedingEventId?: string;
        followingEventId?: string;
        conflictingEvents?: string[];
        partOfSeries?: string;
    };
    
    // Special flags
    flags?: {
        needsReminder?: boolean;
        needsPreparation?: boolean;
        needsTravel?: boolean;
        isAllDay?: boolean;
        isMultiDay?: boolean;
        isOffSiteEvent?: boolean;
    };
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
    context?: {
        previousMessages?: any[];
        threadId?: string;
        userId?: string;
    };
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
    // Properties needed by chat.controller.ts
    isTimeSlotAvailable?: boolean;
    message?: string;
    error?: string;
    success?: boolean;
    created?: boolean;
    result?: any;
    suggestion?: Date;
}