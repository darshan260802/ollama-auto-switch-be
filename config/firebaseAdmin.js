import { initializeApp, getApps, cert } from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let adminDb = null;
let adminAuth = null;

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    adminDb = getFirestore();
    adminAuth = getAuth();
    return { adminDb, adminAuth };
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
        'Add the full Firebase service account JSON to your environment.'
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (error) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ' + error.message
    );
  }

  initializeApp({
    credential: cert(serviceAccount),
  });

  adminDb = getFirestore();
  adminAuth = getAuth();

  console.log('Firebase Admin SDK initialized');
  return { adminDb, adminAuth };
}

initializeFirebaseAdmin();

export { adminDb, adminAuth };

