const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  }
});

const taskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  taskTitle: {
    type: String,
    required: true
  },
  description: {
    type: String,
    maxLength: 300
  },
  steps: [stepSchema],
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },
  generatedBy: {
    type: String,
    enum: ['ai', 'manual'],
    default: 'ai'
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'easy'
  },
  category: {
    type: String,
    enum: ['self_care', 'productivity', 'social', 'physical', 'mental', 'creative'],
    default: 'self_care'
  },
  completedAt: {
    type: Date,
    default: null
  },
  aiPrompt: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Ensure one task per user per day
taskSchema.index({ userId: 1, date: 1 }, { unique: true });

// Update task status based on steps completion
taskSchema.methods.updateStatus = function() {
  const completedSteps = this.steps.filter(step => step.completed).length;
  const totalSteps = this.steps.length;
  
  if (completedSteps === 0) {
    this.status = 'pending';
  } else if (completedSteps < totalSteps) {
    this.status = 'in_progress';
  } else {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  
  return this.save();
};

// Static method to get task completion stats
taskSchema.statics.getCompletionStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const tasks = await this.find({
    userId,
    date: { $gte: startDate }
  });
  
  const completed = tasks.filter(task => task.status === 'completed').length;
  const inProgress = tasks.filter(task => task.status === 'in_progress').length;
  const pending = tasks.filter(task => task.status === 'pending').length;
  
  return {
    total: tasks.length,
    completed,
    inProgress,
    pending,
    completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0
  };
};

module.exports = mongoose.model('Task', taskSchema);