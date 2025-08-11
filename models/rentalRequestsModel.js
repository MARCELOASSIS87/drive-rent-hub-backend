// drive-rent-hub-backend/models/rentalRequestsModel.js
const pool = require('../config/db');

module.exports = {
  /**
   * Insere uma nova solicitação no banco e retorna o registro completo.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async criarSolicitacao({
    motorista_id,
    veiculo_id,
    data_inicio,
    data_fim,
    endereco_retirada,
    endereco_devolucao,
    pagamentoDinheiro,
    nacionalidade,
    estado_civil,
    profissao,
    rg,
    endereco
  }) {
    const [result] = await pool.query(
      `INSERT INTO solicitacoes_aluguel
        (motorista_id, veiculo_id, data_inicio, data_fim,
         endereco_retirada, endereco_devolucao, pagamento_dinheiro, status,
         nacionalidade, estado_civil, profissao, rg, endereco)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        motorista_id,
        veiculo_id,
        data_inicio,
        data_fim,
        endereco_retirada,
        endereco_devolucao,
        pagamentoDinheiro ? 1 : 0,
        'pendente',
        nacionalidade,
        estado_civil,
        profissao,
        rg,
        endereco
      ]
    );
    return this.buscarPorId(result.insertId);
  },

  /**
   * Busca uma solicitação pelo ID.
   * @param {number} id
   * @returns {Promise<object>}
   */
  async buscarPorId(id) {
    const [rows] = await pool.query(
      `SELECT * FROM solicitacoes_aluguel WHERE id = ?`,
      [id]
    );
    return rows[0];
  },


  /**
   * Atualiza o status (e opcionalmente o motivo de recusa) de uma solicitação.
   * @param {number} id
   * @param {string} status
   * @param {string|null} motivo
   */
  async atualizarStatus(id, status, motivo = null) {
    const sql = motivo
      ? 'UPDATE solicitacoes_aluguel SET status = ?, motivo_recusa = ? WHERE id = ?'
      : 'UPDATE solicitacoes_aluguel SET status = ? WHERE id = ?';
    const params = motivo ? [status, motivo, id] : [status, id];
    await pool.query(sql, params);
  },

  /**
   * Lista solicitações, filtrando por status se passado.
   * @param {string} [status] — 'pendente', 'aprovado' ou 'recusado'
   * @returns {Promise<object[]>}
   */
  async listarSolicitacoes(status) {
    let sql = 'SELECT * FROM solicitacoes_aluguel';
    const params = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    const [rows] = await pool.query(sql, params);
    return rows;
  }
};
