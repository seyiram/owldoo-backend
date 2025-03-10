// src/services/thread.service.ts
import mongoose from 'mongoose';
import { AgentProcessingStep } from '../types/chat.types';

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
      
      // Get Thread model
      const Thread = mongoose.model('Thread');
      
      // Update thread with new processing step
      const thread = await Thread.findByIdAndUpdate(
        threadId,
        { 
          $push: { 
            processingSteps: step 
          } 
        },
        { new: true }
      );
      
      if (!thread) {
        console.error(`Thread ${threadId} not found when adding processing step`);
        return null;
      }
      
      console.log(`Added processing step to thread ${threadId}`);
      return thread;
    } catch (error) {
      console.error('Error adding processing step to thread:', error);
      throw error;
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
      
      // Get Thread model
      const Thread = mongoose.model('Thread');
      
      // Update thread with agent task ID
      const thread = await Thread.findByIdAndUpdate(
        threadId,
        { 
          $addToSet: { 
            relatedAgentTasks: taskId 
          } 
        },
        { new: true }
      );
      
      if (!thread) {
        console.error(`Thread ${threadId} not found when linking agent task`);
        return null;
      }
      
      console.log(`Linked agent task ${taskId} to thread ${threadId}`);
      return thread;
    } catch (error) {
      console.error('Error linking agent task to thread:', error);
      throw error;
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
      
      // Get thread with processing steps
      const thread = await Thread.findById(threadId);
      
      if (!thread) {
        console.error(`Thread ${threadId} not found`);
        return null;
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