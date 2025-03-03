import { v4 as uuid } from 'uuid';
import mongoose from 'mongoose';
import { Anthropic } from '@anthropic-ai/sdk';
import nlpService from './nlp.service';
import googleCalendarService from './googleCalendar.service';

class AgentService {
    private client: Anthropic;
    private taskQueue: Array<{
        id: string;
        task: string;
        priority: number;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        userId?: string;
        metadata?: any;
        createdAt: Date;
        result?: any;
    }> = [];
    private isProcessingQueue: boolean = false;

    constructor() {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || ''
        });
    }

    async addTask(task: string, priority: number = 1, userId?: string, metadata?: any): Promise<string> {
        const taskId = uuid();
        this.taskQueue.push({
            id: taskId,
            task,
            priority,
            status: 'pending',
            userId,
            metadata,
            createdAt: new Date()
        });

        // Start processing queue if not already running
        if (!this.isProcessingQueue) {
            this.processTaskQueue();
        }

        return taskId;
    }

    async processTaskQueue(): Promise<void> {
        if (this.isProcessingQueue || this.taskQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            // Sort tasks by priority (higher number = higher priority)
            this.taskQueue.sort((a, b) => b.priority - a.priority);

            // Process each task
            for (const task of this.taskQueue.filter(t => t.status === 'pending')) {
                try {
                    task.status = 'processing';

                    // Process based on task type
                    if (task.task.startsWith('calendar_optimize')) {
                        task.result = await this.optimizeCalendar(task.userId);
                    } else if (task.task.startsWith('email_draft')) {
                        task.result = await this.draftEmail(task.userId, task.metadata);
                    } else if (task.task.startsWith('analyze_')) {
                        task.result = await this.analyzeData(task.task, task.userId, task.metadata);
                    } else {
                        task.result = await this.processGenericTask(task.task, task.userId);
                    }

                    task.status = 'completed';
                } catch (error) {
                    console.error(`Error processing task: ${task.task}`, error);
                    task.status = 'failed';
                    task.result = { error: error instanceof Error ? error.message : 'Unknown error' };
                }
            }
        } finally {
            this.isProcessingQueue = false;

            // Clean up completed tasks older than 1 day
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            this.taskQueue = this.taskQueue.filter(
                task => task.status === 'pending' ||
                    task.status === 'processing' ||
                    task.createdAt > oneDayAgo
            );
        }
    }

    async optimizeCalendar(userId?: string): Promise<any> {
        if (!userId) return { success: false, error: 'User ID required' };

        try {
            // Get user preferences
            const user = await mongoose.model('User').findById(userId);
            if (!user) return { success: false, error: 'User not found' };

            // Get upcoming events
            const now = new Date();
            const nextWeek = new Date(now);
            nextWeek.setDate(now.getDate() + 7);

            const events = await googleCalendarService.getEvents(now, nextWeek);

            // Analyze calendar for optimization opportunities
            const optimizations = await this.analyzeCalendarForOptimizations(events, user.preferences);

            // Create suggestions for the user
            for (const opt of optimizations) {
                await this.createSuggestion({
                    userId,
                    type: 'calendar_optimization',
                    title: opt.title,
                    description: opt.description,
                    action: {
                        type: opt.actionType,
                        data: opt.actionData
                    },
                    relevance: opt.confidence,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
                });
            }

            return { success: true, optimizationsFound: optimizations.length };
        } catch (error) {
            console.error('Error optimizing calendar:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    private async analyzeCalendarForOptimizations(events: any[], preferences: any): Promise<any[]> {
        const optimizations = [];

        // Check for back-to-back meetings
        for (let i = 0; i < events.length - 1; i++) {
            const current = events[i];
            const next = events[i + 1];

            const currentEnd = new Date(current.end.dateTime);
            const nextStart = new Date(next.start.dateTime);

            // If meetings are back-to-back with no break
            if (nextStart.getTime() - currentEnd.getTime() < 5 * 60 * 1000) {
                optimizations.push({
                    title: 'Add break between meetings',
                    description: `You have back-to-back meetings: "${current.summary}" and "${next.summary}". Would you like to add a 15-minute break?`,
                    confidence: 0.85,
                    actionType: 'reschedule_event',
                    actionData: {
                        eventId: next.id,
                        newStartTime: new Date(currentEnd.getTime() + 15 * 60 * 1000).toISOString()
                    }
                });
            }
        }

        // Check for meetings outside working hours
        if (preferences?.workingHours) {
            const workStart = preferences.workingHours.start.split(':').map(Number);
            const workEnd = preferences.workingHours.end.split(':').map(Number);

            for (const event of events) {
                const eventStart = new Date(event.start.dateTime);
                const eventHour = eventStart.getHours();
                const eventMinutes = eventStart.getMinutes();

                const startTimeMinutes = workStart[0] * 60 + (workStart[1] || 0);
                const endTimeMinutes = workEnd[0] * 60 + (workEnd[1] || 0);
                const eventTimeMinutes = eventHour * 60 + eventMinutes;

                if (eventTimeMinutes < startTimeMinutes || eventTimeMinutes > endTimeMinutes) {
                    // Find alternative time within working hours
                    const alternativeDate = new Date(eventStart);
                    if (eventTimeMinutes < startTimeMinutes) {
                        alternativeDate.setHours(workStart[0], workStart[1] || 0);
                    } else {
                        // Suggest for next day at start of working hours
                        alternativeDate.setDate(alternativeDate.getDate() + 1);
                        alternativeDate.setHours(workStart[0], workStart[1] || 0);
                    }

                    optimizations.push({
                        title: 'Reschedule outside working hours',
                        description: `"${event.summary}" is scheduled outside your working hours. Would you like to move it to ${alternativeDate.toLocaleString()}?`,
                        confidence: 0.8,
                        actionType: 'reschedule_event',
                        actionData: {
                            eventId: event.id,
                            newStartTime: alternativeDate.toISOString()
                        }
                    });
                }
            }
        }

        return optimizations;
    }

    async draftEmail(userId?: string, metadata?: any): Promise<any> {
        if (!userId) return { success: false, error: 'User ID required' };
        if (!metadata?.eventId) return { success: false, error: 'Event ID required' };

        try {
            // Get event details
            const event = await googleCalendarService.getEvent(metadata.eventId);
            if (!event) return { success: false, error: 'Event not found' };

            // Generate email draft based on event type
            const emailType = metadata.emailType || 'follow_up';
            let emailDraft;

            if (emailType === 'follow_up') {
                emailDraft = await this.generateFollowUpEmail(event);
            } else if (emailType === 'cancellation') {
                emailDraft = await this.generateCancellationEmail(event);
            } else if (emailType === 'reschedule') {
                emailDraft = await this.generateRescheduleEmail(event, metadata.newTime);
            }

            // Create suggestion for the user
            await this.createSuggestion({
                userId,
                type: 'email_draft',
                title: `Email draft: ${emailType === 'follow_up' ? 'Follow-up' : emailType === 'cancellation' ? 'Cancellation' : 'Reschedule'} for "${event.summary}"`,
                description: (emailDraft || 'No draft generated').substring(0, 100) + '...',
                action: {
                    type: 'copy_email_draft',
                    data: {
                        draft: emailDraft || 'No draft generated',
                        subject: emailDraft ? emailDraft.split('\n')[0] : 'Email draft',
                        recipients: event.attendees?.map((a: any) => a.email) || []
                    }
                },
                relevance: 0.9,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
            });

            return { success: true, emailDraft };
        } catch (error) {
            console.error('Error drafting email:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    private async generateFollowUpEmail(event: any): Promise<string> {
        const response = await this.client.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            messages: [
                {
                    role: "user",
                    content: "You are an assistant that drafts professional follow-up emails after meetings. Create a concise, professional email that summarizes key points and next steps."
                },
                {
                    role: "user",
                    content: `Draft a follow-up email for a meeting titled "${event.summary}" with the following attendees: ${event.attendees?.map((a: any) => a.email).join(', ') || 'No attendees'}.
          
Meeting details:
- Date: ${new Date(event.start.dateTime).toLocaleDateString()}
- Time: ${new Date(event.start.dateTime).toLocaleTimeString()} - ${new Date(event.end.dateTime).toLocaleTimeString()}
- Description: ${event.description || 'No description provided'}

Format the email with a subject line on the first line, followed by the body.`
                }
            ]
        });

        return response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate email';
    }

    private async createSuggestion(suggestion: any): Promise<void> {
        try {
            const Suggestion = mongoose.model('Suggestion');
            await Suggestion.create(suggestion);
        } catch (error) {
            console.error('Error creating suggestion:', error);
        }
    }

    public async processGenericTask(task: string, userId?: string): Promise<any> {
        try {
            // Process the task
            const parsedCommand = await nlpService.parseCommand(task);
            console.log('Initial parsed command:', parsedCommand);

            // Extract event type from command
            const eventType = this.identifyEventType(task);
            const isWorkSchedule = eventType === 'work';

            // Generate appropriate title and description
            const title = isWorkSchedule ? 'Work' : this.generateTitle(parsedCommand, task);

            // Modify description to be more appropriate for work schedules
            const description = isWorkSchedule 
                ? `Work scheduled from ${new Date(parsedCommand.startTime).toLocaleString()} to ${
                    new Date(new Date(parsedCommand.startTime).getTime() + parsedCommand.duration * 60000).toLocaleString()
                  }`
                : this.generateDescription(parsedCommand, task);

            let processDetails = 'Processing your request:\n\n';
            processDetails += `1. Understanding your request:\n${task}\n\n`;
            processDetails += `2. Scheduling details:\n`;
            processDetails += `- Type: ${isWorkSchedule ? 'Work Schedule' : parsedCommand.action}\n`;
            processDetails += `- Start: ${parsedCommand.startTime ? new Date(parsedCommand.startTime).toLocaleString() : 'Not specified'}\n`;
            processDetails += `- Duration: ${parsedCommand.duration} minutes\n\n`;

            // Create the event with properly typed context
            const event = await googleCalendarService.createEvent({
                ...parsedCommand,
                title,
                description,
                context: {
                    isUrgent: parsedCommand.context?.isUrgent || false,
                    isFlexible: parsedCommand.context?.isFlexible || false,
                    priority: parsedCommand.context?.priority || 'normal',
                    timePreference: parsedCommand.context?.timePreference || 'approximate',
                    isWorkSchedule // This is now optional
                }
            });

            processDetails += `3. Schedule created successfully!\n`;
            processDetails += `- Title: ${title}\n`;
            processDetails += `- Start: ${new Date(event.start.dateTime).toLocaleString()}\n`;
            processDetails += `- End: ${new Date(event.end.dateTime).toLocaleString()}\n`;

            return {
                success: true,
                result: `Created ${isWorkSchedule ? 'work schedule' : 'event'}: ${title}`,
                processDetails,
                message: processDetails,
            };
        } catch (error) {
            console.error('Error processing task:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    private generateTitle(parsedCommand: any, task: string): string {
        // If it's a simple work schedule, just return 'Work'
        if (this.identifyEventType(task) === 'work') {
            return 'Work';
        }

        // Extract potential title from parsed command
        if (parsedCommand.title) {
            return this.toTitleCase(parsedCommand.title);
        }

        // Extract meeting details
        const meetingMatch = task.match(/(?:meeting|call|appointment)\s+(?:with\s+)?([^@\n]+?)(?=\s+[\w.+-]+@[\w-]+\.[\w.-]+|\s*$)/i);
        if (meetingMatch) {
            return `Meeting with ${this.toTitleCase(meetingMatch[1].trim())}`;
        }

        // Default to generic event name
        return 'Calendar Event';
    }

    private generateDescription(parsedCommand: any, task: string): string {
        // Identify event type from task and context
        const eventType = this.identifyEventType(task);
        const details = [];

        // Add base description
        if (parsedCommand.description) {
            details.push(parsedCommand.description);
        }

        // Add event type specific details
        switch (eventType) {
            case 'work':
                details.push(`🏢 Work Schedule`);
                if (parsedCommand.location) {
                    details.push(`📍 Location: ${parsedCommand.location === 'wfh' ? 'Working from Home' : parsedCommand.location}`);
                }
                break;

            case 'meeting':
                if (parsedCommand.attendees?.length) {
                    details.push(`👥 Attendees: ${parsedCommand.attendees.join(', ')}`);
                }
                if (parsedCommand.videoLink) {
                    details.push(`🎥 Video Link: ${parsedCommand.videoLink}`);
                }
                break;

            case 'deadline':
                details.push('⏰ Important Deadline');
                break;

            case 'personal':
                details.push('🏠 Personal Event');
                break;

            case 'travel':

            case 'exercise':
                details.push('🏃‍♂️ Exercise/Workout');
                break;

            case 'meal':
                details.push('🍽️ Meal Time');
                break;
        }

        // Add context-based information
        if (parsedCommand.context) {
            if (parsedCommand.context.isUrgent) {
                details.push('⚠️ High Priority');
            }
            if (parsedCommand.context.isFlexible) {
                details.push('⚡ Flexible Timing');
            }
            if (parsedCommand.context.priority === 'high') {
                details.push('🔥 Important');
            }
        }

        // Add notes or additional information
        if (parsedCommand.notes) {
            details.push(`📝 Notes: ${parsedCommand.notes}`);
        }

        // Add metadata
        if (parsedCommand.metadata) {
            details.push(`Created: ${new Date(parsedCommand.metadata.parseTime).toLocaleString()}`);
            if (parsedCommand.metadata.confidence < 0.8) {
                details.push('⚠️ Some details may need verification');
            }
        }

        return details.join('\n\n');
    }

    private identifyEventType(task: string): string {
        const taskLower = task.toLowerCase();
        
        // Check for work schedule first - make this pattern more specific
        const workSchedulePattern = /\b(?:schedule|set|plan)?\s*work\s*(?:from|at|for|until)?\b/i;
        if (workSchedulePattern.test(taskLower) && 
            !taskLower.includes('meeting') && 
            !taskLower.includes('call')) {
            return 'work';
        }

        // Rest of the patterns remain the same
        const patterns = {
            meeting: /\b(meet|meeting|call|sync|appointment|interview)\b/,
            deadline: /\b(deadline|due|by|until)\b/,
            personal: /\b(personal|family|kids|home|life)\b/,
            travel: /\b(travel|trip|flight|journey|commute)\b/,
            exercise: /\b(exercise|workout|gym|training|fitness)\b/,
            meal: /\b(lunch|dinner|breakfast|meal|food)\b/
        };

        // Check for explicit mentions
        for (const [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(taskLower)) {
                return type;
            }
        }

        // Analyze context for implicit type
        if (taskLower.includes('@') || taskLower.includes('zoom') || taskLower.includes('teams')) {
            return 'meeting';
        }

        if (taskLower.includes('wfh') || taskLower.includes('office')) {
            return 'work';
        }

        // Default to generic event type
        return 'event';
    }

    public async processGenericTaskWithStream(
        task: string,
        onChunk: (chunk: string) => void,
        userId?: string
    ): Promise<void> {
        try {
            // Stream initial AI response
            const aiResponse = await this.client.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                stream: true,
                messages: [
                    {
                        role: "user",
                        content: "You are an AI assistant that helps process tasks for a calendar and productivity application."
                    },
                    {
                        role: "user",
                        content: `Process the following task: ${task}`
                    }
                ]
            });

            // Stream the initial response
            for await (const chunk of aiResponse) {
                if ('type' in chunk && chunk.type === 'content_block_delta' &&
                    'delta' in chunk && 'text' in chunk.delta) {
                    onChunk(chunk.delta.text);
                }
            }

            // Process the task
            const parsedCommand = await nlpService.parseCommand(task);
            console.log('Parsed command:', parsedCommand);

            // Extract event type from command - align with processGenericTask
            const eventType = this.identifyEventType(task);
            const isWorkSchedule = eventType === 'work';
            console.log('Event type:', eventType, 'Is work schedule:', isWorkSchedule);

            // Generate appropriate title
            const title = isWorkSchedule ? 'Work' : this.generateTitle(parsedCommand, task);
            console.log('Generated title:', title);

            // Stream the processing details
            const details = [
                '\n\nHere\'s what I\'m doing:\n\n',
                `1. Understanding your request:\n${task}\n\n`,
                '2. Parsing command details:\n',
                `- Type: ${isWorkSchedule ? 'Work Schedule' : parsedCommand.action}\n`,
                `- Start: ${parsedCommand.startTime ? new Date(parsedCommand.startTime).toLocaleString() : 'Not specified'}\n`,
                `- Duration: ${parsedCommand.duration} minutes\n\n`
            ];

            // Stream each detail
            for (const detail of details) {
                onChunk(detail);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Extract attendees if it's a meeting
            const attendees = !isWorkSchedule ? this.extractAttendees(task) : [];

            // Generate description
            const description = isWorkSchedule 
                ? `Work scheduled from ${new Date(parsedCommand.startTime).toLocaleString()} to ${
                    new Date(new Date(parsedCommand.startTime).getTime() + parsedCommand.duration * 60000).toLocaleString()
                  }`
                : `${title} scheduled for ${parsedCommand.startTime ? new Date(parsedCommand.startTime).toLocaleString() : 'specified time'}`;

            onChunk('3. Creating calendar event with:\n');
            onChunk(`- Title: ${title}\n`);
            onChunk(`- Description: ${description}\n`);
            if (attendees.length > 0) {
                onChunk(`- Attendees: ${attendees.join(', ')}\n`);
            }
            onChunk('\n');

            // Create the event
            const event = await googleCalendarService.createEvent({
                ...parsedCommand,
                title,
                description,
                context: {
                    isUrgent: parsedCommand.context?.isUrgent || false,
                    isFlexible: parsedCommand.context?.isFlexible || false,
                    priority: parsedCommand.context?.priority || 'normal',
                    timePreference: parsedCommand.context?.timePreference || 'approximate',
                    isWorkSchedule
                },
                attendees
            });

            // Stream the confirmation
            onChunk('4. Event created successfully!\n');
            onChunk(`- Event ID: ${event.id}\n`);
            onChunk(`- Start: ${new Date(event.start.dateTime).toLocaleString()}\n`);
            onChunk(`- End: ${new Date(event.end.dateTime).toLocaleString()}\n`);
            if (attendees.length > 0) {
                onChunk(`- Attendees: ${attendees.join(', ')}\n`);
            }

        } catch (error) {
            console.error('Error processing generic task:', error);
            onChunk(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private extractAttendees(task: string): string[] {
        const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
        return task.match(emailPattern) || [];
    }

    async analyzeData(taskType: string, userId?: string, metadata?: any): Promise<any> {
        if (!userId) return { success: false, error: 'User ID required' };

        try {
            if (taskType === 'analyze_productivity') {
                return await this.analyzeProductivity(userId);
            } else if (taskType === 'analyze_meeting_patterns') {
                return await this.analyzeMeetingPatterns(userId);
            } else if (taskType === 'analyze_time_usage') {
                return await this.analyzeTimeUsage(userId);
            } else {
                return { success: false, error: 'Unknown analysis type' };
            }
        } catch (error) {
            console.error(`Error analyzing data (${taskType}):`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async analyzeProductivity(userId: string): Promise<any> {
        // Get calendar events for the past month
        const now = new Date();
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);

        const events = await googleCalendarService.getEvents(oneMonthAgo, now);

        // Calculate metrics
        const totalMeetings = events.length;
        const totalMeetingMinutes = events.reduce((total, event) => {
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
            return total + durationMinutes;
        }, 0);

        // Group by day of week
        const meetingsByDay = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
        events.forEach(event => {
            const day = new Date(event.start.dateTime).getDay();
            meetingsByDay[day]++;
        });

        // Group by hour of day
        const meetingsByHour = Array(24).fill(0);
        events.forEach(event => {
            const hour = new Date(event.start.dateTime).getHours();
            meetingsByHour[hour]++;
        });

        // Generate insights
        const insights = await this.generateProductivityInsights({
            totalMeetings,
            totalMeetingMinutes,
            meetingsByDay,
            meetingsByHour,
            events
        });

        // Create insight records
        for (const insight of insights) {
            await this.createInsight({
                userId,
                title: insight.title,
                description: insight.description,
                category: 'productivity',
                actionable: insight.actionable,
                actionLink: insight.actionLink,
                timestamp: new Date()
            });
        }

        return {
            success: true,
            metrics: {
                totalMeetings,
                totalMeetingMinutes,
                meetingsByDay,
                meetingsByHour
            },
            insights
        };
    }

    private async generateProductivityInsights(data: any): Promise<any[]> {
        const response = await this.client.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            messages: [
                {
                    role: "user",
                    content: "You are an AI assistant that analyzes calendar data to provide productivity insights. Generate 3-5 actionable insights based on the data provided."
                },
                {
                    role: "user",
                    content: `Generate productivity insights based on the following calendar data:
          
Total meetings: ${data.totalMeetings}
Total meeting minutes: ${data.totalMeetingMinutes}
Meetings by day of week: ${data.meetingsByDay.join(', ')}
Meetings by hour of day: ${data.meetingsByHour.join(', ')}

For each insight, provide:
1. A short title
2. A description with specific observations and recommendations
3. Whether it's actionable (true/false)
4. An action link (can be a simple path like "/calendar/settings")

Format as JSON array.`
                }
            ]
        });

        try {
            // Extract JSON from response
            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonStart = text.indexOf('[');
            const jsonEnd = text.lastIndexOf(']') + 1;
            const jsonStr = text.substring(jsonStart, jsonEnd);
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('Error parsing productivity insights:', error);
            return [];
        }
    }

    private async createInsight(insight: any): Promise<void> {
        try {
            const Insight = mongoose.model('Insight');
            await Insight.create(insight);
        } catch (error) {
            console.error('Error creating insight:', error);
        }
    }

    async getUserStats(userId: string): Promise<any> {
        try {
            // Get tasks for this user
            const AgentTask = mongoose.model('AgentTask');
            const tasks = await AgentTask.find({ userId });

            // Get suggestions for this user
            const Suggestion = mongoose.model('Suggestion');
            const suggestions = await Suggestion.find({ userId });

            // Get insights for this user
            const Insight = mongoose.model('Insight');
            const insights = await Insight.find({ userId });

            // Get events from calendar
            const now = new Date();
            const oneMonthAgo = new Date(now);
            oneMonthAgo.setMonth(now.getMonth() - 1);
            const events = await googleCalendarService.getEvents(oneMonthAgo, now);

            // Calculate statistics
            const totalEvents = events.length;
            const suggestionsGenerated = suggestions.length;
            const suggestionsAccepted = suggestions.filter(s => s.status === 'accepted').length;
            const suggestionsAcceptedRate = suggestionsGenerated > 0
                ? Math.round((suggestionsAccepted / suggestionsGenerated) * 100)
                : 0;

            // Calculate task distribution
            const taskDistribution = [
                { name: 'Calendar Optimization', value: tasks.filter(t => t.title?.includes('calendar') || t.description?.includes('calendar')).length },
                { name: 'Email Drafting', value: tasks.filter(t => t.title?.includes('email') || t.description?.includes('email')).length },
                { name: 'Meeting Analysis', value: tasks.filter(t => t.title?.includes('meeting') || t.description?.includes('meeting')).length },
                { name: 'Productivity Insights', value: tasks.filter(t => t.title?.includes('productivity') || t.description?.includes('productivity')).length },
                {
                    name: 'Other Tasks', value: tasks.length - (
                        tasks.filter(t =>
                            t.title?.includes('calendar') || t.description?.includes('calendar') ||
                            t.title?.includes('email') || t.description?.includes('email') ||
                            t.title?.includes('meeting') || t.description?.includes('meeting') ||
                            t.title?.includes('productivity') || t.description?.includes('productivity')
                        ).length
                    )
                }
            ];

            // Filter out categories with zero values
            const filteredTaskDistribution = taskDistribution.filter(item => item.value > 0);

            // Get weekly activity
            const weeklyActivity = [
                { day: 'Sun', tasks: 0, events: 0 },
                { day: 'Mon', tasks: 0, events: 0 },
                { day: 'Tue', tasks: 0, events: 0 },
                { day: 'Wed', tasks: 0, events: 0 },
                { day: 'Thu', tasks: 0, events: 0 },
                { day: 'Fri', tasks: 0, events: 0 },
                { day: 'Sat', tasks: 0, events: 0 }
            ];

            events.forEach(event => {
                const day = new Date(event.start.dateTime).getDay();
                weeklyActivity[day].events++;
            });

            tasks.forEach(task => {
                const day = new Date(task.createdAt).getDay();
                weeklyActivity[day].tasks++;
            });

            return {
                eventsManaged: totalEvents,
                suggestionsGenerated,
                suggestionsAcceptedRate,
                insightsGenerated: insights.length,
                taskDistribution: filteredTaskDistribution,
                weeklyActivity,
                averageConfidence: 85, // Placeholder - could be calculated from actual confidence scores
                accuracyRate: 92, // Placeholder - could be calculated from feedback
                userSatisfaction: 8.7 // Placeholder - could be calculated from feedback
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            return {
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async generateCancellationEmail(event: any): Promise<string> {
        const response = await this.client.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            system: "You are an assistant that drafts professional cancellation emails for meetings. Create a concise, professional email that explains the cancellation.",
            messages: [
                {
                    role: "user",
                    content: `Draft a cancellation email for a meeting titled "${event.summary}" with the following attendees: ${event.attendees?.map((a: any) => a.email).join(', ') || 'No attendees'}.
              
      Meeting details:
      - Date: ${new Date(event.start.dateTime).toLocaleDateString()}
      - Time: ${new Date(event.start.dateTime).toLocaleTimeString()} - ${new Date(event.end.dateTime).toLocaleTimeString()}
      - Description: ${event.description || 'No description provided'}
      
      Format the email with a subject line on the first line, followed by the body.`
                }
            ]
        });

        return response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate email';
    }

    private async generateRescheduleEmail(event: any, newTime: string): Promise<string> {
        const response = await this.client.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            system: "You are an assistant that drafts professional rescheduling emails for meetings. Create a concise, professional email that explains the time change.",
            messages: [
                {
                    role: "user",
                    content: `Draft a rescheduling email for a meeting titled "${event.summary}" with the following attendees: ${event.attendees?.map((a: any) => a.email).join(', ') || 'No attendees'}.
              
      Meeting details:
      - Original date: ${new Date(event.start.dateTime).toLocaleDateString()}
      - Original time: ${new Date(event.start.dateTime).toLocaleTimeString()} - ${new Date(event.end.dateTime).toLocaleTimeString()}
      - New time: ${new Date(newTime).toLocaleString()}
      - Description: ${event.description || 'No description provided'}
      
      Format the email with a subject line on the first line, followed by the body.`
                }
            ]
        });

        return response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate email';
    }

    private async analyzeMeetingPatterns(userId: string): Promise<any> {
        try {
            // Get calendar events for the past month
            const now = new Date();
            const oneMonthAgo = new Date(now);
            oneMonthAgo.setMonth(now.getMonth() - 1);

            const events = await googleCalendarService.getEvents(oneMonthAgo, now);

            // Calculate meeting patterns
            const meetingsByPerson: Record<string, number> = {};
            const meetingDurations: number[] = [];
            const recurringMeetings: Record<string, number> = {};

            // Analyze each event
            events.forEach(event => {
                // Track attendees
                if (event.attendees) {
                    event.attendees.forEach(attendee => {
                        const email = attendee.email;
                        meetingsByPerson[email] = (meetingsByPerson[email] || 0) + 1;
                    });
                }

                // Track durations
                const start = new Date(event.start.dateTime);
                const end = new Date(event.end.dateTime);
                const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
                meetingDurations.push(durationMinutes);

                // Track recurring meetings
                if (event.recurringEventId) {
                    recurringMeetings[event.summary] = (recurringMeetings[event.summary] || 0) + 1;
                }
            });

            // Calculate statistics
            const averageDuration = meetingDurations.length > 0
                ? meetingDurations.reduce((sum, duration) => sum + duration, 0) / meetingDurations.length
                : 0;

            const topCollaborators = Object.entries(meetingsByPerson)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([email, count]) => ({ email, count }));

            const topRecurringMeetings = Object.entries(recurringMeetings)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([title, count]) => ({ title, count }));

            // Generate insights
            const insights = await this.generateMeetingPatternInsights({
                totalMeetings: events.length,
                averageDuration,
                topCollaborators,
                topRecurringMeetings,
                meetingDurations
            });

            // Create insight records
            for (const insight of insights) {
                await this.createInsight({
                    userId,
                    title: insight.title,
                    description: insight.description,
                    category: 'meeting_patterns',
                    actionable: insight.actionable,
                    actionLink: insight.actionLink,
                    timestamp: new Date()
                });
            }

            return {
                success: true,
                metrics: {
                    totalMeetings: events.length,
                    averageDuration,
                    topCollaborators,
                    topRecurringMeetings,
                    durationDistribution: {
                        short: meetingDurations.filter(d => d <= 30).length,
                        medium: meetingDurations.filter(d => d > 30 && d <= 60).length,
                        long: meetingDurations.filter(d => d > 60).length
                    }
                },
                insights
            };
        } catch (error) {
            console.error('Error analyzing meeting patterns:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async generateMeetingPatternInsights(data: any): Promise<any[]> {
        const response = await this.client.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            system: "You are an AI assistant that analyzes calendar data to provide insights about meeting patterns. Generate 3-5 actionable insights based on the data provided.",
            messages: [
                {
                    role: "user",
                    content: `Generate meeting pattern insights based on the following calendar data:
              
      Total meetings: ${data.totalMeetings}
      Average meeting duration: ${Math.round(data.averageDuration)} minutes
      Top collaborators: ${data.topCollaborators.map((c: { email: string; count: number; }) => `${c.email} (${c.count} meetings)`).join(', ')}
      Top recurring meetings: ${data.topRecurringMeetings.map((m: { title: string; count: number; }) => `${m.title} (${m.count} occurrences)`).join(', ')}
      
      For each insight, provide:
      1. A short title
      2. A description with specific observations and recommendations
      3. Whether it's actionable (true/false)
      4. An action link (can be a simple path like "/calendar/settings")
      
      Format as JSON array.`
                }
            ]
        });

        try {
            // Extract JSON from response
            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonStart = text.indexOf('[');
            const jsonEnd = text.lastIndexOf(']') + 1;
            const jsonStr = text.substring(jsonStart, jsonEnd);
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('Error parsing meeting pattern insights:', error);
            return [];
        }
    }

    private async analyzeTimeUsage(userId: string): Promise<any> {
        try {
            // Get calendar events for the past month
            const now = new Date();
            const oneMonthAgo = new Date(now);
            oneMonthAgo.setMonth(now.getMonth() - 1);

            const events = await googleCalendarService.getEvents(oneMonthAgo, now);

            // Calculate time usage metrics
            const totalMinutesInMeetings = events.reduce((total, event) => {
                const start = new Date(event.start.dateTime);
                const end = new Date(event.end.dateTime);
                const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
                return total + durationMinutes;
            }, 0);

            // Calculate time spent by day of week
            const timeByDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
            events.forEach(event => {
                const start = new Date(event.start.dateTime);
                const end = new Date(event.end.dateTime);
                const dayOfWeek = start.getDay();
                const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
                timeByDayOfWeek[dayOfWeek] += durationMinutes;
            });

            // Calculate time spent by hour of day
            const timeByHourOfDay = Array(24).fill(0);
            events.forEach(event => {
                const start = new Date(event.start.dateTime);
                const end = new Date(event.end.dateTime);
                const startHour = start.getHours();
                const endHour = end.getHours();
                const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

                // Simple distribution across hours
                if (startHour === endHour) {
                    timeByHourOfDay[startHour] += durationMinutes;
                } else {
                    // Distribute across multiple hours
                    const startMinutesInHour = 60 - start.getMinutes();
                    timeByHourOfDay[startHour] += startMinutesInHour;

                    for (let hour = startHour + 1; hour < endHour; hour++) {
                        timeByHourOfDay[hour] += 60;
                    }

                    const endMinutesInHour = end.getMinutes();
                    timeByHourOfDay[endHour] += endMinutesInHour;
                }
            });

            // Generate insights
            const insights = await this.generateTimeUsageInsights({
                totalMinutesInMeetings,
                timeByDayOfWeek,
                timeByHourOfDay,
                totalEvents: events.length
            });

            // Create insight records
            for (const insight of insights) {
                await this.createInsight({
                    userId,
                    title: insight.title,
                    description: insight.description,
                    category: 'time_usage',
                    actionable: insight.actionable,
                    actionLink: insight.actionLink,
                    timestamp: new Date()
                });
            }

            // Calculate percentage of work time spent in meetings
            // Assuming 8-hour workdays, 5 days a week, 4 weeks in the analyzed month
            const totalWorkMinutes = 8 * 60 * 5 * 4;
            const percentageInMeetings = (totalMinutesInMeetings / totalWorkMinutes) * 100;

            return {
                success: true,
                metrics: {
                    totalMinutesInMeetings,
                    percentageInMeetings: Math.round(percentageInMeetings),
                    timeByDayOfWeek,
                    timeByHourOfDay,
                    mostBusyDay: timeByDayOfWeek.indexOf(Math.max(...timeByDayOfWeek)),
                    mostBusyHour: timeByHourOfDay.indexOf(Math.max(...timeByHourOfDay))
                },
                insights
            };
        } catch (error) {
            console.error('Error analyzing time usage:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async generateTimeUsageInsights(data: any): Promise<any[]> {
        const response = await this.client.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            system: "You are an AI assistant that analyzes calendar data to provide insights about time usage patterns. Generate 3-5 actionable insights based on the data provided.",
            messages: [
                {
                    role: "user",
                    content: `Generate time usage insights based on the following calendar data:
              
      Total time in meetings: ${Math.round(data.totalMinutesInMeetings)} minutes
      Time by day of week (minutes): ${data.timeByDayOfWeek.join(', ')}
      Time by hour of day (minutes): ${data.timeByHourOfDay.join(', ')}
      Total events: ${data.totalEvents}
      
      For each insight, provide:
      1. A short title
      2. A description with specific observations and recommendations
      3. Whether it's actionable (true/false)
      4. An action link (can be a simple path like "/calendar/settings")
      
      Format as JSON array.`
                }
            ]
        });

        try {
            // Extract JSON from response
            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonStart = text.indexOf('[');
            const jsonEnd = text.lastIndexOf(']') + 1;
            const jsonStr = text.substring(jsonStart, jsonEnd);
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('Error parsing time usage insights:', error);
            return [];
        }
    }

    async executeSuggestion(suggestion: any): Promise<void> {
        try {
            // Execute the suggestion based on its type and action
            const { type, action } = suggestion;

            if (action.type === 'create_event') {
                await this.createCalendarEvent(suggestion.userId, action.data);
            } else if (action.type === 'reschedule_event') {
                await this.rescheduleCalendarEvent(suggestion.userId, action.data);
            } else if (action.type === 'cancel_event') {
                await this.cancelCalendarEvent(suggestion.userId, action.data);
            } else if (action.type === 'send_email') {
                await this.sendEmail(suggestion.userId, action.data);
            } else if (action.type === 'copy_email_draft') {
                // No action needed - user will copy the draft manually
            }

            // Mark suggestion as executed
            suggestion.status = 'executed';
            await suggestion.save();
        } catch (error) {
            console.error('Error executing suggestion:', error);
            throw error;
        }
    }

    private async createCalendarEvent(userId: string, data: any): Promise<void> {
        try {
            await googleCalendarService.createEvent(data);
        } catch (error) {
            console.error('Error creating calendar event:', error);
            throw error;
        }
    }

    private async rescheduleCalendarEvent(userId: string, data: any): Promise<void> {
        try {
            const { eventId, newStartTime } = data;
            await googleCalendarService.updateEvent(eventId, { startTime: new Date(newStartTime) });
        } catch (error) {
            console.error('Error rescheduling calendar event:', error);
            throw error;
        }
    }

    private async cancelCalendarEvent(userId: string, data: any): Promise<void> {
        try {
            await googleCalendarService.deleteEvent(data.eventId);
        } catch (error) {
            console.error('Error canceling calendar event:', error);
            throw error;
        }
    }

    private async sendEmail(userId: string, data: any): Promise<void> {
        try {
            // Implement email sending logic or integrate with email service
            console.log('Email would be sent with data:', data);
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }

    private toTitleCase(str: string): string {
        return str
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

export const agentService = new AgentService();