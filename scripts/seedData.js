// Optional: Script to seed initial data for testing
const mongoose = require('mongoose');
const User = require('../models/User');
const Mood = require('../models/Mood');
const Task = require('../models/Task');
require('dotenv').config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Mood.deleteMany({});
    await Task.deleteMany({});

    // Create test user
    const testUser = await User.create({
      googleId: 'test123',
      name: 'Test User',
      email: 'test@example.com',
      isPremium: true,
      streakCount: 5,
      lastCheckIn: new Date()
    });

    // Create sample mood entries
    const moods = ['happy', 'sad', 'neutral', 'very_happy', 'very_sad'];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      await Mood.create({
        userId: testUser._id,
        mood: moods[i % moods.length],
        notes: `Sample mood entry for ${date.toDateString()}`,
        moodScore: Math.floor(Math.random() * 5) + 1,
        factors: ['work', 'sleep'],
        date
      });
    }

    // Create sample tasks
    const tasks = [
      {
        taskTitle: 'Take a mindful walk',
        description: 'A gentle walk to clear your mind',
        steps: [
          { label: 'Put on comfortable shoes', completed: true },
          { label: 'Walk for 10 minutes', completed: true },
          { label: 'Take deep breaths', completed: false }
        ],
        status: 'in_progress',
        category: 'physical'
      },
      {
        taskTitle: 'Practice gratitude',
        description: 'Write down things you\'re grateful for',
        steps: [
          { label: 'Get a notebook', completed: true },
          { label: 'Write 3 things you\'re grateful for', completed: true },
          { label: 'Reflect on each one', completed: true }
        ],
        status: 'completed',
        category: 'mental'
      }
    ];

    for (let i = 0; i < tasks.length; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      await Task.create({
        ...tasks[i],
        userId: testUser._id,
        date,
        generatedBy: 'ai',
        completedAt: tasks[i].status === 'completed' ? date : null
      });
    }

    console.log('Sample data seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedData();