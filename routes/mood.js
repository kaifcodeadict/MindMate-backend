const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Mood = require('../models/Mood');
const router = express.Router();

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

// Get mood analytics
router.get('/analytics', authMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const analytics = await Mood.getMoodAnalytics(req.user._id, parseInt(days));

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch mood analytics'
    });
  }
});

module.exports = router;