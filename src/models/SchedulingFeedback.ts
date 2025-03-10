import mongoose, { Schema, Document } from 'mongoose';

export interface ISchedulingFeedback extends Document {
    userId: mongoose.Types.ObjectId;
    suggestionId: mongoose.Types.ObjectId;
    actionType: 'bufferTime' | 'reschedule' | 'focusTimeConsolidation' | 'meetingTypeOptimization';
    result: 'accepted' | 'rejected' | 'modified' | 'ignored';
    timestamp: Date;
    modifications?: any;
    context?: any;
}

const SchedulingFeedbackSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    suggestionId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Suggestion', 
        required: true 
    },
    actionType: { 
        type: String, 
        required: true,
        enum: ['bufferTime', 'reschedule', 'focusTimeConsolidation', 'meetingTypeOptimization']
    },
    result: { 
        type: String, 
        required: true,
        enum: ['accepted', 'rejected', 'modified', 'ignored']
    },
    timestamp: { 
        type: Date, 
        default: Date.now 
    },
    modifications: Schema.Types.Mixed,
    context: Schema.Types.Mixed
});

// Create indexes for efficient querying
SchedulingFeedbackSchema.index({ userId: 1, actionType: 1 });
SchedulingFeedbackSchema.index({ timestamp: 1 });
SchedulingFeedbackSchema.index({ suggestionId: 1 });

export default mongoose.model<ISchedulingFeedback>('SchedulingFeedback', SchedulingFeedbackSchema);