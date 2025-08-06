const pool = require('../config/db');

exports.criarSolicitacao = async (req, res) => {
  const { veiculo_id, data_inicio, data_fim } = req.body;
  const motorista_id = req.user?.id;

  if (!motorista_id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO solicitacoes_aluguel (motorista_id, veiculo_id, data_inicio, data_fim, status)
       VALUES (?, ?, ?, ?, 'pendente')`,
      [motorista_id, veiculo_id, data_inicio, data_fim]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar solicitação', detalhes: err.message });
  }
};

exports.listarSolicitacoes = async (req, res) => {
  if (!req.user || !['comum', 'super'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT s.*, 
              m.nome    AS motorista_nome, 
              m.email   AS motorista_email,
              v.marca, v.modelo, v.placa
         FROM solicitacoes_aluguel s
         JOIN motoristas m ON s.motorista_id = m.id
         JOIN veiculos   v ON s.veiculo_id   = v.id`
    );

    // Mapeia para aninhar veiculo e remover campos achatados
    const formatted = rows.map(({ marca, modelo, placa, ...rest }) => ({
      ...rest,
      motorista: {
        id: rest.motorista_id,
        nome: rest.motorista_nome,
        email: rest.motorista_email
      },
      veiculo: { marca, modelo, placa }
    }));

    return res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar solicitações', detalhes: err.message });
  }
};

exports.listarMinhasSolicitacoes = async (req, res) => {
  const motorista_id = req.user?.id;
  if (!motorista_id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT s.*, v.marca, v.modelo, v.placa
         FROM solicitacoes_aluguel s
         JOIN veiculos v ON s.veiculo_id = v.id
        WHERE s.motorista_id = ?`,
      [motorista_id]
    );
    // Mantém marca/modelo/placa no root e adiciona veiculo aninhado
    const formatted = rows.map(r => ({
      ...r,
      veiculo: { marca: r.marca, modelo: r.modelo, placa: r.placa }
    }));
    return res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar solicitações', detalhes: err.message });
  }
};

exports.atualizarStatus = async (req, res) => {
  const { id } = req.params;
  const { status, motivo } = req.body;

  if (!req.user || !['comum', 'super'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  if (!['pendente', 'aprovado', 'recusado'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  try {
    await pool.query(
      'UPDATE solicitacoes_aluguel SET status = ?, motivo_recusa = ? WHERE id = ?',
      [status, motivo || null, id]
    );
    res.json({ message: 'Status atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status', detalhes: err.message });
  }
};