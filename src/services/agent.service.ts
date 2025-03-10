import { v4 as uuidv4 } from 'uuid';
import { 
  Task, 
  TaskResult, 
  ExecutionPlan, 
  ExecutionStep,
  StepResult,
  StepReflection,
  AgentMemory
} from '../types/nlp.types';
import { advancedNLPService } from './advancedNLP.service';
import { NLPLog } from '../models/NLPLog';
import AgentTask from '../models/AgentTask';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Agent service providing autonomous reasoning and task execution
 */
class AgentService {
  private client: any; // Anthropic Claude API client
  private memory: AgentMemory;
  private readonly VERSION = '1.0.0';
  
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
    
    // Initialize agent memory
    this.memory = {
      tasks: [],
      observations: [],
      decisions: [],
      feedback: []
    };
  }
  
  /**
   * Plan and execute multiple steps to fulfill a complex task
   * @param task The task to execute
   * @returns Task execution result
   */
  async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    try {
      // Log task start
      await this.logAgentOperation({
        requestId,
        type: 'TASK_START',
        data: JSON.stringify(task),
        timestamp: new Date()
      });
      
      // 1. Create execution plan
      const plan = await this.createExecutionPlan(task);
      
      // Log planning
      await this.logAgentOperation({
        requestId,
        type: 'PLANNING_COMPLETE',
        data: JSON.stringify(plan),
        timestamp: new Date()
      });
      
      // 2. Execute each step with reflection
      const results: Array<{ step: ExecutionStep; result: StepResult; reflection: StepReflection }> = [];
      let currentPlan = { ...plan };
      
      for (let i = 0; i < currentPlan.steps.length; i++) {
        const step = currentPlan.steps[i];
        
        // Log step start
        await this.logAgentOperation({
          requestId,
          type: 'STEP_START',
          data: JSON.stringify({
            stepId: step.id,
            stepType: step.type,
            action: step.action
          }),
          timestamp: new Date()
        });
        
        // Execute step
        const stepResult = await this.executeStep(step);
        
        // Reflect on result
        const reflection = await this.reflectOnStep(step, stepResult);
        
        // Log step completion with reflection
        await this.logAgentOperation({
          requestId,
          type: 'STEP_COMPLETE',
          data: JSON.stringify({
            stepId: step.id,
            success: stepResult.success,
            assessment: reflection.assessment,
            needsReplanning: reflection.needsReplanning
          }),
          timestamp: new Date()
        });
        
        // Save step results
        results.push({
          step,
          result: stepResult,
          reflection
        });
        
        // Update agent memory
        this.updateMemory(step, stepResult, reflection);
        
        // If replanning is needed, update the plan
        if (reflection.needsReplanning) {
          const updatedPlan = await this.replanExecution(
            currentPlan,
            results,
            step,
            reflection
          );
          
          // Log replanning
          await this.logAgentOperation({
            requestId,
            type: 'REPLANNING',
            data: JSON.stringify({
              originalPlanSteps: currentPlan.steps.length,
              newPlanSteps: updatedPlan.steps.length,
              reason: reflection.suggestedAdjustments
            }),
            timestamp: new Date()
          });
          
          // Update current plan
          currentPlan = updatedPlan;
          
          // Adjust i to continue with the right step
          // If we're replacing the current step, don't increment i
          // If we're adding steps after the current one, don't change i
          // If we're skipping steps, adjust i accordingly
          if (reflection.suggestedAdjustments?.skipSteps) {
            i += reflection.suggestedAdjustments.skipSteps;
          }
        }
      }
      
      // 3. Synthesize results into final output
      const finalResult = await this.synthesizeResults(results, task);
      
      // Log task completion
      await this.logAgentOperation({
        requestId,
        type: 'TASK_COMPLETE',
        data: JSON.stringify({
          taskId: task.id,
          status: finalResult.status,
          executionTime: Date.now() - startTime,
          stepsExecuted: results.length
        }),
        timestamp: new Date()
      });
      
      // Update memory with overall task result
      this.memory.tasks.push({
        taskId: task.id,
        outcome: finalResult.status === 'COMPLETE' ? 'SUCCESS' : 'FAILURE',
        learnedPatterns: finalResult.executionSummary.insights
      });
      
      return finalResult;
    } catch (error) {
      // Log error
      await this.logAgentOperation({
        requestId,
        type: 'TASK_ERROR',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
      
      // Create error result
      return {
        taskId: task.id,
        status: 'FAILED',
        output: null,
        executionSummary: {
          totalSteps: 0,
          successfulSteps: 0,
          executionTime: Date.now() - startTime,
          challenges: [error instanceof Error ? error.message : String(error)],
          insights: ['Task execution failed due to error']
        }
      };
    }
  }
  
  /**
   * Create a multi-step plan to solve a complex problem
   * @param task Task to create a plan for
   * @returns Detailed execution plan
   */
  private async createExecutionPlan(task: Task): Promise<ExecutionPlan> {
    const systemPrompt = `You are an expert planner with deep understanding of calendar management and scheduling.
    Your goal is to create a detailed execution plan with precise steps to solve the given task.
    Think step by step and consider different approaches to solving the problem.`;
    
    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 2000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Create a detailed execution plan for this task:
          
          ${JSON.stringify(task)}
          
          For each step include:
          1. A unique step ID
          2. The type of operation (CALENDAR_QUERY, SCHEDULING_DECISION, USER_CLARIFICATION, DATA_ANALYSIS, etc.)
          3. The action to take
          4. Specific parameters needed
          5. Expected output
          6. Success criteria
          7. A fallback strategy if the step fails
          8. Dependencies on other steps
          9. Reasoning for this step
          
          Also provide:
          - Estimated completion time (in minutes)
          - Expected outcomes
          - Alternative approaches (if applicable)
          - Detailed reasoning for your plan
          
          Return the plan in JSON format following the ExecutionPlan type.`
        }
      ]
    });
    
    // Extract and parse JSON from response
    const planJSON = this.extractJSONFromResponse(response);
    
    // Ensure each step has a unique ID if not provided
    if (planJSON.steps) {
      planJSON.steps = planJSON.steps.map((step: any, index: number) => ({
        ...step,
        id: step.id || `step-${index + 1}`
      }));
    }
    
    // Add task ID if not included
    if (!planJSON.taskId) {
      planJSON.taskId = task.id;
    }
    
    return planJSON;
  }
  
  /**
   * Execute a single step in the plan
   * @param step Step to execute
   * @returns Step execution result
   */
  private async executeStep(step: ExecutionStep): Promise<StepResult> {
    const startTime = Date.now();
    
    try {
      let output;
      
      // Execute step based on type
      switch (step.type) {
        case 'CALENDAR_QUERY':
          output = await this.executeCalendarQueryStep(step);
          break;
        case 'SCHEDULING_DECISION':
          output = await this.executeSchedulingDecisionStep(step);
          break;
        case 'USER_CLARIFICATION':
          output = await this.executeUserClarificationStep(step);
          break;
        case 'DATA_ANALYSIS':
          output = await this.executeDataAnalysisStep(step);
          break;
        case 'EXTRACTION':
          output = await this.executeExtractionStep(step);
          break;
        case 'SYNTHESIS':
          output = await this.executeSynthesisStep(step);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
      
      return {
        stepId: step.id,
        success: true,
        output,
        executionTime: Date.now() - startTime,
        metadata: {
          stepType: step.type,
          action: step.action
        }
      };
    } catch (error) {
      return {
        stepId: step.id,
        success: false,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        metadata: {
          stepType: step.type,
          action: step.action
        }
      };
    }
  }
  
  /**
   * Execute a calendar query step
   */
  private async executeCalendarQueryStep(step: ExecutionStep): Promise<any> {
    // Implementation depends on your calendar service
    // This would typically call your existing calendar service methods
    const { action, parameters } = step;
    
    // Simulated response for now
    return {
      eventsFetched: true,
      count: 5,
      events: [
        // Calendar events would go here
      ]
    };
  }
  
  /**
   * Execute a scheduling decision step
   */
  private async executeSchedulingDecisionStep(step: ExecutionStep): Promise<any> {
    const { action, parameters } = step;
    
    const systemPrompt = `You are an expert scheduler making optimal calendar decisions.
    Consider all constraints, preferences, and available times to make the best scheduling decision.`;
    
    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Make a scheduling decision for the following scenario:
          
          Action: ${action}
          Parameters: ${JSON.stringify(parameters)}
          
          Consider all constraints and preferences. Explain your reasoning process.
          Return your decision in JSON format with detailed explanation of tradeoffs considered.`
        }
      ]
    });
    
    return this.extractJSONFromResponse(response);
  }
  
  /**
   * Execute a user clarification step
   */
  private async executeUserClarificationStep(step: ExecutionStep): Promise<any> {
    const { parameters } = step;
    
    // Generate clarification question based on ambiguities
    const clarification = await advancedNLPService.generateClarificationQuestion(
      parameters.query,
      parameters.ambiguities
    );
    
    // In a real implementation, this would interact with the user
    // For now, simulate a user response
    return {
      clarificationQuestion: clarification.question,
      options: clarification.options,
      userResponse: clarification.options[0] // Simulated response
    };
  }
  
  /**
   * Execute a data analysis step
   */
  private async executeDataAnalysisStep(step: ExecutionStep): Promise<any> {
    const { action, parameters } = step;
    
    const systemPrompt = `You are an expert data analyst specialized in calendar pattern analysis.
    Analyze the provided calendar data and extract meaningful insights.`;
    
    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze the following calendar data:
          
          ${JSON.stringify(parameters.data)}
          
          Analysis type: ${action}
          
          Provide a detailed analysis with specific insights.
          Return your analysis in JSON format.`
        }
      ]
    });
    
    return this.extractJSONFromResponse(response);
  }
  
  /**
   * Execute an extraction step
   */
  private async executeExtractionStep(step: ExecutionStep): Promise<any> {
    const { parameters } = step;
    
    // Use advanced NLP service to extract parameters
    return await advancedNLPService.extractSchedulingParameters(parameters.input);
  }
  
  /**
   * Execute a synthesis step
   */
  private async executeSynthesisStep(step: ExecutionStep): Promise<any> {
    const { parameters } = step;
    
    const systemPrompt = `You are an expert at synthesizing information into clear, coherent summaries.`;
    
    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1000,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Synthesize the following information into a coherent summary:
          
          ${JSON.stringify(parameters.inputs)}
          
          Create a comprehensive synthesis that addresses all key points.
          Return your synthesis in JSON format.`
        }
      ]
    });
    
    return this.extractJSONFromResponse(response);
  }
  
  /**
   * Reflect on step execution and learn from results
   * @param step The executed step
   * @param result The step result
   * @returns Reflection on step execution
   */
  private async reflectOnStep(step: ExecutionStep, result: StepResult): Promise<StepReflection> {
    // For successful steps, calculate success criteria met
    if (result.success) {
      // Count how many success criteria were met
      const successCriteriaMet = step.successCriteria.filter(criterion => {
        // Implement logic to check if criterion was met based on result
        // This is a simplified version
        return true; // Assume all criteria met for now
      }).length;
      
      const effectiveness = successCriteriaMet / step.successCriteria.length;
      
      // If all criteria met, no need for replanning
      if (effectiveness >= 0.8) {
        return {
          assessment: 'SUCCESS',
          successCriteriaMetCount: successCriteriaMet,
          effectiveness,
          learnings: [
            `${step.type} step executed successfully with ${(effectiveness * 100).toFixed(0)}% effectiveness`
          ],
          needsReplanning: false,
          reasoning: 'Step executed successfully, meeting all success criteria.'
        };
      } else {
        // Partial success might need replanning
        return {
          assessment: 'PARTIAL_SUCCESS',
          successCriteriaMetCount: successCriteriaMet,
          effectiveness,
          learnings: [
            `${step.type} step partially successful, missing some success criteria`
          ],
          needsReplanning: effectiveness < 0.5, // Only replan if below 50% effective
          suggestedAdjustments: {
            modifyCurrentStep: true,
            reason: 'Step was only partially successful'
          },
          reasoning: 'Step executed but only met some success criteria.'
        };
      }
    } else {
      // Failed step - determine if and how to replan
      // Use the fallback strategy if available
      if (step.fallbackStrategy) {
        return {
          assessment: 'FAILURE',
          successCriteriaMetCount: 0,
          effectiveness: 0,
          learnings: [
            `${step.type} step failed with error: ${result.error}`,
            'Applying fallback strategy'
          ],
          needsReplanning: true,
          suggestedAdjustments: {
            useFallbackStrategy: true,
            reason: result.error
          },
          reasoning: `Step failed due to error: ${result.error}. Fallback strategy will be applied.`
        };
      } else {
        // No fallback - need to replan more significantly
        return {
          assessment: 'FAILURE',
          successCriteriaMetCount: 0,
          effectiveness: 0,
          learnings: [
            `${step.type} step failed with error: ${result.error}`,
            'No fallback strategy available, major replanning needed'
          ],
          needsReplanning: true,
          suggestedAdjustments: {
            skipStep: true,
            findAlternativeApproach: true,
            reason: result.error
          },
          reasoning: `Step failed due to error: ${result.error}. No fallback strategy available, requiring significant replanning.`
        };
      }
    }
  }
  
  /**
   * Update the execution plan based on reflection and results
   * @param originalPlan The original execution plan
   * @param completedSteps Results of completed steps
   * @param failedStep The step that triggered replanning
   * @param reflection The reflection on the failed step
   * @returns Updated execution plan
   */
  private async replanExecution(
    originalPlan: ExecutionPlan,
    completedSteps: Array<{
      step: ExecutionStep;
      result: StepResult;
      reflection: StepReflection;
    }>,
    failedStep: ExecutionStep,
    reflection: StepReflection
  ): Promise<ExecutionPlan> {
    const systemPrompt = `You are an expert planner with the ability to adapt and replan when steps fail.
    Your goal is to update the execution plan based on the results of completed steps and the reflection on failures.`;
    
    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 2000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Update the execution plan based on step results and reflection.
          
          Original plan: ${JSON.stringify(originalPlan)}
          
          Completed steps: ${JSON.stringify(completedSteps.map(s => ({
            stepId: s.step.id,
            success: s.result.success,
            output: s.result.output
          })))}
          
          Failed step: ${JSON.stringify(failedStep)}
          
          Reflection: ${JSON.stringify(reflection)}
          
          Create an updated execution plan that addresses the issues identified in the reflection.
          You can:
          1. Modify the failed step
          2. Replace the failed step with alternative steps
          3. Skip the failed step if it's not critical
          4. Add new steps to recover from the failure
          5. Adjust downstream steps based on changes
          
          Return the updated plan in JSON format following the ExecutionPlan type.`
        }
      ]
    });
    
    // Extract and parse JSON response
    const updatedPlan = this.extractJSONFromResponse(response);
    
    // Ensure each step has a unique ID
    if (updatedPlan.steps) {
      updatedPlan.steps = updatedPlan.steps.map((step: any, index: number) => ({
        ...step,
        id: step.id || `replan-step-${index + 1}`
      }));
    }
    
    return updatedPlan;
  }
  
  /**
   * Update agent memory with observations and learnings
   * @param step The executed step
   * @param result The step result
   * @param reflection The reflection on execution
   */
  private updateMemory(
    step: ExecutionStep,
    result: StepResult,
    reflection: StepReflection
  ): void {
    // Store observation
    this.memory.observations.push({
      timestamp: new Date(),
      context: {
        stepId: step.id,
        stepType: step.type,
        action: step.action
      },
      observation: result.output,
      assessment: reflection.assessment
    });
    
    // Store decision
    this.memory.decisions.push({
      timestamp: new Date(),
      decision: step.action,
      outcome: result.output,
      effectiveness: reflection.effectiveness
    });
  }
  
  /**
   * Synthesize results from all steps into a final output
   * @param stepResults Results from all executed steps
   * @param originalTask The original task definition
   * @returns Final task result
   */
  private async synthesizeResults(
    stepResults: Array<{
      step: ExecutionStep;
      result: StepResult;
      reflection: StepReflection;
    }>,
    originalTask: Task
  ): Promise<TaskResult> {
    const systemPrompt = `You are an expert at synthesizing results from multiple steps into a coherent final output.
    Your goal is to create a comprehensive task result that addresses the original task objectives.`;
    
    const response = await this.client.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1500,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Synthesize the results from multiple execution steps into a final task result.
          
          Original task: ${JSON.stringify(originalTask)}
          
          Step results: ${JSON.stringify(stepResults.map(s => ({
            stepId: s.step.id,
            stepType: s.step.type,
            action: s.step.action,
            success: s.result.success,
            output: s.result.output,
            assessment: s.reflection.assessment
          })))}
          
          Create a comprehensive synthesis that includes:
          1. Overall status (COMPLETE, PARTIAL, or FAILED)
          2. Final output addressing the task objectives
          3. Execution summary with metrics
          4. Key challenges encountered
          5. Insights gained during execution
          6. Suggested next actions (if applicable)
          
          Return your synthesis in JSON format following the TaskResult type.`
        }
      ]
    });
    
    // Extract and parse JSON response
    const synthesisResult = this.extractJSONFromResponse(response);
    
    // Add task ID and execution metrics
    const successfulSteps = stepResults.filter(s => s.result.success).length;
    const executionTime = stepResults.reduce((total, s) => total + s.result.executionTime, 0);
    
    return {
      ...synthesisResult,
      taskId: originalTask.id,
      executionSummary: {
        ...synthesisResult.executionSummary,
        totalSteps: stepResults.length,
        successfulSteps,
        executionTime
      }
    };
  }
  
  /**
   * Extract JSON from LLM response
   */
  private extractJSONFromResponse(response: any): any {
    try {
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }
      
      // Find JSON in response using regex
      const jsonRegex = /{[\s\S]*}/g;
      const match = text.match(jsonRegex);
      
      if (match && match[0]) {
        return JSON.parse(match[0]);
      }
      
      throw new Error('No valid JSON found in response');
    } catch (error) {
      console.error('Error extracting JSON from response:', error);
      throw new Error('Failed to parse response JSON');
    }
  }
  
  /**
   * Log agent operations to database
   */
  private async logAgentOperation(data: {
    requestId: string;
    type: string;
    data?: string;
    error?: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      await NLPLog.create({
        ...data,
        version: this.VERSION,
        category: 'AGENT'
      });
    } catch (error) {
      console.error('Error logging agent operation:', error);
      // Non-blocking - don't let logging errors break agent functionality
    }
  }
  
  /**
   * Record user feedback on agent performance
   * @param taskId The ID of the task to provide feedback for
   * @param feedback User feedback data
   */
  async recordFeedback(taskId: string, feedback: {
    rating: number;
    comments?: string;
  }): Promise<void> {
    this.memory.feedback.push({
      timestamp: new Date(),
      ...feedback
    });
    
    // Log feedback
    await this.logAgentOperation({
      requestId: uuidv4(),
      type: 'USER_FEEDBACK',
      data: JSON.stringify({
        taskId,
        ...feedback
      }),
      timestamp: new Date()
    });
  }
  
  /**
   * Get memory statistics for learning and improvement
   */
  getMemoryStats(): {
    taskSuccessRate: number;
    averageEffectiveness: number;
    averageFeedbackRating: number;
    topChallenges: string[];
    topInsights: string[];
  } {
    // Calculate task success rate
    const successfulTasks = this.memory.tasks.filter(task => task.outcome === 'SUCCESS').length;
    const taskSuccessRate = this.memory.tasks.length > 0 ? 
      successfulTasks / this.memory.tasks.length : 0;
    
    // Calculate average decision effectiveness
    const totalEffectiveness = this.memory.decisions.reduce((sum, decision) => sum + decision.effectiveness, 0);
    const averageEffectiveness = this.memory.decisions.length > 0 ? 
      totalEffectiveness / this.memory.decisions.length : 0;
    
    // Calculate average feedback rating
    const totalRating = this.memory.feedback.reduce((sum, feedback) => sum + feedback.rating, 0);
    const averageFeedbackRating = this.memory.feedback.length > 0 ? 
      totalRating / this.memory.feedback.length : 0;
    
    // Extract challenges and insights for learning
    const allInsights = this.memory.tasks.flatMap(task => task.learnedPatterns);
    const topInsights = this.getTopItems(allInsights, 5);
    
    // Simple implementation to get top challenges - in a real system this would be more sophisticated
    const topChallenges = ['Handling ambiguity', 'Time zone conversions', 'Scheduling conflicts'];
    
    return {
      taskSuccessRate,
      averageEffectiveness,
      averageFeedbackRating,
      topChallenges,
      topInsights
    };
  }
  
  /**
   * Helper to get top occurring items from array
   */
  private getTopItems(items: string[], count: number): string[] {
    const frequency: Record<string, number> = {};
    
    // Count frequency
    for (const item of items) {
      frequency[item] = (frequency[item] || 0) + 1;
    }
    
    // Sort by frequency
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([item]) => item);
  }
  
  /**
   * Add a task to the agent task queue
   * @param taskType Type of task to create
   * @param priority Task priority (1-10)
   * @param userId User ID who owns the task
   * @param data Task data including title, description, and other metadata
   * @returns Success status and task ID
   */
  async addTask(taskType: string, priority: number, userId: string, data: any) {
    try {
      console.log(`Adding task of type ${taskType} with priority ${priority} for user ${userId}`);
      
      // Generate a unique task ID
      const taskId = uuidv4();
      
      // Normalize taskType - convert to uppercase for 'CALENDAR_EVENT' consistency
      const normalizedTaskType = taskType.toUpperCase().includes('CALENDAR') ? 
        'CALENDAR_EVENT' : taskType;
      
      // Extract or generate title and description based on data and task type
      let title = '';
      let description = '';
      
      // Process different task types appropriately
      if (normalizedTaskType === 'CALENDAR_EVENT') {
        // Handle calendar event tasks - support multiple data formats
        const eventId = data.eventId || data.event?.id || (data.event ? 'new-event' : null);
        const eventTitle = data.event?.summary || data.event?.title || data.title || 'Calendar Event';
        
        // Generate appropriate title and description
        title = data.title || `Calendar task: ${eventTitle}`;
        description = data.description || `Process calendar event for "${eventTitle}"`;
        
        // Ensure metadata includes eventId for reference
        data = {
          ...data,
          eventId: eventId,
          processType: 'calendar_event'
        };
        
        // If thread ID is provided, add processing step to thread
        if (data.threadId) {
          try {
            const { threadService } = require('./thread.service');
            await threadService.addProcessStarted(
              data.threadId, 
              `Starting task: ${title}`,
              {
                taskId: taskId,
                taskType: normalizedTaskType.toLowerCase(),
                eventId: eventId,
                eventTitle: eventTitle
              }
            );
          } catch (threadError) {
            console.error('Error adding processing step to thread:', threadError);
            // Non-blocking - continue task creation even if thread update fails
          }
        }
      } else if (normalizedTaskType === 'LEARN_FROM_CORRECTION') {
        // Handle learning tasks
        title = data.title || 'Learning from user correction';
        description = data.description || 'Process user correction feedback';
      } else {
        // Handle generic tasks
        title = data.title || `Task: ${taskType}`;
        description = data.description || `${taskType} task`;
      }
      
      console.log(`Creating task with title: "${title}" and description: "${description}"`);
      
      // Store the task in the database
      await AgentTask.create({
        _id: taskId,
        userId,
        title,
        description,
        status: 'pending',
        priority: priority || 5,
        type: normalizedTaskType.toLowerCase(), // Store lowercase for consistency
        metadata: data,
        createdAt: new Date()
      });
      
      return { success: true, taskId };
    } catch (error) {
      console.error('Error adding task:', error);
      throw new Error('Failed to queue task: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
  
  /**
   * Update task status and add processing steps to thread
   * @param taskId Task ID to update
   * @param status New status
   * @param details Additional details about the update
   */
  async updateTaskStatus(taskId: string, status: 'pending' | 'processing' | 'completed' | 'failed', details: Record<string, any> = {}) {
    try {
      // Update task status
      const task = await AgentTask.findByIdAndUpdate(
        taskId,
        { 
          $set: { 
            status,
            ...details,
            updatedAt: new Date()
          } 
        },
        { new: true }
      );
      
      if (!task) {
        console.error(`Task ${taskId} not found when updating status`);
        return null;
      }
      
      // If task has a thread ID, update thread with processing steps
      if (task.metadata && task.metadata.threadId) {
        const threadId = task.metadata.threadId;
        const { threadService } = require('./thread.service');
        
        try {
          // Add processing step based on status
          switch (status) {
            case 'processing':
              await threadService.addProcessProgress(
                threadId,
                `Task "${task.title}" is now being processed`,
                { taskId, ...details }
              );
              break;
            case 'completed':
              await threadService.addProcessCompleted(
                threadId,
                `Task "${task.title}" has been completed successfully`,
                { taskId, ...details }
              );
              break;
            case 'failed':
              await threadService.addProcessError(
                threadId,
                `Task "${task.title}" has failed`,
                { taskId, error: details.error || 'Unknown error', ...details }
              );
              break;
          }
        } catch (threadError) {
          console.error('Error updating thread with task status:', threadError);
          // Non-blocking - continue task update even if thread update fails
        }
      }
      
      return task;
    } catch (error) {
      console.error('Error updating task status:', error);
      throw new Error('Failed to update task: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

export const agentService = new AgentService();