import { Message } from './chat.types';
import { CalendarEvent } from './calendar.types';

export interface UserPreferences {
  workingHours: {
    start: string;
    end: string;
  };
  defaultMeetingDuration: number;
  preferredMeetingTimes: string[];
  focusTimes: {
    day: string;
    start: string;
    end: string;
  }[];
  timeZone: string;
}

export interface NLPContext {
  conversationHistory: Message[];
  userPreferences: UserPreferences;
  currentDateTime: Date;
  recentCalendarEvents: CalendarEvent[];
}

export interface Entity {
  type: 'PERSON' | 'TIME' | 'DATE' | 'LOCATION' | 'EVENT' | 'DURATION';
  value: string;
  normalized?: string;
  confidence: number;
}

export interface IntentAnalysis {
  primaryIntent: 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY' | 'ANALYZE' | 'RECOMMEND';
  secondaryIntents: string[];
  entities: {
    people: Entity[];
    times: Entity[];
    dates: Entity[];
    locations: Entity[];
    events: Entity[];
    durations: Entity[];
  };
  temporalContext: {
    timeframe: 'PAST' | 'PRESENT' | 'FUTURE';
    specificity: 'EXACT' | 'APPROXIMATE' | 'RELATIVE';
    reference?: Date;
  };
  implicitConstraints: string[];
  requiredClarifications: string[];
  urgencyLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScores: Record<string, number>;
  ambiguityAnalysis: {
    alternateInterpretations: string[];
    resolutionStrategy: string;
  };
}

export interface UserQuery {
  rawText: string;
  intentAnalysis: IntentAnalysis;
  context: NLPContext;
}

export interface ScheduleParameters {
  title: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  location?: string;
  participants?: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  flexibility: 'EXACT' | 'FLEXIBLE' | 'ANYTIME';
  recurrence?: {
    pattern: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval: number;
    endDate?: Date;
    count?: number;
  };
  isAllDay: boolean;
  reminderTime?: number; // minutes before event
  notes?: string;
  constraints: string[];
}

export interface NLPResponse {
  input: string;
  analysis: IntentAnalysis;
  extractedParameters?: ScheduleParameters;
  suggestedResponse?: string;
  confidence: number;
}

// Agent-related types
export interface Task {
  id: string;
  description: string;
  type: 'SCHEDULING' | 'ANALYSIS' | 'RECOMMENDATION' | 'OPTIMIZATION' | 'CLARIFICATION';
  parameters: Record<string, any>;
  priority: number;
  deadline?: Date;
  context?: any;
  parentTaskId?: string; // For subtasks
}

export interface ExecutionPlan {
  taskId: string;
  steps: ExecutionStep[];
  estimatedCompletionTime: number;
  expectedOutcomes: string[];
  alternativePlans?: ExecutionPlan[];
  reasoningProcess: string;
}

export interface ExecutionStep {
  id: string;
  type: 'CALENDAR_QUERY' | 'SCHEDULING_DECISION' | 'USER_CLARIFICATION' | 'DATA_ANALYSIS' | 'EXTRACTION' | 'SYNTHESIS';
  action: string;
  parameters: Record<string, any>;
  expectedOutput: any;
  successCriteria: string[];
  fallbackStrategy?: string;
  dependencies: string[]; // IDs of steps this depends on
  reasoning: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output: any;
  error?: string;
  executionTime: number;
  metadata: Record<string, any>;
}

export interface StepReflection {
  assessment: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE';
  successCriteriaMetCount: number;
  effectiveness: number; // 0-1
  learnings: string[];
  needsReplanning: boolean;
  suggestedAdjustments?: Record<string, any>;
  reasoning: string;
}

export interface AgentMemory {
  tasks: {
    taskId: string;
    outcome: 'SUCCESS' | 'FAILURE';
    learnedPatterns: string[];
  }[];
  observations: {
    timestamp: Date;
    context: any;
    observation: any;
    assessment: string;
  }[];
  decisions: {
    timestamp: Date;
    decision: string;
    outcome: any;
    effectiveness: number;
  }[];
  feedback: {
    timestamp: Date;
    rating: number;
    comments?: string;
    appliedImprovements?: string[];
  }[];
}

export interface TaskResult {
  taskId: string;
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  output: any;
  executionSummary: {
    totalSteps: number;
    successfulSteps: number;
    executionTime: number;
    challenges: string[];
    insights: string[];
  };
  nextActions?: string[];
}
