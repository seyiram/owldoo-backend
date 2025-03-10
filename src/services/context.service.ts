import mongoose from 'mongoose';
import googleCalendarService from './googleCalendar.service';
import { Context } from '../types/calendar.types';

interface UserContext {
    timeAwareness: {
        userLocalTime: Date;
        timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
        isWeekend: boolean;
        isWorkingHour: boolean;
    };
    preferences: {
        workingHours?: {
            start: string;
            end: string;
            workDays: number[];
        };
        defaultMeetingDuration?: number;
        preferredMeetingTimes?: string[];
    };
    upcomingEvents: any[];
    behavioralPatterns: {
        commonCommands: string[];
        frequentContacts: string[];
        preferredMeetingDurations: number[];
        productivityTimes?: Record<string, number[]>;
        meetingPatterns?: {
            byDay?: number[];
            byHour?: number[];
            busiest?: { day: number; hour: number };
            averageDurationByType?: Record<string, number>;
        };
    };
    environmentalContext?: {
        timezone: string;
        location?: string;
        device?: string;
    };
}

class ContextService {
    async getUserContext(userId: string): Promise<UserContext> {
        try {
            // Get user from database
            const User = mongoose.model('User');
            const user = await User.findById(userId);

            if (!user) {
                throw new Error('User not found');
            }

            // Get user's timezone
            const userTimezone = user.preferences?.timezone || 'UTC';

            // Get current time in user's timezone
            const now = new Date();
            const userLocalTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));

            // Determine time of day
            const hour = userLocalTime.getHours();
            let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';

            if (hour >= 5 && hour < 12) {
                timeOfDay = 'morning';
            } else if (hour >= 12 && hour < 17) {
                timeOfDay = 'afternoon';
            } else if (hour >= 17 && hour < 22) {
                timeOfDay = 'evening';
            } else {
                timeOfDay = 'night';
            }

            // Determine if weekend
            const day = userLocalTime.getDay();
            const isWeekend = day === 0 || day === 6; // Sunday or Saturday

            // Get working hours from user preferences
            const workingHours = user.preferences?.workingHours || {
                start: '09:00',
                end: '17:00',
                workDays: [1, 2, 3, 4, 5] // Monday to Friday
            };

            // Determine if current time is within working hours
            const isWorkingHour = this.isWithinWorkingHours(userLocalTime, workingHours);

            // Get upcoming events
            const endOfDay = new Date(userLocalTime);
            endOfDay.setHours(23, 59, 59, 999);

            const tomorrow = new Date(userLocalTime);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(23, 59, 59, 999);

            const upcomingEvents = await googleCalendarService.getEvents(userLocalTime, tomorrow);

            // Get behavioral patterns
            const behavioralPatterns = await this.getUserBehavioralPatterns(userId);

