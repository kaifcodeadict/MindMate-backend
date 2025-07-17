const mongoose = require('mongoose');

const moodSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mood: {
    type: String,
    required: true,
    enum: ['very_sad', 'sad', 'neutral', 'happy', 'very_happy']
  },
  notes: {
    type: String,
    maxLength: 500
  },
  moodScore: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  factors: [{
    type: String,
    enum: ['work', 'relationships', 'health', 'sleep', 'exercise', 'weather', 'social', 'other']
  }],
  chatReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    default: null
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure one mood entry per user per day
moodSchema.index({ userId: 1, date: 1 }, { unique: true });

// Static method to get mood history
moodSchema.statics.getMoodHistory = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    userId,
    date: { $gte: startDate }
  }).sort({ date: -1 });
};

// Static method to get mood analytics
moodSchema.statics.getMoodAnalytics = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const moods = await this.find({
    userId,
    date: { $gte: startDate }
  });
  
  if (moods.length === 0) {
    return {
      averageScore: 0,
      totalEntries: 0,
      moodDistribution: {},
      trend: 'neutral'
    };
  }
  
  const averageScore = moods.reduce((sum, mood) => sum + mood.moodScore, 0) / moods.length;
  const moodDistribution = moods.reduce((acc, mood) => {
    acc[mood.mood] = (acc[mood.mood] || 0) + 1;
    return acc;
  }, {});
  
  // Calculate trend (last 7 days vs previous 7 days)
  const recent = moods.slice(0, 7);
  const previous = moods.slice(7, 14);
  
  let trend = 'neutral';
  if (recent.length > 0 && previous.length > 0) {
    const recentAvg = recent.reduce((sum, mood) => sum + mood.moodScore, 0) / recent.length;
    const previousAvg = previous.reduce((sum, mood) => sum + mood.moodScore, 0) / previous.length;
    
    if (recentAvg > previousAvg + 0.3) trend = 'improving';
    else if (recentAvg < previousAvg - 0.3) trend = 'declining';
  }
  
  return {
    averageScore: Math.round(averageScore * 100) / 100,
    totalEntries: moods.length,
    moodDistribution,
    trend
  };
};

module.exports = mongoose.model('Mood', moodSchema);