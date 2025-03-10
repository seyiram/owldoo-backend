import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { agentService } from '../services/agent.service';
import { advancedNLPService } from '../services/advancedNLP.service';
import { Task } from '../types/nlp.types';
import AgentTask from '../models/AgentTask';
import Suggestion from '../models/Suggestion';
import Insight from '../models/Insight';
import { IUser } from '../models/User';
// Import the context service for getting user context
import { contextService } from '../services/context.service';

// Define an interface for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: IUser & { userId?: string; id?: string };
}

export const executeTask = async (req: Request, res: Response) => {
  try {
    const { description, type, parameters, priority } = req.body;
    
    // Validate required fields
    if (!description || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: description and type are required'
      });
    }
    
    // Create task object
    const task: Task = {
      id: uuidv4(),
      description,
      type: type,
      parameters: parameters || {},
      priority: priority || 5,
      deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
      context: req.body.context || {}
    };
    
    // Execute task
    const result = await agentService.executeTask(task);
    
    return res.status(200).json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error executing task:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const streamTaskExecution = async (req: Request, res: Response) => {
  try {
    const { description, type, parameters, priority } = req.body;
    
    // Validate required fields
    if (!description || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: description and type are required'
      });
    }
    
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Create task object
    const task: Task = {
      id: uuidv4(),
      description,
      type: type,
      parameters: parameters || {},
      priority: priority || 5,
      deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
      context: req.body.context || {}
    };
    
    // Send task creation event
    res.write(`data: ${JSON.stringify({ type: 'TASK_CREATED', task })}\n\n`);
    
    // Create ExecutionPlan monitoring
    const plan = await agentService.executeTask(task);
    
    // Send final result event
    res.write(`data: ${JSON.stringify({ type: 'TASK_COMPLETE', result: plan })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error in streaming task execution:', error);
    // Send error event
    res.write(`data: ${JSON.stringify({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    })}\n\n`);
    res.end();
  }
};

export const analyzeUserInput = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { input, context } = req.body;
    const userId = req.user?.userId;
    
    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Input is required'
      });
    }
    
    // Get user context if not provided
    let userContext = context || {};
    if (Object.keys(userContext).length === 0 && userId) {
      try {
        // Get user preferences, recent calendar events, etc.
        userContext = await contextService.getUserContext(userId);
      } catch (contextError) {
        console.warn('Error getting user context:', contextError);
        // Continue with analysis even if context fetching fails
      }
    }
    
    // Ensure the context has currentDateTime which is required by the NLP service
    if (!userContext.currentDateTime) {
      userContext.currentDateTime = new Date();
    }
    
    // Analyze the input using the advanced NLP service
    const analysis = await advancedNLPService.analyzeIntent(input, userContext);
    
    return res.status(200).json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Error analyzing user input:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const generateResponse = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    
    if (!query || !query.rawText || !query.intentAnalysis || !query.context) {
      return res.status(400).json({
        success: false,
        error: 'Query with rawText, intentAnalysis, and context is required'
      });
    }
    
    const response = await advancedNLPService.generateResponse(query);
    
    return res.status(200).json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Error generating response:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const extractSchedulingParameters = async (req: Request, res: Response) => {
  try {
    const { input, context } = req.body;
    
    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Input is required'
      });
    }
    
    const parameters = await advancedNLPService.extractSchedulingParameters(input, context);
    
    return res.status(200).json({
      success: true,
      parameters
    });
  } catch (error) {
    console.error('Error extracting scheduling parameters:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const generateClarificationQuestion = async (req: Request, res: Response) => {
  try {
    const { query, ambiguities } = req.body;
    
    if (!query || !ambiguities || !Array.isArray(ambiguities)) {
      return res.status(400).json({
        success: false,
        error: 'Query and ambiguities array are required'
      });
    }
    
    const clarification = await advancedNLPService.generateClarificationQuestion(
      query, 
      ambiguities
    );
    
    return res.status(200).json({
      success: true,
      clarification
    });
  } catch (error) {
    console.error('Error generating clarification question:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const provideFeedback = async (req: Request, res: Response) => {
  try {
    const { taskId, rating, comments } = req.body;
    
    if (!taskId || rating === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Task ID and rating are required'
      });
    }
    
    await agentService.recordFeedback(taskId, { rating, comments });
    
    return res.status(200).json({
      success: true,
      message: 'Feedback recorded successfully'
    });
  } catch (error) {
    console.error('Error recording feedback:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const getAgentStats = async (req: Request, res: Response) => {
  try {
    const stats = agentService.getMemoryStats();
    
    return res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting agent stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

// Legacy methods for backward compatibility

export const queueTask = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Accept either task object or direct properties
    let { task, priority, metadata, title, description, eventId, type, event } = req.body;
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      return res.status(400).json({
        success: false, 
        error: 'User ID is required'
      });
    }
    
    console.log('Queue task request received:', {
      taskProp: typeof task, 
      priority, 
      metadata, 
      title, 
      description
    });
    
    // Check if this is a streaming request
    const wantsStream = req.headers.accept?.includes('text/event-stream');
    
    if (wantsStream) {
      // Set up SSE headers for streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Prevent nginx from buffering the response
      });
      
      // Send initial response
      res.write(`data: ${JSON.stringify({
        success: true,
        taskId: uuidv4()
      })}\n\n`);
      
      try {
        // Import NLP service to parse the message
        const nlpService = require('../services/nlp.service').default;
        const googleCalendarService = require('../services/googleCalendar.service').default;
        
        // Write parsing step
        res.write(`data: ${JSON.stringify({
          message: "Analyzing your request..."
        })}\n\n`);
        
        // Parse the message to extract calendar command
        const parsedCommand = await nlpService.parseCommand(task, {
          userId,
          threadId: metadata?.threadId
        });
        
        // Write analysis result
        res.write(`data: ${JSON.stringify({
          message: "Request parsed successfully",
          parsedCommand
        })}\n\n`);
        
        // Check if it's a calendar command that can be executed
        if (parsedCommand.action && 
            (parsedCommand.action === 'create' || 
             parsedCommand.action === 'update' || 
             parsedCommand.action === 'delete' || 
             parsedCommand.action === 'query')) {
          
          // Write executing command step
          res.write(`data: ${JSON.stringify({
            message: `Executing ${parsedCommand.action} command...`,
            action: parsedCommand.action
          })}\n\n`);
          
          // Execute the calendar command
          const calendarResult = await googleCalendarService.handleCommand(parsedCommand);
          
          // Write final result
          if (calendarResult.success) {
            res.write(`data: ${JSON.stringify({
              message: calendarResult.message || "Calendar operation successful",
              result: calendarResult,
              success: true,
              created: true
            })}\n\n`);
          } else {
            res.write(`data: ${JSON.stringify({
              message: calendarResult.error || "Calendar operation failed",
              result: calendarResult,
              success: false,
              suggestion: calendarResult.suggestion
            })}\n\n`);
          }
        } else {
          // Write non-calendar command response
          res.write(`data: ${JSON.stringify({
            message: "Request was not a calendar command",
            parsedCommand,
            success: false
          })}\n\n`);
        }
        
        // Finally, create the task record for tracking
        const newTask = await AgentTask.create({
          userId,
          title: parsedCommand.title || task,
          description: `Processed message: ${task}`,
          priority: priority || 5,
          type: 'calendar_event',
          status: 'completed',
          metadata: {
            ...metadata,
            parsedCommand,
            originalMessage: task
          },
          createdAt: new Date()
        });
        
        // Write completion
        res.write(`data: ${JSON.stringify({
          message: "Task recording complete",
          taskId: newTask._id,
          complete: true
        })}\n\n`);
        
        // End the stream
        return res.end();
      } catch (streamError) {
        // Send error in the stream
        res.write(`data: ${JSON.stringify({
          message: "Error processing request",
          error: streamError instanceof Error ? streamError.message : "Unknown error",
          success: false
        })}\n\n`);
        
        // End the stream
        return res.end();
      }
    }
    
    // Non-streaming code path below (original implementation)
    // Handle both input formats: either a task object or direct fields
    let taskTitle = title;
    let taskDescription = description;
    let taskMetadata = metadata || {};
    let taskPriority = priority || 5;
    let taskType = type || 'general';
    
    // If task is a string (likely JSON), try to parse it
    if (task && typeof task === 'string') {
      try {
        task = JSON.parse(task);
        console.log('Successfully parsed task from JSON string:', task);
      } catch (parseError) {
        console.error('Error parsing task string as JSON:', parseError);
        // Continue with task as string, will be handled as metadata
      }
    }
    
    // If task object is provided, extract fields from it
    if (task && typeof task === 'object') {
      console.log('Processing task object with keys:', Object.keys(task));
      
      // For NLP analysis objects, handle specially
      if (task.analysis) {
        console.log('Found NLP analysis object:', task.analysis?.primaryIntent);
        
        // Extract scheduling information from NLP analysis
        const intent = task.analysis.primaryIntent || '';
        const entities = task.analysis.entities || {};
        
        // Create a descriptive title based on the intent and entities
        let intentTitle = `${intent.toLowerCase()} `;
        
        // Add event type if available
        if (entities.events && entities.events.length > 0) {
          intentTitle += entities.events[0].value || 'event';
        } else {
          intentTitle += 'event';
        }
        
        // Add time if available
        if (entities.times && entities.times.length > 0) {
          intentTitle += ` at ${entities.times[0].value || 'scheduled time'}`;
        }
        
        // Add person if available
        if (entities.people && entities.people.length > 0) {
          intentTitle += ` with ${entities.people[0].value || 'contact'}`;
        }
        
        taskTitle = intentTitle;
        taskDescription = `Handle ${intent.toLowerCase()} intent from user NLP analysis`;
        taskMetadata = { analysis: task.analysis };
        taskType = 'nlp_intent';
      } else {
        // Standard task object
        taskTitle = task.title || taskTitle;
        taskDescription = task.description || taskDescription;
        taskType = task.type || taskType;
        // Allow adding additional metadata from task object
        taskMetadata = {...taskMetadata, ...task.metadata};
      }
    }
    
    // For calendar events, special handling
    if (eventId) {
      taskTitle = taskTitle || `Process calendar event: ${eventId}`;
      taskDescription = taskDescription || `Calendar event processing task for: ${eventId}`;
      taskType = 'calendar_event';
      taskMetadata = {...taskMetadata, eventId};
    }
    
    // If event object is provided (from calendar creation)
    if (event) {
      const eventTitle = event.summary || event.title || 'Event';
      taskTitle = taskTitle || `Process calendar event: ${eventTitle}`;
      taskDescription = taskDescription || `Calendar event processing for "${eventTitle}"`;
      taskType = taskType || 'calendar_event';
      
      // Add event details to metadata
      taskMetadata = {
        ...taskMetadata,
        eventId: event.id || eventId,
        eventTitle: eventTitle,
        eventTime: event.start?.dateTime || event.startTime
      };
    }
    
    // Validate required fields - generate them if not provided for calendar events
    if (!taskTitle && (eventId || event)) {
      taskTitle = `Process calendar event: ${eventId || (event?.id || 'new event')}`;
    }
    
    if (!taskDescription && (eventId || event)) {
      taskDescription = `Calendar event processing task created at ${new Date().toISOString()}`;
    }
    
    // Generate a default title and description if still missing
    if (!taskTitle) {
      taskTitle = `Task created at ${new Date().toLocaleTimeString()}`;
    }
    
    if (!taskDescription) {
      taskDescription = `Agent task created at ${new Date().toISOString()}`;
    }
    
    console.log('Final task parameters:', {
      title: taskTitle,
      description: taskDescription,
      type: taskType,
      priority: taskPriority
    });
    
    // Create new task
    const newTask = await AgentTask.create({
      userId,
      title: taskTitle,
      description: taskDescription,
      priority: taskPriority,
      type: taskType,
      status: 'pending',
      metadata: taskMetadata,
      createdAt: new Date()
    });
    
    console.log('Task created successfully:', newTask._id);
    
    return res.status(200).json({
      success: true,
      taskId: newTask._id
    });
  } catch (error) {
    console.error('Error queueing task:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const getTasks = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    
    const tasks = await AgentTask.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);
    
    return res.status(200).json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const getSuggestions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    
    const suggestions = await Suggestion.find({ 
      userId,
      status: 'pending'
    }).sort({ relevance: -1 });
    
    return res.status(200).json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const updateSuggestion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { suggestionId } = req.params;
    const { action } = req.body;
    const userId = req.user?.userId || req.user?.id;
    
    if (!['accept', 'dismiss'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be "accept" or "dismiss"'
      });
    }
    
    const suggestion = await Suggestion.findOne({
      _id: suggestionId,
      userId
    });
    
    if (!suggestion) {
      return res.status(404).json({
        success: false,
        error: 'Suggestion not found'
      });
    }
    
    suggestion.status = action === 'accept' ? 'accepted' : 'dismissed';
    await suggestion.save();
    
    return res.status(200).json({
      success: true,
      message: `Suggestion ${action}ed successfully`
    });
  } catch (error) {
    console.error('Error updating suggestion:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const getInsights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    
    const insights = await Insight.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    return res.status(200).json({
      success: true,
      insights
    });
  } catch (error) {
    console.error('Error getting insights:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const getStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    
    // Legacy stats - simple static values for now
    const stats = {
      tasksCompleted: await AgentTask.countDocuments({ userId, status: 'completed' }),
      tasksPending: await AgentTask.countDocuments({ userId, status: 'pending' }),
      suggestionCount: await Suggestion.countDocuments({ userId }),
      acceptedSuggestions: await Suggestion.countDocuments({ userId, status: 'accepted' }),
      insightCount: await Insight.countDocuments({ userId })
    };
    
    return res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting agent stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};