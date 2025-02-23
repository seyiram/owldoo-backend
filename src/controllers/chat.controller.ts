import { Request, Response } from 'express';
import Thread from '../models/Thread';
import nlpService from '../services/nlp.service';
import { IUser } from '../models/User';

interface AuthenticatedRequest extends Request {
    user?: IUser;
}


// Create a new thread
export const createThread = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { message } = req.body;
       
        if(!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userId = req.user.id;

        // Get response from NLP service
        const parsedCommand = await nlpService.parseCommand(message);

        // Create a new thread with initial messages
        const thread = await Thread.create({
            userId,
            messages: [
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
            ]
        });

        res.status(201).json({
            threadId: thread._id,
            message: JSON.stringify(parsedCommand)
        });
    } catch (error) {
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
        const previousMessages = thread.messages.map(msg =>({
            role: msg.sender,
            content: msg.content
        }))

        // Get response from NLP service
        const parsedCommand = await nlpService.parseCommand(message, {
            previousMessages,
            threadId
        });

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
                content: JSON.stringify(parsedCommand),
                timestamp: new Date().toISOString(),
            }
        );

        await thread.save();
        res.status(201).json({ message: JSON.stringify(parsedCommand) });
    } catch (error) {
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

        const thread = await Thread.findOne({ _id: threadId, userId });
        if (!thread) {
            return res.status(404).json({ error: 'Thread not found' });
        }

        res.json(thread);
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch thread'
        });
    }
};