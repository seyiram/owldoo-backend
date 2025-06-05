/**
 * Processing Queue Utility
 * 
 * This utility provides a reliable way to queue processing steps
 * for threads that may not exist in the database yet.
 */

import { AgentProcessingStep } from '../types/chat.types';
import mongoose from 'mongoose';

interface QueuedProcessingStep {
  threadId: string;
  step: AgentProcessingStep;
  attempts: number;
  createdAt: Date;
  lastAttempt?: Date;
  completed: boolean;
  error?: string;
}

interface QueuedAgentTask {
  threadId: string;
  taskId: string;
  attempts: number;
  createdAt: Date; 
  lastAttempt?: Date;
  completed: boolean;
  error?: string;
}

class ProcessingQueue {
  // In-memory queues
  private processingStepsQueue: QueuedProcessingStep[] = [];
  private agentTasksQueue: QueuedAgentTask[] = [];
  
  // Flag to track if the queue processor is running
  private isProcessing: boolean = false;
  
  // Maximum number of retries
  private maxRetries: number = 5;
  
  // Retry intervals (in ms)
  private retryIntervals: number[] = [100, 300, 500, 1000, 3000];
  
  /**
   * Add a processing step to the queue
   * @param threadId The ID of the thread to update
   * @param step The processing step to add
   */
  queueProcessingStep(threadId: string, step: AgentProcessingStep): void {
    console.log(`[ProcessingQueue] Queuing processing step for thread ${threadId}:`, step.description);
    
    this.processingStepsQueue.push({
      threadId,
      step,
      attempts: 0,
      createdAt: new Date(),
      completed: false
    });
    
    // Start processing queue if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
  
  /**
   * Add an agent task link to the queue
   * @param threadId The ID of the thread to update
   * @param taskId The ID of the agent task to link
   */
  queueAgentTask(threadId: string, taskId: string): void {
    console.log(`[ProcessingQueue] Queuing agent task ${taskId} for thread ${threadId}`);
    
    this.agentTasksQueue.push({
      threadId,
      taskId,
      attempts: 0,
      createdAt: new Date(),
      completed: false
    });
    
    // Start processing queue if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
  
  /**
   * Process the queues one item at a time, with retries
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Process processing steps queue
      while (this.processingStepsQueue.length > 0) {
        const item = this.processingStepsQueue[0];
        
        if (item.attempts >= this.maxRetries) {
          console.error(`[ProcessingQueue] Max retries reached for processing step on thread ${item.threadId}:`, item.step.description);
          this.processingStepsQueue.shift(); // Remove from queue
          continue;
        }
        
        // Attempt to process the item
        const success = await this.processStepItem(item);
        
        if (success) {
          this.processingStepsQueue.shift(); // Remove from queue
        } else {
          // Update attempt count and move to end of queue if there are other items
          item.attempts++;
          item.lastAttempt = new Date();
          
          if (this.processingStepsQueue.length > 1) {
            this.processingStepsQueue.shift();
            this.processingStepsQueue.push(item);
          }
          
          // Wait before retrying
          const retryInterval = this.retryIntervals[Math.min(item.attempts - 1, this.retryIntervals.length - 1)];
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
      }
      
      // Process agent tasks queue
      while (this.agentTasksQueue.length > 0) {
        const item = this.agentTasksQueue[0];
        
        if (item.attempts >= this.maxRetries) {
          console.error(`[ProcessingQueue] Max retries reached for agent task ${item.taskId} on thread ${item.threadId}`);
          this.agentTasksQueue.shift(); // Remove from queue
          continue;
        }
        
        // Attempt to process the item
        const success = await this.processTaskItem(item);
        
        if (success) {
          this.agentTasksQueue.shift(); // Remove from queue
        } else {
          // Update attempt count and move to end of queue if there are other items
          item.attempts++;
          item.lastAttempt = new Date();
          
          if (this.agentTasksQueue.length > 1) {
            this.agentTasksQueue.shift();
            this.agentTasksQueue.push(item);
          }
          
          // Wait before retrying
          const retryInterval = this.retryIntervals[Math.min(item.attempts - 1, this.retryIntervals.length - 1)];
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
      }
    } finally {
      this.isProcessing = false;
      
      // If new items have been added while processing, start again
      if (this.processingStepsQueue.length > 0 || this.agentTasksQueue.length > 0) {
        this.processQueue();
      }
    }
  }
  
  /**
   * Process a single processing step item
   * @param item The queued processing step to process
   * @returns True if processed successfully, false if should retry
   */
  private async processStepItem(item: QueuedProcessingStep): Promise<boolean> {
    try {
      const Thread = mongoose.model('Thread');
      
      // Check if thread exists before attempting to update
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(item.threadId);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(item.threadId);
      
      let threadExists = false;
      
      if (isObjectId) {
        const existingThread = await Thread.findById(item.threadId);
        threadExists = !!existingThread;
      } else if (isUUID) {
        const existingThread = await Thread.findOne({ conversationId: item.threadId });
        threadExists = !!existingThread;
      }
      
      if (!threadExists) {
        console.warn(`[ProcessingQueue] Thread ${item.threadId} not found when adding processing step - attempt ${item.attempts + 1}/${this.maxRetries}`);
        return false; // Retry
      }
      
      // Now perform the update
      let thread;
      
      if (isObjectId) {
        // Use findByIdAndUpdate for ObjectID
        thread = await Thread.findByIdAndUpdate(
          item.threadId,
          { 
            $push: { 
              processingSteps: item.step 
            } 
          },
          { new: true }
        );
      } else if (isUUID) {
        // If it's a UUID, it's likely a conversationId
        thread = await Thread.findOneAndUpdate(
          { conversationId: item.threadId },
          { 
            $push: { 
              processingSteps: item.step 
            } 
          },
          { new: true }
        );
      }
      
      if (!thread) {
        console.error(`[ProcessingQueue] Thread ${item.threadId} not found when updating processing step`);
        return false; // Retry
      }
      
      // Log based on step type
      if (item.step.stepType === 'STARTED') {
        console.log(`[ProcessingQueue] Started processing for thread ${item.threadId}`);
      } else if (item.step.stepType === 'COMPLETED') {
        console.log(`[ProcessingQueue] Completed processing for thread ${item.threadId}`);
      }
      
      console.log(`[ProcessingQueue] Added processing step to thread ${item.threadId}`);
      return true; // Success
    } catch (error) {
      console.error('[ProcessingQueue] Error adding processing step to thread:', error);
      return false; // Retry
    }
  }
  
  /**
   * Process a single agent task item
   * @param item The queued agent task to process
   * @returns True if processed successfully, false if should retry
   */
  private async processTaskItem(item: QueuedAgentTask): Promise<boolean> {
    try {
      const Thread = mongoose.model('Thread');
      
      // Check if thread exists before attempting to update
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(item.threadId);
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(item.threadId);
      
      let threadExists = false;
      
      if (isObjectId) {
        const existingThread = await Thread.findById(item.threadId);
        threadExists = !!existingThread;
      } else if (isUUID) {
        const existingThread = await Thread.findOne({ conversationId: item.threadId });
        threadExists = !!existingThread;
      }
      
      if (!threadExists) {
        console.warn(`[ProcessingQueue] Thread ${item.threadId} not found when linking agent task - attempt ${item.attempts + 1}/${this.maxRetries}`);
        return false; // Retry
      }
      
      // Now perform the update
      let thread;
      
      if (isObjectId) {
        // Use findByIdAndUpdate for ObjectID
        thread = await Thread.findByIdAndUpdate(
          item.threadId,
          { 
            $addToSet: { 
              relatedAgentTasks: item.taskId 
            } 
          },
          { new: true }
        );
      } else if (isUUID) {
        // If it's a UUID, it's likely a conversationId
        thread = await Thread.findOneAndUpdate(
          { conversationId: item.threadId },
          { 
            $addToSet: { 
              relatedAgentTasks: item.taskId 
            } 
          },
          { new: true }
        );
      }
      
      if (!thread) {
        console.error(`[ProcessingQueue] Thread ${item.threadId} not found when linking agent task ${item.taskId}`);
        return false; // Retry
      }
      
      console.log(`[ProcessingQueue] Linked agent task ${item.taskId} to thread ${item.threadId}`);
      return true; // Success
    } catch (error) {
      console.error('[ProcessingQueue] Error linking agent task to thread:', error);
      return false; // Retry
    }
  }
}

// Export a singleton instance
export const processingQueue = new ProcessingQueue();