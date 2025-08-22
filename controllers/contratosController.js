const pool = require('../config/db');
const { generateContractHtml } = require('../utils/contractHtml');
const { assertProprietarioDoVeiculoOrAdmin } = require('../utils/ownership');

// === helpers: JSON + deep merge + whitelist de patch ===
function coerceJsonObject(input) {
  if (input == null) return {};
  if (typeof input === 'string') {
    try { return JSON.parse(input); }
    catch { return { __invalid_json__: true, __raw__: input }; }
  }
  if (typeof input === 'object') return input;
  return {};
}

function deepMerge(target, ...sources) {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        target[k] = deepMerge(target[k] || {}, v);
      } else {
        target[k] = v;
      }
    }
  }
  return target;
}
// Aceita apenas chaves permitidas no PATCH do contrato
function pickPatch(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  if (p.pagamento && typeof p.pagamento === 'object') {
    out.pagamento = {};
    if (p.pagamento.valor_por_dia != null) {
      out.pagamento.valor_por_dia = Number(p.pagamento.valor_por_dia);
    }
  }
  // (se no futuro permitir mais campos, adicione aqui com whitelist)
  return out;
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
  // dentro do handler PUT /contratos/:id
  const { id } = req.params;

  // 1) Carregar contrato + veículo para autorização
  const [[contratoRow]] = await pool.query(
    `SELECT c.id, c.veiculo_id, c.status, c.dados_json, v.proprietario_id
       FROM contratos c
       JOIN veiculos v ON v.id = c.veiculo_id
      WHERE c.id = ?`,
    [id]
  );
  if (!contratoRow) {
    return res.status(404).json({ error: 'Contrato não encontrado' });
  }

  // 2) Autorização primeiro (evita 500 quando deveria ser 403)
  await assertProprietarioDoVeiculoOrAdmin({
    user: req.user,
    admin: req.admin,
    veiculoId: contratoRow.veiculo_id,
  });

  // 3) Interpretar payload: aceitar string JSON ou objeto
  const patch = coerceJsonObject(req.body?.dados_json ?? req.body);
  if (patch.__invalid_json__) {
    return res.status(400).json({ error: 'dados_json inválido' });
  }

  // 4) Deep-merge no snapshot atual (dados_json salvo)
  const atual = coerceJsonObject(contratoRow.dados_json);
  const atualizado = deepMerge({}, atual, pickPatch(patch));

  // 5) Recalcular dias e valor_total
  // datas de referência: use as que já estão no snapshot
  const dataInicio = new Date(atualizado?.detalhes?.data_inicio || atual?.detalhes?.data_inicio);
  const dataFim = new Date(atualizado?.detalhes?.data_fim || atual?.detalhes?.data_fim);
  const msDia = 1000 * 60 * 60 * 24;
  let dias = Math.ceil((dataFim - dataInicio) / msDia);
  if (!Number.isFinite(dias) || dias <= 0) dias = 1;

  // valor_por_dia pode vir em patch.pagamento.valor_por_dia (número ou string)
  const valorPorDia = Number(
    patch?.pagamento?.valor_por_dia ??
    atualizado?.pagamento?.valor_por_dia ??
    atualizado?.detalhes?.valor_por_dia
  );
  if (!Number.isFinite(valorPorDia) || valorPorDia <= 0) {
    return res.status(422).json({ error: 'valor_por_dia inválido' });
  }

  atualizado.pagamento = {
    ...(atualizado.pagamento || {}),
    valor_por_dia: valorPorDia,
    dias,
    valor_total: dias * valorPorDia
  };

  // 6) Regerar HTML a partir do snapshot atualizado
  const html = (typeof generateContractHtml === 'function')
    ? generateContractHtml(atualizado)
    : `<pre>${JSON.stringify(atualizado, null, 2)}</pre>`;

  // 7) Persistir atualização
  await pool.query(
    'UPDATE contratos SET dados_json=?, arquivo_html=? WHERE id=?',
    [JSON.stringify(atualizado), html, contratoRow.id]
  );

  // 8) Retorno
  return res.status(200).json({ ok: true, contrato_id: contratoRow.id });
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
