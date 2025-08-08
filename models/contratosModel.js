const pool = require('../config/db');

/**
 * Modelo de acesso à tabela `contratos`.
 */
module.exports = {
  /**
   * Cria um novo contrato.
   * @param {object} contrato Dados do contrato.
   * @param {number} contrato.aluguel_id ID do aluguel relacionado.
   * @param {number} contrato.motorista_id ID do motorista.
   * @param {number} contrato.veiculo_id ID do veículo.
   * @param {string} [contrato.status] Status do contrato.
   * @param {string} [contrato.arquivo_html] Conteúdo HTML do contrato.
   * @param {Date}   [contrato.assinatura_data] Data da assinatura.
   * @param {string} [contrato.assinatura_ip] IP da assinatura.
   * @returns {Promise<number>} ID gerado para o contrato.
   */
  async criarContrato({
    aluguel_id,
    motorista_id,
    veiculo_id,
    status = 'aguardando_assinatura',
    arquivo_html,
    assinatura_data,
    assinatura_ip
  }) {
    const [result] = await pool.query(
      `INSERT INTO contratos (
         aluguel_id, motorista_id, veiculo_id,
         status, arquivo_html, assinatura_data, assinatura_ip
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        aluguel_id,
        motorista_id,
        veiculo_id,
        status,
        arquivo_html,
        assinatura_data,
        assinatura_ip
      ]
    );
    return result.insertId;
  },

  /**
   * Busca um contrato pelo ID.
   * @param {number} id Identificador do contrato.
   * @returns {Promise<object|undefined>} Registro encontrado ou undefined.
   */
  async buscarPorId(id) {
    const [rows] = await pool.query('SELECT * FROM contratos WHERE id = ?', [id]);
    return rows[0];
  },

  /**
   * Marca um contrato como assinado.
   * @param {number} id Identificador do contrato.
   * @param {string} ip IP de onde foi realizado o aceite.
   */
  async assinarContrato(id, ip) {
    const assinatura_data = new Date();
    await pool.query(
      'UPDATE contratos SET status = ?, assinatura_data = ?, assinatura_ip = ? WHERE id = ?',
      ['assinado', assinatura_data, ip, id]
    );
  },
  /**
  * Retorna todos os contratos cadastrados.
  * @returns {Promise<object[]>}
  */
  async listarContratos() {
    const [rows] = await pool.query('SELECT * FROM contratos');
    return rows;
  },
};