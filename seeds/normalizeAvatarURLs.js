// seeds/normalizeAvatarURLs.js
// Run with: NODE_ENV=production node seeds/normalizeAvatarURLs.js
// This script will normalize user.avatar fields: if they contain absolute URLs, it will replace them with path+query.

const mongoose = require('mongoose');
const User = require('../models/User');

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/studypro';

(async function() {
  try {
    await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to DB');

    const users = await User.find({ avatar: { $type: 'string', $regex: '^https?://' } }).exec();
    console.log('Found', users.length, 'users with absolute avatar URLs');

    for (const user of users) {
      try {
        const parsed = new URL(user.avatar);
        const newAvatar = parsed.pathname + parsed.search;
        user.avatar = newAvatar;
        await user.save();
        console.log('Updated user', user._id.toString(), '->', newAvatar);
      } catch (e) {
        console.warn('Failed to normalize avatar for user', user._id.toString(), user.avatar, e.message);
      }
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
