import { Request, Response } from 'express';
import Thread from '../models/Thread';
import nlpService from '../services/nlp.service';
import { IUser } from '../models/User';

interface AuthenticatedRequest extends Request {
    user?: IUser & { userId?: string; id?: string };
}

// Create a new thread
export const createThread = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { message } = req.body;
       
        if(!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userId = req.user.id;

        // Log the incoming message for debugging
        console.log(`Creating new thread with user message: "${message}"`);

        // Get response from NLP service
        const parsedCommand = await nlpService.parseCommand(message);
        
        // Log the parsed command
        console.log(`Parsed command result:`, JSON.stringify(parsedCommand, null, 2));

        // Create a new thread with initial messages
        const messageArray = [
            {
                sender: 'user',
                content: message,
                timestamp: new Date().toISOString(),
            },
            {
                sender: 'bot',
                content: JSON.stringify(parsedCommand),
                timestamp: new Date().toISOString(),
            }
        ];
        
        console.log(`Creating thread with messages:`, JSON.stringify(messageArray, null, 2));
        
        const thread = await Thread.create({
            userId,
            messages: messageArray
        });

        console.log(`Thread created with ID: ${thread._id}, first message: "${message}"`);

        res.status(201).json({
            threadId: thread._id,
            message: JSON.stringify(parsedCommand)
        });
    } catch (error) {
        console.error('Error creating thread:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to create thread'
        });
    }
};

// Add a message to a thread
export const addMessage = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { threadId, message } = req.body;
        if(!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userId = req.user.id;

        const thread = await Thread.findOne({ _id: threadId, userId });
        if (!thread) {
            return res.status(404).json({ error: 'Thread not found' });
        }

        // Get previous messages for context
        const previousMessages = thread.messages.map(msg => ({
            role: msg.sender,
            content: msg.content
        }));

        // Get response from NLP service with enhanced context
        const parsedCommand = await nlpService.parseCommand(message, {
            previousMessages,
            threadId,
            userId
        });

        // Log the parsed command for debugging
        console.log('Parsed command in chat controller:', JSON.stringify(parsedCommand, null, 2));

        // The controller knows this is a scheduling message and schedules through calendar service
        let responseContent = parsedCommand;
        
        // Check if this is a calendar command that needs to be executed
        if (parsedCommand.action && 
            (parsedCommand.action === 'create' || 
             parsedCommand.action === 'update' || 
             parsedCommand.action === 'delete' || 
             parsedCommand.action === 'query')) {
            
            try {
                // Import and use the Google Calendar service to execute the command
                const googleCalendarService = require('../services/googleCalendar.service').default;
                console.log('Executing calendar command:', parsedCommand.action);
                
                // Log detailed information about the event times for debugging
                if (parsedCommand.action === 'create') {
                    console.log('CALENDAR EVENT DEBUG: Creating event with these parameters:', {
                        title: parsedCommand.title,
                        startTime: parsedCommand.startTime.toString(),
                        startHour: parsedCommand.startTime.getHours(),
                        startMinute: parsedCommand.startTime.getMinutes(),
                        duration: parsedCommand.duration,
                        endTimeCalculated: new Date(parsedCommand.startTime.getTime() + (parsedCommand.duration * 60 * 1000)).toString()
                    });
                }
                
                // Execute the command using the calendar service
                const calendarResult = await googleCalendarService.handleCommand(parsedCommand);
                console.log('Calendar command result:', calendarResult);
                
                // Update the response with the result of the calendar operation
                if (calendarResult.success) {
                    responseContent = {
                        ...parsedCommand,
                        result: calendarResult,
                        message: calendarResult.message || 'Calendar event processed successfully',
                        success: true,
                        created: true
                    };
                } else {
                    responseContent = {
                        ...parsedCommand,
                        result: calendarResult,
                        message: calendarResult.error || 'Failed to process calendar event',
                        success: false,
                        suggestion: calendarResult.suggestion
                    };
                }
            } catch (calendarError) {
                console.error('Error executing calendar command:', calendarError);
                responseContent = {
                    ...parsedCommand,
                    error: calendarError instanceof Error ? calendarError.message : 'Calendar service error',
                    success: false
                };
            }
        }
        // Check for availability information (for when a command isn't executed directly)
        else if (parsedCommand.isTimeSlotAvailable === false) {
            // Add availability information to the response
            responseContent = {
                ...parsedCommand,
                message: `The time slot at ${new Date(parsedCommand.startTime).toLocaleString()} is not available. Please choose another time.`
            };
        } else if (parsedCommand.isTimeSlotAvailable === true) {
            // Confirm the time slot is available
            responseContent = {
                ...parsedCommand,
                message: `The time slot at ${new Date(parsedCommand.startTime).toLocaleString()} is available.`
            };
        }

        // Add both user message and bot response
        thread.messages.push(
            {
                id: userId.toString(), 
                sender: 'user',
                content: message,
                timestamp: new Date().toISOString(),
            },
            {
                id: userId.toString(),
                sender: 'bot',
                content: JSON.stringify(responseContent),
                timestamp: new Date().toISOString(),
            }
        );

        await thread.save();
        res.status(201).json({ message: JSON.stringify(responseContent) });
    } catch (error) {
        console.error('Error in addMessage:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to add message'
        });
    }
};

// Get all threads for a user
export const getThreads = async (req: AuthenticatedRequest, res: Response) => {
    try {

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userId = req.user.id;
        const threads = await Thread.find({ userId }).sort({ createdAt: -1 });
        res.json(threads);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch threads'
        });

    }
};

// Get a specific thread
export const getThread = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { threadId } = req.params;
        const userId = req.user.id;

        // Use the updated thread service to get thread with processing steps
        const { threadService } = require('../services/thread.service');
        const thread = await threadService.getThreadWithProcessing(threadId);
        
        if (!thread || thread.userId.toString() !== userId) {
            return res.status(404).json({ error: 'Thread not found' });
        }
        
        // Log thread contents for debugging
        console.log(`Retrieved thread ${threadId} with ${thread.messages.length} messages`);
        if (thread.messages.length > 0) {
            console.log('First user message:', thread.messages.find((m: any) => m.sender === 'user')?.content);
        }
        
        // Log processing steps if present
        if (thread.processingSteps && thread.processingSteps.length > 0) {
            console.log(`Thread has ${thread.processingSteps.length} processing steps`);
        } else {
            console.log('Thread has no processing steps');
        }

        res.json(thread);
    } catch (error) {
        console.error('Error getting thread:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch thread'
        });
    }
};

// Stream responses from the bot
export const streamResponse = async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { threadId } = req.params;
        const userId = req.user.id;

        const thread = await Thread.findOne({ _id: threadId, userId });
        if (!thread) {
            return res.status(404).json({ error: 'Thread not found' });
        }

        // Use the streamResponse method from nlpService
        const responseStream = await nlpService.streamResponse('Your input here', {
            userId,
            previousMessages: thread.messages.map(msg => ({
                role: msg.sender,
                content: msg.content
            }))
        });

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        for await (const chunk of responseStream) {
            res.write(`data: ${chunk}\n\n`);
        }

        res.end();
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to stream response'
        });
    }
};