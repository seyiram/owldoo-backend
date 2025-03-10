import mongoose, { Schema, Document } from 'mongoose';

export interface IUserPreferences extends Document {
    userId: string;
    workingHours: {
        start: string;  // "09:00"
        end: string;    // "17:00"
        workDays: number[];  // [1,2,3,4,5] (Monday=1)
    };
    defaultMeetingDuration: number;  // in minutes
    defaultReminders: {
        email: number[];     // minutes before event
        popup: number[];     // minutes before event
    };
    timeZone: string;
    defaultLocation?: string;
    preferredMeetingTimes: string[];  // ["10:00", "14:00"]
    avoidMeetingTimes: string[];      // ["12:00", "13:00"]
    autoDeclineOutsideHours: boolean;
    bufferTimePreference?: number;    // minutes to add between meetings
    productivityPatterns?: {
        mostProductiveHours: { [key: string]: number[] }; // dayOfWeek: [hours]
        leastProductiveHours: { [key: string]: number[] };
        focusTimePreference: 'morning' | 'afternoon' | 'evening';
        preferredMeetingDays: number[];  // preferred days for meetings (Monday=1)
        preferredMeetingDensity: 'spread' | 'batched';  // prefer meetings spread out or grouped
    };
    meetingTypePreferences?: {
        highIntensityBufferTime: number;  // in minutes
        defaultMeetingDurationByType: {
            oneOnOne: number;
            team: number;
            client: number;
            interview: number;
            brainstorm: number;
            [key: string]: number;
        };
        preferredTimesByType: {
            oneOnOne: string[];
            team: string[];
            client: string[];
            [key: string]: string[];
        };
    };
    focusTimePreferences?: {
        minimumBlockDuration: number;  // in minutes
        preferredDaysOfWeek: number[];
        preferredHours: number[];
        protectFromMeetings: boolean;
    };
    learningData?: {
        reschedulingAcceptanceRate: number;
        bufferSuggestionAcceptanceRate: number;
        focusTimeConsolidationAcceptanceRate: number;
        commonRejectionPatterns: string[];
        lastModelUpdate: Date;
    };
}

const UserPreferencesSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    workingHours: {
        start: { type: String, default: "09:00" },
        end: { type: String, default: "17:00" },
        workDays: { type: [Number], default: [1,2,3,4,5] }
    },
    defaultMeetingDuration: { type: Number, default: 30 },
    defaultReminders: {
        email: { type: [Number], default: [1440] },  // 24 hours
        popup: { type: [Number], default: [10] }
    },
    timeZone: { type: String, required: true },
    defaultLocation: String,
    preferredMeetingTimes: [String],
    avoidMeetingTimes: [String],
    autoDeclineOutsideHours: { type: Boolean, default: false },
    bufferTimePreference: { type: Number },
    productivityPatterns: {
        mostProductiveHours: { type: Map, of: [Number] },
        leastProductiveHours: { type: Map, of: [Number] },
        focusTimePreference: { 
            type: String, 
            enum: ['morning', 'afternoon', 'evening'],
            default: 'morning'
        },
        preferredMeetingDays: { type: [Number] },
        preferredMeetingDensity: { 
            type: String, 
            enum: ['spread', 'batched'],
            default: 'spread'
        }
    },
    meetingTypePreferences: {
        highIntensityBufferTime: { type: Number, default: 25 },
        defaultMeetingDurationByType: {
            oneOnOne: { type: Number, default: 30 },
            team: { type: Number, default: 45 },
            client: { type: Number, default: 60 },
            interview: { type: Number, default: 45 },
            brainstorm: { type: Number, default: 60 }
        },
        preferredTimesByType: {
            oneOnOne: [String],
            team: [String],
            client: [String]
        }
    },
    focusTimePreferences: {
        minimumBlockDuration: { type: Number, default: 90 },
        preferredDaysOfWeek: [Number],
        preferredHours: [Number],
        protectFromMeetings: { type: Boolean, default: true }
    },
    learningData: {
        reschedulingAcceptanceRate: { type: Number, default: 0 },
        bufferSuggestionAcceptanceRate: { type: Number, default: 0 },
        focusTimeConsolidationAcceptanceRate: { type: Number, default: 0 },
        commonRejectionPatterns: [String],
        lastModelUpdate: Date
    }
});

export default mongoose.model<IUserPreferences>('UserPreferences', UserPreferencesSchema);