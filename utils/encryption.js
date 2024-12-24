const crypto = require('crypto');
require('dotenv').config();

let secretKey = process.env.SECRET_KEY;
if (secretKey.length < 32) {
    // Pad the key if it's too short
    secretKey = secretKey.padEnd(32, '0');
} else if (secretKey.length > 32) {
    // Trim the key if it's too long
    secretKey = secretKey.slice(0, 32);
}

function encrypt(text) {
    const iv = crypto.randomBytes(16); // Generate a random IV
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey, 'utf8'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`; // Return IV with encrypted text
}

function decrypt(encryptedText) {
    const [ivHex, encryptedData] = encryptedText.split(':'); // Split IV and data
    const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        Buffer.from(secretKey, 'utf8'),
        Buffer.from(ivHex, 'hex')
    );
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

module.exports = { encrypt, decrypt };
