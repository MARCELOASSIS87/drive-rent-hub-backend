const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const pool = require('../config/db');

let resetDb;
try { resetDb = require('./helpers/resetDb'); } catch (_) { resetDb = null; }

function signToken(payload) {
  return 'Bearer ' + jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function insertProprietario(props = {}) {
  const nome = props.nome || 'Prop Contador';
  const email = props.email || `prop_cnt_${Date.now()}@t.com`;
  const cpf_cnpj = props.cpf_cnpj || String(Math.floor(1e14 + Math.random() * 9e14)).slice(0, 14);
  const senha_hash = props.senha_hash || 'x'.repeat(60);
  const status = props.status || 'aprovado';
  const [r] = await pool.query(
    `INSERT INTO proprietarios (nome, email, cpf_cnpj, senha_hash, status, criado_em)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [nome, email, cpf_cnpj, senha_hash, status]
  );
  return { id: r.insertId, nome, email };
}

async function insertMotorista(props = {}) {
  const nome = props.nome || 'Mot Contador';
  const email = props.email || `mot_cnt_${Date.now()}@t.com`;
  const cpf = props.cpf || String(Math.floor(1e10 + Math.random() * 9e10)).slice(0, 11);
  const senha_hash = props.senha_hash || 'x'.repeat(60);
  const [r] = await pool.query(
    `INSERT INTO motoristas (nome, email, cpf, senha_hash, status, criado_em)
     VALUES (?, ?, ?, ?, 'aprovado', NOW())`,
    [nome, email, cpf, senha_hash]
  );
  return { id: r.insertId, nome, email, cpf };
}

async function insertVeiculo(proprietarioId, props = {}) {
  const marca = props.marca || 'VW';
  const modelo = props.modelo || 'Gol';
  const placa = props.placa || ('CNT' + Math.floor(Math.random()*900+100) + '3');
  const renavam = props.renavam || String(Math.floor(1e9 + Math.random()*9e9));
  const ano = props.ano || 2022;
  const cor = props.cor || 'Prata';
  const valor_diaria = props.valor_diaria || 120.0;

  const [r] = await pool.query(
    `INSERT INTO veiculos (marca, modelo, placa, renavam, ano, cor, valor_diaria, status, ativo, criado_em, proprietario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'disponivel', 1, NOW(), ?)`,
    [marca, modelo, placa, renavam, ano, cor, valor_diaria, proprietarioId]
  );
  return { id: r.insertId, marca, modelo };
}

describe('Badge counter (/notificacoes/contador) soma flags de solicitacoes + contratos', () => {
  let prop, mot, vei;
  let tokenProp, tokenMot;

  beforeAll(async () => {
    if (resetDb?.resetAll) {
      await resetDb.resetAll();
    } else {
      await pool.query('SET FOREIGN_KEY_CHECKS=0');
      const order = ['contrato_revisoes','contratos','avaliacoes','solicitacoes_aluguel','alugueis','veiculos','motoristas','proprietarios','admins'];
      for (const t of order) {
        try { await pool.query(`TRUNCATE TABLE \`${t}\``); } catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; }
      }
      await pool.query('SET FOREIGN_KEY_CHECKS=1');
    }

    prop = await insertProprietario();
    mot  = await insertMotorista();
    vei  = await insertVeiculo(prop.id);

    // dados legais exigidos pelo aprovacao → evitar 422
    await pool.query(
      `INSERT INTO motoristas_legal
       (motorista_id, rg, orgao_expeditor, uf_rg, nacionalidade, estado_civil, profissao,
        endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep)
       VALUES (?, '1234567', 'SSP', 'SP', 'brasileiro', 'solteiro', 'Motorista',
               'Rua A', '100', 'Centro', 'São Paulo', 'SP', '01000-000')
       ON DUPLICATE KEY UPDATE
         rg=VALUES(rg), orgao_expeditor=VALUES(orgao_expeditor), uf_rg=VALUES(uf_rg),
         nacionalidade=VALUES(nacionalidade), estado_civil=VALUES(estado_civil), profissao=VALUES(profissao),
         endereco_logradouro=VALUES(endereco_logradouro), endereco_numero=VALUES(endereco_numero),
         endereco_bairro=VALUES(endereco_bairro), endereco_cidade=VALUES(endereco_cidade),
         endereco_uf=VALUES(endereco_uf), endereco_cep=VALUES(endereco_cep)`,
      [mot.id]
    );
    await pool.query(
      `INSERT INTO proprietarios_legal
       (proprietario_id, rg, orgao_expeditor, uf_rg, nacionalidade, estado_civil, profissao,
        endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep)
       VALUES (?, '7654321', 'SSP', 'SP', 'brasileiro', 'casado', 'Proprietário de Veículos',
               'Av. B', '200', 'Jardins', 'São Paulo', 'SP', '01400-000')
       ON DUPLICATE KEY UPDATE
         rg=VALUES(rg), orgao_expeditor=VALUES(orgao_expeditor), uf_rg=VALUES(uf_rg),
         nacionalidade=VALUES(nacionalidade), estado_civil=VALUES(estado_civil), profissao=VALUES(profissao),
         endereco_logradouro=VALUES(endereco_logradouro), endereco_numero=VALUES(endereco_numero),
         endereco_bairro=VALUES(endereco_bairro), endereco_cidade=VALUES(endereco_cidade),
         endereco_uf=VALUES(endereco_uf), endereco_cep=VALUES(endereco_cep)`,
      [prop.id]
    );

    tokenProp = signToken({ id: prop.id, role: 'proprietario' });
    tokenMot  = signToken({ id: mot.id, role: 'motorista' });
  });

  afterAll(async () => {
    if (resetDb?.resetAll) {
      await resetDb.resetAll();
    } else {
      await pool.query('SET FOREIGN_KEY_CHECKS=0');
      const order = ['contrato_revisoes','contratos','avaliacoes','solicitacoes_aluguel','alugueis','veiculos','motoristas','proprietarios','admins'];
      for (const t of order) {
        try { await pool.query(`TRUNCATE TABLE \`${t}\``); } catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; }
      }
      await pool.query('SET FOREIGN_KEY_CHECKS=1');
    }
  });

  test('contador reflete eventos de solicitacao e contrato + mark-read zera', async () => {
    const hoje = new Date();
    const amanha = new Date(hoje.getTime() + 24*60*60*1000);
    const fmt = d => d.toISOString().slice(0,10);

    // 1) motorista cria solicitação → contador do PROP = 1
    const resSolic = await request(app)
      .post('/solicitacoes')
      .set('Authorization', tokenMot)
      .send({ veiculo_id: vei.id, data_inicio: fmt(hoje), data_fim: fmt(amanha) });
    expect([200,201].includes(resSolic.statusCode)).toBe(true);
    const solicitacaoId = resSolic.body?.id || resSolic.body?.insertId || resSolic.body?.solicitacao?.id;
    expect(solicitacaoId).toBeTruthy();

    const cntProp1 = await request(app).get('/notificacoes/contador').set('Authorization', tokenProp);
    expect(cntProp1.statusCode).toBe(200);
    expect(Number(cntProp1.body?.total_nao_lidas)).toBe(1);

    // 2) prop marca solicitação como lida → contador do PROP = 0
    const markPropSolic = await request(app)
      .patch(`/solicitacoes/${solicitacaoId}/mark-read/proprietario`)
      .set('Authorization', tokenProp).send();
    expect(markPropSolic.statusCode).toBe(200);

    const cntProp2 = await request(app).get('/notificacoes/contador').set('Authorization', tokenProp);
    expect(cntProp2.statusCode).toBe(200);
    expect(Number(cntProp2.body?.total_nao_lidas)).toBe(0);

    // 3) prop APROVA a solicitação (já temos dados legais) → contador do MOT = 1 (pela solicitação aprovada)
    const aprovarRes = await request(app)
      .put(`/solicitacoes/${solicitacaoId}/aprovar`)
      .set('Authorization', tokenProp)
      .send({ valor_por_dia: 150, forma_pagamento: 'pix', local_retirada: 'Ponto A', local_devolucao: 'Ponto B' });
    expect([200,201].includes(aprovarRes.statusCode)).toBe(true);

    let contratoId = aprovarRes.body?.contrato_id;
    if (!contratoId) {
      const [cRows] = await pool.query(`SELECT id AS contrato_id FROM contratos ORDER BY id DESC LIMIT 1`);
      expect(cRows.length).toBe(1);
      contratoId = cRows[0].contrato_id;
    }
    expect(contratoId).toBeTruthy();

    const cntMot1 = await request(app).get('/notificacoes/contador').set('Authorization', tokenMot);
    expect(cntMot1.statusCode).toBe(200);
    expect(Number(cntMot1.body?.total_nao_lidas)).toBe(1);

    // 4) prop PUBLICA contrato → contador do MOT = 2 (solicitação + contrato publicado)
    const pubRes = await request(app)
      .post(`/contratos/${contratoId}/publicar`)
      .set('Authorization', tokenProp).send();
    expect([200,204].includes(pubRes.statusCode)).toBe(true);

    const cntMot2 = await request(app).get('/notificacoes/contador').set('Authorization', tokenMot);
    expect(cntMot2.statusCode).toBe(200);
    expect(Number(cntMot2.body?.total_nao_lidas)).toBe(2);

    // 5) mot marca solicitacao e contrato como lidos → contador do MOT = 0
    const markMotSolic = await request(app)
      .patch(`/solicitacoes/${solicitacaoId}/mark-read/motorista`)
      .set('Authorization', tokenMot).send();
    expect(markMotSolic.statusCode).toBe(200);

    const markMotContrato = await request(app)
      .patch(`/contratos/${contratoId}/mark-read/motorista`)
      .set('Authorization', tokenMot).send();
    expect(markMotContrato.statusCode).toBe(200);

    const cntMot3 = await request(app).get('/notificacoes/contador').set('Authorization', tokenMot);
    expect(cntMot3.statusCode).toBe(200);
    expect(Number(cntMot3.body?.total_nao_lidas)).toBe(0);

    // 6) mot ASSINA contrato → contador do PROP = 1 (assinatura)
    const signRes = await request(app)
      .post(`/contratos/${contratoId}/assinar`)
      .set('Authorization', tokenMot).send();
    expect([200,204].includes(signRes.statusCode)).toBe(true);

    const cntProp3 = await request(app).get('/notificacoes/contador').set('Authorization', tokenProp);
    expect(cntProp3.statusCode).toBe(200);
    expect(Number(cntProp3.body?.total_nao_lidas)).toBe(1);

    // 7) prop marca contrato como lido → contador do PROP = 0
    const markPropContrato = await request(app)
      .patch(`/contratos/${contratoId}/mark-read/proprietario`)
      .set('Authorization', tokenProp).send();
    expect(markPropContrato.statusCode).toBe(200);

    const cntProp4 = await request(app).get('/notificacoes/contador').set('Authorization', tokenProp);
    expect(cntProp4.statusCode).toBe(200);
    expect(Number(cntProp4.body?.total_nao_lidas)).toBe(0);
  });
});
