import { Response } from 'express';
import { AuthenticatedRequest } from '../types/route.types';
import { agentService } from '../services/agent.service';
import  nlpService  from '../services/nlp.service';
import Suggestion from '../models/Suggestion';
import AgentTask from '../models/AgentTask';
import Insight from '../models/Insight';
import mongoose from 'mongoose';

/**
 * Queue a task for asynchronous processing by the agent
 */
export const queueTask = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { task, priority, metadata } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const taskId = await agentService.addTask(task, priority, req.user.id, metadata);
    
    res.status(201).json({ 
      message: 'Task queued successfully',
      taskId
    });
  } catch (error) {
    console.error('Error in agent.controller.queueTask:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to queue task'
    });
  }
};

/**
 * Get all tasks for the current user
 */
export const getTasks = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const tasks = await AgentTask.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.status(200).json(tasks);
  } catch (error) {
    console.error('Error in agent.controller.getTasks:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get tasks'
    });
  }
};

/**
 * Get all suggestions for the current user
 */
export const getSuggestions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const suggestions = await Suggestion.find({ 
      userId: req.user.id,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).sort({ relevance: -1 });
    
    res.status(200).json(suggestions);
  } catch (error) {
    console.error('Error in agent.controller.getSuggestions:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get suggestions'
    });
  }
};

/**
 * Update a suggestion (accept or dismiss)
 */
export const updateSuggestion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { suggestionId } = req.params;
    const { action } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!action || !['accept', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    
    const suggestion = await Suggestion.findOne({ 
      _id: suggestionId,
      userId: req.user.id
    });
    
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    // Update suggestion status
    suggestion.status = action === 'accept' ? 'accepted' : 'dismissed';
    await suggestion.save();
    
    // If accepted, perform the suggested action
    if (action === 'accept') {
      await agentService.executeSuggestion(suggestion);
    }
    
    res.status(200).json({ 
      message: `Suggestion ${action}ed successfully` 
    });
  } catch (error) {
    console.error('Error in agent.controller.updateSuggestion:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update suggestion'
    });
  }
};

/**
 * Get all insights for the current user
 */
export const getInsights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const insights = await Insight.find({ userId: req.user.id })
      .sort({ timestamp: -1 })
      .limit(20);
    
    res.status(200).json(insights);
  } catch (error) {
    console.error('Error in agent.controller.getInsights:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get insights'
    });
  }
};

/**
 * Get agent statistics for the current user
 */
export const getStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const stats = await agentService.getUserStats(req.user.id);
    
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error in agent.controller.getStats:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get stats'
    });
  }
};