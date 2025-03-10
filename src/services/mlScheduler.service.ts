import mongoose from 'mongoose';
import { Anthropic } from '@anthropic-ai/sdk';

class MLSchedulerService {
    private client: Anthropic;
    
    constructor() {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || ''
        });
    }

    /**
     * Predicts optimal buffer time between meetings based on meeting characteristics
     * @param currentMeeting Information about the current meeting
     * @param nextMeeting Information about the next meeting
     * @param userPreferences User's preferences
     * @returns Optimal buffer time in minutes
     */
    async predictOptimalBufferTime(
        currentMeeting: any, 
        nextMeeting: any, 
        userPreferences: any
    ): Promise<number> {
        try {
            // Check if we have a personalized model for this user
            const personalModel = await this.getUserModel(userPreferences.userId, 'bufferPrediction');
            
            if (personalModel && personalModel.accuracy > 0.7) {
                // Use personalized model
                return this.applyPersonalizedBufferModel(personalModel, currentMeeting, nextMeeting, userPreferences);
            }
            
            // Otherwise use default heuristic approach
            return this.calculateOptimalBufferTime(currentMeeting, nextMeeting, userPreferences);
        } catch (error) {
            console.error('Error predicting optimal buffer time:', error);
            // Return a reasonable default
            return 15;
        }
    }

    /**
     * Predicts a user's productivity during different hours based on past behavior
     * @param userId User ID
     * @param dayOfWeek Day of week (0-6)
     * @returns Productivity score for each hour (0-23)
     */
    async predictProductivityByHour(userId: string, dayOfWeek: number): Promise<number[]> {
        try {
            const userPreferences = await mongoose.model('UserPreferences').findOne({ userId });
            
            if (!userPreferences) {
                return this.getDefaultProductivityPattern(dayOfWeek);
            }
            
            // Check if we have a personalized model
            const personalModel = await this.getUserModel(userId, 'productivityPrediction');
            
            if (personalModel && personalModel.modelData?.productivityByHour) {
                // If we have data for the specific day, use it
                if (personalModel.modelData.productivityByHour[dayOfWeek]) {
                    return personalModel.modelData.productivityByHour[dayOfWeek];
                }
            }
            
            // Otherwise use preference-based heuristics
            return this.generateProductivityPattern(userPreferences);
        } catch (error) {
            console.error('Error predicting productivity by hour:', error);
            return this.getDefaultProductivityPattern(dayOfWeek);
        }
    }

    /**
     * Classifies a meeting type based on title, description, and attendees
     * @param meetingDetails Meeting details
     * @returns Meeting type classification with confidence score
     */
    async classifyMeetingType(meetingDetails: any): Promise<{ type: string; confidence: number }> {
        try {
            // Extract features from meeting details
            const title = meetingDetails.title || meetingDetails.summary || '';
            const description = meetingDetails.description || '';
            const attendeeCount = meetingDetails.attendees?.length || 0;
            
            // Try to use Claude API for classification
            const response = await this.client.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 100,
                messages: [
                    {
                        role: "user", 
                        content: `Classify this meeting into one of these types: oneOnOne, team, client, interview, brainstorm, presentation, check-in, review, or other.
                            
                        Meeting details:
                        Title: ${title}
                        Description: ${description}
                        Number of attendees: ${attendeeCount}
                            
                        Return only a JSON object with "type" and "confidence" (0-1 value) properties.`
                    }
                ]
            });
            
            // Parse response
            try {
                const content = response.content[0].type === 'text' ? response.content[0].text : '';
                const jsonStart = content.indexOf('{');
                const jsonEnd = content.lastIndexOf('}') + 1;
                
                if (jsonStart >= 0 && jsonEnd > jsonStart) {
                    const jsonStr = content.substring(jsonStart, jsonEnd);
                    const result = JSON.parse(jsonStr);
                    return {
                        type: result.type,
                        confidence: result.confidence
                    };
                }
            } catch (parseError) {
                console.error('Error parsing meeting type classification:', parseError);
            }
            
            // Fallback to rule-based classification
            return this.classifyMeetingTypeByRules(title, description, attendeeCount);
        } catch (error) {
            console.error('Error classifying meeting type:', error);
            return { type: 'other', confidence: 0.5 };
        }
    }

    /**
     * Identifies optimal time blocks for focused work
     * @param events List of calendar events
     * @param userPreferences User preferences
     * @returns List of optimal focus time blocks
     */
    async identifyOptimalFocusTimeBlocks(events: any[], userPreferences: any): Promise<any[]> {
        try {
            // Get dates in the range
            const dates = new Set<string>();
            events.forEach(event => {
                const date = new Date(event.start.dateTime);
                dates.add(date.toDateString());
            });
            
            const focusTimeBlocks: any[] = [];
            
            // For each date, identify optimal focus time
            for (const dateStr of dates) {
                const date = new Date(dateStr);
                const dayOfWeek = date.getDay();
                
                // Get productivity scores for this day
                const productivityScores = await this.predictProductivityByHour(
                    userPreferences.userId,
                    dayOfWeek
                );
                
                // Get events for this day
                const dayEvents = events.filter(event => 
                    new Date(event.start.dateTime).toDateString() === dateStr
                ).sort((a, b) => 
                    new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime()
                );
                
                // Find gaps between events
                const timeBlocks = this.findTimeBlocksBetweenEvents(
                    dayEvents,
                    date,
                    userPreferences
                ) as {
                    start: Date;
                    end: Date;
                    duration: number;
                }[];
                
                // Score each time block based on duration and productivity
                const scoredBlocks = timeBlocks.map(block => {
                    const startHour = block.start.getHours();
                    const endHour = block.end.getHours();
                    
                    // Calculate average productivity score for this block
                    let productivityScore = 0;
                    let hoursCount = 0;
                    
                    for (let hour = startHour; hour <= endHour; hour++) {
                        if (hour < productivityScores.length) {
                            productivityScore += productivityScores[hour];
                            hoursCount++;
                        }
                    }
                    
                    const avgProductivity = hoursCount > 0 ? productivityScore / hoursCount : 0;
                    
                    // Score based on duration and productivity
                    // Weight longer blocks more heavily
                    const durationScore = Math.min(block.duration / 120, 1); // Max score at 2 hours
                    const score = (durationScore * 0.7) + (avgProductivity * 0.3);
                    
                    return {
                        ...block,
                        productivityScore: avgProductivity,
                        score
                    };
                });
                
                // Filter to blocks that meet minimum duration
                const minDuration = userPreferences.focusTimePreferences?.minimumBlockDuration || 60;
                const viableBlocks = scoredBlocks
                    .filter(block => block.duration >= minDuration)
                    .sort((a, b) => b.score - a.score);
                
                // Add the top blocks to our result
                focusTimeBlocks.push(...viableBlocks.slice(0, 2)); // Top 2 blocks per day
            }
            
            return focusTimeBlocks;
        } catch (error) {
            console.error('Error identifying optimal focus time blocks:', error);
            return [];
        }
    }

    /**
     * Processes feedback on scheduling suggestions to improve models
     * @param userId User ID
     * @param suggestionId Suggestion ID
     * @param actionType Type of scheduling action
     * @param result Result (accepted, rejected, etc.)
     * @param modifications Any modifications made
     */
    async processSchedulingFeedback(
        userId: string,
        suggestionId: string,
        actionType: string,
        result: 'accepted' | 'rejected' | 'modified' | 'ignored',
        modifications?: any
    ): Promise<void> {
        try {
            // Save feedback
            const SchedulingFeedback = mongoose.model('SchedulingFeedback');
            await SchedulingFeedback.create({
                userId,
                suggestionId,
                actionType,
                result,
                modifications,
                timestamp: new Date()
            });
            
            // Update learning data in user preferences
            const UserPreferences = mongoose.model('UserPreferences');
            const userPrefs = await UserPreferences.findOne({ userId });
            
            if (userPrefs) {
                const learningData = userPrefs.learningData || {
                    reschedulingAcceptanceRate: 0,
                    bufferSuggestionAcceptanceRate: 0,
                    focusTimeConsolidationAcceptanceRate: 0,
                    commonRejectionPatterns: [],
                    lastModelUpdate: new Date()
                };
                
                // Update the relevant acceptance rate
                if (actionType === 'reschedule') {
                    // Get total reschedule suggestions
                    const totalReschedule = await SchedulingFeedback.countDocuments({
                        userId,
                        actionType: 'reschedule'
                    });
                    
                    // Get accepted reschedule suggestions
                    const acceptedReschedule = await SchedulingFeedback.countDocuments({
                        userId,
                        actionType: 'reschedule',
                        result: 'accepted'
                    });
                    
                    if (totalReschedule > 0) {
                        learningData.reschedulingAcceptanceRate = acceptedReschedule / totalReschedule;
                    }
                } else if (actionType === 'bufferTime') {
                    // Similar for buffer time
                    const totalBuffer = await SchedulingFeedback.countDocuments({
                        userId,
                        actionType: 'bufferTime'
                    });
                    
                    const acceptedBuffer = await SchedulingFeedback.countDocuments({
                        userId,
                        actionType: 'bufferTime',
                        result: 'accepted'
                    });
                    
                    if (totalBuffer > 0) {
                        learningData.bufferSuggestionAcceptanceRate = acceptedBuffer / totalBuffer;
                    }
                } else if (actionType === 'focusTimeConsolidation') {
                    // Similar for focus time
                    const totalFocus = await SchedulingFeedback.countDocuments({
                        userId,
                        actionType: 'focusTimeConsolidation'
                    });
                    
                    const acceptedFocus = await SchedulingFeedback.countDocuments({
                        userId,
                        actionType: 'focusTimeConsolidation',
                        result: 'accepted'
                    });
                    
                    if (totalFocus > 0) {
                        learningData.focusTimeConsolidationAcceptanceRate = acceptedFocus / totalFocus;
                    }
                }
                
                // Save updated preferences
                userPrefs.learningData = learningData;
                await userPrefs.save();
                
                // Check if we have enough data to update models
                const totalFeedback = await SchedulingFeedback.countDocuments({ userId });
                if (totalFeedback >= 10 && this.shouldUpdateModels(learningData.lastModelUpdate)) {
                    this.updateUserModels(userId);
                }
            }
        } catch (error) {
            console.error('Error processing scheduling feedback:', error);
        }
    }

    /**
     * Updates all ML models for a user based on accumulated feedback
     * @param userId User ID
     * @private
     */
    private async updateUserModels(userId: string): Promise<void> {
        try {
            // Update buffer prediction model
            await this.updateBufferPredictionModel(userId);
            
            // Update productivity prediction model
            await this.updateProductivityPredictionModel(userId);
            
            // Update meeting type classifier
            await this.updateMeetingTypeClassifier(userId);
            
            // Update focus time optimizer
            await this.updateFocusTimeOptimizer(userId);
            
            // Update the lastModelUpdate timestamp
            const UserPreferences = mongoose.model('UserPreferences');
            await UserPreferences.updateOne(
                { userId },
                { 'learningData.lastModelUpdate': new Date() }
            );
        } catch (error) {
            console.error('Error updating user models:', error);
        }
    }

    /**
     * Updates the buffer prediction model for a user
     * @param userId User ID
     * @private
     */
    private async updateBufferPredictionModel(userId: string): Promise<void> {
        try {
            // Get all buffer time feedback
            const SchedulingFeedback = mongoose.model('SchedulingFeedback');
            const feedback = await SchedulingFeedback.find({
                userId,
                actionType: 'bufferTime'
            }).sort({ timestamp: -1 }).limit(100);
            
            if (feedback.length < 5) {
                // Not enough data yet
                return;
            }
            
            // Extract features and outcomes
            const trainingData = await Promise.all(feedback.map(async item => {
                // Get the original suggestion
                const Suggestion = mongoose.model('Suggestion');
                const suggestion = await Suggestion.findById(item.suggestionId);
                
                if (!suggestion) return null;
                
                // Get meeting details
                const eventId1 = suggestion.action?.data?.event1Id;
                const eventId2 = suggestion.action?.data?.event2Id;
                
                if (!eventId1 || !eventId2) return null;
                
                // This is a simplified version - in a real system, we'd store features
                // with the suggestion or retrieve from historical data
                return {
                    // Features of the meetings
                    meeting1Type: suggestion.metadata?.meeting1Type || 'unknown',
                    meeting2Type: suggestion.metadata?.meeting2Type || 'unknown',
                    meeting1Attendees: suggestion.metadata?.meeting1Attendees || 0,
                    meeting2Attendees: suggestion.metadata?.meeting2Attendees || 0,
                    meeting1Duration: suggestion.metadata?.meeting1Duration || 30,
                    meeting2Duration: suggestion.metadata?.meeting2Duration || 30,
                    dayOfWeek: suggestion.metadata?.dayOfWeek || 1,
                    timeOfDay: suggestion.metadata?.timeOfDay || 12,
                    
                    // Outcome
                    suggestedBuffer: suggestion.action?.data?.bufferMinutes || 15,
                    outcome: item.result,
                    actualBuffer: item.result === 'modified' ? 
                        item.modifications?.bufferMinutes : 
                        suggestion.action?.data?.bufferMinutes || 15
                };
            }));
            
            // Filter out nulls
            const validData = trainingData.filter(item => item !== null);
            
            if (validData.length < 5) {
                // Not enough valid data
                return;
            }
            
            // Build a simple model - in reality, this would use a machine learning algorithm
            // Here we'll just use a simple heuristic based on the data
            
            // Calculate average buffer for each meeting type combination
            let typeBuffers: Record<string, {total: number; count: number; accepted: number}>;
            const typeBuffersMap: Record<string, {total: number; count: number; accepted: number}> = {};
            
            validData.forEach(item => {
                const key = `${item.meeting1Type}_${item.meeting2Type}`;
                if (!typeBuffersMap[key]) {
                    typeBuffersMap[key] = {
                        total: 0,
                        count: 0,
                        accepted: 0
                    };
                }
                
                if (item.outcome === 'accepted') {
                    typeBuffersMap[key].total += item.suggestedBuffer;
                    typeBuffersMap[key].accepted++;
                } else if (item.outcome === 'modified') {
                    typeBuffersMap[key].total += item.actualBuffer;
                }
                
                typeBuffersMap[key].count++;
            });
            
            // Replace typeBuffers with our properly typed version
            typeBuffers = typeBuffersMap;
            
            // Calculate averages
            const buffersByType: Record<string, number> = {};
            let overallAccuracy = 0;
            let totalTypes = 0;
            
            for (const [key, bufferData] of Object.entries(typeBuffers)) {
                if (bufferData.count > 0) {
                    buffersByType[key] = Math.round(bufferData.total / bufferData.count);
                    overallAccuracy += bufferData.accepted / bufferData.count;
                    totalTypes++;
                }
            }
            
            // Calculate attendee-based adjustments
            const attendeeAdjustments: Record<number, { total: number; count: number }> = {};
            validData.forEach(item => {
                const attendeeBucket = Math.floor(item.meeting1Attendees / 3) * 3; // Group by 0-2, 3-5, 6-8, etc.
                
                if (!attendeeAdjustments[attendeeBucket]) {
                    attendeeAdjustments[attendeeBucket] = {
                        total: 0,
                        count: 0
                    };
                }
                
                if (item.outcome === 'accepted') {
                    attendeeAdjustments[attendeeBucket].total += item.suggestedBuffer;
                } else if (item.outcome === 'modified') {
                    attendeeAdjustments[attendeeBucket].total += item.actualBuffer;
                }
                
                attendeeAdjustments[attendeeBucket].count++;
            });
            
            // Calculate average adjustments by attendee count
            const adjustmentsByAttendees: Record<string, number> = {};
            for (const [bucket, attData] of Object.entries(attendeeAdjustments)) {
                if (attData.count > 0) {
                    // Calculate the average as a percentage adjustment
                    // e.g., +20% buffer for meetings with 6-8 attendees
                    const avgBuffer = attData.total / attData.count;
                    adjustmentsByAttendees[bucket] = avgBuffer / 15; // Relative to 15-min default
                }
            }
            
            // Calculate time-of-day adjustments
            type TimeAdjustment = { total: number; count: number };
            const timeAdjustments: Record<string, TimeAdjustment> = {
                morning: { total: 0, count: 0 },
                afternoon: { total: 0, count: 0 },
                evening: { total: 0, count: 0 }
            };
            
            validData.forEach(item => {
                let timeCategory;
                if (item.timeOfDay < 12) {
                    timeCategory = 'morning';
                } else if (item.timeOfDay < 17) {
                    timeCategory = 'afternoon';
                } else {
                    timeCategory = 'evening';
                }
                
                if (item.outcome === 'accepted') {
                    timeAdjustments[timeCategory].total += item.suggestedBuffer;
                } else if (item.outcome === 'modified') {
                    timeAdjustments[timeCategory].total += item.actualBuffer;
                }
                
                timeAdjustments[timeCategory].count++;
            });
            
            // Calculate average adjustments by time of day
            const adjustmentsByTime: Record<string, number> = {};
            for (const [time, timeData] of Object.entries(timeAdjustments)) {
                if (timeData.count > 0) {
                    adjustmentsByTime[time] = timeData.total / timeData.count;
                }
            }
            
            // Create the model data
            const modelData = {
                buffersByType,
                adjustmentsByAttendees,
                adjustmentsByTime,
                baseBuffer: 15, // Default buffer
                version: '1.0'
            };
            
            // Calculate overall accuracy
            const accuracy = totalTypes > 0 ? overallAccuracy / totalTypes : 0.5;
            
            // Save the model
            const SchedulingModel = mongoose.model('SchedulingModel');
            
            // Check if model already exists
            const existingModel = await SchedulingModel.findOne({
                userId,
                modelType: 'bufferPrediction'
            });
            
            if (existingModel) {
                // Update existing model
                existingModel.modelData = modelData;
                existingModel.accuracy = accuracy;
                existingModel.updatedAt = new Date();
                await existingModel.save();
            } else {
                // Create new model
                await SchedulingModel.create({
                    userId,
                    modelType: 'bufferPrediction',
                    modelData,
                    version: '1.0',
                    accuracy,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
        } catch (error) {
            console.error('Error updating buffer prediction model:', error);
        }
    }

    /**
     * Updates the productivity prediction model for a user
     * @param userId User ID
     * @private
     */
    private async updateProductivityPredictionModel(userId: string): Promise<void> {
        // Similar implementation to updateBufferPredictionModel
        // For brevity, not implementing all the details here
    }

    /**
     * Updates the meeting type classifier for a user
     * @param userId User ID
     * @private
     */
    private async updateMeetingTypeClassifier(userId: string): Promise<void> {
        // Similar implementation to updateBufferPredictionModel
        // For brevity, not implementing all the details here
    }

    /**
     * Updates the focus time optimizer for a user
     * @param userId User ID
     * @private
     */
    private async updateFocusTimeOptimizer(userId: string): Promise<void> {
        // Similar implementation to updateBufferPredictionModel
        // For brevity, not implementing all the details here
    }

    /**
     * Retrieves a user's ML model
     * @param userId User ID
     * @param modelType Model type
     * @private
     */
    private async getUserModel(userId: string, modelType: string): Promise<any> {
        try {
            const SchedulingModel = mongoose.model('SchedulingModel');
            return await SchedulingModel.findOne({
                userId,
                modelType
            });
        } catch (error) {
            console.error(`Error retrieving ${modelType} model:`, error);
            return null;
        }
    }

    /**
     * Calculates the optimal buffer time between meetings using a heuristic approach
     * @param currentMeeting Current meeting
     * @param nextMeeting Next meeting
     * @param userPreferences User preferences
     * @private
     */
    private calculateOptimalBufferTime(
        currentMeeting: any, 
        nextMeeting: any, 
        userPreferences: any
    ): number {
        // Basic buffer estimation based on meeting characteristics
        let baseBuffer = 15; // Default 15-minute buffer
        
        // Adjust based on meeting duration - longer meetings may need longer buffers
        if (currentMeeting.duration > 60) {
            baseBuffer += 5;
        }
        
        // Adjust based on meeting type (inferred from title/description)
        const currentMeetingType = this.inferMeetingType(currentMeeting);
        const nextMeetingType = this.inferMeetingType(nextMeeting);
        
        // High-intensity meetings need longer buffers
        if (currentMeetingType === 'high_intensity' || nextMeetingType === 'high_intensity') {
            baseBuffer += 10;
        }
        
        // Meetings with many attendees may require follow-up time
        if (currentMeeting.attendeeCount > 5) {
            baseBuffer += 5;
        }
        
        // Adjust based on time of day (people may need more breaks in afternoon)
        if (nextMeeting.hourOfDay >= 14) { // Afternoon meetings
            baseBuffer += 5;
        }
        
        // User preferences override
        if (userPreferences.bufferTimePreference) {
            return userPreferences.bufferTimePreference;
        }
        
        return baseBuffer;
    }

    /**
     * Applies a personalized buffer model to predict optimal buffer time
     * @param model Personalized model
     * @param currentMeeting Current meeting
     * @param nextMeeting Next meeting
     * @param userPreferences User preferences
     * @private
     */
    private applyPersonalizedBufferModel(
        model: any,
        currentMeeting: any,
        nextMeeting: any,
        userPreferences: any
    ): number {
        const modelData = model.modelData as {
            buffersByType: Record<string, number>;
            adjustmentsByAttendees: Record<number, number>;
            adjustmentsByTime: Record<string, number>;
            baseBuffer: number;
        };
        
        // Get meeting types
        const currentType = this.inferMeetingType(currentMeeting);
        const nextType = this.inferMeetingType(nextMeeting);
        
        // Get base buffer from model, or use default
        const typeKey = `${currentType}_${nextType}`;
        let buffer = (modelData.buffersByType && modelData.buffersByType[typeKey]) || 
                   modelData.baseBuffer || 15;
        
        // Apply attendee-based adjustment
        const attendeeBucket = Math.floor(currentMeeting.attendeeCount / 3) * 3;
        if (modelData.adjustmentsByAttendees && modelData.adjustmentsByAttendees[attendeeBucket]) {
            buffer = buffer * modelData.adjustmentsByAttendees[attendeeBucket];
        }
        
        // Apply time-of-day adjustment
        let timeCategory: 'morning' | 'afternoon' | 'evening';
        if (nextMeeting.hourOfDay < 12) {
            timeCategory = 'morning';
        } else if (nextMeeting.hourOfDay < 17) {
            timeCategory = 'afternoon';
        } else {
            timeCategory = 'evening';
        }
        
        if (modelData.adjustmentsByTime && modelData.adjustmentsByTime[timeCategory]) {
            // Blend the model adjustment with the base
            buffer = (buffer + modelData.adjustmentsByTime[timeCategory]) / 2;
        }
        
        // Ensure buffer is reasonable
        buffer = Math.max(5, Math.min(45, Math.round(buffer)));
        
        return buffer;
    }
    
    /**
     * Infers the meeting type from its features
     * @param meeting Meeting details
     * @private
     */
    private inferMeetingType(meeting: any): string {
        const title = (meeting.summary || '').toLowerCase();
        const description = (meeting.description || '').toLowerCase();
        
        // Detect high-intensity meetings
        if (
            title.includes('review') || 
            title.includes('interview') || 
            title.includes('presentation') ||
            title.includes('demo') ||
            description.includes('prepare') ||
            description.includes('present')
        ) {
            return 'high_intensity';
        }
        
        // Detect collaborative meetings
        if (
            title.includes('brainstorm') ||
            title.includes('workshop') ||
            title.includes('planning') ||
            description.includes('collaborate') ||
            description.includes('discuss')
        ) {
            return 'collaborative';
        }
        
        // Default to standard meeting
        return 'standard';
    }

    /**
     * Determines if models should be updated based on last update time
     * @param lastUpdate Last update timestamp
     * @private
     */
    private shouldUpdateModels(lastUpdate: Date): boolean {
        if (!lastUpdate) return true;
        
        const now = new Date();
        const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
        
        // Update if it's been more than 7 days
        return daysSinceUpdate > 7;
    }

    /**
     * Classifies meeting type using rule-based approach
     * @param title Meeting title
     * @param description Meeting description
     * @param attendeeCount Number of attendees
     * @private
     */
    private classifyMeetingTypeByRules(
        title: string,
        description: string,
        attendeeCount: number
    ): { type: string; confidence: number } {
        title = title.toLowerCase();
        description = description.toLowerCase();
        
        // Simple rules-based classification
        if (attendeeCount === 1) {
            return { type: 'oneOnOne', confidence: 0.9 };
        }
        
        if (title.includes('interview') || description.includes('interview')) {
            return { type: 'interview', confidence: 0.85 };
        }
        
        if (title.includes('brainstorm') || description.includes('brainstorm') || 
            title.includes('ideation') || description.includes('ideation')) {
            return { type: 'brainstorm', confidence: 0.8 };
        }
        
        if (title.includes('client') || description.includes('client') ||
            title.includes('customer') || description.includes('customer')) {
            return { type: 'client', confidence: 0.75 };
        }
        
        if (title.includes('review') || description.includes('review') ||
            title.includes('present') || description.includes('present')) {
            return { type: 'presentation', confidence: 0.7 };
        }
        
        if (title.includes('check-in') || description.includes('check-in') ||
            title.includes('check in') || description.includes('check in') ||
            title.includes('checkin') || description.includes('checkin')) {
            return { type: 'check-in', confidence: 0.8 };
        }
        
        if (title.includes('team') || description.includes('team') ||
            attendeeCount >= 4) {
            return { type: 'team', confidence: 0.6 };
        }
        
        // Default type with low confidence
        return { type: 'other', confidence: 0.5 };
    }

    /**
     * Finds time blocks between events
     * @param events Calendar events
     * @param date Date to analyze
     * @param userPreferences User preferences
     * @private
     */
    private findTimeBlocksBetweenEvents(
        events: any[],
        date: Date,
        userPreferences: any
    ): {start: Date; end: Date; duration: number}[] {
        // Get working hours
        const workingHours = userPreferences.workingHours || { start: '09:00', end: '17:00' };
        const workStart = workingHours.start.split(':').map(Number);
        const workEnd = workingHours.end.split(':').map(Number);
        
        // Start with the whole working day
        const dayStart = new Date(date);
        dayStart.setHours(workStart[0], workStart[1] || 0, 0, 0);
        
        const dayEnd = new Date(date);
        dayEnd.setHours(workEnd[0], workEnd[1] || 0, 0, 0);
        
        // No events - return the entire day
        if (events.length === 0) {
            return [{
                start: dayStart,
                end: dayEnd,
                duration: (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60)
            }];
        }
        
        // Find gaps between events
        const timeBlocks: {start: Date; end: Date; duration: number}[] = [];
        let lastEndTime = dayStart;
        
        // Add blocks before first event, between events, and after last event
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const eventStart = new Date(event.start.dateTime);
            const eventEnd = new Date(event.end.dateTime);
            
            // If there's a gap before this event
            if (eventStart.getTime() > lastEndTime.getTime()) {
                const blockDuration = (eventStart.getTime() - lastEndTime.getTime()) / (1000 * 60);
                
                timeBlocks.push({
                    start: new Date(lastEndTime),
                    end: new Date(eventStart),
                    duration: blockDuration
                });
            }
            
            lastEndTime = eventEnd;
        }
        
        // Check for time after last event
        if (lastEndTime.getTime() < dayEnd.getTime()) {
            const blockDuration = (dayEnd.getTime() - lastEndTime.getTime()) / (1000 * 60);
            
            timeBlocks.push({
                start: new Date(lastEndTime),
                end: new Date(dayEnd),
                duration: blockDuration
            });
        }
        
        return timeBlocks;
    }

    /**
     * Gets default productivity pattern for a day
     * @param dayOfWeek Day of week (0-6)
     * @private
     */
    private getDefaultProductivityPattern(dayOfWeek: number): number[] {
        // Default productivity model - most productive in morning, dip after lunch
        // Higher values = more productive
        const defaultPattern = [
            0.3, 0.2, 0.1, 0.1, 0.1, 0.2, // 0-5 AM: low productivity (night)
            0.4, 0.6, 0.8, 0.9, 0.95, 0.9, // 6-11 AM: rising productivity (morning)
            0.8, 0.6, 0.7, 0.8, 0.85, 0.8, // 12-5 PM: dip after lunch, recovery (afternoon)
            0.7, 0.6, 0.5, 0.4, 0.3, 0.2   // 6-11 PM: decreasing productivity (evening)
        ];
        
        // Adjust based on day of week
        // Mon-Wed (1-3): normal pattern
        // Thu-Fri (4-5): slight afternoon boost
        // Sat-Sun (0,6): generally lower productivity
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            // Weekend - lower productivity overall
            return defaultPattern.map(v => v * 0.8);
        } else if (dayOfWeek === 4 || dayOfWeek === 5) {
            // Thu-Fri - afternoon boost
            return defaultPattern.map((v, i) => {
                if (i >= 12 && i <= 17) {
                    return v * 1.1; // Boost afternoon
                }
                return v;
            });
        }
        
        return defaultPattern;
    }

    /**
     * Generates productivity pattern based on user preferences
     * @param userPreferences User preferences
     * @private
     */
    private generateProductivityPattern(userPreferences: any): number[] {
        const pattern = this.getDefaultProductivityPattern(new Date().getDay());
        
        // Adjust based on user's focus time preference
        const focusPreference = userPreferences.productivityPatterns?.focusTimePreference || 'morning';
        
        if (focusPreference === 'morning') {
            // Boost morning hours
            return pattern.map((v, i) => {
                if (i >= 8 && i <= 11) {
                    return Math.min(v * 1.2, 1.0); // Boost but cap at 1.0
                }
                return v;
            });
        } else if (focusPreference === 'afternoon') {
            // Boost afternoon hours
            return pattern.map((v, i) => {
                if (i >= 13 && i <= 16) {
                    return Math.min(v * 1.2, 1.0);
                }
                return v;
            });
        } else if (focusPreference === 'evening') {
            // Boost evening hours
            return pattern.map((v, i) => {
                if (i >= 18 && i <= 21) {
                    return Math.min(v * 1.2, 1.0);
                }
                return v;
            });
        }
        
        return pattern;
    }
}

export const mlSchedulerService = new MLSchedulerService();