            return {
                timeAwareness: {
                    userLocalTime,
                    timeOfDay,
                    isWeekend,
                    isWorkingHour
                },
                preferences: {
                    workingHours,
                    defaultMeetingDuration: user.preferences?.defaultMeetingDuration || 30,
                    preferredMeetingTimes: user.preferences?.preferredMeetingTimes || []
                },
                upcomingEvents,
                behavioralPatterns,
                environmentalContext: {
                    timezone: userTimezone,
                    location: user.preferences?.defaultLocation || 'office',
                    device: user.lastDevice || 'unknown'
                }
            };
        } catch (error) {
            console.error('Error getting user context:', error);

            // Return default context
            return {
                timeAwareness: {
                    userLocalTime: new Date(),
                    timeOfDay: 'afternoon',
                    isWeekend: false,
                    isWorkingHour: true
                },
                preferences: {
                    workingHours: {
                        start: '09:00',
                        end: '17:00',
                        workDays: [1, 2, 3, 4, 5]
                    },
                    defaultMeetingDuration: 30
                },
                upcomingEvents: [],
                behavioralPatterns: {
                    commonCommands: [],
                    frequentContacts: [],
                    preferredMeetingDurations: [30, 60]
                },
                environmentalContext: {
                    timezone: 'UTC',
                    location: 'office',
                    device: 'unknown'
                }
            };
        }
    }

    private isWithinWorkingHours(date: Date, workingHours: { start: string; end: string; workDays: number[] }): boolean {
        // Check if current day is a working day
        if (!workingHours.workDays.includes(date.getDay())) {
            return false;
        }

        // Parse working hours
        const [startHour, startMinute] = workingHours.start.split(':').map(Number);
        const [endHour, endMinute] = workingHours.end.split(':').map(Number);

        // Create Date objects for start and end of working hours
        const workStart = new Date(date);
        workStart.setHours(startHour, startMinute, 0, 0);

        const workEnd = new Date(date);
        workEnd.setHours(endHour, endMinute, 0, 0);

        // Check if current time is within working hours
        return date >= workStart && date <= workEnd;
    }

    private async getUserBehavioralPatterns(userId: string): Promise<any> {
        try {
            // Get NLP logs for analysis
            const NLPLog = mongoose.model('NLPLog');
            const logs = await NLPLog.find({ userId })
                .sort({ timestamp: -1 })
                .limit(100);

            // Extract common commands
            const commandCounts: Record<string, number> = {};
            logs.forEach(log => {
                const action = log.parsedCommand?.action;
                if (action) {
                    commandCounts[action] = (commandCounts[action] || 0) + 1;
                }
            });

            const commonCommands = Object.entries(commandCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([command]) => command);

            // Extract frequent contacts
            const contactCounts: Record<string, number> = {};
            logs.forEach(log => {
                const attendees = log.parsedCommand?.attendees;
                if (Array.isArray(attendees)) {
                    attendees.forEach(attendee => {
                        if (typeof attendee === 'string') {
                            contactCounts[attendee] = (contactCounts[attendee] || 0) + 1;
                        } else if (attendee.email) {
                            contactCounts[attendee.email] = (contactCounts[attendee.email] || 0) + 1;
                        }
                    });
                }
            });

            const frequentContacts = Object.entries(contactCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([contact]) => contact);

            // Extract preferred meeting durations
            const durationCounts: Record<string, number> = {};
            logs.forEach(log => {
                const duration = log.parsedCommand?.duration;
                if (duration) {
                    durationCounts[duration] = (durationCounts[duration] || 0) + 1;
                }
            });

            const preferredMeetingDurations = Object.entries(durationCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([duration]) => parseInt(duration, 10));

            // Get past month of events for additional pattern analysis
            const now = new Date();
            const oneMonthAgo = new Date(now);
            oneMonthAgo.setMonth(now.getMonth() - 1);
            
            const events = await googleCalendarService.getEvents(oneMonthAgo, now);
            
            // Calculate meeting patterns by day and hour
            const meetingsByDay = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
            const meetingsByHour = Array(24).fill(0);
            const meetingDurations: Record<string, number[]> = {};
            
            events.forEach(event => {
                const startDate = new Date(event.start.dateTime);
                const endDate = new Date(event.end.dateTime);
                const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
                
                const day = startDate.getDay();
                const hour = startDate.getHours();
                
                meetingsByDay[day]++;
                meetingsByHour[hour]++;
                
                // Group durations by type of meeting
                const summary = event.summary?.toLowerCase() || '';
                let type = 'other';
                
                if (summary.includes('1:1') || summary.includes('one on one')) {
                    type = '1:1';
                } else if (summary.includes('team') || summary.includes('staff')) {
                    type = 'team';
                } else if (summary.includes('interview')) {
                    type = 'interview';
                } else if (summary.includes('planning') || summary.includes('review')) {
                    type = 'planning';
                }
                
                if (!meetingDurations[type]) {
                    meetingDurations[type] = [];
                }
                meetingDurations[type].push(duration);
            });
            
            // Calculate average duration by meeting type
            const averageDurations: Record<string, number> = {};
            Object.entries(meetingDurations).forEach(([type, durations]) => {
                if (durations.length > 0) {
                    const sum = durations.reduce((total, val) => total + val, 0);
                    averageDurations[type] = Math.round(sum / durations.length);
                }
            });
            
            // Find most productive times (less meetings typically means more focus time)
            const productivityByHour = Array(24).fill(0);
            const totalMeetings = meetingsByHour.reduce((sum, val) => sum + val, 0);
            
            if (totalMeetings > 0) {
                meetingsByHour.forEach((count, hour) => {
                    // Inverse relationship - fewer meetings likely means more productive for focused work
                    if (hour >= 9 && hour <= 17) { // Consider only working hours
                        productivityByHour[hour] = 10 - Math.min(10, Math.round((count / totalMeetings) * 50));
                    }
                });
            }

            return {
                commonCommands,
                frequentContacts,
                preferredMeetingDurations,
                productivityTimes: {
                    byHour: productivityByHour,
                    mostProductiveHour: productivityByHour.indexOf(Math.max(...productivityByHour.slice(9, 18)))
                },
                meetingPatterns: {
                    byDay: meetingsByDay,
                    byHour: meetingsByHour,
                    busiest: {
                        day: meetingsByDay.indexOf(Math.max(...meetingsByDay)),
                        hour: meetingsByHour.indexOf(Math.max(...meetingsByHour))
                    },
                    averageDurationByType: averageDurations
                }
            };
        } catch (error) {
            console.error('Error getting user behavioral patterns:', error);
            return {
                commonCommands: [],
                frequentContacts: [],
                preferredMeetingDurations: [30, 60]
            };
        }
    }

    async enrichEventContext(baseContext: Context, userId: string, eventData: any): Promise<Context> {
        // Start with the base context
        const enrichedContext: Context = { ...baseContext };
        
        try {
            // Detect event type if not already provided
            if (!enrichedContext.eventType) {
                enrichedContext.eventType = this.detectEventType(eventData.title, eventData.description);
            }
            
            // Calculate importance based on various factors
            enrichedContext.importance = this.calculateImportance(
                enrichedContext.priority,
                enrichedContext.eventType,
                eventData.attendees?.length || 0
            );
            
            // Add time constraints based on user preferences and schedule
            enrichedContext.timeConstraints = await this.determineTimeConstraints(
                userId,
                eventData.startTime,
                enrichedContext.eventType
            );
            
            // Add attendee context if relevant
            if (eventData.attendees?.length) {
                enrichedContext.attendeeContext = {
                    required: eventData.attendees,
                    optional: eventData.optionalAttendees || [],
                    preferredMeetingTimeForAttendees: enrichedContext.isFlexible
                };
            }
            
            // Add environmental factors
            enrichedContext.environmentalFactors = await this.getEnvironmentalFactors(
                eventData.startTime,
                eventData.location
            );
            
            // Add special flags
            enrichedContext.flags = this.determineSpecialFlags(
                eventData.title,
                eventData.description,
                enrichedContext.eventType,
                eventData.location
            );
            
            // Look for related events
            if (enrichedContext.eventType === 'meeting') {
                enrichedContext.relatedEvents = await this.findRelatedEvents(
                    userId,
                    eventData.title,
                    eventData.startTime,
                    eventData.attendees
                );
            }
            
            return enrichedContext;
        } catch (error) {
            console.error('Error enriching event context:', error);
            // Return at least the base context if there was an error
            return enrichedContext;
        }
    }
    
    private detectEventType(title: string, description?: string): Context['eventType'] {
        const text = `${title} ${description || ''}`.toLowerCase();
        
        // Check for work schedule patterns
        if (/\b(work|job|office|shift)\b/.test(text)) {
            return 'work';
        }
        
        // Check for meeting patterns
        if (/\b(meet|meeting|call|sync|appointment|interview)\b/.test(text)) {
            return 'meeting';
        }
        
        // Check for travel patterns
        if (/\b(travel|trip|flight|journey|commute)\b/.test(text)) {
            return 'travel';
        }
        
        // Check for exercise patterns
        if (/\b(exercise|workout|gym|training|fitness)\b/.test(text)) {
            return 'exercise';
        }
        
        // Check for meal patterns
        if (/\b(lunch|dinner|breakfast|meal|food)\b/.test(text)) {
            return 'meal';
        }
        
        // Check for deadline patterns
        if (/\b(deadline|due|by|submit|complete)\b/.test(text)) {
            return 'deadline';
        }
        
        // Check for appointment patterns
        if (/\b(doctor|dentist|appointment|visit)\b/.test(text)) {
            return 'appointment';
        }
        
        // Default to personal
        return 'personal';
    }
    
    private calculateImportance(
        priority: Context['priority'],
        eventType?: Context['eventType'],
        attendeeCount: number = 0
    ): number {
        let baseScore = 5; // Medium importance by default
        
        // Adjust by priority
        if (priority === 'high') baseScore += 2;
        if (priority === 'low') baseScore -= 2;
        
        // Adjust by event type
        if (eventType === 'deadline') baseScore += 2;
        if (eventType === 'appointment') baseScore += 1;
        if (eventType === 'meeting' && attendeeCount > 3) baseScore += 1;
        if (eventType === 'meal') baseScore -= 1;
        
        // Adjust by attendee count
        if (attendeeCount > 5) baseScore += 1;
        
        // Ensure the score is within 1-10 range
        return Math.max(1, Math.min(10, baseScore));
    }
    
    private async determineTimeConstraints(
        userId: string,
        startTime: Date,
        eventType?: Context['eventType']
    ): Promise<NonNullable<Context['timeConstraints']>> {
        // Get user preferences
        const User = mongoose.model('User');
        const user = await User.findById(userId);
        
        // Get working hours
        const workingHours = user?.preferences?.workingHours || { start: '09:00', end: '17:00' };
        const [startHour, startMinute] = workingHours.start.split(':').map(Number);
        const [endHour, endMinute] = workingHours.end.split(':').map(Number);
        
        // Create start and end of working day
        const startDate = new Date(startTime);
        const workStartTime = new Date(startTime);
        workStartTime.setHours(startHour, startMinute || 0, 0, 0);
        
        const workEndTime = new Date(startTime);
        workEndTime.setHours(endHour, endMinute || 0, 0, 0);
        
        // Determine if this is a work hours event
        const isWorkHours = startDate.getHours() >= startHour && 
                             startDate.getHours() < endHour;
        
        // Default event duration based on type
        let preferredDuration = user?.preferences?.defaultMeetingDuration || 30;
        
        if (eventType === 'meeting') {
            preferredDuration = 30;
        } else if (eventType === 'meal') {
            preferredDuration = 60;
        } else if (eventType === 'exercise') {
            preferredDuration = 45;
        } else if (eventType === 'appointment') {
            preferredDuration = 60;
        }
        
        // Create time constraints
        return {
            preferredTime: startDate,
            earliestStart: workStartTime,
            latestStart: new Date(workEndTime.getTime() - preferredDuration * 60000),
            preferredDuration,
            minimumDuration: Math.floor(preferredDuration * 0.75), // 75% of preferred duration
            isWorkHours
        };
    }
    
    private async getEnvironmentalFactors(
        startTime: Date,
        location?: string
    ): Promise<NonNullable<Context['environmentalFactors']>> {
        // In a real implementation, we might use a weather API or other services
        // For now, we'll just provide placeholder data
        return {
            weather: 'good', // Placeholder
            trafficConditions: 'moderate', // Placeholder
            specialDay: this.isSpecialDay(startTime)
        };
    }
    
    private isSpecialDay(date: Date): boolean {
        // Check for holidays, weekends, etc.
        const dayOfWeek = date.getDay();
        
        // Consider weekends as special days
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return true;
        }
        
        // In a real implementation, we'd check against a holiday API or database
        // For now, we'll just return false for weekdays
        return false;
    }
    
    private determineSpecialFlags(
        title: string,
        description?: string,
        eventType?: Context['eventType'],
        location?: string
    ): NonNullable<Context['flags']> {
        const text = `${title} ${description || ''}`.toLowerCase();
        
        return {
            needsReminder: /\b(remind|remember|important|don't forget)\b/.test(text),
            needsPreparation: /\b(prepare|presentation|materials|bring|prep)\b/.test(text),
            needsTravel: !!location && location !== 'home' && location !== 'office' && location !== 'virtual',
            isAllDay: /\b(all day|all-day)\b/.test(text),
            isMultiDay: false, // Would require start/end date comparison
            isOffSiteEvent: !!location && location !== 'office' && location !== 'virtual'
        };
    }
    
    private async findRelatedEvents(
        userId: string,
        title: string,
        startTime: Date,
        attendees?: string[]
    ): Promise<NonNullable<Context['relatedEvents']>> {
        try {
            // Set up time frame for searching
            const twoDaysBefore = new Date(startTime);
            twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
            
            const twoDaysAfter = new Date(startTime);
            twoDaysAfter.setDate(twoDaysAfter.getDate() + 2);
            
            // Get events within this time frame
            const events = await googleCalendarService.getEvents(twoDaysBefore, twoDaysAfter);
            
            // Find events with similar title or attendees
            const titleKeywords = title.toLowerCase().split(/\s+/).filter(word => word.length > 3);
            
            const relatedByTitle = events.filter(event => {
                if (!event.summary) return false;
                const eventTitle = event.summary.toLowerCase();
                return titleKeywords.some(keyword => eventTitle.includes(keyword));
            });
            
            // Find events with same attendees
            const relatedByAttendees = attendees?.length ? events.filter(event => {
                if (!event.attendees?.length) return false;
                return event.attendees.some(attendee => 
                    attendees.includes(attendee.email)
                );
            }) : [];
            
            // Find closest events before and after
            let precedingEventId: string | undefined;
            let followingEventId: string | undefined;
            
            events.forEach(event => {
                const eventDate = new Date(event.start.dateTime);
                
                if (eventDate < startTime) {
                    // If this event is before our target and closer than the current preceding event
                    if (!precedingEventId || 
                        eventDate > new Date(events.find(e => e.id === precedingEventId)?.start.dateTime || 0)) {
                        precedingEventId = event.id;
                    }
                } else if (eventDate > startTime) {
                    // If this event is after our target and closer than the current following event
                    if (!followingEventId || 
                        eventDate < new Date(events.find(e => e.id === followingEventId)?.start.dateTime || 0)) {
                        followingEventId = event.id;
                    }
                }
            });
            
            // Check for conflicting events
            const eventStart = startTime;
            const eventEnd = new Date(startTime);
            eventEnd.setMinutes(eventEnd.getMinutes() + 60); // Assume 1 hour duration for conflict checking
            
            const conflictingEvents = events
                .filter(event => {
                    const otherStart = new Date(event.start.dateTime);
                    const otherEnd = new Date(event.end.dateTime);
                    
                    return (eventStart < otherEnd && eventEnd > otherStart);
                })
                .map(event => event.id);
            
            return {
                precedingEventId,
                followingEventId,
                conflictingEvents: conflictingEvents.length ? conflictingEvents : undefined,
                partOfSeries: undefined // Would need to check recurringEventId
            };
        } catch (error) {
            console.error('Error finding related events:', error);
            return {};
        }
    }
}

export const contextService = new ContextService();