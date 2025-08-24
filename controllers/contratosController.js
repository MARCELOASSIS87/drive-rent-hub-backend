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
function toUTCDateOnly(d) {
  if (!d) return null;
  if (d instanceof Date) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const dt = new Date(d);
    if (!isNaN(dt)) return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  }
  return null;
}
function daysDiffInclusive(di, df) {
  const a = toUTCDateOnly(di), b = toUTCDateOnly(df);
  if (!a || !b) return null;
  const MS = 1000 * 60 * 60 * 24;
  const diff = Math.round((b - a) / MS);
  return diff > 0 ? diff : 1;
}
function toYMD(d) {
  const dt = toUTCDateOnly(d);
  if (!dt) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
async function canAccessContrato({ contrato, user, admin }) {
  // padroniza: admin é boolean
  const isAdmin = (admin === true) || (user?.role === 'admin');
  if (isAdmin) return true;
  if (!user) return false;

  // motorista: só o “dono” do contrato
  if (user.role === 'motorista') {
    return contrato.motorista_id === user.id;
  }

  // proprietário: só o dono do veículo do contrato
  if (user.role === 'proprietario') {
    try {
      await assertProprietarioDoVeiculoOrAdmin({
        user,
        admin: false,                // não trate proprietário como admin
        veiculoId: contrato.veiculo_id,
      });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
exports.listarMinhasContratos = async (req, res) => {
  if (!req.user || req.user.role !== 'motorista') {
    return res.status(403).json({ error: 'Apenas motoristas' });
  }
  try {
    let sql = `SELECT c.*, v.modelo, v.marca, v.placa
                 FROM contratos c
                 JOIN veiculos v ON v.id = c.veiculo_id
                WHERE c.motorista_id = ?`;
    if (req.query.unread === '1') {
      sql += ' AND c.visto_por_motorista = 0';
    }
    sql += ' ORDER BY c.id DESC';
    const [rows] = await pool.query(sql, [req.user.id]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar contratos', detalhes: err.message });
  }
};

exports.obterContrato = async (req, res) => {
  const { id } = req.params;
  try {
    const [[contrato]] = await pool.query('SELECT * FROM contratos WHERE id=?', [id]);
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    const allowed = await canAccessContrato({ contrato, user: req.user, admin: req.user?.role === 'admin' });
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
    `SELECT c.id, c.aluguel_id, c.motorista_id, c.veiculo_id, c.status, c.dados_json, v.proprietario_id
     FROM contratos c
     JOIN veiculos v ON v.id = c.veiculo_id
    WHERE c.id = ?`,
    [id]
  );


  if (!contratoRow) {
    return res.status(404).json({ error: 'Contrato não encontrado' });
  }
  // curto-circuito: só o dono do veículo (ou admin) pode editar
  // curto-circuito: só o dono do veículo (ou admin) pode editar
  const isAdmin = req.user?.role === 'admin';
  if (!isAdmin) {
    if (!req.user || req.user.role !== 'proprietario' || req.user.id !== contratoRow.proprietario_id) {
      return res.status(403).json({ error: 'Proibido' });
    }
  }
  // defesa em profundidade com o helper, passando admin como boolean
  try {
    await assertProprietarioDoVeiculoOrAdmin({
      user: req.user,
      admin: isAdmin,
      veiculoId: contratoRow.veiculo_id,
    });
  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message || 'Proibido' });
  }



  if (contratoRow.status !== 'em_negociacao') {
    return res.status(409).json({ error: 'Contrato não pode ser editado neste status' });
  }

  // 2.3) Interpretar payload (aceitar objeto OU string)
  const patch = coerceJsonObject(req.body?.dados_json ?? req.body);
  if (patch.__invalid_json__) {
    return res.status(400).json({ error: 'dados_json inválido' });
  }
  // DEBUG (testes): ver o que chegou no PUT
  if (process.env.NODE_ENV === 'test') {
    try {
      console.log('[PUT CONTRATO DEBUG] req.body =', JSON.stringify(req.body));
      console.log('[PUT CONTRATO DEBUG] patch     =', JSON.stringify(patch));
    } catch { }
  }

  // 2.4) Deep-merge no snapshot atual
  const atual = coerceJsonObject(contratoRow.dados_json);
  const atualizado = { ...atual };
  // >>> INÍCIO PATCH: normalizar locais vindos do body (root | aluguel | detalhes)
  const bodyLocalRetirada =
    (patch?.aluguel?.local_retirada ?? patch?.detalhes?.local_retirada ?? patch?.local_retirada);
  const bodyLocalDevolucao =
    (patch?.aluguel?.local_devolucao ?? patch?.detalhes?.local_devolucao ?? patch?.local_devolucao);

  if (bodyLocalRetirada != null || bodyLocalDevolucao != null) {
    atualizado.aluguel = { ...(atualizado.aluguel || {}) };
    atualizado.detalhes = { ...(atualizado.detalhes || {}) };

    if (bodyLocalRetirada != null) {
      const v = String(bodyLocalRetirada);
      atualizado.aluguel.local_retirada = v;
      atualizado.detalhes.local_retirada = v;
    }
    if (bodyLocalDevolucao != null) {
      const v = String(bodyLocalDevolucao);
      atualizado.aluguel.local_devolucao = v;
      atualizado.detalhes.local_devolucao = v;
    }
  }
  // >>> FIM PATCH

  if (patch.aluguel && typeof patch.aluguel === 'object') {
    // base: snapshot atual
    atualizado.aluguel = { ...(atualizado.aluguel || atual.aluguel || {}) };

    // locais
    if (patch.aluguel.local_retirada != null) {
      atualizado.aluguel.local_retirada = String(patch.aluguel.local_retirada);
    }
    if (patch.aluguel.local_devolucao != null) {
      atualizado.aluguel.local_devolucao = String(patch.aluguel.local_devolucao);
    }

    // ★ datas (o teste envia aluguel.data_fim como ISO: '2025-08-26T00:00:00.000Z')
    if (patch.aluguel.data_inicio != null) {
      const ymd = toYMD(patch.aluguel.data_inicio);
      if (ymd) atualizado.aluguel.data_inicio = ymd;
    }
    if (patch.aluguel.data_fim != null) {
      const ymd = toYMD(patch.aluguel.data_fim);
      if (ymd) atualizado.aluguel.data_fim = ymd;
    }
  }

  if (patch.pagamento && typeof patch.pagamento === 'object') {
    atualizado.pagamento = { ...(atual.pagamento || {}) };
    if (patch.pagamento.valor_por_dia != null) {
      atualizado.pagamento.valor_por_dia = Number(patch.pagamento.valor_por_dia);
    }
  }

  const diYMD = toYMD(atualizado?.aluguel?.data_inicio ?? atual?.detalhes?.data_inicio);
  const dfYMD = toYMD(atualizado?.aluguel?.data_fim ?? atual?.detalhes?.data_fim);
  const dias = daysDiffInclusive(diYMD, dfYMD);
  if (dias === null) {
    return res.status(422).json({ error: 'datas inválidas no contrato' });
  }

  atualizado.aluguel = { ...(atualizado.aluguel || {}), data_inicio: diYMD, data_fim: dfYMD, dias };

  const vpd = Number(
    (atualizado.pagamento && atualizado.pagamento.valor_por_dia) ??
    (atual.pagamento && atual.pagamento.valor_por_dia) ??
    (atual.detalhes && atual.detalhes.valor_por_dia)
  );
  if (!Number.isFinite(vpd) || vpd <= 0) {
    return res.status(422).json({ error: 'valor_por_dia inválido' });
  }

  atualizado.pagamento = { ...(atualizado.pagamento || {}), valor_por_dia: vpd, valor_total: dias * vpd }; atualizado.pagamento = { ...(atualizado.pagamento || {}), valor_por_dia: vpd, valor_total: dias * vpd };
  // espelhar também no aluguel, pois o teste espera dados.aluguel.valor_total
  atualizado.aluguel = { ...(atualizado.aluguel || {}), valor_total: dias * vpd };


  // === garantir proprietario/motorista no snapshot para o template não quebrar ===
  try {
    const [[prop]] = await pool.query(
      'SELECT id, nome, cpf_cnpj FROM proprietarios WHERE id=?',
      [contratoRow.proprietario_id]
    );
    const [[mot]] = await pool.query(
      'SELECT id, nome, cpf FROM motoristas WHERE id=?',
      [contratoRow.motorista_id]
    );

    const proprietarioSafe = {
      nome: (atualizado?.proprietario?.nome ?? prop?.nome ?? '').toString(),
      cpf: (atualizado?.proprietario?.cpf ?? prop?.cpf_cnpj ?? '').toString(),
    };
    const motoristaSafe = {
      nome: (atualizado?.motorista?.nome ?? mot?.nome ?? '').toString(),
      cpf: (atualizado?.motorista?.cpf ?? mot?.cpf ?? '').toString(),
    };

    atualizado.proprietario = { ...(atualizado.proprietario || {}), ...proprietarioSafe };
    atualizado.motorista = { ...(atualizado.motorista || {}), ...motoristaSafe };
  } catch (_) {
    // fallback mínimo se leitura falhar
    atualizado.proprietario = atualizado.proprietario || { nome: '', cpf: '' };
    atualizado.motorista = atualizado.motorista || { nome: '', cpf: '' };
  }

  // === gerar HTML com blindagem ===
  let html;
  try {
    if (typeof generateContractHtml === 'function') {
      html = generateContractHtml(atualizado);
    }
  } catch (e) {
    // opcional: console.warn('generateContractHtml falhou no PUT', e.message);
  }
  if (!html) {
    html = `<pre>${JSON.stringify(atualizado, null, 2)}</pre>`;
  }
  // DEBUG (testes): ver o que vamos salvar
  if (process.env.NODE_ENV === 'test') {
    try {
      console.log('[PUT CONTRATO DEBUG] vai salvar aluguel =', JSON.stringify(atualizado.aluguel));
    } catch { }
  }

  await pool.query(
    'UPDATE contratos SET dados_json=?, arquivo_html=? WHERE id=?',
    [JSON.stringify(atualizado), html, contratoRow.id]
  );

  // DEBUG (testes): ler de volta o que ficou salvo
  if (process.env.NODE_ENV === 'test') {
    try {
      const [[rowAfter]] = await pool.query('SELECT dados_json FROM contratos WHERE id=?', [contratoRow.id]);
      let dj = rowAfter?.dados_json;
      if (typeof dj === 'string') { try { dj = JSON.parse(dj); } catch { } }
      console.log('[PUT CONTRATO DEBUG] persistido aluguel =', JSON.stringify(dj?.aluguel));
    } catch (e) {
      console.log('[PUT CONTRATO DEBUG] erro lendo de volta:', e?.message);
    }
  }

  return res.status(200).json({ ok: true, contrato_id: contratoRow.id });
};

exports.publicarContrato = async (req, res) => {
  const { id } = req.params;
  const patch = req.body || {};

  // 1) Carregar contrato + proprietário do veículo (para autorização)
  const [[c]] = await pool.query(
    `SELECT c.id, c.aluguel_id, c.motorista_id, c.veiculo_id, c.status, c.dados_json, v.proprietario_id
       FROM contratos c
       JOIN veiculos v ON v.id = c.veiculo_id
      WHERE c.id=?`,
    [id]
  );
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });

  // 2) Autorização: admin boolean + dono do veículo
  const isAdmin = req.user?.role === 'admin';
  try {
    await assertProprietarioDoVeiculoOrAdmin({
      user: req.user,
      admin: isAdmin,
      veiculoId: c.veiculo_id,
    });
  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message || 'Proibido' });
  }

  // 3) Só publica se estiver em negociação
  if (c.status !== 'em_negociacao') {
    return res.status(409).json({ error: 'Contrato não pode ser publicado neste status' });
  }

  // 4) Coercer dados_json -> objeto
  const atual = (() => {
    if (!c.dados_json) return {};
    if (typeof c.dados_json === 'object') return { ...c.dados_json };
    try { return JSON.parse(c.dados_json); } catch { return {}; }
  })();
  const atualiza = { ...atual };
  // DEBUG INÍCIO – só em teste
  if (process.env.NODE_ENV === 'test') {
    try {
      console.log('[PUBLICAR DEBUG] req.body =', JSON.stringify(patch));
    } catch { }
  }

  // 0) NORMALIZAÇÃO DE LOCAIS DO BODY (todas as formas)
  // Aceita root, aluguel, detalhes, snake_case e camelCase
  const bodyLocalRetirada =
    (patch?.aluguel?.local_retirada ?? patch?.detalhes?.local_retirada ?? patch?.local_retirada) ??
    (patch?.aluguel?.localRetirada ?? patch?.detalhes?.localRetirada ?? patch?.localRetirada);

  const bodyLocalDevolucao =
    (patch?.aluguel?.local_devolucao ?? patch?.detalhes?.local_devolucao ?? patch?.local_devolucao) ??
    (patch?.aluguel?.localDevolucao ?? patch?.detalhes?.localDevolucao ?? patch?.localDevolucao);

  if (bodyLocalRetirada != null || bodyLocalDevolucao != null) {
    atualiza.aluguel = { ...(atual.aluguel || {}) };
    atualiza.detalhes = { ...(atual.detalhes || {}) };
    if (bodyLocalRetirada != null) {
      const v = String(bodyLocalRetirada);
      atualiza.aluguel.local_retirada = v;
      atualiza.detalhes.local_retirada = v;
    }
    if (bodyLocalDevolucao != null) {
      const v = String(bodyLocalDevolucao);
      atualiza.aluguel.local_devolucao = v;
      atualiza.detalhes.local_devolucao = v;
    }
  }

  // 5.0) Campos na RAIZ (ex.: { local_retirada: 'Ponto A', local_devolucao: 'Ponto B' })
  if (patch.local_retirada != null || patch.local_devolucao != null) {
    atualiza.aluguel = { ...(atual.aluguel || {}) };
    atualiza.detalhes = { ...(atual.detalhes || {}) };
    if (patch.local_retirada != null) {
      const v = String(patch.local_retirada);
      atualiza.aluguel.local_retirada = v;
      atualiza.detalhes.local_retirada = v;
    }
    if (patch.local_devolucao != null) {
      const v = String(patch.local_devolucao);
      atualiza.aluguel.local_devolucao = v;
      atualiza.detalhes.local_devolucao = v;
    }
  }

  // 5.1) Campos em patch.aluguel
  if (patch.aluguel && typeof patch.aluguel === 'object') {
    atualiza.aluguel = { ...(atualiza.aluguel || atual.aluguel || {}) };
    if (patch.aluguel.local_retirada != null) {
      const v = String(patch.aluguel.local_retirada);
      atualiza.aluguel.local_retirada = v;
    }
    if (patch.aluguel.local_devolucao != null) {
      const v = String(patch.aluguel.local_devolucao);
      atualiza.aluguel.local_devolucao = v;
    }
    // espelho em detalhes
    atualiza.detalhes = { ...(atualiza.detalhes || atual.detalhes || {}) };
    if (patch.aluguel.local_retirada != null) {
      atualiza.detalhes.local_retirada = String(patch.aluguel.local_retirada);
    }
    if (patch.aluguel.local_devolucao != null) {
      atualiza.detalhes.local_devolucao = String(patch.aluguel.local_devolucao);
    }
  }

  // 5.2) Campos em patch.detalhes
  if (patch.detalhes && typeof patch.detalhes === 'object') {
    atualiza.detalhes = { ...(atualiza.detalhes || atual.detalhes || {}) };
    if (patch.detalhes.local_retirada != null) {
      const v = String(patch.detalhes.local_retirada);
      atualiza.detalhes.local_retirada = v;
    }
    if (patch.detalhes.local_devolucao != null) {
      const v = String(patch.detalhes.local_devolucao);
      atualiza.detalhes.local_devolucao = v;
    }
    // espelho em aluguel
    atualiza.aluguel = { ...(atualiza.aluguel || atual.aluguel || {}) };
    if (patch.detalhes.local_retirada != null) {
      atualiza.aluguel.local_retirada = String(patch.detalhes.local_retirada);
    }
    if (patch.detalhes.local_devolucao != null) {
      atualiza.aluguel.local_devolucao = String(patch.detalhes.local_devolucao);
    }
  }

  // 6) Aceitar pagamento.valor_por_dia (opcional no publish)
  if (patch.pagamento && typeof patch.pagamento === 'object') {
    atualiza.pagamento = { ...(atualiza.pagamento || atual.pagamento || {}) };
    if (patch.pagamento.valor_por_dia != null) {
      const v = Number(patch.pagamento.valor_por_dia);
      if (Number.isFinite(v) && v > 0) {
        atualiza.pagamento.valor_por_dia = v;
      }
    }
  }

  // 7) Recalcular dias e valor_total (sem alterar datas)
  const toYMD = (d) => {
    if (!d) return null;
    if (d instanceof Date) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const da = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    }
    return String(d).slice(0, 10);
  };
  const daysDiffInclusive = (di, df) => {
    try {
      const a = new Date(`${toYMD(di)}T00:00:00Z`);
      const b = new Date(`${toYMD(df)}T00:00:00Z`);
      const MS = 1000 * 60 * 60 * 24;
      const d = Math.round((b - a) / MS);
      return d > 0 ? d : 1;
    } catch { return 1; }
  };

  const diYMD = toYMD(atualiza.aluguel?.data_inicio ?? atual.aluguel?.data_inicio);
  const dfYMD = toYMD(atualiza.aluguel?.data_fim ?? atual.aluguel?.data_fim);
  if (!diYMD || !dfYMD) {
    return res.status(422).json({ error: 'datas ausentes no contrato' });
  }
  const dias = daysDiffInclusive(diYMD, dfYMD);
  atualiza.aluguel = { ...(atualiza.aluguel || {}), data_inicio: diYMD, data_fim: dfYMD, dias };

  const vpd = Number(atualiza.pagamento?.valor_por_dia ?? atual.pagamento?.valor_por_dia);
  if (!Number.isFinite(vpd) || vpd <= 0) {
    return res.status(422).json({ error: 'valor_por_dia inválido' });
  }
  atualiza.pagamento = { ...(atualiza.pagamento || {}), valor_por_dia: vpd, valor_total: dias * vpd };

  // 8) Reforço final: se body trouxe locais, garanta no aluguel.*
  if (patch.local_retirada != null) {
    atualiza.aluguel.local_retirada = String(patch.local_retirada);
  }
  if (patch.local_devolucao != null) {
    atualiza.aluguel.local_devolucao = String(patch.local_devolucao);
  }
  if (patch.aluguel?.local_retirada != null) {
    atualiza.aluguel.local_retirada = String(patch.aluguel.local_retirada);
  }
  if (patch.aluguel?.local_devolucao != null) {
    atualiza.aluguel.local_devolucao = String(patch.aluguel.local_devolucao);
  }
  if (patch.detalhes?.local_retirada != null) {
    atualiza.aluguel.local_retirada = String(patch.detalhes.local_retirada);
  }
  if (patch.detalhes?.local_devolucao != null) {
    atualiza.aluguel.local_devolucao = String(patch.detalhes.local_devolucao);
  }
  // DEBUG ANTES DE SALVAR – só em teste
  if (process.env.NODE_ENV === 'test') {
    try {
      console.log('[PUBLICAR DEBUG] vai salvar aluguel =', JSON.stringify(atualiza.aluguel));
    } catch { }
  }

  // 9) Persistir publicação
  await pool.query(
    `UPDATE contratos
        SET dados_json = ?, status = 'pronto_para_assinatura'
      WHERE id = ?`,
    [JSON.stringify(atualiza), id]
  );
  await pool.query(
    `UPDATE contratos
        SET visto_por_motorista = 0,
            visto_por_proprietario = 1
      WHERE id = ?`,
    [id]
  );
  // DEBUG APÓS SALVAR – ler de volta
  if (process.env.NODE_ENV === 'test') {
    try {
      const [[row]] = await pool.query('SELECT dados_json FROM contratos WHERE id=?', [id]);
      let dj = row?.dados_json;
      if (typeof dj === 'string') { try { dj = JSON.parse(dj); } catch { } }
      console.log('[PUBLICAR DEBUG] persistido aluguel =', JSON.stringify(dj?.aluguel));
    } catch (e) {
      console.log('[PUBLICAR DEBUG] erro lendo de volta:', e?.message);
    }
  }

  return res.json({ ok: true, contrato_id: Number(id) });
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
    await pool.query(
      `UPDATE contratos
          SET visto_por_proprietario = 0,
              visto_por_motorista = 1
        WHERE id = ?`,
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
exports.markContratoReadForMotorista = async (req, res) => {
  const { id } = req.params;
  if (!req.user || req.user.role !== 'motorista') {
    return res.status(403).json({ error: 'Apenas motoristas' });
  }
  try {
    const [[contrato]] = await pool.query(
      'SELECT motorista_id FROM contratos WHERE id = ?',
      [id]
    );
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    if (contrato.motorista_id !== req.user.id) {
      return res.status(403).json({ error: 'Proibido' });
    }
    await pool.query('UPDATE contratos SET visto_por_motorista = 1 WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};

exports.markContratoReadForProprietario = async (req, res) => {
  const { id } = req.params;
  if (!req.user || req.user.role !== 'proprietario') {
    return res.status(403).json({ error: 'Apenas proprietários' });
  }
  try {
    const [[row]] = await pool.query(
      `SELECT v.proprietario_id
         FROM contratos c
         JOIN veiculos v ON v.id = c.veiculo_id
        WHERE c.id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Contrato não encontrado' });
    if (row.proprietario_id !== req.user.id) {
      return res.status(403).json({ error: 'Proibido' });
    }
    await pool.query('UPDATE contratos SET visto_por_proprietario = 1 WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};