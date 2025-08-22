const pool = require('../config/db');
const { generateContractHtml } = require('../utils/contractHtml');
const { assertProprietarioDoVeiculoOrAdmin } = require('../utils/ownership');

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

async function canAccessContrato({ contrato, user, admin }) {
  if (admin) return true;
  if (!user) return false;
  if (user.role === 'motorista' && contrato.motorista_id === user.id) return true;
  if (user.role === 'proprietario') {
    try {
      await assertProprietarioDoVeiculoOrAdmin({ user, admin, veiculoId: contrato.veiculo_id });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

exports.obterContrato = async (req, res) => {
  const { id } = req.params;
  try {
    const [[contrato]] = await pool.query('SELECT * FROM contratos WHERE id=?', [id]);
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    const allowed = await canAccessContrato({ contrato, user: req.user, admin: req.admin });
    if (!allowed) return res.status(403).json({ error: 'Sem permissão' });
    return res.json(contrato);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar contrato', detalhes: err.message });
  }
};

exports.atualizarContrato = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    const [[contrato]] = await pool.query('SELECT * FROM contratos WHERE id=?', [id]);
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    await assertProprietarioDoVeiculoOrAdmin({ user: req.user, admin: req.admin, veiculoId: contrato.veiculo_id });
    const current = contrato.dados_json ? JSON.parse(contrato.dados_json) : {};
    const merged = deepMerge(current, req.body || {});
    if (merged.aluguel && merged.pagamento) {
      const start = new Date(merged.aluguel.data_inicio);
      const end = new Date(merged.aluguel.data_fim);
      const dias = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      merged.aluguel.dias = dias;
      merged.aluguel.valor_total = dias * (merged.pagamento.valor_por_dia || 0);
    }
    const html = generateContractHtml(merged);
    connection = await pool.getConnection();
    await connection.query(
      'UPDATE contratos SET dados_json=?, arquivo_html=?, status=? WHERE id=?',
      [JSON.stringify(merged), html, 'em_negociacao', id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
};

exports.publicarContrato = async (req, res) => {
  const { id } = req.params;
  try {
    const [[contrato]] = await pool.query('SELECT * FROM contratos WHERE id=?', [id]);
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    await assertProprietarioDoVeiculoOrAdmin({ user: req.user, admin: req.admin, veiculoId: contrato.veiculo_id });
    if (contrato.status !== 'em_negociacao') {
      return res.status(409).json({ error: 'Status inválido' });
    }
    await pool.query('UPDATE contratos SET status=? WHERE id=?', ['pronto_para_assinatura', id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

exports.assinarContrato = async (req, res) => {
  const { id } = req.params;
  try {
    const [[contrato]] = await pool.query('SELECT * FROM contratos WHERE id=?', [id]);
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    if (!req.user || req.user.role !== 'motorista' || contrato.motorista_id !== req.user.id) {
      return res.status(403).json({ error: 'Apenas o motorista pode assinar' });
    }
    if (!['pronto_para_assinatura', 'em_negociacao'].includes(contrato.status)) {
      return res.status(409).json({ error: 'Status inválido' });
    }
    await pool.query(
      'UPDATE contratos SET status="assinado", assinatura_data=NOW(), assinatura_ip=? WHERE id=?',
      [req.ip, id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
