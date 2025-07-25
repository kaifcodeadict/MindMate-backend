const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Mood = require('../models/Mood');
const Chat = require('../models/Chat');
const Task = require('../models/Task');
const router = express.Router();
const AIService = require('../services/aiService');

// Submit mood check-in
router.post('/check-in', authMiddleware, async (req, res) => {
  try {
    const { mood, notes, factors } = req.body;

    // Validate mood
    const validMoods = ['very_sad', 'sad', 'neutral', 'happy', 'very_happy'];
    if (!validMoods.includes(mood)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mood value'
      });
    }

    // Convert mood to score
    const moodScores = {
      'very_sad': 1,
      'sad': 2,
      'neutral': 3,
      'happy': 4,
      'very_happy': 5
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existingMood = await Mood.findOne({
      userId: req.user._id,
      date: { $gte: today }
    });

    if (existingMood) {
      // Update existing mood
      existingMood.mood = mood;
      existingMood.notes = notes;
      existingMood.moodScore = moodScores[mood];
      existingMood.factors = factors || [];
      await existingMood.save();

      // Update user streak
      await req.user.updateStreak();

      return res.json({
        success: true,
        message: 'Mood updated successfully',
        data: existingMood
      });
    }

    // Create new mood entry
    const moodEntry = await Mood.create({
      userId: req.user._id,
      mood,
      notes,
      moodScore: moodScores[mood],
      factors: factors || [],
      date: new Date()
    });

    // Update user streak
    await req.user.updateStreak();

    res.status(201).json({
      success: true,
      message: 'Mood checked in successfully',
      data: moodEntry
    });
  } catch (error) {
    console.error('Mood check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save mood'
    });
  }
});

// Get today's mood
router.get('/today', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMood = await Mood.findOne({
      userId: req.user._id,
      date: { $gte: today }
    });

    res.json({
      success: true,
      data: todayMood
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s mood'
    });
  }
});

// Get mood history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const history = await Mood.getMoodHistory(req.user._id, parseInt(days));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mood history'
    });
  }
});

// --- Analytics helpers ---
async function getTaskStreak(userId) {
  // Get all chat dates for user, sorted descending
  const chats = await Chat.find({ userId }).sort({ createdAt: -1 }).select('createdAt');
  if (!chats.length) return 0;
  // Extract unique days (YYYY-MM-DD)
  const days = [...new Set(chats.map(chat => chat.createdAt.toISOString().slice(0, 10)))];
  let streak = 1;
  let prev = new Date(days[0]);
  for (let i = 1; i < days.length; i++) {
    const curr = new Date(days[i]);
    const diff = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      streak++;
      prev = curr;
    } else {
      break;
    }
  }
  return streak;
}

async function getMoodCheckIns(userId) {
  // Count all chats for user
  return Chat.countDocuments({ userId });
}

async function getWeeklyGoal(userId) {
  // Get start of week (Monday)
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? 6 : day - 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  // Get all chat dates for user this week
  const chats = await Chat.find({ userId, createdAt: { $gte: monday } }).select('createdAt');
  const uniqueDays = new Set(chats.map(chat => chat.createdAt.toISOString().slice(0, 10)));
  return uniqueDays.size;
}

async function getTodaysTask(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Task.find({ userId, date: { $gte: today } });
}

async function getMoodJourney(userId) {
  // Get start of week (Monday)
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? 6 : day - 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);

  // Mood percentage mapping
  const moodPercentages = {
    'very_sad': 10,
    'sad': 30,
    'neutral': 60,
    'happy': 80,
    'very_happy': 95
  };

  // Get all chats from this week
  const chats = await Chat.find({
    userId,
    createdAt: { $gte: monday },
    moodDetected: { $ne: null }
  }).select('createdAt moodDetected');

  // Group by day of week
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekData = {};

  // Initialize week data
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    const dayName = dayNames[dayDate.getDay()];
    weekData[dayName] = { mood: null, percentage: 0 };
  }

  // Process chats by day
  chats.forEach(chat => {
    const chatDate = new Date(chat.createdAt);
    const dayName = dayNames[chatDate.getDay()];

    if (!weekData[dayName].mood) {
      weekData[dayName].mood = chat.moodDetected;
      weekData[dayName].percentage = moodPercentages[chat.moodDetected] || 60;
    }
  });

  // Convert to array format
  return Object.entries(weekData).map(([day, data]) => ({
    day,
    mood: data.mood || 'neutral',
    percentage: data.percentage || 60
  }));
}

async function getCommonMood(userId) {
  // Get start of week (Monday)
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? 6 : day - 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);

  // Get all chats from this week with mood data
  const chats = await Chat.find({
    userId,
    createdAt: { $gte: monday },
    moodDetected: { $ne: null }
  }).select('moodDetected');

  if (chats.length === 0) {
    return { mood: 'neutral', percentage: 0 };
  }

  // Count mood frequencies
  const moodCounts = {};
  chats.forEach(chat => {
    const mood = chat.moodDetected;
    moodCounts[mood] = (moodCounts[mood] || 0) + 1;
  });

  // Find most common mood
  let maxCount = 0;
  let commonMood = 'neutral';

  Object.entries(moodCounts).forEach(([mood, count]) => {
    if (count > maxCount) {
      maxCount = count;
      commonMood = mood;
    }
  });

  const percentage = Math.round((maxCount / chats.length) * 100);

  return { mood: commonMood, percentage };
}

