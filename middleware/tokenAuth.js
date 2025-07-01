import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Constants for token configuration
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7; // 7 days

// Generate access token
export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

// Generate refresh token
export const generateRefreshToken = async (user) => {
  const refreshToken = jwt.sign(
    { userId: user._id, tokenVersion: Date.now() },
    process.env.JWT_SECRET
  );

  // Store refresh token in user document
  const expiresAt = user.addRefreshToken(refreshToken, REFRESH_TOKEN_EXPIRY);
  await user.save();

  return { refreshToken, expiresAt };
};

// Middleware to verify access token
export const verifyAccessToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      throw new Error('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded.userId });

    if (!user) {
      throw new Error('User not found');
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    // If token is expired but there's a valid refresh token, try to refresh
    if (error.name === 'TokenExpiredError') {
      return tryRefreshToken(req, res, next);
    }
    
    res.status(401).json({ message: 'Please authenticate', error: error.message });
  }
};

// Try to refresh the access token using refresh token
const tryRefreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.signedCookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Check if the refresh token exists in the user's refreshTokens array
    const tokenExists = user.findRefreshToken(refreshToken);
    if (!tokenExists) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate a new access token
    const newAccessToken = generateAccessToken(user._id);

    // Set the new access token in the response header
    res.setHeader('x-new-access-token', newAccessToken);

    // Attach user to request and continue
    req.user = user;
    req.token = newAccessToken;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Please authenticate', error: error.message });
  }
};

// Middleware to handle refresh token
export const handleRefreshToken = async (req, res) => {
  try {
    const refreshToken = req.signedCookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token' });
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Check if the refresh token exists in the user's refreshTokens array
    const tokenExists = user.findRefreshToken(refreshToken);
    if (!tokenExists) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate a new access token
    const accessToken = generateAccessToken(user._id);

    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token', error: error.message });
  }
};

// Set refresh token in HTTP-only cookie
export const setRefreshTokenCookie = (res, refreshToken, expiresAt) => {
  // Calculate max age in milliseconds
  const maxAge = expiresAt.getTime() - Date.now();
  
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use secure in production
    signed: true,
    maxAge,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Use 'none' in production for cross-site requests
    path: '/api/auth/refresh-token' // Restrict cookie to refresh token endpoint
  });
};

// Clear refresh token cookie
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Use 'none' in production for cross-site requests
    path: '/api/auth/refresh-token'
  });
};