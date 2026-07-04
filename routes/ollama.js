import { Router } from 'express';
import {
  connectAccount,
  disconnectAccount,
  fetchUsage,
} from '../services/ollamaClient.js';

const router = Router();

/**
 * POST /ollama/connect
 * Connect to Ollama with auth, name, and public key
 */
router.post('/connect', async (req, res) => {
  try {
    const { auth, name, enc_key } = req.body;

    if (!auth || !name || !enc_key) {
      return res.status(400).json({
        connect: false,
        error: 'Missing required fields: auth, name, enc_key'
      });
    }

    console.log('Sending public-key:', atob(enc_key));

    const result = await connectAccount(auth, name, enc_key);

    if (!result.success) {
      return res.json({ connect: false, msg: result.error });
    }

    return res.json({ connect: true });
  } catch (error) {
    console.error('Connect error:', error);
    return res.json({ connect: false });
  }
});

/**
 * GET /ollama/usage
 * Get session and weekly usage statistics
 */
router.post('/usage', async (req, res) => {
  try {
    const { auth } = req.body;

    if (!auth) {
      return res.status(400).json({
        error: 'Missing required field: auth'
      });
    }

    const usage = await fetchUsage(auth);

    return res.json(usage);
  } catch (error) {
    console.error('Usage error:', error);
    return res.status(500).json({
      error: 'Failed to fetch usage data',
      session: { usage: null, reset: null },
      weekly: { usage: null, reset: null }
    });
  }
});

/**
 * GET /ollama/disconnect
 * Disconnect a specific public key
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { auth, enc_key } = req.body;

    if (!auth || !enc_key) {
      return res.status(400).json({
        connect: false,
        error: 'Missing required fields: auth, enc_key'
      });
    }

    const result = await disconnectAccount(auth, enc_key);

    return res.json({ connect: result.success });
  } catch (error) {
    console.error('Disconnect error:', error);
    return res.json({ connect: false });
  }
});

export default router;
