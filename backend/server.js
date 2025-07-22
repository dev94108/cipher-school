require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// Connect to MongoDB with enhanced options
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// User Schema with additional stats
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  totalHabits: { type: Number, default: 0 },
  totalCompleted: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  joinDate: { type: Date, default: Date.now }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Habit Schema with enhanced tracking
const habitSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  timeOfDay: { 
    type: String, 
    enum: ['morning', 'afternoon', 'evening', 'anytime'],
    default: 'anytime'
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completions: [{
    date: { type: Date, required: true },
    completed: { type: Boolean, default: false },
    notes: { type: String, default: '' }
  }],
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  totalCompleted: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Habit = mongoose.model('Habit', habitSchema);

// Auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    next();
  } catch (err) {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

// Enhanced streak calculation
const calculateStreaks = (completions) => {
  const sortedCompletions = completions
    .filter(c => c.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < sortedCompletions.length; i++) {
    const currentDate = new Date(sortedCompletions[i].date);
    currentDate.setHours(0, 0, 0, 0);

    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round((prevDate - currentDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }

    prevDate = currentDate;

    if (i === 0 && currentDate.getTime() === today.getTime()) {
      currentStreak = tempStreak;
    }
  }

  longestStreak = Math.max(longestStreak, tempStreak);
  
  return { currentStreak, longestStreak };
};

// Update user stats
const updateUserStats = async (userId) => {
  const habits = await Habit.find({ user: userId });
  const totalCompleted = habits.reduce((sum, habit) => sum + habit.totalCompleted, 0);
  
  const streaks = habits.map(h => h.currentStreak);
  const currentStreak = Math.max(...streaks, 0);
  
  const longestStreaks = habits.map(h => h.longestStreak);
  const longestStreak = Math.max(...longestStreaks, 0);

  await User.findByIdAndUpdate(userId, {
    totalHabits: habits.length,
    totalCompleted,
    currentStreak,
    longestStreak
  });
};

// Routes
// Auth routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = await User.create({ name, email, password });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ 
      token, 
      user: { 
        name: user.name, 
        email: user.email,
        stats: {
          totalHabits: user.totalHabits,
          totalCompleted: user.totalCompleted,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak
        }
      } 
    });
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: 'Email already exists' });
    } else {
      res.status(500).json({ message: 'Server error' });
    }
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ 
      token, 
      user: { 
        name: user.name, 
        email: user.email,
        stats: {
          totalHabits: user.totalHabits,
          totalCompleted: user.totalCompleted,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak
        }
      } 
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Habit routes
app.get('/api/habits', authMiddleware, async (req, res) => {
  try {
    const habits = await Habit.find({ user: req.user._id });
    
    const habitsWithStreaks = await Promise.all(
      habits.map(async habit => {
        const streakData = calculateStreaks(habit.completions);
        const updatedHabit = await Habit.findByIdAndUpdate(
          habit._id,
          { 
            currentStreak: streakData.currentStreak,
            longestStreak: streakData.longestStreak,
            totalCompleted: habit.completions.filter(c => c.completed).length
          },
          { new: true }
        );
        
        await updateUserStats(req.user._id);
        return updatedHabit;
      })
    );

    const user = await User.findById(req.user._id);
    
    res.json({ 
      data: habitsWithStreaks,
      user: {
        name: user.name,
        email: user.email,
        stats: {
          totalHabits: user.totalHabits,
          totalCompleted: user.totalCompleted,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak
        }
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/habits', authMiddleware, async (req, res) => {
  try {
    const { name, timeOfDay, description } = req.body;
    const habit = await Habit.create({
      name,
      timeOfDay,
      description,
      user: req.user._id
    });
    
    await updateUserStats(req.user._id);
    
    res.json({ data: habit });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.patch('/api/habits/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const { date, notes } = req.body;
    const habit = await Habit.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!habit) return res.status(404).json({ message: 'Habit not found' });

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const completionIndex = habit.completions.findIndex(c => 
      new Date(c.date).toISOString().split('T')[0] === targetDate.toISOString().split('T')[0]
    );

    if (completionIndex >= 0) {
      habit.completions[completionIndex].completed = !habit.completions[completionIndex].completed;
      if (notes) habit.completions[completionIndex].notes = notes;
    } else {
      habit.completions.push({ 
        date: targetDate, 
        completed: true,
        notes: notes || ''
      });
    }

    // Calculate streaks and update counts
    const { currentStreak, longestStreak } = calculateStreaks(habit.completions);
    habit.currentStreak = currentStreak;
    habit.longestStreak = longestStreak;
    habit.totalCompleted = habit.completions.filter(c => c.completed).length;

    await habit.save();
    await updateUserStats(req.user._id);
    
    res.json({ 
      message: 'Completion toggled',
      habit: habit.toObject()
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/user/stats', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      stats: {
        totalHabits: user.totalHabits,
        totalCompleted: user.totalCompleted,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        joinDate: user.joinDate
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});