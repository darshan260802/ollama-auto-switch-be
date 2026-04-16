import { Router } from 'express';
import FormData from 'form-data';
import { parseUsage, createCookie } from '../utils/htmlParser.js';

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

    // Prepare form data
    const form = new FormData();
    form.append('name', name);
    form.append('public-key', atob(enc_key));

    // Make request to Ollama
    const response = await fetch('https://ollama.com/connect', {
      method: 'POST',
      headers: {
        'Cookie': createCookie(auth),
        ...form.getHeaders()
      },
      body: form
    });

    // Check if successful (2xx status or redirect)
    const isSuccess = response.ok || response.status === 302;

    return res.json({ connect: isSuccess });
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
    console.log("hi");
    
    const { auth } = req.body;

    if (!auth) {
      return res.status(400).json({
        error: 'Missing required field: auth'
      });
    }

    // Make request to Ollama settings
    const response = await fetch('https://ollama.com/settings', {
      method: 'GET',
      headers: {
        'Cookie': createCookie(auth)
      }
    });

    const html = await response.text();
    const usage = parseUsage(html);

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

    // URL encode the key for the path
    const encodedKey = encodeURIComponent(enc_key);

    // Make request to Ollama
    const response = await fetch(`https://ollama.com/settings/keys/${encodedKey}?type=pubkey`, {
      method: 'GET',
      headers: {
        'Cookie': createCookie(auth)
      }
    });

    // Check if successful
    const isSuccess = response.ok || response.status === 302;

    return res.json({ connect: isSuccess });
  } catch (error) {
    console.error('Disconnect error:', error);
    return res.json({ connect: false });
  }
});

export default router;
