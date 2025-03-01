import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedback extends Document {
  userId: mongoose.Types.ObjectId;
  responseId: string;
  rating: number;
  wasHelpful: boolean;
  comments?: string;
  corrections?: string;
  createdAt: Date;
}

const FeedbackSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  responseId: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  wasHelpful: { type: Boolean, required: true },
  comments: { type: String },
  corrections: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IFeedback>('Feedback', FeedbackSchema);