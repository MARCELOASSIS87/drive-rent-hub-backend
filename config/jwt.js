require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'segredo_super_secreto_trocar_em_producao';

module.exports = { JWT_SECRET };