import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from '../models/User.js';

// Usage: node backend/scripts/promoteAdmin.js <email>
const email = process.argv[2] || process.env.INIT_ADMIN_EMAIL;

if (!email) {
  console.error('Usage: node backend/scripts/promoteAdmin.js <email> OR set INIT_ADMIN_EMAIL in .env');
  process.exit(1);
}

async function run() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube_project';
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }
    if (user.isAdmin) {
      console.log(`${email} is already an admin.`);
    } else {
      user.isAdmin = true;
      await user.save();
      console.log(`Promoted ${email} to admin.`);
    }
  } catch (e) {
    console.error('Error promoting admin:', e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
