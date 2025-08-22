const pool = require('../config/db');
const { buildContractSnapshot, generateContractHtml } = require('../utils/contractHtml');
const { assertProprietarioDoVeiculoOrAdmin } = require('../utils/ownership');

exports.criarSolicitacao = async (req, res) => {
  if (!req.user || req.user.role !== 'motorista') {
    return res.status(403).json({ error: 'Apenas motoristas' });
  }
  const { veiculo_id, data_inicio, data_fim } = req.body;
  if (!veiculo_id || !data_inicio || !data_fim) {
    return res.status(400).json({ error: 'Campos obrigatórios' });
  }
  if (new Date(data_inicio) > new Date(data_fim)) {
    return res.status(400).json({ error: 'data_inicio deve ser <= data_fim' });
  }
  try {
    const [vRows] = await pool.query(
      "SELECT status FROM veiculos WHERE id = ?",
      [veiculo_id]
    );
    if (vRows.length === 0 || vRows[0].status !== 'disponivel') {
      return res.status(400).json({ error: 'Veículo indisponível' });
    }
    const [result] = await pool.query(
      `INSERT INTO solicitacoes_aluguel (motorista_id, veiculo_id, data_inicio, data_fim, status)
       VALUES (?, ?, ?, ?, 'pendente')`,
      [req.user.id, veiculo_id, data_inicio, data_fim]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar solicitação', detalhes: err.message });
  }
};

exports.listarMinhasSolicitacoes = async (req, res) => {
  if (!req.user || req.user.role !== 'motorista') {
    return res.status(403).json({ error: 'Apenas motoristas' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT s.*, v.modelo, v.marca, v.placa
         FROM solicitacoes_aluguel s
         JOIN veiculos v ON v.id = s.veiculo_id
        WHERE s.motorista_id = ?
        ORDER BY s.id DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar solicitações', detalhes: err.message });
  }
};

exports.listarSolicitacoesRecebidas = async (req, res) => {
  if (!req.user || req.user.role !== 'proprietario') {
    return res.status(403).json({ error: 'Apenas proprietários' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT s.*, v.modelo, v.marca, v.placa
         FROM solicitacoes_aluguel s
         JOIN veiculos v ON v.id = s.veiculo_id
        WHERE v.proprietario_id = ?
        ORDER BY s.id DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar solicitações', detalhes: err.message });
  }
};

exports.recusarSolicitacao = async (req, res) => {
  const { id } = req.params;
  const { motivo_recusa } = req.body || {};
  try {
    const [[sol]] = await pool.query(
      'SELECT veiculo_id FROM solicitacoes_aluguel WHERE id = ?',
      [id]
    );
    if (!sol) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    await assertProprietarioDoVeiculoOrAdmin({
      user: req.user,
      admin: req.admin,
      veiculoId: sol.veiculo_id,
    });
    await pool.query(
      "UPDATE solicitacoes_aluguel SET status='recusado', motivo_recusa=?, updated_at=NOW() WHERE id=?",
      [motivo_recusa || null, id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

exports.aprovarSolicitacao = async (req, res) => {
  const { id } = req.params;
  const { valor_por_dia, forma_pagamento, local_retirada, local_devolucao } = req.body;
  if (!valor_por_dia || !forma_pagamento || !local_retirada || !local_devolucao) {
    return res.status(400).json({ error: 'Campos obrigatórios' });
  }
  let connection;
  try {
    const [[sol]] = await pool.query(
      'SELECT * FROM solicitacoes_aluguel WHERE id = ?',
      [id]
    );
    if (!sol) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    await assertProprietarioDoVeiculoOrAdmin({
      user: req.user,
      admin: req.admin,
      veiculoId: sol.veiculo_id,
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(
      "UPDATE solicitacoes_aluguel SET status='aprovado', updated_at=NOW() WHERE id=?",
      [id]
    );
    const [aluguelRes] = await connection.query(
      "INSERT INTO alugueis (motorista_id, veiculo_id, data_inicio, data_fim_prevista, status) VALUES (?, ?, ?, ?, 'aprovado')",
      [sol.motorista_id, sol.veiculo_id, sol.data_inicio, sol.data_fim]
    );
    const aluguelId = aluguelRes.insertId;
    const [[veiculo]] = await connection.query(
      'SELECT id, ano, marca, modelo, placa, renavam, proprietario_id FROM veiculos WHERE id=?',
      [sol.veiculo_id]
    );
    const [[prop]] = await connection.query(
      'SELECT nome, cpf_cnpj FROM proprietarios WHERE id=?',
      [veiculo.proprietario_id]
    );
    const [[mot]] = await connection.query(
      'SELECT nome, cpf, rg, endereco, nacionalidade, estado_civil, profissao FROM motoristas WHERE id=?',
      [sol.motorista_id]
    );
    const snapshot = buildContractSnapshot({
      solicitacao: sol,
      aluguel: { id: aluguelId },
      veiculo,
      proprietario: {
        nome: prop.nome,
        cpf: prop.cpf_cnpj,
        nacionalidade: '',
        estado_civil: '',
        profissao: '',
        rg: '',
        endereco: '',
      },
      motorista: mot,
      detalhes: { valor_por_dia, forma_pagamento, local_retirada, local_devolucao },
    });
    const html = generateContractHtml(snapshot);
    const [contratoRes] = await connection.query(
      'INSERT INTO contratos (aluguel_id, motorista_id, veiculo_id, status, dados_json, arquivo_html) VALUES (?, ?, ?, ?, ?, ?)',
      [aluguelId, sol.motorista_id, sol.veiculo_id, 'em_negociacao', JSON.stringify(snapshot), html]
    );
    await connection.commit();
    if (process.env.NODE_ENV !== 'test') {
      console.info('Proprietário aprovou solicitação; motorista deve revisar/assinar.');
    }
    return res.json({ contrato_id: contratoRes.insertId, aluguel_id: aluguelId });
  } catch (err) {
    if (connection) await connection.rollback();
    return res.status(err.status || 500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
};