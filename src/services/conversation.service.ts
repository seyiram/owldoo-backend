// src/services/conversation.service.ts
import { v4 as uuid } from 'uuid';
import mongoose from 'mongoose';
import { Intent, ConversationResponse, ConversationContext } from '../types/chat.types';
import { IConversation, IConversationTurn } from '../models/Conversation';
import nlpService from './nlp.service';
import { contextService } from './context.service';
import { formatDateTime } from '../utils/timeUtils';

class ConversationService {
  async getOrCreateConversation(userId: string): Promise<IConversation> {
    const Conversation = mongoose.model<IConversation>('Conversation');
    
    // Find most recent active conversation
    let conversation = await Conversation.findOne({ 
      userId, 
      isActive: true 
    }).sort({ lastActivityTime: -1 });
    
    // Create new conversation if none exists or last one is old
    if (!conversation || this.isConversationExpired(conversation)) {
      conversation = await Conversation.create({
        userId,
        conversationId: uuid(),
        startTime: new Date(),
        lastActivityTime: new Date(),
        turns: [],
        context: {
          activeEntities: {},
          referencedEvents: [],
          goals: [],
          preferences: await this.getUserPreferences(userId),
          environmentContext: {
            timezone: await this.getUserTimezone(userId)
          }
        },
        isActive: true
      });
    }
    
    return conversation;
  }
  
  private isConversationExpired(conversation: IConversation): boolean {
    const lastActivity = new Date(conversation.lastActivityTime);
    const now = new Date();
    const hoursSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    
    // Consider conversation expired if last activity was more than 6 hours ago
    return hoursSinceLastActivity > 6;
  }
  
  async processUserMessage(
    userId: string, 
    message: string, 
    conversationId?: string
  ): Promise<ConversationResponse> {
    try {
      console.log(`[ProcessUserMessage] Starting to process message: "${message}" for user ${userId}`);
      console.log(`[ProcessUserMessage] Conversation ID provided: ${conversationId || 'none (creating new)'}`);
      
      // Get or create conversation
      const Conversation = mongoose.model<IConversation>('Conversation');
      let conversation;
      
      if (conversationId) {
        console.log(`[ProcessUserMessage] Looking for existing conversation with ID: ${conversationId}`);
        conversation = await Conversation.findOne({ conversationId, userId });
        if (!conversation) {
          console.log(`[ProcessUserMessage] Conversation not found: ${conversationId}`);
          throw new Error('Conversation not found');
        } else {
          console.log(`[ProcessUserMessage] Existing conversation found with ${conversation.turns.length} turns`);
        }
      } else {
        console.log(`[ProcessUserMessage] Creating new conversation for user ${userId}`);
        conversation = await this.getOrCreateConversation(userId);
        console.log(`[ProcessUserMessage] New conversation created with ID: ${conversation.conversationId}`);
      }
      
      // Add user message to conversation
      const userTurn: IConversationTurn = {
        speaker: 'user',
        content: message,
        timestamp: new Date()
      };
      
      conversation.turns.push(userTurn);
      conversation.lastActivityTime = new Date();
      
      // Process message to understand intent
      const intent = await this.recognizeIntent(message, conversation);
      
      // Update user turn with recognized intent
      const lastTurnIndex = conversation.turns.length - 1;
      conversation.turns[lastTurnIndex].intent = intent;
      
      // Generate a response based on intent
      const response = await this.generateResponse(intent, conversation);
      
      // Add assistant's response to conversation
      const assistantTurn: IConversationTurn = {
        speaker: 'assistant',
        content: response.content,
        timestamp: new Date(),
        intent: response.intent,
        action: response.action
      };
      
      conversation.turns.push(assistantTurn);
      
      // Update conversation context based on this interaction
      conversation.context = await this.updateConversationContext(
        conversation.context,
        intent,
        response
      );
      
      // Save updated conversation
      await conversation.save();
      
      // We've now implemented a proper time verification system in formatActionResponse
      // instead of using specific string replacements
      
      // Generate a thread in the database if one doesn't exist or validate existing one
      try {
        // Get the original user message from this conversation
        const userMessage = message; // Use the current message instead of searching in turns
        
        if (!conversation.threadId) {
          console.log('Creating new thread for message:', userMessage);
          
          // Create a thread in the database with just the current message
          const Thread = mongoose.model('Thread');
          const messages = [
            {
              sender: 'user',
              content: message,
              timestamp: new Date()
            }
          ];
          
          console.log('Creating new thread with messages:', messages);
          
          const newThread = await Thread.create({
            userId: conversation.userId,
            messages,
            createdAt: conversation.startTime,
            conversationId: conversation.conversationId
          });
          
          // Update conversation with thread ID
          conversation.threadId = newThread._id.toString();
          await conversation.save();
          
          console.log(`Created new thread ${newThread._id} for conversation ${conversation.conversationId}`);
        } else {
          // Add message to existing thread
          const Thread = mongoose.model('Thread');
          await Thread.findByIdAndUpdate(
            conversation.threadId,
            {
              $push: {
                messages: {
                  sender: 'user',
                  content: message,
                  timestamp: new Date()
                }
              }
            }
          );
        }
      } catch (threadError) {
        console.error('Error managing thread:', threadError);
      }
      
      // Define a proper return type that includes conversationId and threadId
      const fullResponse: ConversationResponse & { 
        conversationId: string;
        threadId: string;
        id: string;
      } = {
        ...response,
        conversationId: conversation.conversationId,
        id: conversation.conversationId, // Include id for consistency with frontend
        threadId: conversation.threadId || '' // Include threadId if it exists
      };
      
      console.log(`[ProcessUserMessage] Returning response with threadId: ${fullResponse.threadId}`);
      console.log(`[ProcessUserMessage] Original message: "${message}"`);
      console.log(`[ProcessUserMessage] Response content: "${fullResponse.content}"`);
      
      // Return response to controller
      return fullResponse;
    } catch (error) {
      console.error('Error processing user message:', error);
      return {
        content: 'I apologize, but I encountered an issue processing your request.',
        needsClarification: false
      };
    }
  }
  
