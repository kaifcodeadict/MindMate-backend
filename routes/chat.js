const express = require('express');
const { authMiddleware, premiumMiddleware } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const Chat = require('../models/Chat');
const AIService = require('../services/aiService');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

// Send message to AI assistant
router.post('/send',  aiLimiter, async (req, res) => {
  try {
    console.log("on chat send");
    // const { userId } = req.auth;
    console.log("on chat send message is required");
    const  userId  = "user_2zzJSn1Ym2XGuLyIIED7yRkWIWy"
    // const { message, sessionId } = req.body;
    const  sessionId  = "3445e8d4-1269-4c85-a4ee-2b1eeec5dbd6"
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    console.log('message is', message);


    const chatSessionId = sessionId || uuidv4();

    // Find or create chat session
    let chat = await Chat.findOne({
      userId: userId,
      sessionId: chatSessionId
    });
    console.log('chat is', chat);

    if (!chat) {
      chat = await Chat.create({
        userId: userId,
        sessionId: chatSessionId,
        messages: [],
        isActive: true
      });
      console.log('Chat created:', chat);
    }

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    });

    console.log('chat.messages is push', chat.messages);

    // Prepare messages for AI
    const aiMessages = chat.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    console.log('aiMessages is', aiMessages);

        // Analyze mood from user message
        if(chat.moodDetected === null){
        const moodAnalysis = await AIService.analyzeMoodFromText(message);
        if (moodAnalysis.success) {
          chat.moodDetected = moodAnalysis.data.mood;
          chat.sentiment = moodAnalysis.data.sentiment;
          chat.topics = moodAnalysis.data.topics;
        }
      }
    // Get AI response
    const aiResponse = await AIService.generateChatResponse(aiMessages, chat.moodDetected, userId);

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



    await chat.save();

    // Save or update Task if generateTask is true
    let savedTask = null;
    if (aiResponse.data.generateTask && aiResponse.data.task && aiResponse.data.task.success) {
      const Task = require('../models/Task');
      const taskData = aiResponse.data.task.data;
      // Try to find existing task by sessionId
      let existingTask = await Task.findOne({ sessionId: chatSessionId });
      if (existingTask) {
        // Update existing task
        existingTask.taskTitle = taskData.taskTitle;
        existingTask.description = taskData.description;
        existingTask.steps = (taskData.steps || []).map(s => ({ label: s.label, completed: false }));
        existingTask.status = 'pending';
        existingTask.difficulty = taskData.difficulty;
        existingTask.category = taskData.category;
        existingTask.aiPrompt = taskData.aiPrompt || null;
        existingTask.date = new Date();
        await existingTask.save();
        savedTask = existingTask;
      } else {
        // Create new task
        savedTask = await Task.create({
          userId: userId,
          sessionId: chatSessionId,
          date: new Date(),
          taskTitle: taskData.taskTitle,
          description: taskData.description,
          steps: (taskData.steps || []).map(s => ({ label: s.label, completed: false })),
          status: 'pending',
          generatedBy: 'ai',
          difficulty: taskData.difficulty,
          category: taskData.category,
          aiPrompt: taskData.aiPrompt || null
        });
      }
    }

    res.json({
      success: true,
      data: {
        sessionId: chatSessionId,
        response: chat.messages,
        generateTask: aiResponse.data.generateTask,
        task: aiResponse.data.task,
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
router.get('/history', ClerkExpressRequireAuth(), premiumMiddleware, async (req, res) => {
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
router.get('/session/:sessionId', ClerkExpressRequireAuth(), premiumMiddleware, async (req, res) => {
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
router.delete('/session/:sessionId', ClerkExpressRequireAuth(), premiumMiddleware, async (req, res) => {
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
router.get('/analytics', ClerkExpressRequireAuth(), premiumMiddleware, async (req, res) => {
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
