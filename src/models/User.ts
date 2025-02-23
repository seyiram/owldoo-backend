// src/models/User.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    email: string;
    clerkId: string;
    googleId: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiryDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    googleId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    accessToken: { 
        type: String 
    },
    refreshToken: { 
        type: String 
    },
    tokenExpiryDate: { 
        type: Date 
    }
}, { 
    timestamps: true 
});

export default mongoose.model<IUser>('User', UserSchema);