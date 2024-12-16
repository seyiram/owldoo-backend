
import mongoose, { Schema, Document } from 'mongoose';

export interface IEventAnalytics extends Document {
    userId: string;
    period: {
        start: Date;
        end: Date;
    };
    metrics: {
        totalMeetings: number;
        totalDuration: number;  // minutes
        busyHours: number;
        meetingsByDay: {
            [key: string]: number;  // day -> count
        };
        meetingsByType: {
            [key: string]: number;  // "1:1", "team", "external"
        };
        commonAttendees: {
            email: string;
            meetingCount: number;
        }[];
        commonLocations: {
            location: string;
            count: number;
        }[];
        declinedMeetings: number;
        rescheduledMeetings: number;
        recurringMeetings: number;
    };
}

const EventAnalyticsSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    period: {
        start: { type: Date, required: true },
        end: { type: Date, required: true }
    },
    metrics: {
        totalMeetings: Number,
        totalDuration: Number,
        busyHours: Number,
        meetingsByDay: Schema.Types.Mixed,
        meetingsByType: Schema.Types.Mixed,
        commonAttendees: [{
            email: String,
            meetingCount: Number
        }],
        commonLocations: [{
            location: String,
            count: Number
        }],
        declinedMeetings: Number,
        rescheduledMeetings: Number,
        recurringMeetings: Number
    }
});

export default mongoose.model<IEventAnalytics>('EventAnalytics', EventAnalyticsSchema);
