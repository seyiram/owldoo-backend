import { Response } from 'express';
import { AuthenticatedRequest } from '../types/route.types';
import Feedback from '../models/Feedback';
import { agentService } from '../services/agent.service';
import mongoose from 'mongoose';

export const submitFeedback = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { responseId, rating, wasHelpful, comments, corrections } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!responseId || rating === undefined || wasHelpful === undefined) {
      return res.status(400).json({ error: 'Required fields missing' });
    }
    
    // Create feedback record
    const feedback = new Feedback({
      userId: req.user.id,
      responseId,
      rating,
      wasHelpful,
      comments,
      corrections
    });
    
    await feedback.save();
    
    // If corrections were provided, queue a learning task
    if (corrections) {
      await agentService.addTask('learn_from_correction', 2, req.user.id, {
        responseId,
        originalResponse: req.body.originalResponse,
        userCorrection: corrections
      });
    }
    
    res.status(201).json({ 
      message: 'Feedback submitted successfully',
      feedbackId: feedback._id
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to submit feedback'
    });
  }
};

export const getFeedbackStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get feedback stats for the user
    const totalFeedback = await Feedback.countDocuments({ userId: req.user.id });
    const helpfulFeedback = await Feedback.countDocuments({ 
      userId: req.user.id,
      wasHelpful: true
    });
    
    // Calculate average rating
    const ratingResult = await Feedback.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      { $group: { _id: null, averageRating: { $avg: '$rating' } } }
    ]);
    
    const averageRating = ratingResult.length > 0 
      ? Math.round(ratingResult[0].averageRating * 10) / 10
      : 0;
    
    // Get recent feedback
    const recentFeedback = await Feedback.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.status(200).json({
      totalFeedback,
      helpfulPercentage: totalFeedback > 0 
        ? Math.round((helpfulFeedback / totalFeedback) * 100) 
        : 0,
      averageRating,
      recentFeedback
    });
  } catch (error) {
    console.error('Error getting feedback stats:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get feedback stats'
    });
  }
};