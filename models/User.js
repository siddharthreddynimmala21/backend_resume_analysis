import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: false,
    validate: {
      validator: function(v) {
        // Only validate if password is being set and not empty
        if (v !== undefined && v !== null && v !== '') {
          return v.length >= 6;
        }
        return true; // Skip validation if password is not being set
      },
      message: 'If set, password must be at least 6 characters long'
    }
  },
  otp: {
    code: String,
    expiresAt: Date,
  },  isVerified: {
    type: Boolean,
    default: false,
  },
  hasPassword: {
    type: Boolean,
    default: false,
  },
  // Admin access flag
  isAdmin: {
    type: Boolean,
    default: false,
  },
  // Counter for number of resumes uploaded via chat/resume feature
  resumeUploadCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Activity tracking
  lastLoginAt: {
    type: Date,
    default: null,
  },
  lastActiveAt: {
    type: Date,
    default: null,
  },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password') && user.password) {
    user.password = await bcrypt.hash(user.password, 8);
    user.hasPassword = true;
  }
  next();
});

// Method to verify password
userSchema.methods.verifyPassword = async function (password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

// Method to generate OTP
userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // OTP expires in 10 minutes
  };
  return otp;
};

// Method to verify OTP
userSchema.methods.verifyOTP = function (otp) {
  return (
    this.otp &&
    this.otp.code === otp &&
    this.otp.expiresAt > new Date()
  );
};

// Method to check if user can login
userSchema.methods.canLogin = function () {
  return this.isVerified && this.hasPassword;
};

// Clear OTP after verification
userSchema.methods.clearOTP = function () {
  this.otp = undefined;
};

const User = mongoose.model('User', userSchema);

export default User;
