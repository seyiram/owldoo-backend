// src/models/NLPLog.ts
import mongoose, { Schema, Document } from 'mongoose';



export interface INLPLog extends Document {
    userId: string;
    originalText: string;
    parsedCommand: {
        title: string;
        startTime: Date;
        duration: number;
        description?: string;
        location?: string;
        attendees?: string[];
        isRecurring?: boolean;
        recurringPattern?: string;
    };
    success: boolean;
    errorMessage?: string;
    createdAt: Date;
}

const NLPLogSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    originalText: { 
        type: String, 
        required: true 
    },
    parsedCommand: {
        title: String,
        startTime: Date,
        duration: Number,
        description: String,
        location: String,
        attendees: [String],
        isRecurring: Boolean,
        recurringPattern: String
    },
    success: { 
        type: Boolean, 
        required: true 
    },
    errorMessage: String
}, { 
    timestamps: true 
});

// Index for faster queries
NLPLogSchema.index({ userId: 1, createdAt: -1 });
NLPLogSchema.index({ success: 1 });

export default mongoose.model<INLPLog>('NLPLog', NLPLogSchema);