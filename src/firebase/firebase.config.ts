// Import Firebase
import firebaseAdmin from 'firebase-admin';

console.log('Firebase Project ID:', process.env.FIREBASE_PROJECT_ID);
console.log('Firebase Client Email:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('Firebase Storage Bucket:', process.env.FIREBASE_STORAGE_BUCKET);

const app = firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    // i have commented above due to undifined error when
    // privateKey:process.env.FIREBASE_API_KEY ? process.env.FIREBASE_API_KEY.replace(/\\n/g, '\n') : '',

    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

export const FirebaseBucket = firebaseAdmin.storage().bucket();
export const FirebaseApp = app;
