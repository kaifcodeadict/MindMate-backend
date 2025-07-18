const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  response: {
    type: [String],
    required: true
  }
}, { _id: false });

const emotionalContextSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  responses: {
    type: [responseSchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('EmotionalContext', emotionalContextSchema);
