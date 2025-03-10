import { Request, Response, NextFunction } from 'express';
import { mlSchedulerService } from '../services/mlScheduler.service';
import mongoose from 'mongoose';
import googleCalendarService from '../services/googleCalendar.service';

// Extend Express Request type to include user
interface AuthRequest extends Request {
    user: {
        id: string;
    };
}

export const getSchedulingOptimizations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = (req as AuthRequest).user.id;
        
        // Get upcoming events
        const now = new Date();
        const twoWeeksLater = new Date(now);
        twoWeeksLater.setDate(now.getDate() + 14);
        
        const events = await googleCalendarService.getEvents(now, twoWeeksLater);
        
        // Get user preferences
        const userPreferences = await mongoose.model('UserPreferences').findOne({ userId });
        
        if (!userPreferences) {
            res.status(404).json({ error: 'User preferences not found' });
            return;
        }
        
        // Find optimal focus time blocks
        const focusTimeBlocks = await mlSchedulerService.identifyOptimalFocusTimeBlocks(
            events,
            userPreferences
        );
        
        // Analyze meetings for buffer time suggestions
        const bufferSuggestions = [];
        
        for (let i = 0; i < events.length - 1; i++) {
            const current = events[i];
            const next = events[i + 1];
            
            const currentEnd = new Date(current.end.dateTime);
            const nextStart = new Date(next.start.dateTime);
            const minutesBetween = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);
            
            // Extract meeting features
            const currentMeeting = {
                id: current.id,
                summary: current.summary,
                description: current.description || '',
                attendeeCount: current.attendees?.length || 0,
                duration: (new Date(current.end.dateTime).getTime() - new Date(current.start.dateTime).getTime()) / (1000 * 60)
            };
            
            const nextMeeting = {
                id: next.id,
                summary: next.summary,
                description: next.description || '',
                attendeeCount: next.attendees?.length || 0,
                duration: (new Date(next.end.dateTime).getTime() - new Date(next.start.dateTime).getTime()) / (1000 * 60),
                hourOfDay: new Date(next.start.dateTime).getHours()
            };
            
            // Use ML to determine optimal buffer
            const optimalBuffer = await mlSchedulerService.predictOptimalBufferTime(
                currentMeeting,
                nextMeeting,
                userPreferences
            );
            
            if (minutesBetween < optimalBuffer) {
                // Classify meeting types
                const currentType = await mlSchedulerService.classifyMeetingType(currentMeeting);
                const nextType = await mlSchedulerService.classifyMeetingType(nextMeeting);
                
                bufferSuggestions.push({
                    currentMeeting: {
                        id: current.id,
                        title: current.summary,
                        start: current.start.dateTime,
                        end: current.end.dateTime,
                        type: currentType.type
                    },
                    nextMeeting: {
                        id: next.id,
                        title: next.summary,
                        start: next.start.dateTime,
                        end: next.end.dateTime,
                        type: nextType.type
                    },
                    currentBuffer: minutesBetween,
                    recommendedBuffer: optimalBuffer,
                    confidence: Math.min(
                        (currentType.confidence + nextType.confidence) / 2, 0.95
                    ),
                    suggestedNewStartTime: new Date(
                        new Date(current.end.dateTime).getTime() + optimalBuffer * 60000
                    ).toISOString()
                });
            }
        }
        
        res.status(200).json({
            focusTimeRecommendations: focusTimeBlocks.map(block => ({
                date: block.start.toISOString().split('T')[0],
                startTime: block.start.toISOString(),
                endTime: block.end.toISOString(),
                durationMinutes: block.duration,
                score: block.score || 0.8, // Default score if not available
                productivityScore: block.productivityScore || 0.8
            })),
            bufferTimeRecommendations: bufferSuggestions
        });
    } catch (error) {
        next(error);
    }
};

export const getProductivityPatterns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = (req as AuthRequest).user.id;
        
        // Get productivity patterns for each day of the week
        const productivityPatterns = [];
        
        for (let day = 0; day < 7; day++) {
            const pattern = await mlSchedulerService.predictProductivityByHour(userId, day);
            productivityPatterns.push({
                dayOfWeek: day,
                hourlyScores: pattern
            });
        }
        
        res.status(200).json({
            productivityPatterns
        });
    } catch (error) {
        next(error);
    }
};

export const submitSchedulingFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { suggestionId, actionType, result, modifications } = req.body;
        const userId = (req as AuthRequest).user.id;
        
        if (!suggestionId || !actionType || !result) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        
        // Validate action type
        const validActionTypes = ['bufferTime', 'reschedule', 'focusTimeConsolidation', 'meetingTypeOptimization'];
        if (!validActionTypes.includes(actionType)) {
            res.status(400).json({ error: 'Invalid action type' });
            return;
        }
        
        // Validate result
        const validResults = ['accepted', 'rejected', 'modified', 'ignored'];
        if (!validResults.includes(result)) {
            res.status(400).json({ error: 'Invalid result' });
            return;
        }
        
        // Process feedback
        await mlSchedulerService.processSchedulingFeedback(
            userId,
            suggestionId,
            actionType,
            result,
            modifications
        );
        
        res.status(200).json({
            success: true,
            message: 'Feedback submitted successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const updateUserPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = (req as AuthRequest).user.id;
        const {
            bufferTimePreference,
            productivityPatterns,
            meetingTypePreferences,
            focusTimePreferences
        } = req.body;
        
        // Get user preferences
        const userPreferences = await mongoose.model('UserPreferences').findOne({ userId });
        
        if (!userPreferences) {
            res.status(404).json({ error: 'User preferences not found' });
            return;
        }
        
        // Update preferences
        if (bufferTimePreference !== undefined) {
            userPreferences.bufferTimePreference = bufferTimePreference;
        }
        
        if (productivityPatterns) {
            userPreferences.productivityPatterns = {
                ...userPreferences.productivityPatterns || {},
                ...productivityPatterns
            };
        }
        
        if (meetingTypePreferences) {
            userPreferences.meetingTypePreferences = {
                ...userPreferences.meetingTypePreferences || {},
                ...meetingTypePreferences
            };
        }
        
        if (focusTimePreferences) {
            userPreferences.focusTimePreferences = {
                ...userPreferences.focusTimePreferences || {},
                ...focusTimePreferences
            };
        }
        
        // Save updated preferences
        await userPreferences.save();
        
        res.status(200).json({
            success: true,
            message: 'Preferences updated successfully',
            preferences: {
                bufferTimePreference: userPreferences.bufferTimePreference,
                productivityPatterns: userPreferences.productivityPatterns,
                meetingTypePreferences: userPreferences.meetingTypePreferences,
                focusTimePreferences: userPreferences.focusTimePreferences
            }
        });
    } catch (error) {
        next(error);
    }
};

export default {
    getSchedulingOptimizations,
    getProductivityPatterns,
    submitSchedulingFeedback,
    updateUserPreferences
};