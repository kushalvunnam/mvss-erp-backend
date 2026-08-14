const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, restrictTo, JWT_SECRET } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

// Version Check
router.get('/version', (req, res) => {
  res.send({ version: '2.1.0-total-discount-pdf-removal' });
});

// User Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).send({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail, active: true });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).send({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { _id: user._id.toString(), email: user.email, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    // Log login activity asynchronously without delaying the user HTTP response
    logAction(user, 'USER_LOGIN', `User ${user.email} logged in successfully`, req).catch(err => {
      console.warn('Non-blocking audit log warning:', err.message);
    });
    
    res.send({ 
      user: { id: user._id, name: user.name, email: user.email, role: user.role }, 
      token 
    });
  } catch (error) {
    res.status(500).send({ error: 'Server error during login.' });
  }
});

// Get Current User Profile
router.get('/profile', auth, async (req, res) => {
  res.send({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
});

// Admin-only: Create user
router.post('/register', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send({ error: 'User with this email already exists.' });
    }

    const newUser = new User({ name, email, password, role });
    await newUser.save();

    await logAction(req.user, 'USER_CREATE', `Created new user ${email} with role ${role}`, req);
    res.status(201).send({ message: 'User registered successfully', userId: newUser._id });
  } catch (error) {
    res.status(500).send({ error: 'Failed to register user.' });
  }
});

// Admin-only: List users
router.get('/users', auth, restrictTo('Admin'), async (req, res) => {
  try {
    // Deactivate obsolete autoworkshop.com accounts
    await User.updateMany(
      { email: { $regex: '@autoworkshop.com$', $options: 'i' } },
      { active: false }
    );

    // Load only active users belonging to the mvssautomobiles.com domain
    const users = await User.find(
      { 
        active: true, 
        email: { $regex: '@mvssautomobiles.com$', $options: 'i' } 
      }, 
      '-password'
    );
    res.send(users);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch users.' });
  }
});

// User Logout
router.post('/logout', auth, async (req, res) => {
  try {
    await logAction(req.user, 'USER_LOGOUT', `User ${req.user.email} logged out`, req);
    res.send({ message: 'Logged out successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Server error during logout.' });
  }
});

// Change own password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).send({ error: 'All password fields are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).send({ error: 'New password and confirmation do not match.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).send({ error: 'New password must be at least 6 characters long.' });
    }

    // Load the user from DB (with password field)
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send({ error: 'User not found.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).send({ error: 'Incorrect current password.' });
    }

    const isSame = await user.comparePassword(newPassword);
    if (isSame) {
      return res.status(400).send({ error: 'New password cannot be the same as the current password.' });
    }

    user.password = newPassword; // Pre-save hook will hash this
    await user.save();

    await logAction(user, 'USER_PASSWORD_CHANGE', `User ${user.email} successfully updated their password`, req);

    res.send({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to update password: ' + error.message });
  }
});

// Admin only: Change another user's password
router.put('/users/:id/change-password', auth, restrictTo('Admin'), async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    if (!newPassword || !confirmPassword) {
      return res.status(400).send({ error: 'Password and confirmation are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).send({ error: 'Passwords do not match.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).send({ error: 'Password must be at least 6 characters long.' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).send({ error: 'User not found.' });
    }

    targetUser.password = newPassword;
    await targetUser.save();

    await logAction(req.user, 'USER_PASSWORD_RESET', `Admin Password Reset: Admin ${req.user.email} reset password for user ${targetUser.email} with role ${targetUser.role}`, req);

    res.send({ success: true, message: 'User password reset successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to reset user password: ' + error.message });
  }
});

module.exports = router;

