import mongoose, { Schema, Document } from 'mongoose';

export interface IAgentTask extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  metadata: any;
  result: any;
  createdAt: Date;
  updatedAt: Date;
}

const AgentTaskSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  priority: { type: Number, default: 1 },
  metadata: { type: Schema.Types.Mixed },
  result: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model<IAgentTask>('AgentTask', AgentTaskSchema);