async function getStabilityScore(userId) {
  // Mood score mapping
  const moodScores = {
    'very_sad': 1,
    'sad': 2,
    'neutral': 3,
    'happy': 4,
    'very_happy': 5
  };

  // Get current week (Monday to Sunday)
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? 6 : day - 1);
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - diffToMonday);
  currentMonday.setHours(0, 0, 0, 0);

  // Get previous week
  const previousMonday = new Date(currentMonday);
  previousMonday.setDate(currentMonday.getDate() - 7);

  // Get current week chats
  const currentWeekChats = await Chat.find({
    userId,
    createdAt: { $gte: currentMonday },
    moodDetected: { $ne: null }
  }).select('moodDetected');

  // Get previous week chats
  const previousWeekChats = await Chat.find({
    userId,
    createdAt: { $gte: previousMonday, $lt: currentMonday },
    moodDetected: { $ne: null }
  }).select('moodDetected');

  // Calculate current week average
  let currentWeekScore = 0;
  if (currentWeekChats.length > 0) {
    const totalScore = currentWeekChats.reduce((sum, chat) => {
      return sum + (moodScores[chat.moodDetected] || 3);
    }, 0);
    currentWeekScore = Math.round((totalScore / currentWeekChats.length) * 20); // Convert to 0-100 scale
  }

  // Calculate previous week average
  let previousWeekScore = 0;
  if (previousWeekChats.length > 0) {
    const totalScore = previousWeekChats.reduce((sum, chat) => {
      return sum + (moodScores[chat.moodDetected] || 3);
    }, 0);
    previousWeekScore = Math.round((totalScore / previousWeekChats.length) * 20); // Convert to 0-100 scale
  }

  // Calculate change from last week
  let changeFromLastWeek = 0;
  if (previousWeekScore > 0) {
    changeFromLastWeek = Math.round(((currentWeekScore - previousWeekScore) / previousWeekScore) * 100);
  }

  // Determine if improved
  const isImproved = currentWeekScore > previousWeekScore;

  // Generate message based on score
  let message = '';
  if (currentWeekScore >= 0 && currentWeekScore <= 40) {
    message = 'Low emotional balance';
  } else if (currentWeekScore > 40 && currentWeekScore <= 70) {
    message = 'Needs attention';
  } else if (currentWeekScore > 70 && currentWeekScore <= 90) {
    message = 'Good emotional balance';
  } else if (currentWeekScore > 90) {
    message = 'Excellent balance';
  } else {
    message = 'No data available';
  }

  return {
    stabilityScore: currentWeekScore,
    changeFromLastWeek,
    isImproved,
    message
  };
}

async function getWeeklyInsights(userId) {
  // Get current week (Monday to Sunday)
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? 6 : day - 1);
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - diffToMonday);
  currentMonday.setHours(0, 0, 0, 0);

  // Get previous week
  const previousMonday = new Date(currentMonday);
  previousMonday.setDate(currentMonday.getDate() - 7);

  // Get current week chats
  const currentWeekChats = await Chat.find({
    userId,
    createdAt: { $gte: currentMonday },
    moodDetected: { $ne: null }
  }).select('moodDetected createdAt');

  // Get previous week chats
  const previousWeekChats = await Chat.find({
    userId,
    createdAt: { $gte: previousMonday, $lt: currentMonday },
    moodDetected: { $ne: null }
  }).select('moodDetected createdAt');

  // Prepare data for AI analysis
  const currentWeekMoods = currentWeekChats.map(chat => ({
    mood: chat.moodDetected,
    day: new Date(chat.createdAt).toLocaleDateString('en-US', { weekday: 'short' })
  }));

  const previousWeekMoods = previousWeekChats.map(chat => ({
    mood: chat.moodDetected,
    day: new Date(chat.createdAt).toLocaleDateString('en-US', { weekday: 'short' })
  }));

  // If no data available, return default insights
  if (currentWeekMoods.length === 0 && previousWeekMoods.length === 0) {
    return {
      insights: [
        "Start tracking your mood to get personalized insights",
        "Regular check-ins help identify patterns in your emotional well-being",
        "Consider setting up a daily mood tracking routine"
      ]
    };
  }

  try {
    // Use AIService to generate insights
    const moodData = {
      currentWeek: currentWeekMoods,
      previousWeek: previousWeekMoods,
      totalCurrentWeek: currentWeekMoods.length,
      totalPreviousWeek: previousWeekMoods.length
    };

    const insightsResponse = await AIService.generateWeeklyInsights(moodData);
    return insightsResponse;
  } catch (error) {
    console.error('Error generating weekly insights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly insights'
    });
  }
}

// Get mood analytics
router.get('/analytics',  async (req, res) => {
  try {
    const userId = "user_2zzJSn1Ym2XGuLyIIED7yRkWIWy";
    // Run analytics in parallel
    const [taskStreak, moodCheckIns, weeklyGoal, todaysTask, moodJourney, commonMood, stabilityScore, weeklyInsights] = await Promise.all([
      getTaskStreak(userId),
      getMoodCheckIns(userId),
      getWeeklyGoal(userId),
      getTodaysTask(userId),
      getMoodJourney(userId),
      getCommonMood(userId),
      getStabilityScore(userId),
      getWeeklyInsights(userId)
    ]);
    res.json({
      success: true,
      data: {
        progress: {
          taskStreak,
          moodCheckIns,
          weeklyGoal
        },
        todaysTask,
        moodJourney,
        commonMood,
        stabilityScore,
        weeklyInsights
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mood analytics'
    });
  }
});

module.exports = router;
