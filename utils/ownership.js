const pool = require('../config/db');

async function getVeiculoOwnerId(veiculoId) {
  const [rows] = await pool.query(
    'SELECT proprietario_id FROM veiculos WHERE id=?',
    [veiculoId]
  );
  return rows[0]?.proprietario_id ?? null;
}

async function assertProprietarioDoVeiculoOrAdmin({ user, admin, veiculoId }) {
  const ownerId = await getVeiculoOwnerId(veiculoId);
  if (!ownerId) {
    const err = new Error('Veículo sem proprietário');
    err.status = 400;
    throw err;
  }
  if (admin) return;
  if (!user || user.role !== 'proprietario') {
    const err = new Error('Apenas proprietários');
    err.status = 403;
    throw err;
  }
  if (user.id !== ownerId) {
    const err = new Error('Você não é o proprietário deste veículo');
    err.status = 403;
    throw err;
  }
}

module.exports = { getVeiculoOwnerId, assertProprietarioDoVeiculoOrAdmin };
