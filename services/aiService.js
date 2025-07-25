const OpenAI = require('openai');
const EmotionalContext = require('../models/EmotionalContext');
const Task = require('../models/Task'); // Import Task model

// Initialize OpenAI client only if API key is available
let openai = null;
if (process.env.OPENROUTER_API_KEY) {
  openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY

  });
}

class AIService {
  static async generateDailyTask(userMood, userNotes, userHistory = [], userId = null) {
    // If OpenAI is not configured, use fallback tasks
    if (!openai) {
      console.warn('OpenAI API key not configured, using fallback tasks');
      return this._getFallbackTask(userMood);
    }

    console.log('userHistory', JSON.stringify(userHistory));

    let emotionalContextText = '';
    if (userId) {
      try {
        const emotionalContext = await EmotionalContext.findOne({ userId });
        if (emotionalContext && emotionalContext.responses && emotionalContext.responses.length > 0) {
          emotionalContextText = '\n\nUser Emotional Context:';
          emotionalContext.responses.forEach((item, idx) => {
            emotionalContextText += `\nQ${idx + 1}: ${item.question}\nA${idx + 1}: ${item.response.join('; ')}`;
          });
        }
      } catch (err) {
        console.error('Error fetching emotional context:', err);
      }
    }

    try {
      const moodMapping = {
        'very_sad': 'extremely low and sad',
        'sad': 'low and sad',
        'neutral': 'neutral',
        'happy': 'good and happy',
        'very_happy': 'excellent and very happy'
      };

      const moodDescription = moodMapping[userMood] || 'neutral';

      // Prepare a summary of pending tasks for the prompt
      let pendingTasksText = '';
      if (userHistory && userHistory.length > 0) {
        pendingTasksText = '\n- User has not completed these tasks yet: ' + userHistory.map(task => `"${task.taskTitle}"`).join(', ');
      } else {
        pendingTasksText = '\n- User has no pending tasks.';
      }

      console.log('pendingTasksText', pendingTasksText);

      const prompt = `
You are a compassionate mental health assistant. Generate a gentle, achievable daily task for someone whose mood is ${moodDescription}.

Context:
- User's mood: ${userMood}
- User's notes: "${userNotes || 'No additional notes'}"
- User's emotional context:  ${emotionalContextText}
- User's pending tasks:  ${pendingTasksText}

Requirements:
1. Create a task that takes 15-30 minutes.
2. Break it into 2-3 simple steps.
3. Make it appropriate for their current mood and emotional context.
4. Focus on small wins and self-care.
5. Be encouraging and supportive.
6. If the user has pending tasks, do NOT repeat, reinforce, or suggest a very similar task to those not yet completed. Introduce something completely new.
7. Respond ONLY with a valid JSON object as specified below, with no extra text or explanation.

Respond with a JSON object in this format:
{
  "taskTitle": "Clear, encouraging task title",
  "description": "Brief description of why this task is helpful",
  "steps": [
    {"label": "Step 1 description"},
    {"label": "Step 2 description"},
    {"label": "Step 3 description (optional)"}
  ],
  "category": "self_care|productivity|social|physical|mental|creative",
  "difficulty": "easy|medium|hard"
}
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a mental health assistant focused on creating gentle, achievable daily tasks. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      const taskData = JSON.parse(content);

      return {
        success: true,
        data: taskData
      };
    } catch (error) {
      console.error('AI Service Error:', error);
      return this._getFallbackTask(userMood);
    }
  }

  static async getPendingTasksForUser(userId) {
    // Fetch all pending tasks for the user
    return Task.find({ userId, status: 'pending' }).sort({ date: -1 });
  }

  static async generateChatResponse(messages, userMood = null, userId = null) {
    console.log('[AIService.generateChatResponse] called with messages:', messages, 'userMood:', userMood);
    if (!openai) {
      console.warn('[AIService.generateChatResponse] OpenAI not configured');
      return {
        success: false,
        error: 'AI chat is currently unavailable. Please configure your OpenAI API key to enable this feature.'
      };
    }

    try {
      // Count user messages for context
      const userMessages = messages.filter(m => m.role === 'user');
      const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content.toLowerCase() : '';
      const POSITIVE_RESPONSES = ['yes', 'please', 'sure', 'okay', 'ok', 'yeah', 'yep', 'mate'];
      const CONTEXT_THRESHOLD = 2; // Number of user messages before offering help

      // Check if user responded positively to a help offer
      if (userMessages.length > CONTEXT_THRESHOLD) {
        if (POSITIVE_RESPONSES.some(r => lastUserMessage.includes(r))) {
          // Summarize conversation for userNotes
          const conversationSummaryPrompt = `Summarize the user's main concerns and emotional state from this conversation in 1-2 sentences, focusing on what might help them most right now.\n\nConversation:\n${messages.map(m => m.role + ': ' + m.content).join('\n')}`;
          const summaryResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'You are a mental health assistant. Always respond with a concise summary.' },
              { role: 'user', content: conversationSummaryPrompt }
            ],
            max_tokens: 80,
            temperature: 0.5,
          });
          const userNotes = summaryResponse.choices[0].message.content;
          // Fetch all pending tasks for the user
          let userHistory = [];
          if (userId) {
            userHistory = await this.getPendingTasksForUser(userId);
          }
          const task = await this.generateDailyTask(userMood, userNotes, userHistory, userId);
          return {
            success: true,
            data: {
              generateTask: true,
              task: task,
              content: "Here are a few steps to help improve how you're feeling right now,If you don't like it, just say 'Mate' and I will generate a new one",
              timestamp: new Date()
            }
          };
        }
      }

      // If enough context, offer help
      let offerHelp = false;
      if (userMessages.length === CONTEXT_THRESHOLD) {
        offerHelp = true;
      }

      // System prompt for emotionally intelligent, supportive conversation
      const systemPrompt = `You are a compassionate mental health assistant. Your role is to:
1. Listen empathetically to the user's concerns.
2. Provide gentle, supportive responses.
3. Reflect back the user's emotional state in a comforting tone (e.g., "It sounds like you're feeling really overwhelmed today. That's completely okay.")
4. If you have gathered enough context from the conversation (at least ${CONTEXT_THRESHOLD} user messages) not less than ${CONTEXT_THRESHOLD}, gently ask: "Would you like a few steps to help improve how you're feeling right now?" and wait for the user's response.
5. If the user responds positively (e.g., "yes", "please", "sure") and at least ${CONTEXT_THRESHOLD} user messages, respond ONLY with a JSON object: { generateTask: true, userMood, userNotes: <summary of the conversation> }.
6. If the user declines or is unclear, respond with a gentle, supportive message and do not offer steps again unless the user asks.
7. Never provide medical diagnoses or emergency crisis intervention.
8. Always keep responses warm, supportive, and under 200 words.
${userMood ? `Current user mood: ${userMood}` : ''}`;

      console.log('[AIService.generateChatResponse] systemPrompt:', systemPrompt);
      console.log('[AIService.generateChatResponse] Sending request to OpenAI with messages:', [
        {
          role: 'system',
          content: systemPrompt
        },
        ...messages
      ]);

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          ...messages
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      console.log('[AIService.generateChatResponse] OpenAI response:', response);

      return {
        success: true,
        data: {
          content: response.choices[0].message.content,
          timestamp: new Date()
        }
      };
    } catch (error) {
      console.error('[AIService.generateChatResponse] Chat AI Error:', error);
      return {
        success: false,
        error: 'Unable to generate response at this time. Please try again later.'
      };
    }
  }

  static async analyzeMoodFromText(text) {
    // If OpenAI is not configured, return basic analysis
    if (!openai) {
      return {
        success: false,
        data: {
          mood: 'neutral',
          sentiment: 'neutral',
          confidence: 0.0,
          topics: []
        }
      };
    }

    try {
      const prompt = `Analyze the mood/sentiment of this text and return a JSON response:
"${text}"

Respond with:
{
  "mood": "very_sad|sad|neutral|happy|very_happy",
  "sentiment": "negative|neutral|positive",
  "confidence": 0.0-1.0,
  "topics": ["topic1", "topic2"]
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a mood analysis assistant. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      return {
        success: true,
        data: analysis
      };
    } catch (error) {
      console.error('Mood Analysis Error:', error);
      return {
        success: false,
        data: {
          mood: 'neutral',
          sentiment: 'neutral',
          confidence: 0.0,
          topics: []
        }
      };
    }
  }

  static async generateWeeklyInsights(moodData) {
    // If OpenAI is not configured, return fallback insights
    if (!openai) {
      console.warn('[AIService.generateWeeklyInsights] OpenAI not configured');
      return {
        success: false,
        error: 'AI chat is currently unavailable. Please configure your OpenAI API key to enable this feature.'
      };
    }

    try {
      const prompt = `Analyze this user's mood data and generate 3 personalized weekly insights. Focus on patterns, improvements, and actionable advice.

Current Week Moods: ${JSON.stringify(moodData.currentWeek)}
Previous Week Moods: ${JSON.stringify(moodData.previousWeek)}

Generate insights that are:
1. Positive and encouraging
2. Based on actual mood patterns
3. Actionable and specific
4. Focus on emotional well-being and self-care

Respond with a JSON object:
{
  "insights": [
    "First insight about mood patterns or improvements",
    "Second insight about specific days or routines",
    "Third insight with actionable advice"
  ]
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a mental health assistant that provides personalized, encouraging insights based on mood data. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const insightsData = JSON.parse(response.choices[0].message.content);
      return insightsData;
    } catch (error) {
      console.error('[AIService.generateWeeklyInsights] Chat AI Error:', error);
      return {
        success: false,
        error: 'Unable to generate weekly insights at this time. Please try again later.'
      };
    }
  }

  static _getFallbackTask(userMood) {
    const fallbackTasks = {
      'very_sad': {
        taskTitle: 'Take a gentle self-care break',
        description: 'Small acts of kindness to yourself can help during difficult times',
        steps: [
          { label: 'Take 5 deep breaths' },
          { label: 'Make a warm drink' },
          { label: 'Write down one thing you\'re grateful for' }
        ],
        category: 'self_care',
        difficulty: 'easy'
      },
      'sad': {
        taskTitle: 'Connect with something positive',
        description: 'Gentle activities to lift your spirits',
        steps: [
          { label: 'Listen to a favorite song' },
          { label: 'Step outside for fresh air' },
          { label: 'Text a friend or family member' }
        ],
        category: 'social',
        difficulty: 'easy'
      },
      'neutral': {
        taskTitle: 'Organize one small space',
        description: 'A simple task to create a sense of accomplishment',
        steps: [
          { label: 'Choose a small area (desk, drawer, etc.)' },
          { label: 'Remove everything and clean the space' },
          { label: 'Put items back in an organized way' }
        ],
        category: 'productivity',
        difficulty: 'medium'
      },
      'happy': {
        taskTitle: 'Share your positive energy',
        description: 'Spread joy while maintaining your good mood',
        steps: [
          { label: 'Do something creative for 10 minutes' },
          { label: 'Share a positive message with someone' },
          { label: 'Plan something fun for later' }
        ],
        category: 'creative',
        difficulty: 'medium'
      },
      'very_happy': {
        taskTitle: 'Channel your energy into growth',
        description: 'Use your positive energy for personal development',
        steps: [
          { label: 'Learn something new for 15 minutes' },
          { label: 'Exercise or do physical activity' },
          { label: 'Set a small goal for tomorrow' }
        ],
        category: 'mental',
        difficulty: 'medium'
      }
    };

    return {
      success: true,
      data: fallbackTasks[userMood] || fallbackTasks['neutral']
    };
  }
}

module.exports = AIService;