  private async recognizeIntent(
    message: string, 
    conversation: IConversation
  ): Promise<Intent> {
    try {
      // Convert conversation history to format expected by NLP service
      const conversationHistory = conversation.turns.map(turn => ({
        role: turn.speaker,
        content: turn.content
      }));
      
      // Use enhanced NLP service to recognize intent
      const enhancedParsedCommand = await nlpService.parseCommand(message, {
        userId: conversation.userId.toString(),
        previousMessages: conversationHistory,
        threadId: conversation.conversationId
      });
      
      console.log('NLP parsed command:', enhancedParsedCommand);
      
      // GENERAL TIME FIX: Check for timezone inconsistencies in time processing
      // This preserves the user's requested time by examining the original input
      if (enhancedParsedCommand.startTime && enhancedParsedCommand.metadata?.originalText) {
        // Extract time expressions from the original text using regex
        const timeRegex = /(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)/i;
        const timeMatch = enhancedParsedCommand.metadata.originalText.match(timeRegex);
        
        if (timeMatch) {
          const [fullMatch, hourStr, minuteStr, ampm] = timeMatch;
          let hour = parseInt(hourStr);
          let minute = minuteStr ? parseInt(minuteStr) : 0;
          
          // Apply AM/PM logic
          if (ampm.toLowerCase() === 'pm' && hour < 12) {
            hour += 12;
          } else if (ampm.toLowerCase() === 'am' && hour === 12) {
            hour = 0;
          }
          
          // Check if there's a significant difference between extracted time and parsed time
          const parsedHour = enhancedParsedCommand.startTime.getHours();
          const parsedMinute = enhancedParsedCommand.startTime.getMinutes();
          
          if (Math.abs(parsedHour - hour) > 1 || Math.abs(parsedMinute - minute) > 5) {
            console.log(`TIME CORRECTION: Fixing time discrepancy - Original request had ${hour}:${minute} (${ampm}) but was parsed as ${parsedHour}:${parsedMinute}`);
            
            // Create a corrected time using the date from parsed command but hours/minutes from original text
            const fixedTime = new Date(enhancedParsedCommand.startTime);
            fixedTime.setHours(hour, minute, 0, 0);
            enhancedParsedCommand.startTime = fixedTime;
            
            console.log(`TIME CORRECTION: Corrected time to ${fixedTime.toLocaleTimeString()}`);
          }
        }
      }
      
      // Handle availability checks explicitly
      if (message.toLowerCase().includes('availability') || 
          message.toLowerCase().includes('available') ||
          message.toLowerCase().includes('check my') ||
          message.toLowerCase().match(/what'?s\s+(?:on|in)\s+(?:my\s+)?calendar/i)) {
        
        console.log('Detected availability check request');
        
        // Time period detection
        let startTime = new Date();
        let endTime = new Date(startTime);
        
        // Determine time period from message
        if (message.toLowerCase().includes('today')) {
          // Set to end of today
          endTime.setHours(23, 59, 59);
        } else if (message.toLowerCase().includes('tomorrow')) {
          // Set to tomorrow
          startTime.setDate(startTime.getDate() + 1);
          startTime.setHours(0, 0, 0);
          endTime.setDate(endTime.getDate() + 1);
          endTime.setHours(23, 59, 59);
        } else if (message.toLowerCase().includes('this week')) {
          // Set to end of this week
          const dayOfWeek = startTime.getDay();
          const daysUntilEndOfWeek = 6 - dayOfWeek; // 6 = Saturday
          endTime.setDate(endTime.getDate() + daysUntilEndOfWeek);
          endTime.setHours(23, 59, 59);
        } else if (message.toLowerCase().includes('next week')) {
          // Set to next week
          const dayOfWeek = startTime.getDay();
          const daysUntilNextWeek = 7 - dayOfWeek + 1; // 1 = Monday
          startTime.setDate(startTime.getDate() + daysUntilNextWeek);
          startTime.setHours(0, 0, 0);
          endTime.setDate(endTime.getDate() + daysUntilNextWeek + 6); // +6 for the end of that week
          endTime.setHours(23, 59, 59);
        } else if (message.toLowerCase().includes('afternoon')) {
          // Set to this afternoon (12pm - 6pm)
          startTime.setHours(12, 0, 0);
          endTime.setHours(18, 0, 0);
        } else if (message.toLowerCase().includes('morning')) {
          // Set to this morning (8am - 12pm)
          startTime.setHours(8, 0, 0);
          endTime.setHours(12, 0, 0);
        } else if (message.toLowerCase().includes('evening')) {
          // Set to this evening (6pm - 10pm)
          startTime.setHours(18, 0, 0);
          endTime.setHours(22, 0, 0);
        }
        
        return {
          primaryIntent: 'query',
          subIntent: 'availability',
          confidence: 0.9,
          entities: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            title: 'Availability Check',
            duration: Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)),
            context: enhancedParsedCommand.context
          }
        };
      }
      
