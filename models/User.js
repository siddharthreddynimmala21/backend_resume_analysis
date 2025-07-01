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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  refreshTokens: [{
    token: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
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

// Add a refresh token to the user
userSchema.methods.addRefreshToken = function (token, expiresIn) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresIn); // expiresIn is in days
  
  this.refreshTokens.push({
    token,
    expiresAt
  });
  
  // Clean up expired tokens while we're at it
  this.refreshTokens = this.refreshTokens.filter(t => t.expiresAt > new Date());
  
  return expiresAt;
};

// Remove a specific refresh token
userSchema.methods.removeRefreshToken = function (token) {
  this.refreshTokens = this.refreshTokens.filter(t => t.token !== token);
};

// Check if a refresh token exists and is valid
userSchema.methods.findRefreshToken = function (token) {
  return this.refreshTokens.find(t => t.token === token && t.expiresAt > new Date());
};

// Remove all refresh tokens (logout from all devices)
userSchema.methods.removeAllRefreshTokens = function () {
  this.refreshTokens = [];
};

const User = mongoose.model('User', userSchema);

export default User;
