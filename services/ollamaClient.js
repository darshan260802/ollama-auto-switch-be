import FormData from 'form-data';
import axios from 'axios';
import { createCookie, parseUsage } from '../utils/htmlParser.js';

/**
 * Connect an Ollama account to a device key.
 * @param {string} authToken - Ollama session token.
 * @param {string} deviceName - Device name.
 * @param {string} encKey - Base64-encoded public key.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function connectAccount(authToken, deviceName, encKey) {
  const form = new FormData();
  form.append('name', deviceName);
  form.append('public-key', atob(encKey));

  const response = await axios.post('https://ollama.com/connect', form, {
    headers: {
      Cookie: createCookie(authToken),
      ...form.getHeaders(),
    },
    validateStatus: () => true,
  });

  const responseHtml = response.data;
  const isSuccess = responseHtml.includes('Device Connected Successfully');

  if (!isSuccess) {
    const errorMatch = responseHtml.match(
      /hx-swap-oob="innerHTML:#connect-error"[^>]*>([^<]*)/
    );
    const errorMsg = errorMatch ? errorMatch[1].trim() : 'Connection failed';
    return { success: false, error: errorMsg };
  }

  return { success: true };
}

/**
 * Disconnect a device key from an Ollama account.
 * @param {string} authToken - Ollama session token.
 * @param {string} encKey - Base64-encoded public key.
 * @returns {Promise<{success: boolean}>}
 */
export async function disconnectAccount(authToken, encKey) {
  const encodedKey = encodeURIComponent(encKey);

  const response = await axios.delete(
    `https://ollama.com/settings/keys/${encodedKey}/?type=pubkey`,
    {
      headers: {
        Cookie: createCookie(authToken),
      },
      validateStatus: () => true,
    }
  );

  const isSuccess = response.status >= 200 && response.status < 400;
  return { success: isSuccess };
}

/**
 * Fetch Ollama usage for an account.
 * @param {string} authToken - Ollama session token.
 * @returns {Promise<{session: {usage: string|null, reset: string|null}, weekly: {usage: string|null, reset: string|null}}>}
 */
export async function fetchUsage(authToken) {
  const response = await axios.get('https://ollama.com/settings', {
    headers: {
      Cookie: createCookie(authToken),
    },
    validateStatus: () => true,
  });

  return parseUsage(response.data);
}
