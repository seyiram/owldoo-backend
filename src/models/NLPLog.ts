// src/models/NLPLog.ts
import mongoose, { Schema, Document } from 'mongoose';

// Interface for Agent and Advanced NLP logging
export interface INLPLog extends Document {
    requestId: string;
    type: string;
    input?: string;
    output?: string;
    context?: string;
    error?: string;
    processingTime?: number;
    timestamp: Date;
    version: string;
    category?: string;
    data?: string;
}

// Schema for Advanced NLP and Agent operations
const NLPLogSchema = new Schema({
    requestId: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        index: true
    },
    input: String,
    output: String,
    context: String,
    error: String,
    processingTime: Number,
    timestamp: {
        type: Date,
        default: Date.now,
        required: true,
        index: true
    },
    version: {
        type: String,
        required: true
    },
    category: {
        type: String,
        index: true
    },
    data: String
}, {
    timestamps: true
});

// Add compound indexes
NLPLogSchema.index({ requestId: 1, timestamp: 1 });
NLPLogSchema.index({ type: 1, timestamp: -1 });
NLPLogSchema.index({ version: 1, timestamp: -1 });
NLPLogSchema.index({ category: 1, type: 1, timestamp: -1 });

// NLP log for advanced NLP and agent operations
export const NLPLog = mongoose.model<INLPLog>('NLPLog', NLPLogSchema);

export default NLPLog;