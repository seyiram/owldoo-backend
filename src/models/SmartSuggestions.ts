// src/models/SmartSuggestions.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ISmartSuggestions extends Document {
    userId: string;
    suggestedMeetingTimes: {
        timeSlot: string;
        successRate: number;
        acceptanceRate: number;
        totalSuggestions: number;
    }[];
    commonParticipants: {
        email: string;
        preferredTimes: string[];
        commonMeetingDuration: number;
        lastMeetingDate: Date;
    }[];
    meetingPatterns: {
        title: string;
        typicalDuration: number;
        typicalAttendees: string[];
        frequencyPattern: string;
        lastOccurrence: Date;
    }[];
}

const SmartSuggestionsSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    suggestedMeetingTimes: [{
        timeSlot: String,
        successRate: Number,
        acceptanceRate: Number,
        totalSuggestions: Number
    }],
    commonParticipants: [{
        email: String,
        preferredTimes: [String],
        commonMeetingDuration: Number,
        lastMeetingDate: Date
    }],
    meetingPatterns: [{
        title: String,
        typicalDuration: Number,
        typicalAttendees: [String],
        frequencyPattern: String,
        lastOccurrence: Date
    }]
});

export default mongoose.model<ISmartSuggestions>('SmartSuggestions', SmartSuggestionsSchema);