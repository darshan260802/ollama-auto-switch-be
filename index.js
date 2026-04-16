import express from 'express';
import ollamaRoutes from './routes/ollama.js';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors(
  { origin: true }
));

// Middleware
app.use(express.json());

// Routes
app.use('/ollama', ollamaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
