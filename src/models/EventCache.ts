import mongoose, { Schema, Document } from 'mongoose';

export interface IEventCache extends Document {
    googleEventId: string;
    userId: string;
    eventData: any;
    lastSynced: Date;
}

const EventCacheSchema = new Schema({
    googleEventId: {
        type: String,
        required: true
    },
    userId: {
        type: String, 
        required: true
    },
    eventData: {
        type: Schema.Types.Mixed,
        required: true
    },
    lastSynced: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// Indexes for faster queries
EventCacheSchema.index({ googleEventId: 1, userId: 1 }, { unique: true });
EventCacheSchema.index({ userId: 1, 'eventData.start.dateTime': 1 });

export default mongoose.model<IEventCache>('EventCache', EventCacheSchema);