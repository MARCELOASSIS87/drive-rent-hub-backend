const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const token = authHeader.replace('Bearer ', '');

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token inválido' });

    req.user = decoded;
    req.admin = decoded;// Inclui os dados do admin autenticado na request
    next();
  });
}

module.exports = authMiddleware;
