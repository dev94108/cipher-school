import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const App = () => {
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState({ 
    name: '', 
    timeOfDay: 'morning',
    description: ''
  });
  const [user, setUser] = useState(null);
  const [authData, setAuthData] = useState({ 
    email: '', 
    password: '', 
    name: '' 
  });
  const [isLogin, setIsLogin] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userStats, setUserStats] = useState(null);
  const [completionNotes, setCompletionNotes] = useState({});

  const API_URL = 'http://localhost:5000/api';

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUserData(token);
    }
  }, []);

  const fetchUserData = async (token) => {
    setIsLoading(true);
    try {
      const [habitsRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/habits`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/user/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setHabits(habitsRes.data.data);
      setUser({ 
        name: habitsRes.data.user.name, 
        email: habitsRes.data.user.email 
      });
      setUserStats({
        ...habitsRes.data.user.stats,
        ...statsRes.data.stats
      });
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data');
      localStorage.removeItem('token');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const endpoint = isLogin ? 'login' : 'signup';
      const res = await axios.post(`${API_URL}/auth/${endpoint}`, authData);
      localStorage.setItem('token', res.data.token);
      fetchUserData(res.data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const addHabit = async (e) => {
    e.preventDefault();
    if (!newHabit.name.trim()) return;
    
    setIsLoading(true);
    try {
      const res = await axios.post(`${API_URL}/habits`, newHabit, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setHabits([...habits, res.data.data]);
      setNewHabit({ name: '', timeOfDay: 'morning', description: '' });
      setError('');
      fetchUserData(localStorage.getItem('token')); // Refresh stats
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add habit');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCompletion = async (habitId) => {
    setIsLoading(true);
    try {
      const res = await axios.patch(
        `${API_URL}/habits/${habitId}/toggle`, 
        { 
          date: selectedDate,
          notes: completionNotes[habitId] || ''
        }, 
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      
      setHabits(habits.map(habit => 
        habit._id === habitId ? res.data.habit : habit
      ));
      setError('');
      fetchUserData(localStorage.getItem('token')); // Refresh stats
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update habit');
    } finally {
      setIsLoading(false);
      setCompletionNotes(prev => ({ ...prev, [habitId]: '' }));
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setHabits([]);
    setUserStats(null);
    setError('');
  };

  const renderHabitItem = (habit) => {
    const completion = habit.completions.find(c => 
      c.date.split('T')[0] === selectedDate
    );
    const isCompleted = completion?.completed || false;
    
    // Calculate if streak is in danger (missed yesterday)
    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const missedYesterday = habit.currentStreak > 0 && 
      !habit.completions.some(c => 
        c.date.split('T')[0] === yesterdayStr && c.completed
      );

    return (
      <li key={habit._id} className="habit-item">
        <div className="habit-info">
          <div className="habit-header">
            <h3>{habit.name}</h3>
            <span className="time-badge">{habit.timeOfDay}</span>
          </div>
          
          {habit.description && (
            <p className="habit-description">{habit.description}</p>
          )}
          
          <div className="habit-meta">
            <div className="streak-display">
              <span className={`streak-count ${missedYesterday ? 'streak-danger' : ''}`}>
                🔥 {habit.currentStreak} day{habit.currentStreak !== 1 ? 's' : ''}
              </span>
              {habit.longestStreak > habit.currentStreak && (
                <span className="longest-streak">
                  (Best: {habit.longestStreak})
                </span>
              )}
            </div>
            <div className="completion-count">
              ✅ {habit.totalCompleted} time{habit.totalCompleted !== 1 ? 's' : ''}
            </div>
          </div>
          
          {isCompleted && completion.notes && (
            <div className="completion-notes">
              <p>Notes: {completion.notes}</p>
            </div>
          )}
        </div>
        
        <div className="habit-actions">
          {!isCompleted && (
            <div className="notes-input">
              <input
                type="text"
                placeholder="Add notes (optional)"
                value={completionNotes[habit._id] || ''}
                onChange={(e) => 
                  setCompletionNotes(prev => ({
                    ...prev,
                    [habit._id]: e.target.value
                  }))
                }
              />
            </div>
          )}
          <button
            onClick={() => toggleCompletion(habit._id)}
            className={`completion-btn ${isCompleted ? 'completed' : ''}`}
            disabled={isLoading}
          >
            {isCompleted ? '✓ Completed' : 'Mark Complete'}
          </button>
        </div>
      </li>
    );
  };

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <form onSubmit={handleAuth}>
            {!isLogin && (
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={authData.name}
                  onChange={(e) => setAuthData({...authData, name: e.target.value})}
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={authData.email}
                onChange={(e) => setAuthData({...authData, email: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={authData.password}
                onChange={(e) => setAuthData({...authData, password: e.target.value})}
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="primary-btn" disabled={isLoading}>
              {isLoading ? 'Processing...' : isLogin ? 'Login' : 'Sign Up'}
            </button>
          </form>
          <div className="auth-footer">
            <span>
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </span>
            <button 
              className="text-btn"
              onClick={() => setIsLogin(!isLogin)}
              disabled={isLoading}
            >
              {isLogin ? 'Sign Up' : 'Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>Habit Tracker</h1>
          <div className="user-actions">
            <div className="user-stats">
              <span className="welcome-message">Hello, {user.name}</span>
              {userStats && (
                <div className="stats-badges">
                  <span className="stat-badge">Habits: {userStats.totalHabits}</span>
                  <span className="stat-badge">Completed: {userStats.totalCompleted}</span>
                  <span className="stat-badge streak">
                    🔥 {userStats.currentStreak} day{userStats.currentStreak !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="date-controls">
          <div className="date-selector">
            <label>Select Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>

        <div className="habit-section">
          <div className="habit-form-container">
            <h2>Add New Habit</h2>
            <form onSubmit={addHabit} className="habit-form">
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Habit name"
                  value={newHabit.name}
                  onChange={(e) => setNewHabit({...newHabit, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <textarea
                  placeholder="Description (optional)"
                  value={newHabit.description}
                  onChange={(e) => setNewHabit({...newHabit, description: e.target.value})}
                />
              </div>
              <div className="form-row">
                <select
                  value={newHabit.timeOfDay}
                  onChange={(e) => setNewHabit({...newHabit, timeOfDay: e.target.value})}
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                  <option value="anytime">Anytime</option>
                </select>
                <button 
                  type="submit" 
                  className="primary-btn"
                  disabled={isLoading}
                >
                  {isLoading ? 'Adding...' : 'Add Habit'}
                </button>
              </div>
            </form>
          </div>

          <div className="habits-list-container">
            <h2>Your Habits</h2>
            {error && <div className="error-message">{error}</div>}
            {isLoading && habits.length === 0 ? (
              <div className="loading-spinner">Loading...</div>
            ) : habits.length === 0 ? (
              <div className="empty-state">
                <p>No habits yet. Add your first habit above!</p>
              </div>
            ) : (
              <ul className="habits-list">
                {habits.map(renderHabitItem)}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;