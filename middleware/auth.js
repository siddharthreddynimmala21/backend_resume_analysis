import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { verifyAccessToken } from './tokenAuth.js';

// Legacy auth middleware - kept for backward compatibility
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            throw new Error();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ _id: decoded.userId });

        if (!user) {
            throw new Error();
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        // If token is expired but there's a valid refresh token, try to refresh
        if (error.name === 'TokenExpiredError') {
            return verifyAccessToken(req, res, next);
        }
        res.status(401).json({ message: 'Please authenticate' });
    }
};

export default auth;