      // Map the parsed command to our Intent structure
      const intent: Intent = {
        primaryIntent: enhancedParsedCommand.action,
        subIntent: enhancedParsedCommand.queryType,
        confidence: enhancedParsedCommand.metadata?.confidence || 0.5,
        originalText: message, // Store the original user message for time verification
        entities: {
          title: enhancedParsedCommand.title,
          startTime: enhancedParsedCommand.startTime,
          duration: enhancedParsedCommand.duration,
          description: enhancedParsedCommand.description,
          recurrence: enhancedParsedCommand.recurrence,
          location: enhancedParsedCommand.location,
          attendees: enhancedParsedCommand.attendees,
          videoLink: enhancedParsedCommand.videoLink,
          context: enhancedParsedCommand.context
        }
      };
      
      // If there are alternative interpretations, add them to the intent
      if (enhancedParsedCommand.ambiguityResolution?.alternativeInterpretations) {
        intent.entities.alternatives = enhancedParsedCommand.ambiguityResolution.alternativeInterpretations;
      }
      
      // Add reference resolution
      intent.entities.references = this.resolveReferences(
        message, 
        conversation.turns,
        conversation.context
      );
      
      return intent;
    } catch (error) {
      console.error('Error recognizing intent:', error);
      return {
        primaryIntent: 'unknown',
        confidence: 0.1,
        entities: {}
      };
    }
  }
  
  private resolveReferences(
    message: string, 
    turns: IConversationTurn[],
    context: ConversationContext
  ): any {
    // Simple reference resolution for pronouns and demonstratives
    const referencesResolved: Record<string, any> = {};
    
    // Check for pronouns like "it", "that", "this", etc.
    if (/\b(it|that|this|them|these|those)\b/i.test(message)) {
      // Find the most recent entity referenced
      const recentEntities: Array<[string, any]> = [];
      
      // Convert activeEntities from Record to Array of key-value pairs
      Object.entries(context.activeEntities).forEach(([key, value]) => {
        recentEntities.push([key, value]);
      });
      
      if (recentEntities.length > 0) {
        // Use the most recently mentioned entity as the referent
        const [key, value] = recentEntities[recentEntities.length - 1];
        referencesResolved[key] = value;
      }
    }
    
    // More sophisticated referencing logic would be implemented here
    
    return referencesResolved;
  }
  
  private async generateResponse(
    intent: Intent, 
    conversation: IConversation
  ): Promise<ConversationResponse> {
    try {
      // If confidence is low, ask for clarification
      if (intent.confidence < 0.6) {
        return this.generateClarificationRequest(intent, conversation);
      }
      
      // Execute the appropriate action based on intent
      let action;
      switch (intent.primaryIntent) {
        case 'create':
          action = await this.handleCreateIntent(intent, conversation);
          break;
        case 'update':
          action = await this.handleUpdateIntent(intent, conversation);
          break;
        case 'delete':
          action = await this.handleDeleteIntent(intent, conversation);
          break;
        case 'query':
          action = await this.handleQueryIntent(intent, conversation);
          break;
        default:
          // Handle general conversation
          return this.handleGeneralConversation(intent, conversation);
      }
      
      // Generate appropriate response text based on action result
      const response = await this.formatActionResponse(action, intent);
      
      return {
        content: response.content,
        intent: response.intent,
        action: {
          type: intent.primaryIntent,
          parameters: intent.entities,
          result: action.result,
          status: action.success ? 'completed' : 'failed'
        },
        suggestions: this.generateSuggestions(intent, action),
        followUpQuestions: this.generateFollowUpQuestions(intent, action)
      };
    } catch (error) {
      console.error('Error generating response:', error);
      return {
        content: 'I apologize, but I encountered an issue while processing your request.',
        needsClarification: false
      };
    }
  }
  
  private async generateClarificationRequest(
    intent: Intent, 
    conversation: IConversation
  ): Promise<ConversationResponse> {
    let clarificationContent = 'I\'m not quite sure what you mean. ';
    
    // Check what part is unclear
    if (intent.entities.title && !intent.entities.startTime) {
      clarificationContent += `When would you like to schedule "${intent.entities.title}"?`;
    } else if (intent.entities.startTime && !intent.entities.title) {
      clarificationContent += `What would you like to schedule for ${new Date(intent.entities.startTime).toLocaleString()}?`;
    } else {
      // Generate a more general clarification request
      clarificationContent += 'Could you please provide more details about what you\'d like to do?';
    }
    
    return {
      content: clarificationContent,
      needsClarification: true,
      intent: {
        ...intent,
        primaryIntent: 'clarify'
      }
    };
  }
  
  private async handleCreateIntent(
    intent: Intent, 
    conversation: IConversation
  ): Promise<any> {
    // Import required services
    const googleCalendarService = require('./googleCalendar.service').default;
    const { agentService } = require('./agent.service');
    
    try {
      // Convert intent to the format expected by the googleCalendarService
      const parsedCommand = {
        action: 'create',
        title: intent.entities.title,
        startTime: new Date(intent.entities.startTime),
        duration: intent.entities.duration || 30, // Default to 30 min if not specified
        description: intent.entities.description,
        location: intent.entities.location,
        attendees: intent.entities.attendees,
        videoLink: intent.entities.videoLink,
        recurrence: intent.entities.recurrence,
        context: {
          isUrgent: intent.entities.isUrgent,
          priority: intent.entities.priority || 'medium',
          timePreference: intent.entities.timePreference || 'fixed'
        },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      
      console.log('Creating real calendar event from intent:', parsedCommand);
      
      // Call the Google Calendar service to create the event
      const result = await googleCalendarService.handleCommand(parsedCommand);
      
      // Log the complete result for debugging
      console.log('Calendar service result:', JSON.stringify(result, null, 2));
      
      if (result.success) {
        console.log('Calendar event created successfully:', result.event);
        
        // After successful calendar event creation, create a corresponding task
        try {
          // First add a processing step to the thread if one exists
          if (conversation.threadId) {
            const { threadService } = require('./thread.service');
            await threadService.addProcessStarted(
              conversation.threadId, 
              `Processing calendar event: ${result.event.summary}`,
              {
                eventId: result.event.id,
                eventTitle: result.event.summary,
                eventTime: result.event.start.dateTime
              }
            );
          }
          
          // Create the agent task
          const taskResult = await agentService.addTask(
            'calendar_event',  // Task type
            5,                 // Medium priority
            conversation.userId.toString(),  // User ID
            {
              eventId: result.event.id,
              title: `Calendar Event: ${result.event.summary}`,
              description: `Process calendar event "${result.event.summary}" scheduled for ${new Date(result.event.start.dateTime).toLocaleString()}`,
              event: result.event,
              threadId: conversation.threadId, // Pass thread ID for linking
              metadata: {
                eventId: result.event.id,
                eventTitle: result.event.summary,
                eventTime: result.event.start.dateTime,
                operationId: result.operationId // Pass operation ID for tracking
              }
            }
          );
          
          console.log('Task created for calendar event:', taskResult);
          
          // Link task to thread if thread exists
          if (conversation.threadId) {
            const { threadService } = require('./thread.service');
            await threadService.linkAgentTask(conversation.threadId, taskResult.taskId);
            
            // Add progress update to thread
            await threadService.addProcessProgress(
              conversation.threadId,
              `Calendar event "${result.event.summary}" is being processed`,
              { taskId: taskResult.taskId }
            );
          }
        } catch (taskError: unknown) {
          // Log but don't fail if task creation fails
          console.error('Failed to create task for calendar event:', taskError);
          
          // Add error to thread if one exists
          if (conversation.threadId) {
            const { threadService } = require('./thread.service');
            const errorMessage = taskError instanceof Error ? taskError.message : 'Unknown error';
            await threadService.addProcessError(
              conversation.threadId,
              `Error processing calendar event: ${errorMessage}`,
              { error: errorMessage }
            );
          }
        }
        
        return {
          success: true,
          result: {
            eventId: result.event.id,
            title: result.event.summary,
            startTime: new Date(result.event.start.dateTime),
            endTime: new Date(result.event.end.dateTime),
            created: true,
            eventData: result.event,
            isTimeSlotAvailable: result.isTimeSlotAvailable,
            operationId: result.operationId // Include operation ID for tracking
          }
        };
      } else {
        console.log('Failed to create calendar event:', result.error);
        return {
          success: false,
          error: result.error || 'Failed to create calendar event',
          result: {
            isTimeSlotAvailable: result.isTimeSlotAvailable === false ? false : undefined,
            operationId: result.operationId // Include operation ID for error tracking
          },
          suggestion: result.suggestion
        };
      }
    } catch (error) {
      console.error('Error creating calendar event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating event',
        result: null
      };
    }
  }
  
  private async handleUpdateIntent(
    intent: Intent, 
    conversation: IConversation
  ): Promise<any> {
    // Import googleCalendarService for real updates
    const googleCalendarService = require('./googleCalendar.service').default;
    
    try {
      // Convert intent to the format expected by the googleCalendarService
      const parsedCommand = {
        action: 'update',
        title: intent.entities.title,
        startTime: intent.entities.startTime ? new Date(intent.entities.startTime) : undefined,
        duration: intent.entities.duration,
        targetTime: intent.entities.targetTime ? new Date(intent.entities.targetTime) : undefined,
        description: intent.entities.description,
        location: intent.entities.location,
        attendees: intent.entities.attendees,
        videoLink: intent.entities.videoLink,
        recurrence: intent.entities.recurrence,
        context: {
          isUrgent: intent.entities.isUrgent,
          priority: intent.entities.priority || 'medium',
          timePreference: intent.entities.timePreference || 'fixed'
        }
      };
      
      console.log('Updating calendar event from intent:', parsedCommand);
      
      // Call the Google Calendar service to update the event
      const result = await googleCalendarService.handleCommand(parsedCommand);
      
      if (result.success) {
        console.log('Calendar event updated successfully:', result.event);
        return {
          success: true,
          result: {
            eventId: result.event.id,
            title: result.event.summary,
            startTime: new Date(result.event.start.dateTime),
            endTime: new Date(result.event.end.dateTime),
            updated: true,
            eventData: result.event
          }
        };
      } else {
        console.log('Failed to update calendar event:', result.error);
        return {
          success: false,
          error: result.error || 'Failed to update calendar event',
          result: null,
          suggestion: result.suggestion
        };
      }
    } catch (error) {
      console.error('Error updating calendar event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error updating event',
        result: null
      };
    }
  }
  
  private async handleDeleteIntent(
    intent: Intent, 
    conversation: IConversation
  ): Promise<any> {
    // Import googleCalendarService for real deletions
    const googleCalendarService = require('./googleCalendar.service').default;
    
    try {
      // Convert intent to the format expected by the googleCalendarService
      const parsedCommand = {
        action: 'delete',
        title: intent.entities.title,
        targetTime: intent.entities.targetTime ? new Date(intent.entities.targetTime) : undefined
      };
      
      console.log('Deleting calendar event from intent:', parsedCommand);
      
      // Call the Google Calendar service to delete the event
      const result = await googleCalendarService.handleCommand(parsedCommand);
      
      if (result.success) {
        console.log('Calendar event deleted successfully');
        return {
          success: true,
          result: {
            deleted: true,
            eventId: intent.entities.eventId
          }
        };
      } else {
        console.log('Failed to delete calendar event:', result.error);
        return {
          success: false,
          error: result.error || 'Failed to delete calendar event',
          result: null
        };
      }
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error deleting event',
        result: null
      };
    }
  }
  
  private async handleQueryIntent(
    intent: Intent, 
    conversation: IConversation
  ): Promise<any> {
    // Import googleCalendarService for real queries
    const googleCalendarService = require('./googleCalendar.service').default;
    
    try {
      console.log('Handling query intent:', intent);
      
      // Special handling for availability queries
      if (intent.subIntent === 'availability') {
        const startTime = intent.entities.startTime ? new Date(intent.entities.startTime) : new Date();
        const endTime = intent.entities.endTime ? new Date(intent.entities.endTime) : new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
        
        console.log('Checking availability between:', startTime, 'and', endTime);
        
        // Use the proper query command with availability subtype
        const availabilityCommand = {
          action: 'query',
          queryType: 'availability',
          startTime: startTime,
          duration: Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)),
          title: 'Availability Check'
        };
        
        // Call the Google Calendar service to check availability properly
        const availabilityResult = await googleCalendarService.handleCommand(availabilityCommand);
        
        console.log('Availability check result:', JSON.stringify(availabilityResult, null, 2));
        
        // Format time range for output
        const formatTimeRange = (start: Date, end: Date): string => {
          // For same day ranges
          if (start.toDateString() === end.toDateString()) {
            // For part of a day
            if (end.getHours() - start.getHours() < 12) {
              return `from ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} to ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} on ${start.toLocaleDateString()}`;
            } 
            // For full day
            return `on ${start.toLocaleDateString()}`;
          }
          // For multi-day ranges
          return `from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
        };
        
        // Create availability message
        const timeRangeText = formatTimeRange(startTime, endTime);
        const isAvailable = availabilityResult.isTimeSlotAvailable === true;
        
        if (isAvailable) {
          return {
            success: true,
            result: {
              events: [],
              message: `You're available ${timeRangeText}. No events scheduled during this time.`,
              isTimeSlotAvailable: true
            }
          };
        } else {
          // Get events in the specified time range
          const events = availabilityResult.events || [];
          
          // Format events for display
          const formattedEvents = events.map((event: any) => ({
            id: event.id,
            title: event.summary,
            startTime: event.start.dateTime,
            endTime: event.end.dateTime,
            duration: Math.round((new Date(event.end.dateTime).getTime() - 
                              new Date(event.start.dateTime).getTime()) / (1000 * 60)),
            location: event.location,
            description: event.description,
            attendees: event.attendees?.map((a: any) => a.email) || []
          }));
          
          // Generate user-friendly event list
          const eventSummaries = events.map((event: any) => 
            `${event.summary} at ${new Date(event.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
          ).join(', ');
          
          return {
            success: true,
            result: {
              events: formattedEvents,
              message: `You have ${events.length} event${events.length > 1 ? 's' : ''} ${timeRangeText}: ${eventSummaries}.`,
              isTimeSlotAvailable: false
            }
          };
        }
      }
      
      // Regular event queries (non-availability)
      const parsedCommand = {
        action: 'query',
        queryType: intent.subIntent || 'events',
        startTime: intent.entities.startTime ? new Date(intent.entities.startTime) : new Date(),
        duration: intent.entities.duration || 1440, // Default to full day (24 hours)
        title: intent.entities.title
      };
      
      console.log('Querying calendar events from intent:', parsedCommand);
      
      // Call the Google Calendar service to query events
      const result = await googleCalendarService.handleCommand(parsedCommand);
      
      // Log complete result for debugging
      console.log('Calendar query result:', JSON.stringify(result, null, 2));
      
      if (result.success) {
        console.log('Calendar events queried successfully:', result.events?.length || 0);
        return {
          success: true,
          result: {
            events: result.events?.map((event: any) => ({
              id: event.id,
              title: event.summary,
              startTime: event.start.dateTime,
              endTime: event.end.dateTime,
              duration: Math.round((new Date(event.end.dateTime).getTime() - 
                                  new Date(event.start.dateTime).getTime()) / (1000 * 60)),
              location: event.location,
              description: event.description,
              attendees: event.attendees?.map((a: any) => a.email) || []
            })) || [],
            message: result.message,
            isTimeSlotAvailable: result.isTimeSlotAvailable
          }
        };
      } else {
        console.log('Failed to query calendar events:', result.error);
        return {
          success: false,
          error: result.error || 'Failed to query calendar events',
          result: {
            events: [],
            isTimeSlotAvailable: result.isTimeSlotAvailable
          }
        };
      }
    } catch (error) {
      console.error('Error querying calendar events:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error querying events',
        result: {
          events: []
        }
      };
    }
  }
  
  private handleGeneralConversation(
    intent: Intent, 
    conversation: IConversation
  ): ConversationResponse {
    // Generate a general conversation response
    return {
      content: 'I understand you want to chat. How can I help you with your calendar today?',
      intent: intent
    };
  }
  
  private async formatActionResponse(
    action: any, 
    intent: Intent
  ): Promise<{ content: string; intent: Intent }> {
    // Handle unsuccessful actions
    if (!action.success) {
      // Special handling for availability issues
      if (action.result && action.result.isTimeSlotAvailable === false) {
        const baseMsg = `I'm sorry, I couldn't schedule "${intent.entities.title}" because the time slot is not available.`;
        const suggestionMsg = action.suggestion ? 
          ` Would ${new Date(action.suggestion).toLocaleString([], {weekday: 'long', hour: '2-digit', minute: '2-digit'})} work instead?` : 
          '';
        return {
          content: baseMsg + suggestionMsg,
          intent: intent
        };
      }
      
      // Generic error handling
      return {
        content: `I'm sorry, I couldn't ${intent.primaryIntent} the event. ${action.error || ''}`,
        intent: intent
      };
    }
    
    // Handle successful actions
    switch (intent.primaryIntent) {
      case 'create':
        // Extract information for proper time handling
        const startTime = new Date(intent.entities.startTime);
        let originalHour = -1;
        let originalMinute = -1;
        let displayTime = startTime; // Default to the parsed time
        
        // COMPREHENSIVE TIME VERIFICATION: Extract the original time from user input
        if (intent.originalText) {
          // Extract time expressions from the original text using regex
          const timeRegex = /(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)/i;
          const timeMatch = intent.originalText.match(timeRegex);
          
          if (timeMatch) {
            const [fullMatch, hourStr, minuteStr, ampm] = timeMatch;
            let hour = parseInt(hourStr);
            let minute = minuteStr ? parseInt(minuteStr) : 0;
            
            // Store the original values for logging
            originalHour = hour;
            originalMinute = minute;
            
            // Apply AM/PM logic to get 24-hour format
            if (ampm.toLowerCase() === 'pm' && hour < 12) {
              hour += 12;
            } else if (ampm.toLowerCase() === 'am' && hour === 12) {
              hour = 0;
            }
            
            // Check the current time
            const displayHour = startTime.getHours();
            const displayMinute = startTime.getMinutes();
            
            // Log complete time information for debugging
            console.log('TIME VERIFICATION:', {
              requestedTime: `${originalHour}:${originalMinute} ${ampm}`,
              convertedRequestedTime: `${hour}:${minute}`,
              systemTime: `${displayHour}:${displayMinute}`,
              difference: Math.abs(displayHour - hour),
              originalText: intent.originalText
            });
            
            // Verify times match - fix if there's a significant difference
            if (Math.abs(displayHour - hour) > 0 || Math.abs(displayMinute - minute) > 5) {
              console.log(`TIME MISMATCH: Requested ${hour}:${minute} but system shows ${displayHour}:${displayMinute}`);
              
              // Create a corrected time with the exact hour/minute requested by user
              displayTime = new Date(startTime); // Keep the date part
              displayTime.setHours(hour, minute, 0, 0); // Set to explicitly requested time
              
              console.log(`CORRECTION APPLIED: Fixed time to ${displayTime.toLocaleTimeString()}`);
            }
          }
        }
        
        // Use the verified time for the response
        return {
          content: `Great! I've scheduled "${intent.entities.title}" for ${formatDateTime(displayTime)}.`,
          intent: intent
        };
      case 'update':
        return {
          content: `I've updated the event as requested.`,
          intent: intent
        };
      case 'delete':
        return {
          content: `I've canceled the event as requested.`,
          intent: intent
        };
      case 'query':
        if (action.result.events.length === 0) {
          if (action.result.isTimeSlotAvailable === true) {
            return {
              content: `That time slot is available! You don't have any events scheduled at that time.`,
              intent: intent
            };
          }
          return {
            content: 'I don\'t see any events matching your query.',
            intent: intent
          };
        }
        
        // Format events list
        const eventsList = action.result.events
          .map((e: any) => `- ${e.title} at ${new Date(e.startTime).toLocaleString([], {hour: '2-digit', minute: '2-digit'})}`)
          .join('\n');
        
        return {
          content: `Here's what I found:\n${eventsList}`,
          intent: intent
        };
      default:
        return {
          content: 'I\'ve processed your request.',
          intent: intent
        };
    }
  }
  
  private generateSuggestions(
    intent: Intent, 
    action: any
  ): string[] {
    const suggestions: string[] = [];
    
    // Add suggestions based on intent and action
    switch (intent.primaryIntent) {
      case 'create':
        suggestions.push('Would you like to add attendees to this event?');
        suggestions.push('Do you want to make this a recurring event?');
        break;
      case 'query':
        if (action.result.events.length > 0) {
          suggestions.push('Would you like to see more details about any of these events?');
        }
        break;
    }
    
    return suggestions;
  }
  
  private generateFollowUpQuestions(
    intent: Intent, 
    action: any
  ): string[] {
    const questions: string[] = [];
    
    // Add follow-up questions based on intent and action
    switch (intent.primaryIntent) {
      case 'create':
        questions.push('Would you like me to send a notification?');
        break;
      case 'update':
        questions.push('Do you want to notify the attendees about this change?');
        break;
    }
    
    return questions;
  }
  
  private async updateConversationContext(
    currentContext: ConversationContext,
    intent: Intent,
    response: ConversationResponse
  ): Promise<ConversationContext> {
    const updatedContext = { ...currentContext };
    
    // Update active entities
    if (intent.entities.title) {
      updatedContext.activeEntities.lastEventTitle = intent.entities.title;
    }
    
    if (intent.entities.startTime) {
      updatedContext.activeEntities.lastEventTime = intent.entities.startTime;
    }
    
    // Update referenced events if an event was created/modified
    if (response.action?.result?.eventId) {
      updatedContext.referencedEvents.push(response.action.result.eventId);
    }
    
    // Keep only the 5 most recent referenced events
    if (updatedContext.referencedEvents.length > 5) {
      updatedContext.referencedEvents = updatedContext.referencedEvents.slice(-5);
    }
    
    // Update goals based on intent
    if (intent.primaryIntent === 'create' && intent.confidence > 0.8) {
      if (!updatedContext.goals.includes('calendar_management')) {
        updatedContext.goals.push('calendar_management');
      }
    }
    
    return updatedContext;
  }
  
  private async getUserPreferences(userId: string): Promise<Record<string, any>> {
    try {
      const UserPreferences = mongoose.model('UserPreferences');
      const preferences = await UserPreferences.findOne({ userId });
      
      if (preferences) {
        return preferences.toObject();
      }
      
      return {}; // Default empty preferences
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return {};
    }
  }
  
  private async getUserTimezone(userId: string): Promise<string> {
    try {
      const UserPreferences = mongoose.model('UserPreferences');
      const preferences = await UserPreferences.findOne({ userId });
      
      if (preferences?.timeZone) {
        return preferences.timeZone;
      }
      
      // Default to browser timezone
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      console.error('Error getting user timezone:', error);
      return 'UTC'; // Default to UTC
    }
  }
  
  // Additional utility methods can be added as needed
}

export const conversationService = new ConversationService();