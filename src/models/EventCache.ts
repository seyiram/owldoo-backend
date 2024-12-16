import mongoose, { Schema, Document } from 'mongoose';

export interface IEventCache extends Document {
    googleEventId: string;
    userId: string;
    eventData: {
        summary: string;
        description?: string;
        start: {
            dateTime: string;
            timeZone: string;
        };
        end: {
            dateTime: string;
            timeZone: string;
        };
        location?: string;
        attendees?: { email: string }[];
        recurrence?: string[];
        conferenceData?: any;
    };
    lastSynced: Date;
    createdAt: Date;
    updatedAt: Date;
}

const EventCacheSchema = new Schema({
    googleEventId: { 
        type: String, 
        required: true 
    },
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    eventData: {
        summary: { type: String, required: true },
        description: String,
        start: {
            dateTime: { type: String, required: true },
            timeZone: { type: String, required: true }
        },
        end: {
            dateTime: { type: String, required: true },
            timeZone: { type: String, required: true }
        },
        location: String,
        attendees: [{
            email: { type: String }
        }],
        recurrence: [String],
        conferenceData: Schema.Types.Mixed
    },
    lastSynced: { 
        type: Date, 
        required: true, 
        default: Date.now 
    }
}, { 
    timestamps: true 
});

// Index for faster queries
EventCacheSchema.index({ googleEventId: 1, userId: 1 }, { unique: true });
EventCacheSchema.index({ userId: 1, 'eventData.start.dateTime': 1 });

export default mongoose.model<IEventCache>('EventCache', EventCacheSchema);