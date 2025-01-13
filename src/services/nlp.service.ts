import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';
import { ParsedCommand, TimeDefaults, EnhancedParsedCommand, Context, Recurrence } from '../types/calendar.types';



class NLPService {
    private client: Anthropic;
    private timeDefaults: TimeDefaults;
    private readonly VERSION = '2.0.0';

    constructor() {
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
    }

    async parseCommand(input: string): Promise<EnhancedParsedCommand> {
        try {
            const anthroParsedCommand = await this.parseWithAnthropic(input);

            // If confidence is low but regex might work better
            if (anthroParsedCommand.confidence &&
                anthroParsedCommand.confidence < 0.7 &&
                this.hasSimplePattern(input)) {
                const regexParsedCommand = this.parseWithRegex(input);
                return regexParsedCommand.confidence! > anthroParsedCommand.confidence
                    ? regexParsedCommand
                    : anthroParsedCommand;
            }

            return anthroParsedCommand;
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

    private async parseWithAnthropic(input: string): Promise<EnhancedParsedCommand> {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const currentTime = new Date();

        const messages: MessageParam[] = [
            {
                role: "assistant",
                content: [
                    {
                        type: 'text',
                        text: `You are a calendar event parser specialized in understanding natural language and handling edge cases.
    
    CURRENT CONTEXT:
    Time: ${currentTime.toISOString()}
    Timezone: ${userTimezone}
    Day: ${currentTime.toLocaleDateString('en-US', { weekday: 'long' })}
    
    COMMAND INTERPRETATION GUIDELINES:
    
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
            system: `Parse calendar commands and return structured JSON. Handle time ranges crossing midnight correctly. Ensure all times are in ISO format with timezone. For ranges like "3pm to 1:30am", calculate the full duration including the next day.`,
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
                    confidence: parsedResponse.confidence || 0
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
        const { startTime, timeConfidence } = this.parseDateTime(input, patterns);

        // Parse duration with context awareness
        const duration = this.parseDuration(input, patterns);

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
            duration,
            description: input,
            queryType,
            confidence,
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
        // Remove time-related phrases from the title
        const timePattern = /(?:from|at|on)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i;
        const cleanedInput = input.replace(timePattern, '').trim();

        // Remove common scheduling words
        const schedulingWords = /(?:schedule|create|add|set up|book)\s+/i;
        const finalTitle = cleanedInput.replace(schedulingWords, '').trim();

        return finalTitle || 'Untitled Event';
    }

    private parseDateTime(input: string, patterns: Record<string, RegExp>): { startTime: Date; timeConfidence: number; duration?: number } {
        const startTime = new Date();
        let timeConfidence = 0.8;

        // Handle relative dates
        if (/tomorrow|tmr|tmrw|next day/i.test(input)) {
            startTime.setDate(startTime.getDate() + 1);
            timeConfidence = 0.9;
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

                // Handle cases where end time is on the next day
                if (endHours < hours || (endHours === hours && endMinutes < minutes)) {
                    endHours += 24;
                }

                // Calculate duration in minutes
                const durationMinutes = ((endHours - hours) * 60) + (endMinutes - minutes);

                return {
                    startTime,
                    timeConfidence,
                    duration: durationMinutes > 0 ? durationMinutes : this.timeDefaults.defaultDuration
                };
            }
        }
        return { startTime, timeConfidence, duration: this.timeDefaults.defaultDuration };
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
        const isUrgent = patterns.urgency.test(input);
        const flexMatch = input.match(patterns.flexibility);
        const isFlexible = flexMatch ? !flexMatch[0].includes('must be') : true;

        return {
            isUrgent,
            isFlexible,
            priority: isUrgent ? 'high' : 'normal',
            timePreference: input.includes('exactly') ? 'exact' :
                isFlexible ? 'flexible' : 'approximate'
        };
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
        const date = new Date(isoString);
        return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
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
}

export default new NLPService();