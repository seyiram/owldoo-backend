// src/models/Conversation.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IConversationTurn {
  speaker: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  intent?: {
    primaryIntent: string;
    subIntent?: string;
    confidence: number;
    entities: Record<string, any>;
  };
  action?: {
    type: string;
    parameters?: Record<string, any>;
    result?: any;
    status?: 'pending' | 'completed' | 'failed';
  } | Record<string, any>;
}

export interface IConversation extends Document {
  userId: string;
  conversationId: string;
  threadId?: string;  // Add threadId to link to Thread model
  startTime: Date;
  lastActivityTime: Date;
  turns: IConversationTurn[];
  context: {
    activeEntities: Record<string, any>;
    referencedEvents: string[];
    goals: string[];
    preferences: Record<string, any>;
    environmentContext: {
      timezone: string;
      location?: string;
      device?: string;
    };
  };
  isActive: boolean;
}

const ConversationTurnSchema = new Schema({
  speaker: { 
    type: String, 
    enum: ['user', 'assistant'], 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  intent: {
    primaryIntent: String,
    subIntent: String,
    confidence: Number,
    entities: Schema.Types.Mixed
  },
  action: {
    type: Schema.Types.Mixed,
    required: false
  }
});

const ConversationSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  conversationId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  threadId: {
    type: String,
    ref: 'Thread',
    index: true
  },
  startTime: { 
    type: Date, 
    default: Date.now 
  },
  lastActivityTime: { 
    type: Date, 
    default: Date.now 
  },
  turns: [ConversationTurnSchema],
  context: {
    activeEntities: { type: Schema.Types.Mixed, default: {} },
    referencedEvents: [String],
    goals: [String],
    preferences: { type: Schema.Types.Mixed, default: {} },
    environmentContext: {
      type: Schema.Types.Mixed,
      default: { timezone: 'UTC' }
    }
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

export default mongoose.model<IConversation>('Conversation', ConversationSchema);