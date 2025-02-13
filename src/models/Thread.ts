import mongoose, { Schema, Document } from 'mongoose';
import { Message } from '../types/chat.types';
export interface IThread extends Document {
  messages: Message[];
  createdAt: Date;
  userId?: Schema.Types.ObjectId;
}

const messageSchema = new Schema<Message>({
  sender: {
    type: String,
    enum: ['user', 'bot'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: String,
    default: () => Date().toString(),
    required: true
  },
});
const threadSchema = new Schema<IThread>({
  messages: [messageSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});
export default mongoose.model<IThread>('Thread', threadSchema);