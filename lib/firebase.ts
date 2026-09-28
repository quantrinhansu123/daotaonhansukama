import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDhc9bWAA8h1bqXEZcW0tq7j9t5lTQeoN4",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "classroom-257dc.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://classroom-257dc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "classroom-257dc",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "classroom-257dc.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "376090394045",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:376090394045:web:d99dedd72d3a02f96966d4",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-NS5J50BB0F"
};

// Log config in development (only first 10 chars of apiKey for security)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('[Firebase] Initializing with config:', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    apiKey: firebaseConfig.apiKey?.substring(0, 10) + '...',
    hasApiKey: !!firebaseConfig.apiKey
  });
}

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Test connection in browser
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED !== 'true' && process.env.NEXT_PUBLIC_SUPABASE_ENABLED !== 'true') {
  // Test Firestore connection after a short delay
  setTimeout(() => {
    const testRef = collection(db, 'users');
    getDocs(testRef)
      .then((snapshot) => {
        console.log('[Firebase] ✅ Firestore connection successful! Users count:', snapshot.size);
      })
      .catch((error) => {
        console.error('[Firebase] ❌ Firestore connection failed:', error.message);
        console.error('[Firebase] Error details:', error);
        console.error('[Firebase] Check Firestore rules and network connection');
      });
  }, 1000);
}
