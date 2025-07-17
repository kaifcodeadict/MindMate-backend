const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const router = express.Router();
const { ClerkExpressRequireAuth, users } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
const { clerkClient } = require('@clerk/clerk-sdk-node');

// Google OAuth routes
router.get('/google',
  authLimiter,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed` }),
  (req, res) => {
    // Generate JWT token
    const token = jwt.sign(
      { id: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await req.user.populate('premiumExpiresAt');
    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        streakCount: user.streakCount,
        lastCheckIn: user.lastCheckIn,
        preferences: user.preferences,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user data'
    });
  }
});

// Update user preferences
router.patch('/preferences', authMiddleware, async (req, res) => {
  try {
    const { notifications, reminderTime, timezone } = req.body;

    const updateData = {};
    if (notifications !== undefined) updateData['preferences.notifications'] = notifications;
    if (reminderTime !== undefined) updateData['preferences.reminderTime'] = reminderTime;
    if (timezone !== undefined) updateData.timezone = timezone;

    const user = await req.user.updateOne(updateData);

    res.json({
      success: true,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences'
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});


router.post('/sync-user', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const clerkUser = await users.getUser(userId);

    let firstName = clerkUser.firstName;
    let lastName = clerkUser.lastName;
    let name;
    if (!firstName && !lastName) {
      // Use email prefix as name if both are missing
      name = clerkUser.emailAddresses[0].emailAddress.split('@')[0];
      firstName = name;
      // Update Clerk user with this firstName
      try {
        await clerkClient.users.updateUser(userId, { firstName });
      } catch (clerkUpdateErr) {
        console.error('Error updating Clerk user firstName:', clerkUpdateErr);
      }
    } else {
      name = (firstName || "") + (lastName ? (" " + lastName) : "");
    }

    const userData = {
      clerkId: clerkUser.id,
      email: clerkUser.emailAddresses[0].emailAddress,
      name,
    };

    let user = await User.findOne({ clerkId: clerkUser.id });
    if (!user) {
      // Try finding by email if not found by clerkId
      user = await User.findOne({ email: userData.email });
      if (user) {
        // Update user to add clerkId and update other fields
        let needsUpdate = false;
        if (user.clerkId !== userData.clerkId) needsUpdate = true;
        if (user.name !== userData.name) needsUpdate = true;
        if (needsUpdate) {
          await User.updateOne({ email: userData.email }, userData);
        }
      } else {
        // Create new user
        try {
          const createdUser = await User.create(userData);
          console.log("User created:", createdUser);
        } catch (createErr) {
          console.error("Error creating user:", createErr);
          return res.status(500).json({ error: createErr.message });
        }
      }
    } else {
      // User found by clerkId, update if needed
      let needsUpdate = false;
      if (user.email !== userData.email) needsUpdate = true;
      if (user.name !== userData.name) needsUpdate = true;
      if (needsUpdate) {
        await User.updateOne({ clerkId: clerkUser.id }, userData);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
