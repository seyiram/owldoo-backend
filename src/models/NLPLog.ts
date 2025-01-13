// src/models/NLPLog.ts
import mongoose, { Schema, Document } from 'mongoose';
import { EnhancedParsedCommand } from '../types/calendar.types';

export interface INLPLog extends Document {
    userId: mongoose.Types.ObjectId;
    originalText: string;
    parsedCommand: EnhancedParsedCommand;
    success: boolean;
    errorMessage?: string;
    metadata?: {
        parseTime: Date;
        parserVersion: string;
        confidence: number;
    };
    timestamp: Date;
}

const AlternativeInterpretationSchema = new Schema({
    action: String,
    title: String,
    startTime: Date,
    duration: Number,
    description: String,
    targetTime: Date,
    queryType: String,
    confidence: Number
}, { _id: false });

const AmbiguityResolutionSchema = new Schema({
    assumedDefaults: [String],
    clarificationNeeded: Boolean,
    alternativeInterpretations: [AlternativeInterpretationSchema],
    confidenceReasons: [String],
    missingInformation: [String]
}, { _id: false });

const ContextSchema = new Schema({
    isUrgent: Boolean,
    isFlexible: Boolean,
    priority: {
        type: String,
        enum: ['low', 'normal', 'high']
    },
    timePreference: {
        type: String,
        enum: ['exact', 'approximate', 'flexible']
    }
}, { _id: false });

const RecurrenceSchema = new Schema({
    pattern: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly']
    },
    interval: Number,
    until: Date
}, { _id: false });

const MetadataSchema = new Schema({
    originalText: String,
    parseTime: Date,
    parserVersion: String,
    confidence: Number
}, { _id: false });

const ParsedCommandSchema = new Schema({
    action: {
        type: String,
        enum: ['create', 'update', 'delete', 'query'],
        required: true
    },
    title: String,
    startTime: Date,
    duration: Number,
    description: String,
    location: String,
    attendees: [String],
    targetTime: Date,
    queryType: {
        type: String,
        enum: ['availability', 'event_details']
    },
    confidence: Number,
    context: ContextSchema,
    recurrence: RecurrenceSchema,
    metadata: MetadataSchema,
    ambiguityResolution: AmbiguityResolutionSchema
});

const NLPLogSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    originalText: {
        type: String,
        required: true
    },
    parsedCommand: ParsedCommandSchema,
    success: {
        type: Boolean,
        required: true,
        index: true
    },
    errorMessage: String,
    metadata: {
        parseTime: Date,
        parserVersion: String,
        confidence: Number
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Compound indexes for common query patterns
NLPLogSchema.index({ userId: 1, timestamp: -1 });
NLPLogSchema.index({ userId: 1, success: 1 });
NLPLogSchema.index({ 'parsedCommand.confidence': 1 });
NLPLogSchema.index({ 'parsedCommand.action': 1, timestamp: -1 });

// Add text index for searching through original commands
NLPLogSchema.index({ originalText: 'text' });

// Virtual for calculating time taken to parse
NLPLogSchema.virtual('parseTimeMs').get(function() {
    if (this.metadata?.parseTime && this.timestamp) {
        return this.metadata.parseTime.getTime() - this.timestamp.getTime();
    }
    return null;
});

// Methods for easy access to common queries
NLPLogSchema.statics.findRecentByUser = function(userId: string, limit = 10) {
    return this.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit);
};

NLPLogSchema.statics.findFailedAttempts = function(userId: string, timespan = 24) {
    const since = new Date();
    since.setHours(since.getHours() - timespan);
    
    return this.find({
        userId,
        success: false,
        timestamp: { $gte: since }
    }).sort({ timestamp: -1 });
};

NLPLogSchema.statics.getSuccessRate = async function(userId: string, timespan = 24) {
    const since = new Date();
    since.setHours(since.getHours() - timespan);
    
    const aggregation = await this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                timestamp: { $gte: since }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                successful: {
                    $sum: { $cond: ['$success', 1, 0] }
                }
            }
        }
    ]);

    if (aggregation.length === 0) return 0;
    return (aggregation[0].successful / aggregation[0].total) * 100;
};

// Document instance methods
NLPLogSchema.methods.wasAmbiguous = function() {
    return this.parsedCommand?.ambiguityResolution?.clarificationNeeded || false;
};

NLPLogSchema.methods.getConfidenceLevel = function() {
    const confidence = this.parsedCommand?.confidence || 0;
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
};

export default mongoose.model<INLPLog>('NLPLog', NLPLogSchema);