import express from 'express';
import ollamaRoutes from './routes/ollama.js';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Keep-alive configuration
const KEEP_ALIVE_INTERVAL = 4 * 60 * 1000; // 4 minutes
const STOP_HOUR_IST = 22; // 11 PM IST
let keepAliveTimer = null;
let isKeepAliveActive = true;

// Function to check if current time is after 11 PM IST
function isAfter11PMIST() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.getUTCHours() >= STOP_HOUR_IST;
}

// Function to ping health endpoint
function pingHealth() {
  if (!isKeepAliveActive || isAfter11PMIST()) {
    isKeepAliveActive = false;
    return;
  }

  fetch(`http://localhost:${PORT}/health`)
    .then(() => console.log('Keep-alive ping'))
    .catch(err => console.error('Keep-alive ping failed:', err));

  keepAliveTimer = setTimeout(pingHealth, KEEP_ALIVE_INTERVAL);
}

// Function to start keep-alive
function startKeepAlive() {
  if (keepAliveTimer) clearTimeout(keepAliveTimer);
  isKeepAliveActive = true;
  keepAliveTimer = setTimeout(pingHealth, KEEP_ALIVE_INTERVAL);
}

// Function to reset keep-alive timer (called on /ollama requests)
function resetKeepAlive() {
  // If it was stopped (after 11 PM), restart it
  if (!isKeepAliveActive) {
    console.log('Resuming keep-alive after /ollama request');
    startKeepAlive();
  }
  // Always reset the timer
  if (keepAliveTimer) clearTimeout(keepAliveTimer);
  keepAliveTimer = setTimeout(pingHealth, KEEP_ALIVE_INTERVAL);
}

app.use(cors(
  { origin: true }
));

// Middleware
app.use(express.json());

// Keep-alive middleware for /ollama routes
app.use('/ollama', (req, res, next) => {
  resetKeepAlive();
  next();
});

// Routes
app.use('/ollama', ollamaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Start keep-alive timer
  startKeepAlive();
});

export default app;
