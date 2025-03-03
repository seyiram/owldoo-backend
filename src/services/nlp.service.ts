import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';
import mongoose from 'mongoose';
import { ParsedCommand, ParseCommandOptions, TimeDefaults, EnhancedParsedCommand, Context, Recurrence, CalendarEvent } from '../types/calendar.types';
import GoogleCalendarService from './googleCalendar.service';
import { UserPreferences } from '../models';
import { contextService } from './context.service';



class NLPService {
    private client: Anthropic;
    private timeDefaults: TimeDefaults;
    private readonly VERSION = '2.0.0';
    private googleCalendarService: any;

    constructor(googleCalendarService: any) {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || '',
        });

        this.timeDefaults = {
            morning: '09:00',
            afternoon: '14:00',
            evening: '18:00',
            defaultTime: '09:00',
            defaultDuration: 30
        };

        this.googleCalendarService = googleCalendarService;
    }

    private readonly MEETING_PATTERNS = {
        withPerson: /(?:meeting|call|appointment|sync)\s+with\s+(\w+)/i,
        timeReference: /(tomorrow|next week|later today)/i,
        moveCommand: /(?:change|move|reschedule)\s+(?:the|my)?\s*(?:date|time)?\s*(?:for|of)?\s*(.+?)\s+to/i,
    }

    private detectEventType(text: string): { 
        type: 'work' | 'meeting' | 'other',
        isWorkSchedule: boolean 
    } {
        const lowerText = text.toLowerCase();
        
        // Check for work schedule patterns first
        const workPatterns = [
            /\b(schedule|set|plan)\s+work\b/i,
            /\bwork\s+(schedule|time|hours)\b/i,
            /\bworking\s+(from|hours)\b/i
        ];

        const isWorkSchedule = workPatterns.some(pattern => pattern.test(text));
        if (isWorkSchedule) {
            return { type: 'work', isWorkSchedule: true };
        }

        // Then check for meeting patterns
        const meetingPatterns = [
            /\bmeeting\b/i,
            /\bcall\b/i,
            /\bappointment\b/i,
            /\bsync\b/i
        ];

        const isMeeting = meetingPatterns.some(pattern => pattern.test(text));
        if (isMeeting) {
            return { type: 'meeting', isWorkSchedule: false };
        }

        return { type: 'other', isWorkSchedule: false };
    }

    private async parseUpdateCommand(input: string): Promise<EnhancedParsedCommand> {
        const moveMatch = input.match(this.MEETING_PATTERNS.moveCommand);
        let title = input;

        if (moveMatch && moveMatch[1]) {
            title = moveMatch[1].trim();
            console.log('Extracted event title:', title);
        }

        // Find the target meeting based on the person's name
        const targetMeetingTime = await this.findTargetMeeting(input, this.MEETING_PATTERNS);
        if (!targetMeetingTime) {
            throw new Error('Target meeting not found');
        }

        // Rest of parsing logic...
        const { startTime, timeConfidence, duration } = this.parseDateTime(input, this.MEETING_PATTERNS);

        return {
            action: 'update',
            title: title,
            startTime: startTime,
            targetTime: startTime,
            timeConfidence: timeConfidence,
            duration: duration || this.timeDefaults.defaultDuration,
            metadata: {
                originalText: input,
                parseTime: new Date(),
                parserVersion: this.VERSION,
                confidence: timeConfidence
            }
        };
    }

    private async findTargetMeeting(input: string, patterns: Record<string, RegExp>): Promise<Date | null> {
        const personMatch = input.match(patterns.withPerson);
        if (!personMatch) return null;

        const person = personMatch[1];
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get today's events
        const events = await this.googleCalendarService.getEvents(
            today,
            tomorrow
        );

        // Find the first event that matches the person's name
        const targetEvent = events.find((event: CalendarEvent) =>
            event.summary.toLowerCase().includes(person.toLowerCase()) ||
            event.attendees?.some(a =>
                a.email.toLowerCase().includes(person.toLowerCase())
            )
        );

        return targetEvent ? new Date(targetEvent.start.dateTime) : null;
    }

    async parseCommand(input: string, options?: ParseCommandOptions): Promise<EnhancedParsedCommand> {
        try {

            const isUpdateCommand = input.toLowerCase().match(/^(?:let's\s+)?(?:change|move|reschedule)/i);

            if (isUpdateCommand) {
                return this.parseUpdateCommand(input);
            }

            // Add debug logging
            console.log('Input:', input);
            console.log('Has Simple Pattern:', this.hasSimplePattern(input));

            // Check if it's a move command
            if (this.MEETING_PATTERNS.moveCommand.test(input)) {
                return this.handleMeetingUpdate(input);
            }

            if (this.hasSimplePattern(input)) {
                return this.parseWithRegex(input);
            }

            const anthroParsedCommand = await this.parseWithAnthropic(input, options);

            // If confidence is low but regex might work better
            if (anthroParsedCommand.confidence &&
                anthroParsedCommand.confidence < 0.7 &&
                this.hasSimplePattern(input)) {
                const regexParsedCommand = this.parseWithRegex(input);
                return regexParsedCommand.confidence! > anthroParsedCommand.confidence
                    ? regexParsedCommand
                    : anthroParsedCommand;
            }

            // Extract video conference link
            const videoLinkPattern = /(https?:\/\/[^\s]+)/i;
            const videoLinkMatch = input.match(videoLinkPattern);
            const videoLink = videoLinkMatch ? videoLinkMatch[0] : undefined;

            // Remove video link from input
            const cleanedInput = videoLink ? input.replace(videoLinkPattern, '').trim() : input;

            // Parse the cleaned input
            const finalParsedCommand = await this.parseWithAnthropic(cleanedInput, options);

            if (videoLink) {
                anthroParsedCommand.videoLink = videoLink;
            }

            const eventType = this.detectEventType(input);
        
            // Set the appropriate title and context based on event type
            if (eventType.isWorkSchedule) {
                finalParsedCommand.title = 'Work';
                finalParsedCommand.context = {
                    ...finalParsedCommand.context,
                    isWorkSchedule: true,
                    isUrgent: false,
                    isFlexible: false,
                    priority: 'normal',
                    timePreference: 'exact'
                };
            }

            return finalParsedCommand;
        } catch (error) {
            console.warn('Anthropic API failed, falling back to regex-based parser:', error);
            return this.parseWithRegex(input);
        }
    }

    async parseWithClarification(input: string): Promise<EnhancedParsedCommand> {
        const initialParse = await this.parseCommand(input);

        if (initialParse.ambiguityResolution?.clarificationNeeded) {
            return {
                ...initialParse,
                status: 'needs_clarification',
                clarificationOptions: initialParse.ambiguityResolution.alternativeInterpretations
            };
        }

        return initialParse;
    }

    private async parseWithAnthropic(input: string, options?: ParseCommandOptions): Promise<EnhancedParsedCommand> {
        try {
            // Get user context if userId is provided
            let userContext = null;
            if (options?.userId) {
                userContext = await contextService.getUserContext(options.userId);
            }

            const userTimezone = await this.getUserTimezone(options?.userId);
            const currentTime = new Date();

            // Build conversation context from previous messages
            let conversationContext = '';
            if (options?.previousMessages?.length) {
                conversationContext = options.previousMessages
                    .slice(-5) // Use last 5 messages for context
                    .map(msg => `${msg.role}: ${msg.content}`)
                    .join('\n');
            }

            // Handle update commands (move/reschedule)
            if (input.toLowerCase().includes('change') || input.toLowerCase().includes('move') || input.toLowerCase().includes('reschedule')) {
                // Find the most recent create command in the context
                const previousCreate = options?.previousMessages?.reverse().find(msg =>
                    msg.role === 'user' && (msg.content.toLowerCase().includes('create') || msg.content.toLowerCase().includes('schedule'))
                );

                if (previousCreate) {
                    // Extract the time pattern from the original command
                    const timePattern = previousCreate.content.match(/(\d{1,2})(?::\d{2})?\s*(?:am|pm)\s*to\s*(\d{1,2})(?::\d{2})?\s*(?:am|pm)/i);
                    if (timePattern) {
                        // Preserve the original time range when updating the date
                        const [, startTime, endTime] = timePattern;
                        input = `${input} at ${startTime}${endTime ? ` to ${endTime}` : ''}`;
                    }

                    // Extract the event title from the original command
                    const titleMatch = previousCreate.content.match(/schedule\s+(.+?)\s+for/i);
                    if (titleMatch) {
                        const originalTitle = titleMatch[1];
                        if (!input.includes(originalTitle)) {
                            input = `${input} for "${originalTitle}"`;
                        }
                    }
                }
            }

            // Create enhanced system prompt with context
            const systemPrompt = `Parse calendar commands and return structured JSON. Handle time ranges crossing midnight correctly. Ensure all times are in ISO format with timezone. For ranges like "3pm to 1:30am", calculate the full duration including the next day.
    
    CURRENT CONTEXT:
    Time: ${currentTime.toISOString()}
    Timezone: ${userTimezone}
    Day: ${currentTime.toLocaleDateString('en-US', { weekday: 'long' })}
    
    ${userContext ? `USER CONTEXT:
    Working hours: ${userContext.preferences.workingHours?.start || '09:00'} to ${userContext.preferences.workingHours?.end || '17:00'}
    Default meeting duration: ${userContext.preferences.defaultMeetingDuration || 30} minutes
    Time of day: ${userContext.timeAwareness.timeOfDay}
    Is weekend: ${userContext.timeAwareness.isWeekend}
    Is working hour: ${userContext.timeAwareness.isWorkingHour}
    Upcoming events: ${userContext.upcomingEvents.map(e => e.summary).join(', ') || 'None'}
    Common contacts: ${userContext.behavioralPatterns.frequentContacts.join(', ') || 'None'}` : ''}
    
    PREVIOUS CONVERSATION:
    ${conversationContext}`;

            const messages: MessageParam[] = [
                {
                    role: "assistant",
                    content: [
                        {
                            type: 'text',
                            text: `You are a calendar event parser specialized in understanding natural language and handling edge cases.
        
    COMMAND INTERPRETATION GUIDELINES:
    
    Key requirements:
    - Parse specific dates like "Tuesday 25th February" into exact ISO dates with the correct year
    - Validate that parsed dates match specified days of the week
    - Handle time specifications in 12-hour format (e.g., "12pm")
    - Default to next occurrence if date is in the future
    - Return all times in ISO format with timezone
    - Include confidence scores (0-1) for date/time parsing accuracy
    
    Example input: "schedule an interview with Jay Jaffar from Fortive for Tuesday 25th February at 12pm"
    Example output: {
        "action": "create",
        "title": "Interview with Jay Jaffar from Fortive",
        "startTime": "2025-02-25T12:00:00.000Z",
        "duration": 30,
        "confidence": 0.95,
        "context": {
            "isUrgent": false,
            "isFlexible": false,
            "priority": "normal",
            "timePreference": "exact"
        }
    }
        
    1. Action Classification:
       CREATE:
         Primary: "schedule", "set up", "add", "create", "book", "plan"
         Secondary: "need to", "want to", "going to", "will be", "should"
         Examples:
           - "I need to meet John"
           - "Going to have a team sync"
           - "Will be interviewing tomorrow"
    
       UPDATE:
         Primary: "change", "move", "reschedule", "shift", "update", "postpone"
         Secondary: "instead of", "rather than", "switch to", "push to"
         Examples:
           - "Push the meeting to 4pm"
           - "Switch tomorrow's call to Friday"
           - "Need to move my 3pm"
    
       DELETE:
         Primary: "cancel", "delete", "remove", "clear", "drop"
         Secondary: "can't make", "won't be able", "need to skip"
         Examples:
           - "Can't make the 3pm call"
           - "Need to skip tomorrow's meeting"
           - "Drop my afternoon appointment"
    
       QUERY:
         Primary: "check", "show", "find", "list", "what", "when", "where"
         Secondary: "do I have", "is there", "look up", "tell me about"
         Examples:
           - "What's on my calendar today?"
           - "Do I have anything at 3?"
           - "Show me next week's events"
    
    2. Time Understanding:
       A. Time Range Handling:
          - When a time range crosses midnight (e.g., "8pm to 1am"):
            * If end time is earlier than start time, assume it's the next day
            * Calculate duration by adding 24 hours to end time when needed
            * Example: "3pm to 1:30am" = 10.5 hours (630 minutes)
          - Formats supported:
            * "from X to Y"
            * "X to Y"
            * "X - Y"
            * "X until Y"
            * "between X and Y"
          - Time formats:
            * 12-hour: "3pm", "3:30pm", "3PM", "3:30 PM"
            * 24-hour: "15:00", "1500"
            
       B. Date References:
          Absolute:
            - ISO dates: "2024-01-15", "2024/01/15"
            - Written dates: "January 15th", "15th January", "Jan 15"
            - Numeric dates: "15/01", "01/15", "15-01"
            
          Relative to Today:
            - "today", "tonight", "this evening"
            - "tomorrow", "tmr", "tmrw", "next day"
            - "day after tomorrow", "in 2 days"
            - "next [day]" -> next occurrence of day
            - "this [day]" -> this week's occurrence
            - "in a week" -> today + 7 days
            - "in two weeks" -> today + 14 days
    
    3. Duration Calculation:
       - Explicit time ranges: Calculate exact minutes between start and end
       - Crossing midnight: Add 24 hours to end time when before start time
       - Default durations if not specified:
         * "meeting", "call": 30 minutes
         * "lunch": 60 minutes
         * "workshop": 120 minutes
         * "quick sync": 15 minutes
    
    4. Response Format:
    {
        "action": string ("create" | "update" | "delete" | "query"),
        "title": string,
        "startTime": string (ISO datetime with timezone),
        "duration": number (in minutes),
        "description": string,
        "confidence": number (0-1),
        "context": {
            "isUrgent": boolean,
            "isFlexible": boolean,
            "priority": "low" | "normal" | "high",
            "timePreference": "exact" | "approximate" | "flexible"
        },
        "recurrence"?: {
            "pattern": string,
            "interval": number,
            "until"?: string (ISO datetime)
        },
        "ambiguityResolution": {
            "assumedDefaults": string[],
            "clarificationNeeded": boolean,
            "alternativeInterpretations": any[],
            "confidenceReasons": string[],
            "missingInformation": string[]
        }
    }`
                        },
                    ],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: 'text',
                            text: input,
                        },
                    ],
                },
            ];

            const response = await this.client.messages.create({
                model: "claude-3-sonnet-20240229",
                max_tokens: 1024,
                messages,
                temperature: 0,
                system: systemPrompt,
            });

            if (!response.content || response.content.length === 0) {
                throw new Error('No response from Claude');
            }

            let text = '';
            for (const block of response.content) {
                if (block.type === 'text') {
                    text += block.text;
                }
            }

            if (!text) {
                throw new Error('No text content found in response');
            }

            try {
                const parsedResponse = JSON.parse(text);

                console.log('Parsed Response:', parsedResponse);

                // Validate the parsed date matches the day of week
                if (parsedResponse.startTime) {
                    const date = new Date(parsedResponse.startTime);

                    // Extract date components from input
                    const dateInfo = {
                        hasExplicitYear: !!input.match(/\b\d{4}\b/),
                        hasExplicitMonth: !!input.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i),
                        hasExplicitDay: !!input.match(/\b(\d{1,2})(st|nd|rd|th)?\b/),
                        hasNext: !!input.match(/\b(next|coming)\b/i),
                        specifiedDay: input.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i)?.[1]
                    };

                    console.log('Date parsing info:', dateInfo);

                    // Validate day of week if specified
                    if (dateInfo.specifiedDay) {
                        const actualDay = date.toLocaleDateString('en-US', { weekday: 'long' });
                        if (!this.validateDateWithDayOfWeek(date, dateInfo.specifiedDay)) {
                            console.warn(`Day mismatch: specified ${dateInfo.specifiedDay}, but date falls on ${actualDay}`);
                            throw new Error(`The specified date (${date.toDateString()}) falls on ${actualDay}, not ${dateInfo.specifiedDay}`);
                        }
                    }

                    // Determine if we should adjust the date
                    const shouldAdjustDate = !dateInfo.hasExplicitYear ||
                        (dateInfo.hasNext && !dateInfo.hasExplicitMonth) ||
                        (!dateInfo.hasExplicitMonth && !dateInfo.hasExplicitDay);

                    if (shouldAdjustDate && dateInfo.specifiedDay) {
                        console.log('Adjusting date to next occurrence');
                        parsedResponse.startTime = this.adjustDateToNextOccurrence(date, dateInfo.specifiedDay);
                    }

                    // Validate the final date is not in the past
                    const now = new Date();
                    if (parsedResponse.startTime < now) {
                        console.warn('Adjusted date is in the past, moving to next year');
                        parsedResponse.startTime.setFullYear(parsedResponse.startTime.getFullYear() + 1);
                    }

                    // Add confidence adjustments based on date specificity
                    parsedResponse.confidence = this.calculateDateConfidence(dateInfo);
                }

                // Validate required fields
                if (!parsedResponse.action || !parsedResponse.title || !parsedResponse.startTime || !parsedResponse.duration) {
                    throw new Error('Missing required fields in parsed response');
                }

                // Convert string dates to Date objects before creating enhancedResponse
                if (typeof parsedResponse.startTime === 'string') {
                    parsedResponse.startTime = new Date(parsedResponse.startTime);
                }
                if (typeof parsedResponse.targetTime === 'string') {
                    parsedResponse.targetTime = new Date(parsedResponse.targetTime);
                }
                if (parsedResponse.recurrence?.until && typeof parsedResponse.recurrence.until === 'string') {
                    parsedResponse.recurrence.until = new Date(parsedResponse.recurrence.until);
                }

                // Add metadata
                const enhancedResponse: EnhancedParsedCommand = {
                    ...parsedResponse,
                    metadata: {
                        originalText: input,
                        parseTime: new Date(),
                        parserVersion: this.VERSION,
                        confidence: parsedResponse.confidence || 0,
                        context: options
                    }
                };

                // Convert string dates to Date objects and handle timezones
                if (enhancedResponse.startTime) {
                    enhancedResponse.startTime = this.convertToLocalTime(enhancedResponse.startTime.toISOString(), userTimezone);
                }
                if (enhancedResponse.targetTime) {
                    enhancedResponse.targetTime = this.convertToLocalTime(enhancedResponse.targetTime.toISOString(), userTimezone);
                }
                if (enhancedResponse.recurrence?.until) {
                    enhancedResponse.recurrence.until = this.convertToLocalTime(enhancedResponse.recurrence.until.toISOString(), userTimezone);
                }

                // Validate the enhanced response structure
                if (!this.validateEnhancedParsedCommand(enhancedResponse)) {
                    throw new Error('Invalid parsed command structure');
                }

                return enhancedResponse;
            } catch (error) {
                console.error('Error parsing Anthropic response:', error);
                throw new Error('Invalid parsed command structure');
            }
        } catch (error) {
            console.error('Error in parseWithAnthropic:', error);
            throw error;
        }
    }

    private hasSimplePattern(input: string): boolean {
        const simplePatterns = {
            create: /schedule|create|add|set up|need to|going to|will be/i,
            update: /change|move|reschedule|shift|update|postpone|instead of|switch to/i,
            delete: /cancel|delete|remove|clear|drop|can't make|won't be able|skip/i,
            time: /at\s+\d{1,2}(?::\d{2})?(?:\s*[ap]m)?|\d{1,2}(?::\d{2})?(?:\s*[ap]m)?\s+on/i
        };

        return Object.values(simplePatterns).some(pattern => pattern.test(input));
    }

    private parseWithRegex(input: string): EnhancedParsedCommand {
        const patterns = {
            time: /at\s+(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/i,
            duration: /for\s+(\d+)\s*(?:hour|hr|hours|mins|minutes)/i,
            date: /(?:today|tomorrow|next|on)\s+(\w+)/i,
            timeOfDay: /(?:morning|afternoon|evening|night)/i,
            query: /check|show|list|what'?s|is there|do i have/i,
            action: /(?:change|update|move|reschedule|cancel|delete|remove)/i,
            urgency: /urgent|asap|right away|immediately/i,
            flexibility: /if possible|must be|has to be|preferably/i,
            recurring: /every|daily|weekly|bi-weekly|monthly|quarterly|yearly/i,
            location: /wfh|remote|in person|on site|office/i,
            meetingType: /quick sync|catch-up|check-in|meeting|call|review|workshop|training|1:1|one on one/i
        };

        // Check for recurring patterns first
        if (input.toLowerCase().includes('every') || input.toLowerCase().includes('weekly')) {
            const recurringDateTime = this.parseRecurringDateTime(input, patterns);
            return {
                action: 'create',
                title: this.generateTitle(input, 'create'),
                startTime: recurringDateTime.startTime,
                duration: recurringDateTime.duration || this.timeDefaults.defaultDuration,
                timeConfidence: recurringDateTime.timeConfidence,
                description: input,
                recurrence: {
                    pattern: 'weekly',
                    interval: 1
                },
                context: this.determineContext(input, patterns),
                metadata: {
                    originalText: input,
                    parseTime: new Date(),
                    parserVersion: this.VERSION,
                    confidence: recurringDateTime.timeConfidence
                },
                ambiguityResolution: {
                    assumedDefaults: [],
                    clarificationNeeded: false,
                    alternativeInterpretations: [],
                    confidenceReasons: ['Recurring pattern detected'],
                    missingInformation: []
                }
            };
        }

        // Determine action type with enhanced patterns
        const action: 'create' | 'update' | 'delete' | 'query' = this.determineAction(input, patterns);

        // Set queryType for query actions
        const queryType = action === 'query'
            ? input.match(/is there|available|do i have/i)
                ? 'availability'
                : 'event_details'
            : undefined;

        // Extract title using enhanced title generation
        const title = this.generateTitle(input, action);

        // Parse time with enhanced understanding
        const { startTime, timeConfidence, duration } = this.parseDateTime(input, patterns);

        console.log("Parsed DateTime Result:", startTime, timeConfidence, duration);

        // Parse duration with context awareness
        const finalDuration = duration || this.parseDuration(input, patterns);

        // Determine context
        const context = this.determineContext(input, patterns);

        // Parse recurrence
        const recurrence = this.parseRecurrence(input, patterns);

        // Calculate overall confidence
        const confidence = this.calculateConfidence(input, patterns, timeConfidence);

        const parsedCommand: EnhancedParsedCommand = {
            action,
            title,
            startTime,
            duration: finalDuration,
            description: input,
            queryType,
            timeConfidence,
            context,
            recurrence,
            metadata: {
                originalText: input,
                parseTime: new Date(),
                parserVersion: this.VERSION,
                confidence
            },
            ambiguityResolution: {
                assumedDefaults: [],
                clarificationNeeded: false,
                alternativeInterpretations: [],
                confidenceReasons: [],
                missingInformation: []
            }
        };

        // Add targetTime for update/delete actions
        if (action !== 'create' && action !== 'query') {
            parsedCommand.targetTime = new Date(startTime);
        }

        // Track assumptions and build confidence reasons
        this.trackAssumptions(parsedCommand, input, patterns);

        return parsedCommand;
    }

    private determineAction(input: string, patterns: Record<string, RegExp>): 'create' | 'update' | 'delete' | 'query' {
        if (patterns.query.test(input)) return 'query';
        if (/cancel|delete|remove|drop|can't make|won't be able|skip/i.test(input)) return 'delete';
        if (/change|move|reschedule|shift|update|postpone|instead of|switch to/i.test(input)) return 'update';
        if (/schedule|create|add|set up|need to|going to|will be|plan|book/i.test(input)) return 'create';
        return 'create'; // Default to create if no clear action is found
    }

    private generateTitle(input: string, action: string): string {
        // Remove video links
        const videoLinkPattern = /(?:here'?s?\s+(?:the\s+)?(?:video\s+)?link:?\s+)?https?:\/\/[^\s]+/gi;
        let cleanedInput = input.replace(videoLinkPattern, '');
        // Remove time-related phrases
        const timePatterns = [
            /(?:from|at|on)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i,
            /(?:today|tomorrow|next week|this week|tonight)/i,
            /for\s+(?:today|tomorrow|next week|this week|tonight)/i,
            /\s+for\s*$/i  // Matches "for" at the end of the string
        ];

        timePatterns.forEach(pattern => {
            cleanedInput = cleanedInput.replace(pattern, '');
        });

        // Remove scheduling words
        const schedulingWords = /(?:schedule|create|add|set up|book)\s+/i;
        let finalTitle = cleanedInput.replace(schedulingWords, '').trim();

        // Remove any trailing "for" that might be left
        finalTitle = finalTitle.replace(/\s+for\s*$/i, '');

        return finalTitle || 'Untitled Event';
    }

    private parseDateTime(input: string, patterns: Record<string, RegExp>): {
        startTime: Date;
        timeConfidence: number;
        duration?: number;
        timeZone?: string;
    } {
        const startTime = new Date();
        let timeConfidence = 0.8;
        let duration: number | undefined;

        // Define relative time expressions
        const relativePatterns = {
            'end of day': () => {
                startTime.setHours(17, 0, 0, 0); // Default to 5 PM
                timeConfidence = 0.9;
                duration = 60;
            },
            'beginning of next month': () => {
                startTime.setMonth(startTime.getMonth() + 1, 1);
                startTime.setHours(9, 0, 0, 0); // Default to 9 AM
                timeConfidence = 0.95;
                duration = 60;
            },
            'lunch time': () => {
                startTime.setHours(12, 0, 0, 0);
                timeConfidence = 0.85;
                duration = 60;
            },
            'morning': () => {
                startTime.setHours(9, 0, 0, 0);
                timeConfidence = 0.7;
                duration = 60;
            },
            'afternoon': () => {
                startTime.setHours(14, 0, 0, 0);
                timeConfidence = 0.7;
                duration = 60;
            },
            'evening': () => {
                startTime.setHours(18, 0, 0, 0);
                timeConfidence = 0.7;
                duration = 60;
            }
        };

        // Check for specific date patterns
        const datePattern = /(\w+day),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i;
        const dateMatch = input.match(datePattern);
        if (dateMatch) {
            const [_, dayOfWeek, month, day, year] = dateMatch;
            const targetDate = new Date(`${month} ${day}, ${year}`);
            const specifiedDay = dayOfWeek.toLowerCase();

            if (this.validateDateWithDayOfWeek(targetDate, specifiedDay)) {
                startTime.setFullYear(targetDate.getFullYear());
                startTime.setMonth(targetDate.getMonth());
                startTime.setDate(targetDate.getDate());
                timeConfidence = 0.95;
            } else {
                console.warn('Parsed date does not match specified day of week');
                return this.parseWithRegex(input);
            }
        }

        // Check for relative time expressions
        for (const [pattern, handler] of Object.entries(relativePatterns)) {
            if (input.toLowerCase().includes(pattern)) {
                handler();
                return { startTime, timeConfidence, duration };
            }
        }

        // Fuzzy time matching
        const fuzzyTimePatterns = {
            'around noon': { hour: 12, confidence: 0.8 },
            'early morning': { hour: 8, confidence: 0.7 },
            'mid morning': { hour: 10, confidence: 0.7 },
            'late morning': { hour: 11, confidence: 0.7 },
            'early afternoon': { hour: 13, confidence: 0.7 },
            'late afternoon': { hour: 16, confidence: 0.7 },
            'early evening': { hour: 17, confidence: 0.7 },
            'late evening': { hour: 20, confidence: 0.7 }
        };

        for (const [pattern, config] of Object.entries(fuzzyTimePatterns)) {
            if (input.toLowerCase().includes(pattern)) {
                startTime.setHours(config.hour, 0, 0, 0);
                timeConfidence = config.confidence;
                duration = 60;
                return { startTime, timeConfidence, duration };
            }
        }

        // Handle relative days
        if (/tomorrow|tmr|tmrw|next day/i.test(input)) {
            startTime.setDate(startTime.getDate() + 1);
            timeConfidence = 0.9;
        } else if (/next week/i.test(input)) {
            startTime.setDate(startTime.getDate() + 7);
            timeConfidence = 0.9;
        } else if (/next month/i.test(input)) {
            startTime.setMonth(startTime.getMonth() + 1);
            timeConfidence = 0.9;
        }

        // Time zone handling
        const timeZonePattern = /in|at\s+([\w\s/]+time zone|GMT[+-]\d+|UTC[+-]\d+)/i;
        const timeZoneMatch = input.match(timeZonePattern);
        let timeZone: string | undefined;

        if (timeZoneMatch) {
            timeZone = timeZoneMatch[1];
            timeConfidence += 0.1; // Increase confidence when timezone is specified
        }

        // Improved time range pattern
        const timeRangePattern = /(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s+(?:to|until|till|-)\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i;
        const timeMatch = input.match(timeRangePattern);

        if (timeMatch) {
            const [_, startHour, startMin, startAmPm, endHour, endMin, endAmPm] = timeMatch;

            // Parse start time
            let hours = parseInt(startHour);
            let minutes = startMin ? parseInt(startMin) : 0;

            // Handle AM/PM for start time
            if (startAmPm?.toLowerCase() === 'pm' && hours < 12) {
                hours += 12;
            } else if (startAmPm?.toLowerCase() === 'am' && hours === 12) {
                hours = 0;
            }

            startTime.setHours(hours, minutes, 0, 0);
            timeConfidence = 0.95;

            // Calculate duration if end time is provided
            if (endHour) {
                let endHours = parseInt(endHour);
                let endMinutes = endMin ? parseInt(endMin) : 0;

                // Handle AM/PM for end time
                if (endAmPm?.toLowerCase() === 'pm' && endHours < 12) {
                    endHours += 12;
                } else if (endAmPm?.toLowerCase() === 'am' && endHours === 12) {
                    endHours = 0;
                }

                // Create end time date
                const endTimeDate = new Date(startTime);
                endTimeDate.setHours(endHours, endMinutes);

                // If end time is earlier than start time, assume it's next day
                if (endTimeDate < startTime) {
                    endTimeDate.setDate(endTimeDate.getDate() + 1);
                }

                // Calculate duration in minutes
                duration = Math.round((endTimeDate.getTime() - startTime.getTime()) / (1000 * 60));
            }
        }

        // Specific time pattern
        const specificTimePattern = /at\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i;
        const specificTimeMatch = input.match(specificTimePattern);

        if (specificTimeMatch) {
            let [fullMatch, hourStr, minuteStr, ampm] = specificTimeMatch;
            let hour = parseInt(hourStr);
            let minute = minuteStr ? parseInt(minuteStr) : 0;

            if (ampm?.toLowerCase() === 'pm' && hour < 12) {
                hour += 12;
            } else if (ampm?.toLowerCase() === 'am' && hour === 12) {
                hour = 0;
            }

            startTime.setHours(hour, minute, 0, 0);
            timeConfidence = 0.95;
        }

        return {
            startTime,
            timeConfidence,
            duration: duration || this.timeDefaults.defaultDuration,
            timeZone
        };
    }



    private parseDuration(input: string, patterns: Record<string, RegExp>): number {
        // Check for explicit duration
        const durationMatch = input.match(patterns.duration);
        if (durationMatch) {
            return parseInt(durationMatch[1]) * (durationMatch[0].includes('hour') ? 60 : 1);
        }

        // Check meeting types for implicit duration
        const meetingTypeMatch = input.match(patterns.meetingType);
        if (meetingTypeMatch) {
            const type = meetingTypeMatch[0].toLowerCase();
            if (type.includes('quick') || type.includes('check-in')) return 15;
            if (type.includes('workshop') || type.includes('training')) return 120;
            if (type.includes('review')) return 60;
            if (type.includes('1:1') || type.includes('one on one')) return 30;
            return 30; // default meeting duration
        }

        return this.timeDefaults.defaultDuration;
    }

    private determineContext(input: string, patterns: Record<string, RegExp>): Context {
        const context: Context = {
            isUrgent: /urgent|asap|immediately|right away/i.test(input),
            isFlexible: /flexible|anytime|whenever/i.test(input),
            priority: /high priority|important|critical/i.test(input) ? 'high' : 'normal',
            timePreference: /exactly|sharp|on the dot/i.test(input) ? 'exact' : 'approximate'
        };

        return context;
    }

    private parseRecurrence(input: string, patterns: Record<string, RegExp>): Recurrence | undefined {
        const recurringMatch = input.match(patterns.recurring);
        if (!recurringMatch) return undefined;

        const pattern = recurringMatch[0].toLowerCase();
        let interval = 1;

        if (pattern.includes('bi-weekly')) {
            return { pattern: 'weekly', interval: 2 };
        } else if (pattern.includes('quarterly')) {
            return { pattern: 'monthly', interval: 3 };
        } else if (pattern.includes('yearly')) {
            return { pattern: 'yearly', interval: 1 };
        } else if (pattern.includes('weekly')) {
            return { pattern: 'weekly', interval: 1 };
        } else if (pattern.includes('monthly')) {
            return { pattern: 'monthly', interval: 1 };
        } else if (pattern.includes('daily')) {
            return { pattern: 'daily', interval: 1 };
        }

        return { pattern: 'weekly', interval: 1 };
    }

    private calculateConfidence(input: string, patterns: Record<string, RegExp>, timeConfidence: number): number {
        let confidence = timeConfidence;

        // Adjust based on clarity of action
        if (patterns.action.test(input)) confidence += 0.1;

        // Adjust based on completeness
        if (patterns.time.test(input)) confidence += 0.2;
        if (patterns.duration.test(input)) confidence += 0.1;

        // Penalize for ambiguity
        if (input.includes('maybe') || input.includes('probably')) confidence -= 0.1;
        if (!patterns.time.test(input)) confidence -= 0.2;

        // Cap confidence
        return Math.min(Math.max(confidence, 0), 1);
    }

    private trackAssumptions(parsedCommand: EnhancedParsedCommand, input: string, patterns: Record<string, RegExp>): void {
        const assumedDefaults: string[] = [];
        const confidenceReasons: string[] = [];
        const missingInformation: string[] = [];

        if (!patterns.time.test(input)) {
            assumedDefaults.push(`Default time: ${this.timeDefaults.defaultTime}`);
            confidenceReasons.push('No explicit time specified (-0.2)');
            missingInformation.push('Explicit time');
        }

        if (!patterns.duration.test(input)) {
            assumedDefaults.push(`Default duration: ${this.timeDefaults.defaultDuration} minutes`);
            if (!patterns.meetingType.test(input)) {
                confidenceReasons.push('No duration specified (-0.1)');
                missingInformation.push('Duration');
            }
        }

        if (patterns.recurring.test(input)) {
            confidenceReasons.push('Recurring pattern detected (+0.1)');
        }

        parsedCommand.ambiguityResolution = {
            ...parsedCommand.ambiguityResolution,
            assumedDefaults,
            confidenceReasons,
            missingInformation,
            clarificationNeeded: false,
            alternativeInterpretations: []
        };
    }

    private convertToLocalTime(isoString: string, timezone: string): Date {
        // Create a date object in the target timezone
        const targetDate = new Date(isoString);

        // Get the UTC timestamp
        const utcTimestamp = targetDate.getTime();

        // Get the target timezone offset in minutes
        const targetOffset = new Date(targetDate.toLocaleString('en-US', { timeZone: timezone })).getTimezoneOffset();

        // Get the local timezone offset in minutes
        const localOffset = targetDate.getTimezoneOffset();

        // Calculate the difference and adjust the time
        const offsetDiff = localOffset - targetOffset;
        return new Date(utcTimestamp + (offsetDiff * 60000));
    }

    private validateEnhancedParsedCommand(command: EnhancedParsedCommand): boolean {
        // Include original validation logic
        if (!this.validateBasicParsedCommand(command)) {
            return false;
        }

        // Additional validation for enhanced fields
        if (command.context) {
            if (typeof command.context.isUrgent !== 'boolean' ||
                typeof command.context.isFlexible !== 'boolean' ||
                !['low', 'normal', 'high'].includes(command.context.priority) ||
                !['exact', 'approximate', 'flexible'].includes(command.context.timePreference)) {
                console.error('Invalid context structure');
                return false;
            }
        }

        if (command.recurrence) {
            if (!command.recurrence.pattern || typeof command.recurrence.interval !== 'number') {
                console.error('Invalid recurrence structure');
                return false;
            }
        }

        if (command.metadata) {
            if (!command.metadata.originalText || !command.metadata.parseTime ||
                !command.metadata.parserVersion || typeof command.metadata.confidence !== 'number') {
                console.error('Invalid metadata structure');
                return false;
            }
        }

        return true;
    }

    private validateBasicParsedCommand(command: ParsedCommand): boolean {
        if (!command.action) {
            console.error('Missing required field: action');
            return false;
        }

        if (command.startTime && (!(command.startTime instanceof Date) || isNaN(command.startTime.getTime()))) {
            console.error('Invalid startTime');
            return false;
        }

        switch (command.action) {
            case 'create':
                return this.validateCreateCommand(command);
            case 'update':
                return this.validateUpdateCommand(command);
            case 'delete':
                return this.validateDeleteCommand(command);
            case 'query':
                return this.validateQueryCommand(command);
            default:
                console.error('Invalid action type');
                return false;
        }
    }


    private validateCreateCommand(command: ParsedCommand): boolean {
        return !!(command.title && command.startTime && command.duration && command.duration > 0);
    }

    private validateUpdateCommand(command: ParsedCommand): boolean {
        return !!(command.title && command.startTime && command.duration &&
            command.duration > 0 && command.targetTime);
    }

    private validateDeleteCommand(command: ParsedCommand): boolean {
        return !!command.targetTime;
    }

    private validateQueryCommand(command: ParsedCommand): boolean {
        return !!(command.startTime && command.queryType);
    }

    private async handleMeetingUpdate(input: string): Promise<EnhancedParsedCommand> {
        // Extract title from the move/reschedule command
        const moveMatch = input.match(this.MEETING_PATTERNS.moveCommand);
        let title = input;

        if (moveMatch && moveMatch[1]) {
            title = moveMatch[1].trim();
        }

        // Get today's and tomorrow's events
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 2);

        // Get events
        const events = await this.googleCalendarService.getEvents(
            today,
            tomorrow
        );

        // Find the target event by title
        const targetEvent = events.find((event: CalendarEvent) =>
            event.summary.toLowerCase().includes(title.toLowerCase())
        );

        if (!targetEvent) {
            throw new Error(`No event found matching "${title}"`);
        }



        // Parse the new date/time
        const { startTime, timeConfidence, duration } = this.parseDateTime(input, this.MEETING_PATTERNS);

        // Use calculateNewTime as a fallback if parseDateTime doesn't find a specific time
        if (!startTime || startTime.getTime() === today.getTime()) {
            const timeReference = input.match(this.MEETING_PATTERNS.timeReference)?.[1];
            if (timeReference) {
                const calculatedTime = this.calculateNewTime(timeReference, new Date(targetEvent.start.dateTime));
                return {
                    action: 'update',
                    title: targetEvent.summary,
                    startTime: calculatedTime,
                    targetTime: new Date(targetEvent.start.dateTime),
                    duration: duration || this.timeDefaults.defaultDuration,
                    description: input,
                    timeConfidence: 0.9, // High confidence when using explicit time reference
                    context: {
                        isUrgent: false,
                        isFlexible: true,
                        priority: 'normal',
                        timePreference: 'approximate'
                    },
                    metadata: {
                        originalText: input,
                        parseTime: new Date(),
                        parserVersion: this.VERSION,
                        confidence: 0.9
                    },
                    ambiguityResolution: {
                        assumedDefaults: [],
                        clarificationNeeded: false,
                        alternativeInterpretations: [],
                        confidenceReasons: ['Explicit time reference detected', 'Target event found'],
                        missingInformation: []
                    }
                };
            }
        }



        return {
            action: 'update',
            title: targetEvent.summary,
            startTime: startTime,
            targetTime: new Date(targetEvent.start.dateTime),
            duration: duration || this.timeDefaults.defaultDuration,
            description: input,
            timeConfidence: timeConfidence,
            context: {
                isUrgent: false,
                isFlexible: true,
                priority: 'normal',
                timePreference: 'approximate'
            },
            metadata: {
                originalText: input,
                parseTime: new Date(),
                parserVersion: this.VERSION,
                confidence: timeConfidence
            },
            ambiguityResolution: {
                assumedDefaults: [],
                clarificationNeeded: false,
                alternativeInterpretations: [],
                confidenceReasons: ['Explicit move command detected', 'Target event found'],
                missingInformation: []
            }
        };
    }

    private calculateNewTime(timeReference: string, originalTime: Date): Date {
        const newTime = new Date(originalTime);

        switch (timeReference.toLowerCase()) {
            case 'tomorrow':
                newTime.setDate(newTime.getDate() + 1);
                break;
            case 'next week':
                newTime.setDate(newTime.getDate() + 7);
                break;
            case 'later today':
                newTime.setHours(newTime.getHours() + 3); // Move 3 hours later
                break;
            default:
                newTime.setDate(newTime.getDate() + 1); // Default to tomorrow
        }

        return newTime;
    }

    private parseRecurringDateTime(input: string, patterns: Record<string, RegExp>): { startTime: Date; timeConfidence: number; duration?: number } {
        const startTime = new Date();
        let timeConfidence = 0.9;

        // Parse time
        const timePattern = /at\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i;
        const timeMatch = input.match(timePattern);

        if (timeMatch) {
            const [_, hours, minutes, meridiem] = timeMatch;
            let parsedHours = parseInt(hours);

            // Handle AM/PM
            if (meridiem?.toLowerCase() === 'pm' && parsedHours < 12) {
                parsedHours += 12;
            } else if (meridiem?.toLowerCase() === 'am' && parsedHours === 12) {
                parsedHours = 0;
            }

            startTime.setHours(parsedHours, minutes ? parseInt(minutes) : 0, 0, 0);
            timeConfidence = 0.95;
        }

        // Parse day of week
        const dayPattern = /every\s+(\w+day)/i;
        const dayMatch = input.match(dayPattern);

        if (dayMatch) {
            const targetDay = dayMatch[1].toLowerCase();
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const targetDayIndex = days.indexOf(targetDay);

            if (targetDayIndex !== -1) {
                const currentDay = startTime.getDay();
                const daysToAdd = (targetDayIndex + 7 - currentDay) % 7;
                startTime.setDate(startTime.getDate() + daysToAdd);
                timeConfidence = Math.min(timeConfidence + 0.05, 1);
            }
        }

        // Determine duration based on meeting type
        let duration = 30; // default
        if (input.toLowerCase().includes('sync')) {
            duration = 30;
        } else if (input.toLowerCase().includes('workshop')) {
            duration = 120;
        } else if (input.toLowerCase().includes('training')) {
            duration = 120;
        }

        return { startTime, timeConfidence, duration };
    }

    private async getUserTimezone(userId?: string): Promise<string> {
        if (userId) {
            const userPrefs = await UserPreferences.findOne({ userId });
            if (userPrefs?.timeZone) {
                return userPrefs.timeZone;
            }
        }
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    // Add helper method for date validation
    private validateDateWithDayOfWeek(date: Date, specifiedDay: string): boolean {
        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dateDay = daysOfWeek[date.getDay()];
        return dateDay === specifiedDay.toLowerCase();
    }

    private adjustDateToNextOccurrence(date: Date, specifiedDay: string): Date {
        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDayIndex: number = daysOfWeek.indexOf(specifiedDay.toLowerCase());
        const currentDayIndex: number = date.getDay();

        let daysToAdd = targetDayIndex - currentDayIndex;
        if (daysToAdd <= 0) daysToAdd += 7;

        const newDate = new Date(date);
        newDate.setDate(date.getDate() + daysToAdd);
        return newDate;
    }

    private calculateDateConfidence(dateInfo: {
        hasExplicitYear: boolean;
        hasExplicitMonth: boolean;
        hasExplicitDay: boolean;
        hasNext: boolean;
        specifiedDay: string | undefined;
    }): number {
        let confidence = 0.7; // Base confidence

        // Add confidence for each explicit component
        if (dateInfo.hasExplicitYear) confidence += 0.1;
        if (dateInfo.hasExplicitMonth) confidence += 0.1;
        if (dateInfo.hasExplicitDay) confidence += 0.1;

        // Reduce confidence for relative terms
        if (dateInfo.hasNext) confidence -= 0.1;

        // Slight boost for day of week validation  
        if (dateInfo.specifiedDay) confidence += 0.05;

        // Full date specification gets maximum confidence
        if (dateInfo.hasExplicitYear && dateInfo.hasExplicitMonth &&
            dateInfo.hasExplicitDay && dateInfo.specifiedDay) {
            confidence = 1.0;
        }

        return Math.min(Math.max(confidence, 0), 1);
    }

    // Add to NLPService class

    async generateContextualResponse(input: string, options?: ParseCommandOptions): Promise<string> {
        try {
            // Get user context
            const userId = options?.userId;
            const userContext = userId ? await this.buildUserContext(userId) : null;

            // Build context-aware prompt
            const currentTime = new Date();
            const userTimezone = await this.getUserTimezone(userId);

            // Get conversation context
            let conversationContext = '';
            if (options?.previousMessages && options.previousMessages.length > 0) {
                conversationContext = options.previousMessages
                    .slice(-5) // Use last 5 messages for context
                    .map(msg => `${msg.role}: ${msg.content}`)
                    .join('\n');
            }

            // Create enhanced system prompt with context
            const systemPrompt = `You are an intelligent assistant with the following context:
      
  CURRENT CONTEXT:
  Time: ${currentTime.toISOString()}
  Timezone: ${userTimezone}
  Day: ${currentTime.toLocaleDateString('en-US', { weekday: 'long' })}
  
  ${userContext ? `USER CONTEXT:
  Working hours: ${userContext.workingHours?.start || 'Unknown'} to ${userContext.workingHours?.end || 'Unknown'}
  Preferred meeting duration: ${userContext.defaultMeetingDuration || 30} minutes
  Recent calendar events: ${userContext.recentEvents?.map((event: { title: string }) => event.title).join(', ') || 'None'}` : ''}
  
  PREVIOUS CONVERSATION:
  ${conversationContext}
  
  Respond in a helpful, concise manner. For calendar operations, extract specific details about dates, times, and event information.`;

            // Generate response with Claude
            const response = await this.client.messages.create({
                model: "claude-3-sonnet-20240229",
                max_tokens: 1024,
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: input
                    }
                ]
            });

            return response.content[0].type === 'text'
                ? response.content[0].text
                : 'Unable to process response';
        } catch (error) {
            console.error('Error generating contextual response:', error);
            return `I'm sorry, I encountered an error while processing your request. ${error instanceof Error ? error.message : ''}`;
        }
    }

    private async buildUserContext(userId: string): Promise<any> {
        try {
            // Get user preferences
            const user = await mongoose.model('User').findById(userId);

            // Get recent calendar events
            const now = new Date();
            const pastDate = new Date(now);
            pastDate.setDate(now.getDate() - 7);
            const futureDate = new Date(now);
            futureDate.setDate(now.getDate() + 7);

            const recentEvents = await mongoose.model('Event').find({
                userId,
                startTime: { $gte: pastDate, $lte: futureDate }
            }).sort({ startTime: 1 }).limit(5);

            return {
                workingHours: user?.preferences?.workingHours,
                defaultMeetingDuration: user?.preferences?.defaultMeetingDuration || 30,
                recentEvents: recentEvents.map(event => ({
                    title: event.title,
                    startTime: event.startTime,
                    endTime: event.endTime
                }))
            };
        } catch (error) {
            console.error('Error building user context:', error);
            return null;
        }
    }

    /**
     * 
     *StreamResponse method for streaming response from Claude
     */

    async streamResponse(input: string, options?: ParseCommandOptions): Promise<AsyncIterable<string>> {
        try {
            // Get user context
            const userId = options?.userId;
            const userContext = userId ? await this.buildUserContext(userId) : null;

            // Build context-aware prompt
            const currentTime = new Date();
            const userTimezone = await this.getUserTimezone(userId);

            // Get conversation context
            let conversationContext = '';
            if (options?.previousMessages && options.previousMessages.length > 0) {
                conversationContext = options.previousMessages
                    .slice(-5) // Use last 5 messages for context
                    .map(msg => `${msg.role}: ${msg.content}`)
                    .join('\n');
            }

            // Create enhanced system prompt with context
            const systemPrompt = `You are an intelligent assistant with the following context:
      
  CURRENT CONTEXT:
  Time: ${currentTime.toISOString()}
  Timezone: ${userTimezone}
  Day: ${currentTime.toLocaleDateString('en-US', { weekday: 'long' })}
  
  ${userContext ? `USER CONTEXT:
  Working hours: ${userContext.workingHours?.start || 'Unknown'} to ${userContext.workingHours?.end || 'Unknown'}
  Preferred meeting duration: ${userContext.defaultMeetingDuration || 30} minutes
  Recent calendar events: ${userContext.recentEvents?.map((e: { title: string }) => e.title).join(', ') || 'None'}` : ''}
  
  PREVIOUS CONVERSATION:
  ${conversationContext}
  
  Respond in a helpful, concise manner. For calendar operations, extract specific details about dates, times, and event information.`;

            // Stream response with Claude
            const stream = await this.client.messages.create({
                model: "claude-3-sonnet-20240229",
                max_tokens: 1024,
                stream: true,
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: input
                    }
                ]
            });

            // Return the stream for controller to handle
            return {
                [Symbol.asyncIterator]: async function* () {
                    for await (const chunk of stream) {
                        if (chunk.type === 'content_block_delta' &&
                            'text' in chunk.delta &&
                            chunk.delta.text) {
                            yield chunk.delta.text;
                        }
                    }
                }
            };
        } catch (error) {
            console.error('Error streaming response:', error);
            return {
                [Symbol.asyncIterator]: async function* () {
                    yield `I'm sorry, I encountered an error while processing your request. ${error instanceof Error ? error.message : ''}`;
                }
            };
        }
    }
}

export default new NLPService(GoogleCalendarService);