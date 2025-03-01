import mongoose, { Schema, Document } from 'mongoose';

export interface IInsight extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  category: string;
  actionable: boolean;
  actionLink?: string;
  timestamp: Date;
}

const InsightSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  actionable: { type: Boolean, default: false },
  actionLink: { type: String },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model<IInsight>('Insight', InsightSchema);