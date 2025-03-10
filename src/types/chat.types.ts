export interface Message {
  id: string;
  sender: 'user' | 'bot';
  content: string;
  timestamp: string;
}

export interface Intent {
  primaryIntent: 'create' | 'update' | 'delete' | 'query' | 'confirm' | 'unknown' | string;
  subIntent?: string;
  originalText?: string;  // Original user text for time verification
  confidence: number;
  entities: Record<string, any>;
}

export interface ConversationAction {
  type: string;
  parameters: Record<string, any>;
  result?: any;
  status: 'pending' | 'completed' | 'failed';
}

export interface ConversationResponse {
  content: string;
  intent?: Intent;
  action?: ConversationAction;
  suggestions?: string[];
  followUpQuestions?: string[];
  needsClarification?: boolean;
  threadId?: string;  // Add thread ID for conversation tracking
}

export interface ConversationContext {
  activeEntities: Record<string, any>;
  referencedEvents: string[];
  goals: string[];
  preferences: Record<string, any>;
  environmentContext: {
    timezone: string;
    location?: string;
    device?: string;
  };
}

/**
 * Agent processing step information to show in threads
 */
export interface AgentProcessingStep {
  stepType: 'STARTED' | 'PROGRESS' | 'COMPLETED' | 'ERROR';
  description: string;
  timestamp: Date;
  details?: Record<string, any>;
}

/**
 * Thread with processing information
 */
export interface ThreadWithProcessing {
  _id: string;
  messages: Message[];
  createdAt: Date;
  userId: string;
  processingSteps: AgentProcessingStep[];
  relatedAgentTasks: string[];
}