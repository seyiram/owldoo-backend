
import { Request } from 'express';
import { IUser } from '../models/User';

export interface AuthenticatedRequest extends Request {
    user?: IUser;
}

export interface CalendarEventQuery {
    startDate?: string;
    endDate?: string;
    limit?: number;
    page?: number;
}

export interface CreateEventBody {
    title: string;
    startTime: string;
    duration: number;
    description?: string;
    location?: string;
    attendees?: string[];
    isRecurring?: boolean;
    recurringPattern?: string;
}