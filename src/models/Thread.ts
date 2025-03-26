import mongoose, { Schema, Document } from 'mongoose';
import { Message, AgentProcessingStep } from '../types/chat.types';

export interface IThread extends Document {
  messages: Message[];
  createdAt: Date;
  userId?: Schema.Types.ObjectId;
  conversationId?: string; // Reference to Conversation model
  processingSteps?: AgentProcessingStep[]; // Processing steps for tracking
  relatedAgentTasks?: string[]; // References to agent task IDs
}

const messageSchema = new Schema<Message>({
  sender: {
    type: String,
    enum: ['user', 'bot', 'assistant'], // Add 'assistant' to support both naming conventions
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: String, // Using String type but with ISO string format
    default: () => new Date().toISOString(),
    required: true
  },
});

// Schema for agent processing steps
const processingStepSchema = new Schema({
  stepType: {
    type: String,
    enum: ['STARTED', 'PROGRESS', 'COMPLETED', 'ERROR'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  }
});

const threadSchema = new Schema<IThread>({
  messages: [messageSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  conversationId: {
    type: String,
    ref: 'Conversation',
    index: true
  },
  processingSteps: [processingStepSchema], // Processing steps array - ensure this field name is consistent
  relatedAgentTasks: [String] // Array of agent task IDs
});

export default mongoose.model<IThread>('Thread', threadSchema);