import mongoose from 'mongoose';
import googleCalendarService from './googleCalendar.service';

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
                behavioralPatterns
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

            return {
                commonCommands,
                frequentContacts,
                preferredMeetingDurations
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
}

export const contextService = new ContextService();