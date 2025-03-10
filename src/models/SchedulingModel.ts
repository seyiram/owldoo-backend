import mongoose, { Schema, Document } from 'mongoose';

export interface ISchedulingModel extends Document {
    userId: mongoose.Types.ObjectId;
    modelType: 'bufferPrediction' | 'productivityPrediction' | 'meetingTypeClassifier' | 'focusTimeOptimizer';
    modelData: any;
    version: string;
    accuracy: number;
    createdAt: Date;
    updatedAt: Date;
    metadata?: any;
}

const SchedulingModelSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    modelType: { 
        type: String, 
        required: true,
        enum: ['bufferPrediction', 'productivityPrediction', 'meetingTypeClassifier', 'focusTimeOptimizer']
    },
    modelData: { 
        type: Schema.Types.Mixed, 
        required: true 
    },
    version: { 
        type: String, 
        required: true 
    },
    accuracy: { 
        type: Number, 
        required: true,
        min: 0,
        max: 1
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    },
    metadata: Schema.Types.Mixed
});

// Create compound index on userId and modelType
SchedulingModelSchema.index({ userId: 1, modelType: 1 }, { unique: true });

// Update the updatedAt timestamp before saving
SchedulingModelSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

export default mongoose.model<ISchedulingModel>('SchedulingModel', SchedulingModelSchema);