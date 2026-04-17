import express from 'express';
import ollamaRoutes from './routes/ollama.js';
import cors from 'cors';
import chalk from 'chalk';

const app = express();
const PORT = process.env.PORT || 3000;

// Keep-alive configuration
const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; // 14 minutes (under Render's 15 min timeout)
const STOP_HOUR_IST = 22; // 11 PM IST

// Base URL for keep-alive - use env var for production, auto-detect for local
const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL;
let baseUrl = null;

let keepAliveTimer = null;
let isKeepAliveActive = true;
let nextPingTime = null;

// Helper to format timestamp
function getTimestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

// Helper to format next ping time
function formatNextPingTime(timestamp) {
  if (!timestamp) return 'unknown';
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

// Function to check if current time is after 11 PM IST
function isAfter11PMIST() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const isAfter = istTime.getUTCHours() >= STOP_HOUR_IST;
  if (isAfter) {
    console.log(chalk.bgMagenta.black.bold(` ${getTimestamp()} `) + chalk.magenta(' ⏰ Time check: ') + chalk.white('After 11 PM IST - keep-alive will stop'));
  }
  return isAfter;
}

// Function to ping health endpoint
function pingHealth() {
  const currentTime = getTimestamp();

  if (!isKeepAliveActive) {
    console.log(chalk.bgGray.white(` ${currentTime} `) + chalk.gray(' ⛔ Keep-alive is ') + chalk.bgGray.white.bold(' INACTIVE ') + chalk.gray(', skipping ping'));
    return;
  }

  if (isAfter11PMIST()) {
    isKeepAliveActive = false;
    console.log(chalk.bgRed.white.bold(` ${currentTime} `) + chalk.red(' 🛑 Stopping keep-alive - past 11 PM IST cutoff'));
    return;
  }

  nextPingTime = Date.now() + KEEP_ALIVE_INTERVAL;
  console.log(
    chalk.bgCyan.black(` ${currentTime} `) +
    chalk.cyan(' 📡 Keep-alive ping ') + chalk.bgCyan.black.bold(' EXECUTING ') +
    chalk.cyan(` → Next ping at `) + chalk.bgGreen.black(` ${formatNextPingTime(nextPingTime)} `)
  );

  fetch(`${baseUrl}/health`)
    .then(() => {
      console.log(
        chalk.bgGreen.black(` ${getTimestamp()} `) +
        chalk.green(' ✅ Keep-alive ping ') + chalk.bgGreen.black.bold(' SUCCESS ')
      );
    })
    .catch(err => {
      console.log(
        chalk.bgRed.white(` ${getTimestamp()} `) +
        chalk.red(' ❌ Keep-alive ping ') + chalk.bgRed.white.bold(' FAILED ') +
        chalk.red(` → ${err.message}`)
      );
    });

  keepAliveTimer = setTimeout(pingHealth, KEEP_ALIVE_INTERVAL);
}

// Function to start keep-alive
function startKeepAlive() {
  const currentTime = getTimestamp();
  if (keepAliveTimer) clearTimeout(keepAliveTimer);
  isKeepAliveActive = true;
  nextPingTime = Date.now() + KEEP_ALIVE_INTERVAL;
  console.log(
    chalk.bgBlue.white(` ${currentTime} `) +
    chalk.blue(' 🚀 Keep-alive ') + chalk.bgBlue.white.bold(' STARTED ') +
    chalk.blue(` → Next ping at `) + chalk.bgYellow.black(` ${formatNextPingTime(nextPingTime)} `)
  );
  keepAliveTimer = setTimeout(pingHealth, KEEP_ALIVE_INTERVAL);
}

// Function to reset keep-alive timer (called on /ollama requests)
function resetKeepAlive(req) {
  const currentTime = getTimestamp();
  const previousNextPing = nextPingTime ? formatNextPingTime(nextPingTime) : 'none';

  // If it was stopped (after 11 PM), restart it
  if (!isKeepAliveActive) {
    console.log(
      chalk.bgYellow.black(` ${currentTime} `) +
      chalk.yellow(' 🔄 Resuming keep-alive after ') + chalk.bgYellow.black.bold(' /OLLAMA ') + chalk.yellow(' request')
    );
    startKeepAlive();
    return;
  }

  // Always reset the timer
  if (keepAliveTimer) clearTimeout(keepAliveTimer);
  nextPingTime = Date.now() + KEEP_ALIVE_INTERVAL;

  const url = req ? req.method + ' ' + req.path : 'unknown';
  console.log(
    chalk.bgYellow.black(` ${currentTime} `) +
    chalk.yellow(' 🔄 Keep-alive ') + chalk.bgYellow.black.bold(' RESET ') +
    chalk.yellow(' │ Request: ') + chalk.bgWhite.black(` ${url} `) +
    chalk.yellow(' │ Previous: ') + chalk.bgRed.white(` ${previousNextPing} `) +
    chalk.yellow(' │ New: ') + chalk.bgGreen.black(` ${formatNextPingTime(nextPingTime)} `)
  );

  keepAliveTimer = setTimeout(pingHealth, KEEP_ALIVE_INTERVAL);
}

app.use(cors(
  { origin: true }
));

// Middleware
app.use(express.json());

// Keep-alive middleware for /ollama routes
app.use('/ollama', (req, res, next) => {
  resetKeepAlive(req);
  next();
});

// Routes
app.use('/ollama', ollamaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const server = app.listen(PORT, () => {
  // Use env var for production, auto-detect for local dev
  if (DEPLOYMENT_URL) {
    baseUrl = DEPLOYMENT_URL;
  } else {
    const address = server.address();
    // Handle both IPv4 and IPv6 addresses
    const host = address.address === '::' ? 'localhost' : address.address;
    baseUrl = `http://${host}:${address.port}`;
  }

  console.log(chalk.green.bold('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.green.bold('║') + chalk.white.bold('  Server running on port ') + chalk.cyan.bold(PORT) + chalk.green.bold('           ║'));
  console.log(chalk.green.bold('╚══════════════════════════════════════════╝'));
  console.log(chalk.gray('Keep-alive base URL: ') + chalk.cyan(baseUrl) + '\n');
  // Start keep-alive timer
  startKeepAlive();
});

export default app;
