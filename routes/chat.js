const express = require('express');
const { authMiddleware, premiumMiddleware } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const Chat = require('../models/Chat');
const AIService = require('../services/aiService');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Send message to AI assistant
router.post('/send', authMiddleware, premiumMiddleware, aiLimiter, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const chatSessionId = sessionId || uuidv4();

    // Find or create chat session
    let chat = await Chat.findOne({
      userId: req.user._id,
      sessionId: chatSessionId
    });

    if (!chat) {
      chat = await Chat.create({
        userId: req.user._id,
        sessionId: chatSessionId,
        messages: [],
        isActive: true
      });
    }

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    });

    // Prepare messages for AI
    const aiMessages = chat.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Get AI response
    const aiResponse = await AIService.generateChatResponse(aiMessages);

    if (!aiResponse.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to get AI response'
      });
    }

    // Add AI response to chat
    chat.messages.push({
      role: 'assistant',
      content: aiResponse.data.content,
      timestamp: aiResponse.data.timestamp
    });

    // Analyze mood from user message
    const moodAnalysis = await AIService.analyzeMoodFromText(message);
    if (moodAnalysis.success) {
      chat.moodDetected = moodAnalysis.data.mood;
      chat.sentiment = moodAnalysis.data.sentiment;
      chat.topics = moodAnalysis.data.topics;
    }

    await chat.save();

    res.json({
      success: true,
      data: {
        sessionId: chatSessionId,
        response: aiResponse.data.content,
        timestamp: aiResponse.data.timestamp,
        moodDetected: chat.moodDetected,
        sentiment: chat.sentiment
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process chat message'
    });
  }
});

// Get chat history
router.get('/history', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { sessionId, limit = 10 } = req.query;

    let query = { userId: req.user._id };
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const chats = await Chat.find(query)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: chats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history'
    });
  }
});

// Get specific chat session
router.get('/session/:sessionId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const chat = await Chat.findOne({
      userId: req.user._id,
      sessionId
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }

    res.json({
      success: true,
      data: chat
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat session'
    });
  }
});

// Delete chat session
router.delete('/session/:sessionId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await Chat.deleteOne({
      userId: req.user._id,
      sessionId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }

    res.json({
      success: true,
      message: 'Chat session deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete chat session'
    });
  }
});

// Get chat analytics
router.get('/analytics', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await Chat.aggregate([
      {
        $match: {
          userId: req.user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalMessages: { $sum: { $size: '$messages' } },
          moodDistribution: {
            $push: '$moodDetected'
          },
          sentimentDistribution: {
            $push: '$sentiment'
          },
          topicsDiscussed: {
            $push: '$topics'
          }
        }
      }
    ]);

    const result = analytics[0] || {
      totalSessions: 0,
      totalMessages: 0,
      moodDistribution: [],
      sentimentDistribution: [],
      topicsDiscussed: []
    };

    // Process distributions
    const moodCounts = result.moodDistribution.reduce((acc, mood) => {
      if (mood) acc[mood] = (acc[mood] || 0) + 1;
      return acc;
    }, {});

    const sentimentCounts = result.sentimentDistribution.reduce((acc, sentiment) => {
      if (sentiment) acc[sentiment] = (acc[sentiment] || 0) + 1;
      return acc;
    }, {});

    const topicCounts = result.topicsDiscussed.flat().reduce((acc, topic) => {
      if (topic) acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        totalSessions: result.totalSessions,
        totalMessages: result.totalMessages,
        averageMessagesPerSession: result.totalSessions > 0 ? Math.round(result.totalMessages / result.totalSessions) : 0,
        moodDistribution: moodCounts,
        sentimentDistribution: sentimentCounts,
        topTopics: Object.entries(topicCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([topic, count]) => ({ topic, count }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat analytics'
    });
  }
});

module.exports = router;