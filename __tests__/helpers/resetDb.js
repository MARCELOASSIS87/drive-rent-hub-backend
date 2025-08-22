// __tests__/helpers/resetDb.js
const pool = require('../../config/db');

// Ordem: SEMPRE truncar filhos → pais (respeitar FKs)
const TABLES_IN_TRUNCATE_ORDER = [
  'contrato_revisoes',     // FK -> contratos
  'contratos',             // FK -> solicitacoes_aluguel, motoristas, veiculos
  'avaliacoes',            // FK -> alugueis, motoristas, veiculos
  'solicitacoes_aluguel',  // FK -> motoristas, veiculos
  'alugueis',              // FK -> motoristas, veiculos
  'veiculos',              // FK -> proprietarios
  'motoristas',
  'proprietarios',
  'admins'
];

async function resetAll() {
  await pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const table of TABLES_IN_TRUNCATE_ORDER) {
    try {
      await pool.query(`TRUNCATE TABLE \`${table}\``);
    } catch (e) {
      // Em testes, se a tabela não existir, ignore
      if (e && e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  }
  await pool.query('SET FOREIGN_KEY_CHECKS=1');
}

module.exports = { resetAll, TABLES_IN_TRUNCATE_ORDER };