import mongoose, { Schema, Document } from 'mongoose';
import { Message, AgentProcessingStep } from '../types/chat.types';
export interface IThread extends Document {
  messages: Message[];
  createdAt: Date;
  userId?: Schema.Types.ObjectId;
  processingSteps?: AgentProcessingStep[]; // Add processing steps
  relatedAgentTasks?: string[]; // References to agent task IDs
}

const messageSchema = new Schema<Message>({
  sender: {
    type: String,
    enum: ['user', 'bot'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: String,
    default: () => Date().toString(),
    required: true
  },
});

// New schema for agent processing steps
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
  processingSteps: [processingStepSchema], // Add processing steps array
  relatedAgentTasks: [String] // Array of agent task IDs
});

export default mongoose.model<IThread>('Thread', threadSchema);