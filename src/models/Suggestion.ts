import mongoose, { Schema, Document } from 'mongoose';

export interface ISuggestion extends Document {
  userId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  description: string;
  action: {
    type: string;
    data: any;
  };
  status: 'pending' | 'accepted' | 'dismissed';
  relevance: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const SuggestionSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  action: {
    type: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true }
  },
  status: { type: String, enum: ['pending', 'accepted', 'dismissed'], default: 'pending' },
  relevance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

export default mongoose.model<ISuggestion>('Suggestion', SuggestionSchema);
  