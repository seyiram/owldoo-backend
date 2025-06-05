// src/services/thread.service.ts
import mongoose from 'mongoose';
import { AgentProcessingStep } from '../types/chat.types';
import { processingQueue } from '../utils/processingQueue';

/**
 * Service to manage thread-related operations
 */
class ThreadService {
  /**
   * Add a processing step to a thread
   * @param threadId The ID of the thread to update
   * @param step The processing step to add
   * @returns Updated thread or null if thread not found
   */
  async addProcessingStep(threadId: string, step: AgentProcessingStep) {
    try {
      console.log(`Adding processing step to thread ${threadId}:`, step.description);
      
      // Use processing queue to ensure step is added even if the thread isn't created yet
      processingQueue.queueProcessingStep(threadId, step);
      
      // Check if thread exists for immediate feedback
      const Thread = mongoose.model('Thread');
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(threadId);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(threadId);
      
      let thread;
      if (isObjectId) {
        thread = await Thread.findById(threadId);
      } else if (isUUID) {
        thread = await Thread.findOne({ conversationId: threadId });
      }
      
      // Log appropriate message based on step type - this is just for logging
      // The actual work is done by the queue
      if (step.stepType === 'STARTED') {
        console.log(`Queued STARTED processing step for thread ${threadId}`);
      } else if (step.stepType === 'COMPLETED') {
        console.log(`Queued COMPLETED processing step for thread ${threadId}`);
      }
      
      // Return thread if it exists, null otherwise
      // The queue will handle the actual update asynchronously
      return thread;
    } catch (error) {
      console.error('Error queuing processing step:', error);
      return null;
    }
  }
  
  /**
   * Link an agent task to a thread
   * @param threadId The ID of the thread to update
   * @param taskId The ID of the agent task to link
   * @returns Updated thread or null if thread not found
   */
  async linkAgentTask(threadId: string, taskId: string) {
    try {
      console.log(`Linking agent task ${taskId} to thread ${threadId}`);
      
      // Use processing queue for reliable agent task linking
      processingQueue.queueAgentTask(threadId, taskId);
      
      // Check if thread exists for immediate feedback
      const Thread = mongoose.model('Thread');
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(threadId);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(threadId);
      
      let thread;
      if (isObjectId) {
        thread = await Thread.findById(threadId);
      } else if (isUUID) {
        thread = await Thread.findOne({ conversationId: threadId });
      }
      
      console.log(`Queued agent task ${taskId} for thread ${threadId}`);
      
      // Return thread if it exists, null otherwise
      // The queue will handle the actual update asynchronously
      return thread;
    } catch (error) {
      console.error('Error queuing agent task:', error);
      return null;
    }
  }
  
  /**
   * Get a thread with all information including processing steps
   * @param threadId The ID of the thread to get
   * @returns Thread with processing information
   */
  async getThreadWithProcessing(threadId: string) {
    try {
      // Get Thread model
      const Thread = mongoose.model('Thread');
      
      // Check if threadId is a UUID format (conversation ID) or MongoDB ObjectID
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(threadId);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(threadId);
      
      let thread;
      
      if (isObjectId) {
        // Get thread with processing steps using ObjectID
        thread = await Thread.findById(threadId);
      } else if (isUUID) {
        // If it's a UUID, it's likely a conversationId - find the thread by conversationId
        thread = await Thread.findOne({ conversationId: threadId });
      } else {
        // Try with ID as fallback
        thread = await Thread.findById(threadId);
      }
      
      if (!thread) {
        console.warn(`Thread ${threadId} not found when getting thread - it may be still saving to database`);
        
        // Wait a short time to allow database to complete saving operations
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Try one more time after the delay
        if (isObjectId) {
          thread = await Thread.findById(threadId);
        } else if (isUUID) {
          thread = await Thread.findOne({ conversationId: threadId });
        } else {
          thread = await Thread.findById(threadId);
        }
        
        if (!thread) {
          console.error(`Thread ${threadId} still not found after delay`);
          return null;
        } else {
          console.log(`Thread ${threadId} found after delay`);
        }
      }
      
      // Handle both field names for processing steps
      // This ensures the frontend gets the right field regardless of which one is in the database
      if (!thread.processingSteps) {
        // Initialize an empty array if processingSteps doesn't exist
        console.log(`Thread ${threadId} missing processingSteps field, initializing empty array`);
        thread.processingSteps = [];
      }
      
      return thread;
    } catch (error) {
      console.error('Error getting thread with processing:', error);
      throw error;
    }
  }
  
  /**
   * Add a simple process started message to a thread
   * @param threadId Thread ID to update
   * @param description Description of the process
   * @param details Additional details about the process
   */
  async addProcessStarted(threadId: string, description: string, details: Record<string, any> = {}) {
    return this.addProcessingStep(threadId, {
      stepType: 'STARTED',
      description,
      timestamp: new Date(),
      details
    });
  }
  
  /**
   * Add a process progress update to a thread
   * @param threadId Thread ID to update
   * @param description Description of the progress
   * @param details Additional details about the progress
   */
  async addProcessProgress(threadId: string, description: string, details: Record<string, any> = {}) {
    return this.addProcessingStep(threadId, {
      stepType: 'PROGRESS',
      description,
      timestamp: new Date(),
      details
    });
  }
  
  /**
   * Add a process completed message to a thread
   * @param threadId Thread ID to update
   * @param description Description of the completion
   * @param details Additional details about the completion
   */
  async addProcessCompleted(threadId: string, description: string, details: Record<string, any> = {}) {
    return this.addProcessingStep(threadId, {
      stepType: 'COMPLETED',
      description,
      timestamp: new Date(),
      details
    });
  }
  
  /**
   * Add a process error message to a thread
   * @param threadId Thread ID to update
   * @param description Description of the error
   * @param details Additional details about the error
   */
  async addProcessError(threadId: string, description: string, details: Record<string, any> = {}) {
    return this.addProcessingStep(threadId, {
      stepType: 'ERROR',
      description,
      timestamp: new Date(),
      details
    });
  }
}

export const threadService = new ThreadService();