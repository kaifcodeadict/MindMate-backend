const OpenAI = require('openai');

// Initialize OpenAI client only if API key is available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

class AIService {
  static async generateDailyTask(userMood, userNotes, userHistory = []) {
    // If OpenAI is not configured, use fallback tasks
    if (!openai) {
      console.warn('OpenAI API key not configured, using fallback tasks');
      return this._getFallbackTask(userMood);
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
      
      const prompt = `
You are a compassionate mental health assistant. Generate a gentle, achievable daily task for someone whose mood is ${moodDescription}.

Context:
- User's mood: ${userMood}
- User's notes: "${userNotes || 'No additional notes'}"
- Recent task history: ${userHistory.length > 0 ? userHistory.map(task => task.taskTitle).join(', ') : 'No recent tasks'}

Requirements:
1. Create a task that takes 15-30 minutes
2. Break it into 2-3 simple steps
3. Make it appropriate for their current mood
4. Focus on small wins and self-care
5. Be encouraging and supportive

If the mood is low, focus on basic self-care, gentle activities, or reaching out to others.
If the mood is neutral, focus on productivity or personal growth.
If the mood is high, focus on activities that maintain positive energy.

Respond with a JSON object containing:
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

  static async generateChatResponse(messages, userMood = null) {
    // If OpenAI is not configured, return a helpful message
    if (!openai) {
      return {
        success: false,
        error: 'AI chat is currently unavailable. Please configure your OpenAI API key to enable this feature.'
      };
    }

    try {
      const systemPrompt = `You are a compassionate mental health assistant. Your role is to:
1. Listen empathetically to the user's concerns
2. Provide gentle, supportive responses
3. Offer practical coping strategies when appropriate
4. Encourage professional help when needed
5. Never provide medical diagnoses or emergency crisis intervention

Keep responses warm, supportive, and under 200 words. If the user seems to be in crisis, gently encourage them to contact a mental health professional or crisis helpline.

${userMood ? `Current user mood: ${userMood}` : ''}`;

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

      return {
        success: true,
        data: {
          content: response.choices[0].message.content,
          timestamp: new Date()
        }
      };
    } catch (error) {
      console.error('Chat AI Error:', error);
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