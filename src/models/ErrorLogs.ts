// src/models/ErrorLogs.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IErrorLog extends Document {
    userId?: string;
    service: string;
    errorType: string;
    errorMessage: string;
    stackTrace?: string;
    context: {
        input?: any;
        attemptedAction: string;
        additionalInfo?: any;
    };
    resolved: boolean;
    resolution?: string;
}

const ErrorLogSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    service: { type: String, required: true },
    errorType: { type: String, required: true },
    errorMessage: { type: String, required: true },
    stackTrace: String,
    context: {
        input: Schema.Types.Mixed,
        attemptedAction: String,
        additionalInfo: Schema.Types.Mixed
    },
    resolved: { type: Boolean, default: false },
    resolution: String
}, { timestamps: true });

export default mongoose.model<IErrorLog>('ErrorLog', ErrorLogSchema);