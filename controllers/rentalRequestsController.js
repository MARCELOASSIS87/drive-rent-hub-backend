const pool = require('../config/db');
const { buildContractSnapshot, generateContractHtml } = require('../utils/contractHtml');
const { assertProprietarioDoVeiculoOrAdmin } = require('../utils/ownership');

function coerceJsonObject(input) {
  if (input == null) return {};
  if (typeof input === 'string') {
    try { return JSON.parse(input); }
    catch { return { __invalid_json__: true, __raw__: input }; }
  }
  if (typeof input === 'object') return input;
  return {};
}

// normaliza para Date (dia em UTC)
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
// diferença inclusiva em dias (min 1)
function daysDiffInclusive(di, df) {
  const a = toUTCDateOnly(di), b = toUTCDateOnly(df);
  if (!a || !b) return null;
  const MS = 1000 * 60 * 60 * 24;
  const diff = Math.round((b - a) / MS);
  return diff > 0 ? diff : 1;
}
// serializa como 'YYYY-MM-DD' (usando UTC)
function toYMD(d) {
  const dt = toUTCDateOnly(d);
  if (!dt) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}


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
    await pool.query(
      'UPDATE solicitacoes_aluguel SET visto_por_proprietario = 0 WHERE id = ?',
      [result.insertId]
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
    const unread = req.query.unread === '1';
    let sql = `SELECT s.*, v.modelo, v.marca, v.placa
         FROM solicitacoes_aluguel s
         JOIN veiculos v ON v.id = s.veiculo_id
        WHERE s.motorista_id = ?`;
    const params = [req.user.id];
    if (unread) sql += ' AND s.visto_por_motorista = 0';
    sql += ' ORDER BY s.id DESC';
    const [rows] = await pool.query(sql, params);
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
    const unread = req.query.unread === '1';
    let sql = `SELECT s.*, v.modelo, v.marca, v.placa
         FROM solicitacoes_aluguel s
         JOIN veiculos v ON v.id = s.veiculo_id
        WHERE v.proprietario_id = ?`;
    const params = [req.user.id];
    if (unread) sql += ' AND s.visto_por_proprietario = 0';
    sql += ' ORDER BY s.id DESC';
    const [rows] = await pool.query(sql, params);
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
      "UPDATE solicitacoes_aluguel SET status='recusado', motivo_recusa=?, visto_por_motorista=0, visto_por_proprietario=1, updated_at=NOW() WHERE id=?",
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
  const valorDiaNum = Number(valor_por_dia);
  if (!Number.isFinite(valorDiaNum) || valorDiaNum <= 0) {
    return res.status(422).json({ error: 'valor_por_dia inválido' });
  }
  let connection;
  try {
    // 1) Busca a solicitação e valida ownership
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
    const diQuery = toYMD(sol.data_inicio);
    const dfQuery = toYMD(sol.data_fim);
    const diasCheck = daysDiffInclusive(diQuery, dfQuery);
    if (diasCheck === null) {
      return res.status(422).json({ error: 'datas inválidas', data_inicio: sol.data_inicio, data_fim: sol.data_fim });
    }
    const [[conf]] = await pool.query(
      `SELECT COUNT(*) AS n
         FROM alugueis a
        WHERE a.veiculo_id = ?
          AND a.status IN ('aprovado','pronto_para_assinatura','assinado','em_andamento')
          AND NOT (a.data_fim_prevista < ? OR a.data_inicio > ?)` ,
      [sol.veiculo_id, diQuery, dfQuery]
    );
    if (conf.n > 0) {
      return res.status(409).json({ error: 'Conflito de agenda para o veículo no período solicitado' });
    }
    // 2) Transação
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.query(
      "UPDATE solicitacoes_aluguel SET status='aprovado', visto_por_motorista=0, visto_por_proprietario=1, updated_at=NOW() WHERE id=?",
      [id]
    );

    const [aluguelRes] = await connection.query(
      "INSERT INTO alugueis (motorista_id, veiculo_id, data_inicio, data_fim_prevista, status) VALUES (?, ?, ?, ?, 'aprovado')",
      [sol.motorista_id, sol.veiculo_id, sol.data_inicio, sol.data_fim]
    );
    const aluguelId = aluguelRes.insertId;

    // ********************************************
    // 3) Leituras base (usando a mesma conexão)
    // ********************************************
    const q = (connection || pool).query.bind(connection || pool);

    const [[veiculo]] = await q(
      'SELECT id, ano, marca, modelo, placa, proprietario_id FROM veiculos WHERE id=?',
      [sol.veiculo_id]
    );

    const [[prop]] = await q(
      'SELECT id, nome, cpf_cnpj FROM proprietarios WHERE id=?',
      [veiculo.proprietario_id]
    );



    const [[mot]] = await q(
      'SELECT id, nome, cpf FROM motoristas WHERE id=?',
      [sol.motorista_id]
    );

    // ********************************************
    // 4) UPSERT + validação dura (422) — MOTORISTA
    // ********************************************
    const MOTORISTA_LEGAL_FIELDS = [
      'rg', 'orgao_expeditor', 'uf_rg', 'nacionalidade', 'estado_civil', 'profissao',
      'endereco_logradouro', 'endereco_numero', 'endereco_bairro',
      'endereco_cidade', 'endereco_uf', 'endereco_cep'
    ];

    // aceita dados em req.body.dados_legais (ou req.body.detalhes por compat)
    const legalFromBody = (req.body && (req.body.dados_legais || req.body.detalhes)) || {};
    const toLegal = {};
    for (const k of MOTORISTA_LEGAL_FIELDS) {
      if (legalFromBody[k] != null && String(legalFromBody[k]).trim() !== '') {
        toLegal[k] = String(legalFromBody[k]);
      }
    }
    if (Object.keys(toLegal).length) {
      await q(
        `INSERT INTO motoristas_legal (motorista_id, ${Object.keys(toLegal).join(',')})
         VALUES (?, ${Object.keys(toLegal).map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${Object.keys(toLegal).map(k => `${k}=VALUES(${k})`).join(', ')}, updated_at=CURRENT_TIMESTAMP`,
        [sol.motorista_id, ...Object.values(toLegal)]
      );
    }

    const [[legalMot]] = await q(
      `SELECT rg, orgao_expeditor, uf_rg, nacionalidade, estado_civil, profissao,
              endereco_logradouro, endereco_numero, endereco_bairro,
              endereco_cidade, endereco_uf, endereco_cep
         FROM motoristas_legal
        WHERE motorista_id=?`,
      [sol.motorista_id]
    );

    const REQUIRED_MOT_LEGAL = MOTORISTA_LEGAL_FIELDS;
    const missingMot = REQUIRED_MOT_LEGAL.filter((k) => {
      const v = legalMot?.[k];
      return v == null || String(v).trim() === '';
    });
    if (missingMot.length) {
      await connection.rollback();
      return res.status(422).json({
        error: 'Dados legais do motorista incompletos para geração do contrato',
        missing_fields: missingMot
      });
    }

    // ***************************************
    // 5) UPSERT + validação dura (422) — PROPRIETÁRIO
    // ***************************************
    const PROPRIETARIO_LEGAL_FIELDS = [
      'rg', 'orgao_expeditor', 'uf_rg', 'nacionalidade', 'estado_civil', 'profissao',
      'endereco_logradouro', 'endereco_numero', 'endereco_bairro',
      'endereco_cidade', 'endereco_uf', 'endereco_cep'
    ];

    // aceita em req.body.dados_legais_proprietario (ou proprietario_dados_legais)
    const propLegalFromBody = (req.body && (req.body.dados_legais_proprietario || req.body.proprietario_dados_legais)) || {};
    const toPropLegal = {};
    for (const k of PROPRIETARIO_LEGAL_FIELDS) {
      if (propLegalFromBody[k] != null && String(propLegalFromBody[k]).trim() !== '') {
        toPropLegal[k] = String(propLegalFromBody[k]);
      }
    }
    if (Object.keys(toPropLegal).length) {
      await q(
        `INSERT INTO proprietarios_legal (proprietario_id, ${Object.keys(toPropLegal).join(',')})
         VALUES (?, ${Object.keys(toPropLegal).map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${Object.keys(toPropLegal).map(k => `${k}=VALUES(${k})`).join(', ')}, updated_at=CURRENT_TIMESTAMP`,
        [prop.id, ...Object.values(toPropLegal)]
      );
    }

    const [[propLegal]] = await q(
      `SELECT rg, orgao_expeditor, uf_rg, nacionalidade, estado_civil, profissao,
              endereco_logradouro, endereco_numero, endereco_bairro,
              endereco_cidade, endereco_uf, endereco_cep
         FROM proprietarios_legal
        WHERE proprietario_id=?`,
      [prop.id]
    );

    const REQUIRED_PROP_LEGAL = PROPRIETARIO_LEGAL_FIELDS;
    const missingProp = REQUIRED_PROP_LEGAL.filter((k) => {
      const v = propLegal?.[k];
      return v == null || String(v).trim() === '';
    });
    if (missingProp.length) {
      await connection.rollback();
      return res.status(422).json({
        error: 'Dados legais do proprietario incompletos para geração do contrato',
        missing_fields: missingProp
      });
    }

    // 6) Monta snapshot/HTML + inserção do contrato (robusto)
    const diYMD = toYMD(sol.data_inicio);
    const dfYMD = toYMD(sol.data_fim);
    const dias = daysDiffInclusive(diYMD, dfYMD);
    if (dias === null) {
      await connection.rollback();
      return res.status(422).json({
        error: 'datas inválidas',
        data_inicio: sol.data_inicio,
        data_fim: sol.data_fim
      });
    }

    const vpd = Number(valor_por_dia);
    if (!Number.isFinite(vpd) || vpd <= 0) {
      await connection.rollback();
      return res.status(422).json({ error: 'valor_por_dia inválido' });
    }

    // objetos “safe” para nunca quebrar template (sempre strings)
    const proprietario = {
      nome: (prop?.nome ?? '').toString(),
      cpf: (prop?.cpf_cnpj ?? '').toString(),
      rg: (propLegal?.rg ?? '').toString(),
      orgao_expeditor: (propLegal?.orgao_expeditor ?? '').toString(),
      uf_rg: (propLegal?.uf_rg ?? '').toString(),
      nacionalidade: (propLegal?.nacionalidade ?? '').toString(),
      estado_civil: (propLegal?.estado_civil ?? '').toString(),
      profissao: (propLegal?.profissao ?? '').toString(),
      endereco: [
        propLegal?.endereco_logradouro,
        propLegal?.endereco_numero,
        propLegal?.endereco_bairro,
        (propLegal?.endereco_cidade && propLegal?.endereco_uf)
          ? `${propLegal.endereco_cidade}-${propLegal.endereco_uf}`
          : (propLegal?.endereco_cidade || propLegal?.endereco_uf),
        propLegal?.endereco_cep,
      ].filter(Boolean).join(', ')
    };

    const motorista = {
      nome: (mot?.nome ?? '').toString(),
      cpf: (mot?.cpf ?? '').toString(),
      rg: (legalMot?.rg ?? '').toString(),
      orgao_expeditor: (legalMot?.orgao_expeditor ?? '').toString(),
      uf_rg: (legalMot?.uf_rg ?? '').toString(),
      nacionalidade: (legalMot?.nacionalidade ?? '').toString(),
      estado_civil: (legalMot?.estado_civil ?? '').toString(),
      profissao: (legalMot?.profissao ?? '').toString(),
      endereco: [
        legalMot?.endereco_logradouro,
        legalMot?.endereco_numero,
        legalMot?.endereco_bairro,
        (legalMot?.endereco_cidade && legalMot?.endereco_uf)
          ? `${legalMot.endereco_cidade}-${legalMot.endereco_uf}`
          : (legalMot?.endereco_cidade || legalMot?.endereco_uf),
        legalMot?.endereco_cep,
      ].filter(Boolean).join(', ')
    };

    const aluguelSnap = {
      id: aluguelId,
      data_inicio: diYMD,
      data_fim: dfYMD,
      dias,
      local_retirada: String(local_retirada),
      local_devolucao: String(local_devolucao),
    };

    const pagamentoSnap = {
      valor_por_dia: vpd,
      valor_total: dias * vpd,
    };

    let snapshot;
    try {
      if (typeof buildContractSnapshot === 'function') {
        snapshot = buildContractSnapshot({
          solicitacao: sol,
          aluguel: aluguelSnap,
          veiculo,
          proprietario,
          motorista,
          pagamento: pagamentoSnap
        });
      }
    } catch (e) {
      // opcional: console.warn('buildContractSnapshot falhou:', e.message);
    }
    if (!snapshot) {
      snapshot = {
        solicitacao: sol,
        aluguel: aluguelSnap,
        veiculo,
        proprietario,
        motorista,
        pagamento: pagamentoSnap,
        gerado_em: new Date().toISOString()
      };
    }

    // Blindagem do HTML: se o template quebrar, cai no fallback
    let html;
    try {
      if (typeof generateContractHtml === 'function') {
        html = generateContractHtml(snapshot);
      }
    } catch (e) {
      // opcional: console.warn('generateContractHtml falhou:', e.message);
    }
    if (!html) {
      html = `<pre>${JSON.stringify(snapshot, null, 2)}</pre>`;
    }


    const [contratoRes] = await q(
      `INSERT INTO contratos (aluguel_id, motorista_id, veiculo_id, status, dados_json, arquivo_html)
         VALUES (?, ?, ?, 'em_negociacao', ?, ?)`,
      [aluguelId, sol.motorista_id, sol.veiculo_id, JSON.stringify(snapshot), html]
    );

    const contratoId = contratoRes.insertId;

    // ********************************************
    // 10) Commit + retorno
    // ********************************************
    await connection.commit();
    if (process.env.NODE_ENV !== 'test') {
      console.info('Proprietário aprovou solicitação; motorista deve revisar/assinar.');
    }
    return res.status(201).json({
      message: 'Solicitação aprovada e contrato gerado',
      aluguel_id: aluguelId,
      contrato_id: contratoId
    });

  } catch (err) {
    if (connection) await connection.rollback();
    return res.status(err.status || 500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
};
exports.markSolicitacaoReadForProprietario = async (req, res) => {
  if (!req.user || req.user.role !== 'proprietario') {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const { id } = req.params;
  try {
    const [[row]] = await pool.query(
      `SELECT s.id FROM solicitacoes_aluguel s
         JOIN veiculos v ON v.id = s.veiculo_id
        WHERE s.id = ? AND v.proprietario_id = ?`,
      [id, req.user.id]
    );
    if (!row) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    await pool.query(
      'UPDATE solicitacoes_aluguel SET visto_por_proprietario = 1 WHERE id = ?',
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};

exports.markSolicitacaoReadForMotorista = async (req, res) => {
  if (!req.user || req.user.role !== 'motorista') {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const { id } = req.params;
  try {
    const [[row]] = await pool.query(
      `SELECT id FROM solicitacoes_aluguel
        WHERE id = ? AND motorista_id = ?`,
      [id, req.user.id]
    );
    if (!row) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    await pool.query(
      'UPDATE solicitacoes_aluguel SET visto_por_motorista = 1 WHERE id = ?',
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};