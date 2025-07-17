const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  profileImage: {
    type: String,
    default: null
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  premiumExpiresAt: {
    type: Date,
    default: null
  },
  streakCount: {
    type: Number,
    default: 0
  },
  lastCheckIn: {
    type: Date,
    default: null
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  preferences: {
    notifications: {
      type: Boolean,
      default: true
    },
    reminderTime: {
      type: String,
      default: '20:00'
    }
  },
  clerkId: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: true
});

// Update streak logic
userSchema.methods.updateStreak = function() {
  const now = new Date();
  const lastCheckIn = this.lastCheckIn;

  if (!lastCheckIn) {
    this.streakCount = 1;
  } else {
    const timeDiff = now - lastCheckIn;
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    if (daysDiff === 1) {
      this.streakCount += 1;
    } else if (daysDiff > 1) {
      this.streakCount = 1;
    }
  }

  this.lastCheckIn = now;
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
