const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const Task = require('../models/Task');
const Mood = require('../models/Mood');
const AIService = require('../services/aiService');
const router = express.Router();

// Generate or get daily task
router.post('/daily', authMiddleware, aiLimiter, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if task already exists for today
    let existingTask = await Task.findOne({
      userId: req.user._id,
      date: { $gte: today }
    });

    if (existingTask) {
      return res.json({
        success: true,
        data: existingTask,
        message: 'Today\'s task already exists'
      });
    }

    // Get today's mood for context
    const todayMood = await Mood.findOne({
      userId: req.user._id,
      date: { $gte: today }
    });

    // Get recent task history
    const recentTasks = await Task.find({
      userId: req.user._id,
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ date: -1 }).limit(5);

    // Generate task using AI
    const aiResponse = await AIService.generateDailyTask(
      todayMood?.mood || 'neutral',
      todayMood?.notes || '',
      recentTasks
    );

    if (!aiResponse.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate daily task'
      });
    }

    // Create new task
    const newTask = await Task.create({
      userId: req.user._id,
      date: new Date(),
      taskTitle: aiResponse.data.taskTitle,
      description: aiResponse.data.description,
      steps: aiResponse.data.steps.map(step => ({
        label: step.label,
        completed: false
      })),
      category: aiResponse.data.category,
      difficulty: aiResponse.data.difficulty,
      generatedBy: 'ai',
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      data: newTask,
      message: 'Daily task generated successfully'
    });
  } catch (error) {
    console.error('Daily task generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate daily task'
    });
  }
});

// Get task for specific date
router.get('/:date', authMiddleware, async (req, res) => {
  try {
    const { date } = req.params;
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    const task = await Task.findOne({
      userId: req.user._id,
      date: { $gte: taskDate, $lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000) }
    });

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch task'
    });
  }
});

// Update step completion
router.patch('/step/:stepId', authMiddleware, async (req, res) => {
  try {
    const { stepId } = req.params;
    const { completed } = req.body;

    const task = await Task.findOne({
      userId: req.user._id,
      'steps._id': stepId
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task or step not found'
      });
    }

    // Update step
    const step = task.steps.id(stepId);
    step.completed = completed;
    if (completed) {
      step.completedAt = new Date();
    } else {
      step.completedAt = null;
    }

    // Update task status
    await task.updateStatus();

    res.json({
      success: true,
      data: task,
      message: 'Step updated successfully'
    });
  } catch (error) {
    console.error('Step update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update step'
    });
  }
});

// Mark task as complete
router.patch('/:taskId/complete', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findOne({
      _id: taskId,
      userId: req.user._id
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Mark all steps as completed
    task.steps.forEach(step => {
      step.completed = true;
      step.completedAt = new Date();
    });

    await task.updateStatus();

    res.json({
      success: true,
      data: task,
      message: 'Task completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to complete task'
    });
  }
});

// Get task completion calendar
router.get('/calendar/:year/:month', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const tasks = await Task.find({
      userId: req.user._id,
      date: { $gte: startDate, $lte: endDate }
    }).select('date status completedAt');

    const calendar = tasks.reduce((acc, task) => {
      const day = task.date.getDate();
      acc[day] = {
        status: task.status,
        completedAt: task.completedAt
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: calendar
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar data'
    });
  }
});

// Get task statistics
router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await Task.getCompletionStats(req.user._id, parseInt(days));

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch task statistics'
    });
  }
});

module.exports = router;