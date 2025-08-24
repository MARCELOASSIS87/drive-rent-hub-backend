const pool = require('../config/db');
const { generateContractHtml } = require('../utils/contractHtml');
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

// parse seguro "YYYY-MM-DD" para Date UTC
function parseYMDToUTC(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
    return new Date(Date.UTC(y, mo, da));
  }
  return null;
}

// diferença em dias, inclusiva (mínimo 1)
function daysDiffInclusive(di, df) {
  const a = parseYMDToUTC(di), b = parseYMDToUTC(df);
  if (!a || !b) return null;
  const MS = 1000 * 60 * 60 * 24;
  const diff = Math.round((b - a) / MS);
  return diff > 0 ? diff : 1;
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
    const dias = daysDiffInclusive(sol.data_inicio, sol.data_fim);
    if (dias === null) {
      return res.status(422).json({ error: 'datas inválidas' });
    }

    const [[conf]] = await pool.query(
      `SELECT COUNT(*) AS n
         FROM alugueis a
        WHERE a.veiculo_id = ?
          AND a.status IN ('aprovado','pronto_para_assinatura','assinado','em_andamento')
          AND NOT (a.data_fim_prevista < ? OR a.data_inicio > ?)` ,
      [sol.veiculo_id, sol.data_inicio, sol.data_fim]
    );
    if (conf.n > 0) {
      return res.status(409).json({ error: 'Conflito de agenda para o veículo no período solicitado' });
    }
    // 2) Transação
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

    // ********************************************
    // 6) Monta objetos normalizados para o template
    // ********************************************
    const proprietario = {
      nome: prop?.nome || '',
      cpf: prop?.cpf_cnpj || '',
      rg: propLegal.rg,
      orgao_expeditor: propLegal.orgao_expeditor,
      uf_rg: propLegal.uf_rg,
      nacionalidade: propLegal.nacionalidade,
      estado_civil: propLegal.estado_civil,
      profissao: propLegal.profissao,
      endereco: [
        propLegal.endereco_logradouro,
        propLegal.endereco_numero,
        propLegal.endereco_bairro,
        (propLegal.endereco_cidade && propLegal.endereco_uf)
          ? `${propLegal.endereco_cidade}-${propLegal.endereco_uf}`
          : (propLegal.endereco_cidade || propLegal.endereco_uf),
        propLegal.endereco_cep,
      ].filter(Boolean).join(', ')
    };

    const motorista = {
      nome: mot?.nome || '',
      cpf: mot?.cpf || '',
      rg: legalMot.rg,
      orgao_expeditor: legalMot.orgao_expeditor,
      uf_rg: legalMot.uf_rg,
      nacionalidade: legalMot.nacionalidade,
      estado_civil: legalMot.estado_civil,
      profissao: legalMot.profissao,
      endereco: [
        legalMot.endereco_logradouro,
        legalMot.endereco_numero,
        legalMot.endereco_bairro,
        (legalMot.endereco_cidade && legalMot.endereco_uf)
          ? `${legalMot.endereco_cidade}-${legalMot.endereco_uf}`
          : (legalMot.endereco_cidade || legalMot.endereco_uf),
        legalMot.endereco_cep,
      ].filter(Boolean).join(', ')
    };

    // ********************************************
    // 7) Detalhes da negociação (não viram colunas)
    // ********************************************
    const detalhesContrato = {
      valor_por_dia: valorDiaNum,
      forma_pagamento: String(forma_pagamento),
      local_retirada: String(local_retirada),
      local_devolucao: String(local_devolucao),
      data_inicio: sol.data_inicio,
      data_fim: sol.data_fim,
    };

    const aluguelSnap = {
      id: aluguelId,
      data_inicio: sol.data_inicio,
      data_fim: sol.data_fim,
      dias,
      local_retirada: String(local_retirada),
      local_devolucao: String(local_devolucao),
    };

    const pagamentoSnap = {
      valor_por_dia: valorDiaNum,
      valor_total: dias * valorDiaNum,
    };

    const snapshot = {
      solicitacao: sol,
      aluguel: aluguelSnap,
      veiculo,
      proprietario,
      locador: proprietario,
      motorista,
      pagamento: pagamentoSnap,
      detalhes: detalhesContrato,
      gerado_em: new Date().toISOString(),
    };

    const html = (typeof generateContractHtml === 'function')
      ? generateContractHtml(snapshot)
      : `<pre>${JSON.stringify(snapshot, null, 2)}</pre>`;

    // ********************************************
    // 9) Inserção do contrato (colunas explícitas)
    // ********************************************
    const [contratoRes] = await q(
      `INSERT INTO contratos
       (aluguel_id, motorista_id, veiculo_id, status, dados_json, arquivo_html)
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
