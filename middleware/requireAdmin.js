import auth from './auth.js';

// Composes with auth; ensure auth runs before this or use it in route stack
const requireAdmin = (req, res, next) => {
  try {
    const user = req.user;
    if (!user || user.isAdmin !== true) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Admin access required' });
  }
};

export default requireAdmin;
