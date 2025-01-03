const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert(require('../config/memo-ab7e1-firebase-adminsdk-8vt29-d64c88d453.json')),
});

