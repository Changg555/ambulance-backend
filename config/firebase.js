const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

if (!admin.apps.length) {
  const rootDir = path.resolve(__dirname, '..');
  const candidatePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? path.resolve(rootDir, process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : null,
    path.resolve(rootDir, 'serviceAccountKey.json'),
    path.resolve(rootDir, 'serviceAccountKey.json.json'),
  ].filter(Boolean);

  const foundPath = candidatePaths.find((p) => fs.existsSync(p));

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (err) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env var:", err);
    }
  } else if (foundPath) {
    const serviceAccount = require(foundPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
}

const db = admin.firestore();

module.exports = { admin, db };
