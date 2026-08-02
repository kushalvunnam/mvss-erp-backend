const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, restrictTo, JWT_SECRET } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

// Version Check
router.get('/version', (req, res) => {
  res.send({ version: '2.0.0-attendance-and-delete-fix' });
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
    const users = await User.find({}, '-password');
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

module.exports = router;
