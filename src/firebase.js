/**
 * firebase.js — Singleton de Firebase para toda la app.
 * TODOS los servicios y contextos deben importar db/auth desde aquí.
 * Nunca llamar initializeApp() en otro archivo.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { firebaseConfig } from './firebase-config/firebase-config';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);

export const auth      = getAuth(app);
export const storage   = getStorage(app);
export const functions = getFunctions(app);
export default app;
