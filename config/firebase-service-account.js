const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert(require('./memo-ab7e1-firebase-adminsdk-8vt29-ceac478057.json')),
});

module.exports = admin; // Export the Firebase Admin module