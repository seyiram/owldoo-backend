import Anthropic from '@anthropic-ai/sdk';
import { MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources';
import { ParsedCommand } from '../types/calendar.types';


class NLPService {
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || '',
        });
    }

    async parseCommand(input: string): Promise<ParsedCommand> {
        try {
            const anthroParsedCommand = await this.parseWithAnthropic(input);
            return anthroParsedCommand;
        } catch (error) {
            console.warn('Anthropic API failed, falling back to regex-based parser:', error);
            const regexParsedCommand = this.parseWithRegex(input);
            return regexParsedCommand;
        }
    }

    private async parseWithAnthropic(input: string): Promise<ParsedCommand> {
        const messages: MessageParam[] = [
            {
                role: "assistant",
                content: [
                    {
                        type: 'text',
                        text: `You are an AI assistant specialized in parsing calendar events. 
    Your task is to extract event details from natural language and return them in a strict JSON format.
    
    Current time context: ${new Date().toISOString()}
    Current timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
    
    Guidelines for parsing:
    1. For relative times like "tomorrow", "next week", calculate them based on the current time
    2. If no specific time is mentioned, assume 9:00 AM
    3. If no duration is specified, assume 30 minutes
    4. For recurring events, use iCal RRULE format (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR")
    5. Extract location details if mentioned
    6. Identify attendees if mentioned
    7. If a time is ambiguous (e.g., "5"), interpret it based on context and common business hours
    
    Required fields in JSON response:
    - title: Clear, concise event title
    - startTime: ISO datetime string
    - duration: Length in minutes
    - description: Brief event description
    - isRecurring: boolean
    
    Optional fields:
    - location: Physical or virtual location
    - attendees: Array of names/emails
    - recurringPattern: iCal RRULE string
    - videoConference: boolean (true if virtual meeting)`,
                    } as ContentBlock,
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
            system: `Extract calendar event details from natural language input.
        Required fields: title, startTime (ISO string), duration (minutes)
        Optional fields: description, location, attendees (array), isRecurring (boolean), recurringPattern
        Return only valid JSON.`,
        });

        if (!response.content || response.content.length === 0) {
            throw new Error('No response from Claude');
        }

        let text = '';
        for (const block of response.content) {
            if (block.type === 'text' && 'text' in block) {
                text += block.text;
            }
        }

        if (!text) {
            throw new Error('No text content found in response');
        }

        const parsedResponse = JSON.parse(text);
        parsedResponse.startTime = new Date(parsedResponse.startTime);

        if (!this.validateParsedCommand(parsedResponse)) {
            throw new Error('Invalid parsed command structure');
        }

        return parsedResponse;
    }

    private parseWithRegex(input: string): ParsedCommand {
        const patterns = {
            time: /at\s+(\d{1,2}(?::\d{2})?(?:am|pm)?)/i,
            duration: /for\s+(\d+)\s*(?:hour|hr|hours|mins|minutes)/i,
            date: /(?:today|tomorrow|next|on)\s+(\w+)/i,
        };

        const title = input.split(/schedule|create|add|set up/i)[1]?.split(/at|on|for/i)[0]?.trim() || 'Untitled Event';

        const timeMatch = input.match(patterns.time);
        const dateMatch = input.match(patterns.date);
        const durationMatch = input.match(patterns.duration);
        const duration = durationMatch ? parseInt(durationMatch[1]) * 60 : 60;

        const startTime = new Date();
        if (dateMatch && dateMatch[1].toLowerCase() === 'tomorrow') {
            startTime.setDate(startTime.getDate() + 1);
        }


        if (timeMatch) {
            const timeString = timeMatch[1]; // Extract the matched time string
            const [hour, minutePart] = timeString.split(':');
            let hours = parseInt(hour);
            let minutes = minutePart ? parseInt(minutePart) : 0;

            // Handle AM/PM
            if (timeString.toLowerCase().includes('pm') && hours < 12) {
                hours += 12;
            } else if (timeString.toLowerCase().includes('am') && hours === 12) {
                hours = 0;
            }

            startTime.setHours(hours, minutes, 0, 0); // Set the extracted time
        }

        return {
            title,
            startTime,
            duration,
            description: input,
        };
    }

    private validateParsedCommand(command: ParsedCommand): boolean {
        const requiredFields = ['title', 'startTime', 'duration'] as const;

        for (const field of requiredFields) {
            if (!command[field]) {
                console.error(`Missing required field: ${field}`);
                return false;
            }
        }

        if (!(command.startTime instanceof Date) || isNaN(command.startTime.getTime())) {
            console.error('Invalid startTime');
            return false;
        }

        if (typeof command.duration !== 'number' || command.duration <= 0) {
            console.error('Invalid duration');
            return false;
        }

        if (command.attendees && !Array.isArray(command.attendees)) {
            console.error('Invalid attendees format');
            return false;
        }

        return true;
    }
}

export default new NLPService();
