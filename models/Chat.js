const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  messages: [messageSchema],
  moodDetected: {
    type: String,
    enum: ['very_sad', 'sad', 'neutral', 'happy', 'very_happy'],
    default: null
  },
  sentiment: {
    type: String,
    enum: ['negative', 'neutral', 'positive'],
    default: 'neutral'
  },
  topics: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Static method to get recent chats
chatSchema.statics.getRecentChats = async function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('sessionId messages.content messages.timestamp createdAt');
};

module.exports = mongoose.model('Chat', chatSchema);