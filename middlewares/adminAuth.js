const auth = require('./auth');

module.exports = function adminAuth(req, res, next) {
  auth(req, res, () => {
    const user = req.user;
    if (!user || !['comum', 'super'].includes(user.role)) {
      return res.status(403).json({ error: 'Apenas administradores' });
    }
    next();
  });
};