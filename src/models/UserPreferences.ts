
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
    autoDeclineOutsideHours: { type: Boolean, default: false }
});

export default mongoose.model<IUserPreferences>('UserPreferences', UserPreferencesSchema);