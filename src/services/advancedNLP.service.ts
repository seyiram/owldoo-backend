import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { 
  NLPContext, 
  IntentAnalysis, 
  UserQuery, 
  NLPResponse, 
  ScheduleParameters,
  Entity
} from '../types/nlp.types';
import mongoose from 'mongoose';
import { NLPLog } from '../models/NLPLog';

/**
 * Advanced NLP service with enhanced intent detection and context reasoning
 */
export class AdvancedNLPService {
  private client: any; // Anthropic SDK client
  private readonly VERSION = '1.0.0';
  
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
  }
  
  /**
   * Analyze user input with deep contextual understanding
   * @param input User's raw text input
   * @param context Optional context object with conversation history, preferences, etc.
   * @returns Detailed intent analysis with entities and context
   */
  async analyzeIntent(input: string, context?: NLPContext): Promise<IntentAnalysis> {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    try {
      // Create enhanced system prompt with context
      const systemPrompt = this.createSystemPrompt(context);
      
      // Log request
      await this.logNLPOperation({
        requestId,
        type: 'INTENT_ANALYSIS',
        input,
        context: context ? JSON.stringify(context) : undefined,
        timestamp: new Date(),
      });
      
      // Make LLM request with retry logic
      const response = await this.retry(async () => {
        return await this.client.messages.create({
          model: "claude-3-sonnet-20240229",
          max_tokens: 1000,
          temperature: 0,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Analyze this request with deep contextual understanding:
              
              "${input}"
              
              Provide a detailed analysis in JSON format with the following structure:
              
              {
                "primaryIntent": string, // One of: "CREATE", "UPDATE", "DELETE", "QUERY", "ANALYZE", "RECOMMEND"
                "secondaryIntents": string[],
                "entities": {
                  "people": Entity[], // Each Entity has {type, value, normalized, confidence}
                  "times": Entity[],
                  "dates": Entity[],
                  "locations": Entity[],
                  "events": Entity[],
                  "durations": Entity[]
                },
                "temporalContext": {
                  "timeframe": string, // "PAST", "PRESENT", "FUTURE"
                  "specificity": string, // "EXACT", "APPROXIMATE", "RELATIVE"
                  "reference": string // ISO date string if applicable
                },
                "implicitConstraints": string[],
                "requiredClarifications": string[],
                "urgencyLevel": string, // "HIGH", "MEDIUM", "LOW"
                "confidenceScores": object, // Key-value pairs
                "ambiguityAnalysis": {
                  "alternateInterpretations": string[],
                  "resolutionStrategy": string
                }
              }
              
              Focus on deep understanding, including implicit constraints and context.`
            }
          ]
        });
      }, 3);
      
      // Extract and parse JSON response
      const jsonResponse = this.extractJSONFromResponse(response);
      
      // Convert any ISO date strings to Date objects
      if (jsonResponse.temporalContext?.reference) {
        jsonResponse.temporalContext.reference = new Date(jsonResponse.temporalContext.reference);
      }
      
      // Format and validate the response
      const formattedResponse = this.validateIntentAnalysis(jsonResponse);
      
      // Log successful response
      await this.logNLPOperation({
        requestId,
        type: 'INTENT_ANALYSIS_SUCCESS',
        output: JSON.stringify(formattedResponse),
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
      });
      
      return formattedResponse;
    } catch (error) {
      // Log error
      await this.logNLPOperation({
        requestId,
        type: 'INTENT_ANALYSIS_ERROR',
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
      });
      
      throw error;
    }
  }
  
  /**
   * Generate a contextual response with reasoning
   * @param query User query with intent analysis and context
   * @returns Generated response with reasoning
   */
  async generateResponse(query: UserQuery): Promise<NLPResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    try {
      // Log request
      await this.logNLPOperation({
        requestId,
        type: 'RESPONSE_GENERATION',
        input: query.rawText,
        context: JSON.stringify(query),
        timestamp: new Date(),
      });
      
      // Create system prompt
      const systemPrompt = `You are an assistant for calendaring and scheduling with deep contextual understanding. 
      Use the provided intent analysis and context to generate an appropriate, helpful response.
      You should tailor your response based on the detected intent and any available user preferences.`;
      
      // Make LLM request
      const response = await this.retry(async () => {
        return await this.client.messages.create({
          model: "claude-3-sonnet-20240229",
          max_tokens: 1000,
          temperature: 0.2, // Slightly higher temperature for more natural responses
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Generate a helpful response to the following user query.
              
              Raw query: "${query.rawText}"
              
              Intent analysis: ${JSON.stringify(query.intentAnalysis)}
              
              User context: ${JSON.stringify(query.context)}
              
              Return your response in JSON format:
              {
                "suggestedResponse": string, // Natural language response to the user
                "extractedParameters": object, // Scheduling parameters if applicable
                "confidence": number, // 0-1 confidence in the response
                "reasoningProcess": string // Explanation of your thinking process (for debugging)
              }`
            }
          ]
        });
      }, 3);
      
      // Extract and parse JSON response
      const jsonResponse = this.extractJSONFromResponse(response);
      
      // Create formatted response
      const nlpResponse: NLPResponse = {
        input: query.rawText,
        analysis: query.intentAnalysis,
        suggestedResponse: jsonResponse.suggestedResponse,
        extractedParameters: jsonResponse.extractedParameters,
        confidence: jsonResponse.confidence
      };
      
      // Log successful response
      await this.logNLPOperation({
        requestId,
        type: 'RESPONSE_GENERATION_SUCCESS',
        output: JSON.stringify({
          suggestedResponse: jsonResponse.suggestedResponse,
          confidence: jsonResponse.confidence
        }),
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
      });
      
      return nlpResponse;
    } catch (error) {
      // Log error
      await this.logNLPOperation({
        requestId,
        type: 'RESPONSE_GENERATION_ERROR',
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
      });
      
      throw error;
    }
  }
  
  /**
   * Extract detailed scheduling parameters from user input
   * @param input User input text
   * @param context Optional context object
   * @returns Structured scheduling parameters
   */
  async extractSchedulingParameters(input: string, context?: NLPContext): Promise<ScheduleParameters> {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    try {
      // Log request
      await this.logNLPOperation({
        requestId,
        type: 'PARAMETER_EXTRACTION',
        input,
        context: context ? JSON.stringify(context) : undefined,
        timestamp: new Date(),
      });
      
      // Create system prompt
      const systemPrompt = `You are an expert calendar scheduling assistant.
      Extract detailed scheduling parameters from the user input.
      ${context ? `Use the following context for reference: ${JSON.stringify(context)}` : ''}`;
      
      // Make LLM request
      const response = await this.retry(async () => {
        return await this.client.messages.create({
          model: "claude-3-sonnet-20240229",
          max_tokens: 1000,
          temperature: 0,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Extract detailed scheduling parameters from this request:
              
              "${input}"
              
              Return your extraction in JSON format matching this ScheduleParameters type:
              {
                "title": string,
                "startTime": string, // ISO date string
                "endTime": string, // ISO date string (optional)
                "duration": number, // in minutes (optional)
                "location": string, // optional
                "participants": string[], // optional
                "priority": "HIGH" | "MEDIUM" | "LOW",
                "flexibility": "EXACT" | "FLEXIBLE" | "ANYTIME",
                "recurrence": { // optional
                  "pattern": "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
                  "interval": number,
                  "endDate": string, // ISO date string (optional)
                  "count": number // optional
                },
                "isAllDay": boolean,
                "reminderTime": number, // minutes before event (optional)
                "notes": string, // optional
                "constraints": string[] // optional
              }
              
              Be comprehensive and precise in your extraction. Handle complex time expressions and implicit information.`
            }
          ]
        });
      }, 3);
      
      // Extract and parse JSON response
      const jsonResponse = this.extractJSONFromResponse(response);
      
      // Convert date strings to Date objects
      if (jsonResponse.startTime) {
        const originalStartTimeString = jsonResponse.startTime;
        jsonResponse.startTime = new Date(jsonResponse.startTime);
        
        // DEBUG: Print the time conversion details to help debug timezone issues
        console.log('DEBUG: Time conversion in advancedNLP:', {
          input: input,
          originalTimeString: originalStartTimeString,
          convertedDate: jsonResponse.startTime.toString(),
          hours: jsonResponse.startTime.getHours(),
          minutes: jsonResponse.startTime.getMinutes()
        });
        
        // Special fix: Check if the time might have been interpreted incorrectly when converting
        // This finds the pattern "4pm to 5pm" in the input and matches it against the parsed time
        const timePattern = /(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i;
        const timeMatch = input.toLowerCase().match(timePattern);
        
        if (timeMatch) {
          // Extract the requested hour from the input
          const [_, reqHourStr, reqMinStr, ampm] = timeMatch;
          let requestedHour = parseInt(reqHourStr);
          
          // Convert to 24-hour
          if (ampm === 'pm' && requestedHour < 12) {
            requestedHour += 12;
          } else if (ampm === 'am' && requestedHour === 12) {
            requestedHour = 0;
          }
          
          // Compare with the actual hour in the Date object
          const parsedHour = jsonResponse.startTime.getHours();
          
          // If there's a 6-hour difference (common UTC<->local), fix it
          if (Math.abs(parsedHour - requestedHour) === 6) {
            console.warn(`DEBUG: Time shift detected! Requested ${requestedHour}:00 but got ${parsedHour}:00. Fixing.`);
            jsonResponse.startTime.setHours(requestedHour);
          }
        }
      }
      
      if (jsonResponse.endTime) {
        jsonResponse.endTime = new Date(jsonResponse.endTime);
      }
      if (jsonResponse.recurrence?.endDate) {
        jsonResponse.recurrence.endDate = new Date(jsonResponse.recurrence.endDate);
      }
      
      // Check calendar availability directly if we have a start time
      if (jsonResponse.startTime) {
        try {
          // Dynamically import googleCalendarService to avoid circular dependencies
          const googleCalendarService = require('./googleCalendar.service').default;
          
          // Calculate end time based on duration or default to 30 minutes
          const endTime = jsonResponse.endTime || 
            new Date(jsonResponse.startTime.getTime() + 
                    (jsonResponse.duration || 30) * 60 * 1000);
          
          console.log('Checking availability during parameter extraction:', {
            startTime: jsonResponse.startTime,
            endTime: endTime
          });
          
          // Check availability for the time slot
          const isAvailable = await googleCalendarService.checkAvailability(
            jsonResponse.startTime,
            endTime
          );
          
          // Add availability information to the response
          jsonResponse.isTimeSlotAvailable = isAvailable;
          
          console.log('Availability check result:', isAvailable);
        } catch (availabilityError) {
          console.error('Error checking availability during parameter extraction:', availabilityError);
          // Don't fail the whole function if availability check fails
        }
      }
      
      // Log successful response
      await this.logNLPOperation({
        requestId,
        type: 'PARAMETER_EXTRACTION_SUCCESS',
        output: JSON.stringify(jsonResponse),
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
      });
      
      return jsonResponse;
    } catch (error) {
      // Log error
      await this.logNLPOperation({
        requestId,
        type: 'PARAMETER_EXTRACTION_ERROR',
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
        timestamp: new Date(),
      });
      
      throw error;
    }
  }
  
  /**
   * Resolve ambiguity in user queries by asking clarifying questions
   * @param query The ambiguous user query
   * @param options Possible interpretations
   * @returns Clarification question and options
   */
  async generateClarificationQuestion(
    query: string, 
    ambiguities: string[]
  ): Promise<{ question: string; options: string[] }> {
    const systemPrompt = `You are an expert at resolving ambiguity in user queries.
    Generate a clear, concise clarification question to resolve uncertainty.`;
    
    const response = await this.client.messages.create({
      model: "claude-3-haiku-20240307", // Using smaller model for faster response
      max_tokens: 250,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `This query is ambiguous: "${query}"
          
          Possible interpretations:
          ${ambiguities.map((a, i) => `${i + 1}. ${a}`).join('\n')}
          
          Generate a clear, concise question to clarify the user's intent, and refine the options into simple choices.
          
          Return your response in JSON:
          {
            "question": string, // The clarification question
            "options": string[] // 2-5 clear options for the user to choose from
          }`
        }
      ]
    });
    
    return this.extractJSONFromResponse(response);
  }
  
  // Helper methods
  
  /**
   * Create enhanced system prompt with context
   */
  private createSystemPrompt(context?: NLPContext): string {
    let prompt = `You are an advanced natural language understanding system specializing in calendar and scheduling requests.
    Your goal is to extract detailed intent, entities, and context from user input.
    You excel at understanding ambiguous requests and implicit information.`;
    
    if (context) {
      // Add time context if available
      if (context.currentDateTime) {
        prompt += `\n\nCURRENT CONTEXT:
        Current time: ${context.currentDateTime.toISOString()}
        `;
      } else {
        // Use current time if not provided in the context
        prompt += `\n\nCURRENT CONTEXT:
        Current time: ${new Date().toISOString()}
        `;
      }
      
      // Add user preferences
      if (context.userPreferences) {
        prompt += `\n\nUSER PREFERENCES:`;
        
        // Check if workingHours exists
        if (context.userPreferences.workingHours) {
          prompt += `\nWorking hours: ${context.userPreferences.workingHours.start || '9:00'} to ${context.userPreferences.workingHours.end || '17:00'}`;
        }
        
        // Check if defaultMeetingDuration exists
        if (context.userPreferences.defaultMeetingDuration) {
          prompt += `\nDefault meeting duration: ${context.userPreferences.defaultMeetingDuration} minutes`;
        }
        
        // Check if preferredMeetingTimes exists and is an array
        if (context.userPreferences.preferredMeetingTimes && Array.isArray(context.userPreferences.preferredMeetingTimes)) {
          prompt += `\nPreferred meeting times: ${context.userPreferences.preferredMeetingTimes.join(', ')}`;
        }
        
        // Check if timeZone exists
        if (context.userPreferences.timeZone) {
          prompt += `\nTime zone: ${context.userPreferences.timeZone}`;
        }
        
        prompt += '\n';
      }
      
      // Add recent calendar events
      if (context.recentCalendarEvents && context.recentCalendarEvents.length > 0) {
        prompt += `\n\nRECENT CALENDAR EVENTS:`;
        
        // Safely extract event information
        const eventDescriptions = context.recentCalendarEvents.slice(0, 5).map(event => {
          try {
            const summary = event.summary || 'Untitled Event';
            const startDateTime = event.start && event.start.dateTime ? new Date(event.start.dateTime).toLocaleString() : 'Unknown start';
            const endDateTime = event.end && event.end.dateTime ? new Date(event.end.dateTime).toLocaleString() : 'Unknown end';
            return `- ${summary}: ${startDateTime} to ${endDateTime}`;
          } catch (error) {
            console.warn('Error formatting calendar event:', error);
            return `- Event data unavailable`;
          }
        });
        
        prompt += `\n${eventDescriptions.join('\n')}\n`;
      }
      
      // Add conversation history
      if (context.conversationHistory && Array.isArray(context.conversationHistory) && context.conversationHistory.length > 0) {
        prompt += `\n\nRECENT CONVERSATION:`;
        
        // Safely extract conversation messages
        const conversationLines = context.conversationHistory.slice(-5).map(msg => {
          try {
            const sender = msg.sender || 'unknown';
            const content = msg.content || '';
            return `${sender}: ${content}`;
          } catch (error) {
            console.warn('Error formatting conversation message:', error);
            return '';
          }
        }).filter(line => line !== ''); // Remove any empty lines
        
        if (conversationLines.length > 0) {
          prompt += `\n${conversationLines.join('\n')}\n`;
        }
      }
    }
    
    return prompt;
  }
  
  /**
   * Extract JSON from LLM response
   */
  private extractJSONFromResponse(response: any): any {
    try {
      // Log the raw response to understand its structure
      console.log('Raw response structure:', JSON.stringify(response).substring(0, 200) + '...');

      // Extract text from content blocks
      let text = '';
      if (response && response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === 'text') {
            text += block.text;
          }
        }
      } else if (typeof response === 'string') {
        // Handle case where response might be raw text
        text = response;
      } else if (response && typeof response.text === 'string') {
        // Some APIs return text property directly
        text = response.text;
      }
      
      // Log the extracted text for debugging
      console.log('Extracted text (first 200 chars):', text.substring(0, 200) + '...');
      
      // STRATEGY 1: Look for JSON in code blocks (most reliable method)
      const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
      let codeBlockMatches = Array.from(text.matchAll(codeBlockRegex));
      
      for (const codeMatch of codeBlockMatches) {
        if (codeMatch && codeMatch[1]) {
          const codeContent = codeMatch[1].trim();
          try {
            return JSON.parse(codeContent);
          } catch (codeBlockError) {
            console.warn('Failed to parse JSON from code block, will try next strategy');
          }
        }
      }
      
      // STRATEGY 2: Find the largest JSON object pattern match
      // This tries to find complete JSON objects from largest to smallest
      const jsonMatches = [];
      let openBraces = 0;
      let jsonStart = -1;
      
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
          if (openBraces === 0) {
            jsonStart = i;
          }
          openBraces++;
        } else if (text[i] === '}') {
          openBraces--;
          if (openBraces === 0 && jsonStart !== -1) {
            jsonMatches.push(text.substring(jsonStart, i + 1));
            jsonStart = -1;
          }
        }
      }
      
      // Sort matches by length (largest first - most likely to be complete)
      jsonMatches.sort((a, b) => b.length - a.length);
      
      // Try to parse each match
      for (const jsonStr of jsonMatches) {
        try {
          return JSON.parse(jsonStr);
        } catch (e) {
          // Try to fix common JSON errors before giving up
          try {
            // Replace single quotes with double quotes (only in keys and string values)
            const fixedJson = jsonStr
              // Fix unquoted or single-quoted property names
              .replace(/([{,]\s*)(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '$1"$3":')
              // Fix single-quoted string values
              .replace(/:\s*'([^']*)'/g, ':"$1"')
              // Remove trailing commas in objects and arrays
              .replace(/,(\s*[}\]])/g, '$1');
            
            return JSON.parse(fixedJson);
          } catch (fixError) {
            console.warn('Failed to parse fixed JSON, trying next match');
          }
        }
      }
      
      // STRATEGY 3: If all else fails, try to reconstruct the object from keys and values we can find
      console.warn('All JSON parse attempts failed, attempting to reconstruct object');
      
      // Look for known keys in our schema
      const primaryIntentMatch = text.match(/["']?primaryIntent["']?\s*:\s*["']([^"']+)["']/);
      const timeframeMatch = text.match(/["']?timeframe["']?\s*:\s*["']([^"']+)["']/);
      
      if (primaryIntentMatch || timeframeMatch) {
        // We found some keys, construct a basic object
        const reconstructed: Record<string, any> = {
          primaryIntent: primaryIntentMatch ? primaryIntentMatch[1] : 'QUERY',
          secondaryIntents: [],
          entities: {
            people: [],
            times: [],
            dates: [],
            locations: [],
            events: [],
            durations: []
          },
          temporalContext: {
            timeframe: timeframeMatch ? timeframeMatch[1] : 'PRESENT',
            specificity: 'APPROXIMATE'
          },
          implicitConstraints: [],
          requiredClarifications: [],
          urgencyLevel: 'MEDIUM',
          confidenceScores: {},
          ambiguityAnalysis: {
            alternateInterpretations: [],
            resolutionStrategy: ''
          }
        };
        
        console.log('Reconstructed object from text patterns:', reconstructed);
        return reconstructed;
      }
      
      // If we truly can't find anything, return a default object instead of throwing
      return {
        primaryIntent: 'QUERY',
        secondaryIntents: [],
        entities: { people: [], times: [], dates: [], locations: [], events: [], durations: [] },
        temporalContext: { timeframe: 'PRESENT', specificity: 'APPROXIMATE' },
        implicitConstraints: [],
        requiredClarifications: [],
        urgencyLevel: 'MEDIUM',
        confidenceScores: {},
        ambiguityAnalysis: { alternateInterpretations: [], resolutionStrategy: '' }
      };
    } catch (error) {
      console.error('Error extracting JSON from response:', error);
      // Return a default object instead of throwing so the UI doesn't break
      return {
        primaryIntent: 'QUERY',
        secondaryIntents: [],
        entities: { people: [], times: [], dates: [], locations: [], events: [], durations: [] },
        temporalContext: { timeframe: 'PRESENT', specificity: 'APPROXIMATE' },
        implicitConstraints: [],
        requiredClarifications: [],
        urgencyLevel: 'MEDIUM',
        confidenceScores: {},
        ambiguityAnalysis: { alternateInterpretations: [], resolutionStrategy: '' }
      };
    }
  }
  
  /**
   * Validate intent analysis response
   */
  private validateIntentAnalysis(analysis: any): IntentAnalysis {
    // Handle malformed responses
    if (!analysis || typeof analysis !== 'object') {
      console.warn('Analysis is not a valid object:', analysis);
      analysis = {};
    }
    
    // Set default primaryIntent if missing
    if (!analysis.primaryIntent) {
      console.warn('Missing primaryIntent in analysis, using default');
      analysis.primaryIntent = 'QUERY';
    }
    
    // Ensure proper formatting with defaults for all fields
    const intentAnalysis: IntentAnalysis = {
      primaryIntent: analysis.primaryIntent,
      secondaryIntents: Array.isArray(analysis.secondaryIntents) ? analysis.secondaryIntents : [],
      entities: {
        people: this.formatEntities(analysis.entities?.people || []),
        times: this.formatEntities(analysis.entities?.times || []),
        dates: this.formatEntities(analysis.entities?.dates || []),
        locations: this.formatEntities(analysis.entities?.locations || []),
        events: this.formatEntities(analysis.entities?.events || []),
        durations: this.formatEntities(analysis.entities?.durations || [])
      },
      temporalContext: {
        timeframe: analysis.temporalContext?.timeframe || 'PRESENT',
        specificity: analysis.temporalContext?.specificity || 'APPROXIMATE',
        reference: analysis.temporalContext?.reference
      },
      implicitConstraints: Array.isArray(analysis.implicitConstraints) ? analysis.implicitConstraints : [],
      requiredClarifications: Array.isArray(analysis.requiredClarifications) ? analysis.requiredClarifications : [],
      urgencyLevel: analysis.urgencyLevel || 'MEDIUM',
      confidenceScores: analysis.confidenceScores || {},
      ambiguityAnalysis: {
        alternateInterpretations: Array.isArray(analysis.ambiguityAnalysis?.alternateInterpretations) 
          ? analysis.ambiguityAnalysis.alternateInterpretations 
          : [],
        resolutionStrategy: analysis.ambiguityAnalysis?.resolutionStrategy || ''
      }
    };
    
    return intentAnalysis;
  }
  
  /**
   * Format entity objects
   */
  private formatEntities(entities: any[]): Entity[] {
    return entities.map(entity => ({
      type: entity.type,
      value: entity.value,
      normalized: entity.normalized,
      confidence: entity.confidence || 0.8
    }));
  }
  
  /**
   * Retry mechanism with exponential backoff
   */
  private async retry<T>(operation: () => Promise<T>, maxRetries = 3, baseDelay = 500): Promise<T> {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
        lastError = error;
        
        // Calculate delay with exponential backoff and jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  /**
   * Log NLP operations to database
   */
  private async logNLPOperation(data: {
    requestId: string;
    type: string;
    input?: string;
    output?: string;
    context?: string;
    error?: string;
    processingTime?: number;
    timestamp: Date;
  }): Promise<void> {
    try {
      await NLPLog.create({
        ...data,
        version: this.VERSION
      });
    } catch (error) {
      console.error('Error logging NLP operation:', error);
      // Non-blocking - we don't want logging errors to break the main functionality
    }
  }
}

export const advancedNLPService = new AdvancedNLPService();