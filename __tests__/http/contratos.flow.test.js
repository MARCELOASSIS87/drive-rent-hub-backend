const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../server');
const pool = require('../../config/db');
const { resetAll } = require('../helpers/resetDb');

// Helpers
async function criarELogarProprietario() {
  const email = `prop_${Date.now()}@teste.com`;
  const body = {
    nome: 'Prop Flow',
    email,
    telefone: '31999990000',
    cpf_cnpj: String(Date.now()),
    senha: '123456'
  };
  const res = await request(app).post('/proprietarios').send(body);
  if (![200, 201].includes(res.statusCode)) throw new Error('Falha ao criar proprietario');
  await pool.query('UPDATE proprietarios SET status="aprovado" WHERE email=?', [email]);
  const login = await request(app).post('/auth/login').send({ email, senha: '123456' });
  if (login.statusCode !== 200) throw new Error('Falha no login do proprietario');
  return { token: login.body.token, id: login.body.id || null, email };
}

async function criarELogarMotorista() {
  const email = `mot_${Date.now()}@teste.com`;
  const body = {
    nome: 'Mot Flow',
    email,
    telefone: '31999990000',
    cpf: String(Date.now()).slice(0, 11),
    data_nascimento: '1990-01-01',
    cnh_numero: 'CNH' + Date.now(),
    cnh_validade: '2030-01-01',
    cnh_data_emissao: '2015-01-01',
    cnh_categoria: 'B',
    senha: '123456',
    cnh_foto_url: 'cnh.jpg',
    comprovante_endereco_url: 'endereco.pdf',
    foto_perfil_url: 'perfil.jpg',
    selfie_cnh_url: 'selfie.jpg',
    antecedentes_criminais_url: 'antecedentes.pdf'
  };
  const res = await request(app).post('/motoristas').send(body);
  if (![200, 201].includes(res.statusCode)) throw new Error('Falha ao criar motorista');
  await pool.query('UPDATE motoristas SET status="aprovado" WHERE email=?', [email]);
  const login = await request(app).post('/auth/login').send({ email, senha: '123456' });
  if (login.statusCode !== 200) throw new Error('Falha no login do motorista');
  return { token: login.body.token, id: login.body.id || null, email };
}

async function criarELogarAdmin() {
  const email = `admin_${Date.now()}@teste.com`;
  const hash = await bcrypt.hash('123456', 10);
  await pool.query(
    'INSERT INTO admins (nome, email, senha_hash, role, ativo) VALUES (?, ?, ?, ?, 1)',
    ['Admin Test', email, hash, 'comum']
  );
  const login = await request(app).post('/auth/login').send({ email, senha: '123456' });
  if (login.statusCode !== 200) throw new Error('Falha no login do admin');
  return { token: login.body.token, id: login.body.id || null, email };
}

let adminToken;
async function criarVeiculoAprovado(tokenProp) {
  const placa = 'V' + String(Date.now()).slice(-6);
  const body = {
    modelo: 'Argo',
    marca: 'Fiat',
    ano: 2022,
    placa,
    renavam: 'REN' + String(Date.now()).slice(-8),
    cor: 'Prata',
    valor_diaria: 120
  };
  const res = await request(app)
    .post('/veiculos')
    .set('Authorization', `Bearer ${tokenProp}`)
    .send(body);
  if (![200, 201].includes(res.statusCode)) throw new Error('Falha ao criar veiculo');
  const [[row]] = await pool.query('SELECT id FROM veiculos WHERE placa=?', [placa]);
  const veiculoId = row.id;
  const approve = await request(app)
    .put(`/admin/veiculos/${veiculoId}/aprovar`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send();
  if (![200, 201, 204].includes(approve.statusCode)) throw new Error('Falha ao aprovar veiculo');
  return { veiculoId };
}

async function criarSolicitacao(tokenMot, veiculoId, datas) {
  const res = await request(app)
    .post('/solicitacoes')
    .set('Authorization', `Bearer ${tokenMot}`)
    .send({ veiculo_id: veiculoId, data_inicio: datas.inicio, data_fim: datas.fim });
  if (![200, 201].includes(res.statusCode)) throw new Error('Falha ao criar solicitacao');
  return { solicitacaoId: res.body.id };
}

async function aprovarSolicitacaoComoProprietario(tokenProp, solicitacaoId, overrides = {}) {
  const payload = {
    valor_por_dia: overrides.valor_por_dia ?? 120,
    forma_pagamento: overrides.forma_pagamento ?? 'pix',
    local_retirada: overrides.local_retirada ?? 'Pátio Central',
    local_devolucao: overrides.local_devolucao ?? 'Pátio Norte',

    // >>> dados civis do MOTORISTA (obrigatórios)
    dados_legais: {
      rg: '12.345.678-9',
      orgao_expeditor: 'SSP',
      uf_rg: 'SP',
      nacionalidade: 'brasileiro',
      estado_civil: 'solteiro', // ENUM: 'solteiro','casado','divorciado','viuvo','uniao_estavel'
      profissao: 'Motorista',
      endereco_logradouro: 'Rua Alfa',
      endereco_numero: '100',
      endereco_bairro: 'Centro',
      endereco_cidade: 'São Paulo',
      endereco_uf: 'SP',
      endereco_cep: '01000-000',
      ...(overrides.dados_legais || {}),
    },

    // >>> dados civis do PROPRIETÁRIO (obrigatórios)
    dados_legais_proprietario: {
      rg: '98.765.432-1',
      orgao_expeditor: 'SSP',
      uf_rg: 'SP',
      nacionalidade: 'brasileiro',
      estado_civil: 'casado',
      profissao: 'Proprietário de Veículos',
      endereco_logradouro: 'Av. Beta',
      endereco_numero: '200',
      endereco_bairro: 'Jardins',
      endereco_cidade: 'São Paulo',
      endereco_uf: 'SP',
      endereco_cep: '01400-000',
      ...(overrides.dados_legais_proprietario || {}),
    },
  };

  const res = await request(app)
    .put(`/solicitacoes/${solicitacaoId}/aprovar`)
    .set('Authorization', `Bearer ${tokenProp}`)
    .send(payload);

  if (![200, 201].includes(res.statusCode)) {
    console.error(
      '[APROVAR SOLICITAÇÃO] status:',
      res.statusCode,
      '| body:', res.body,
      '| text:', res.text
    );
    throw new Error('Falha ao aprovar solicitacao');
  }

  let { contrato_id: contratoId, aluguel_id: aluguelId } = res.body;
  if (!contratoId || !aluguelId) {
    const [[last]] = await pool.query(
      'SELECT id AS contrato_id, aluguel_id FROM contratos ORDER BY id DESC LIMIT 1'
    );
    contratoId = contratoId || last?.contrato_id;
    aluguelId = aluguelId || last?.aluguel_id;
  }
  return { contratoId, aluguelId };
}



describe('Fluxo de Contratos (editar → publicar → assinar)', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('feliz: proprietário edita, publica e motorista assina', async () => {
    const { token: tokenProp } = await criarELogarProprietario();
    const { token: tokenMot } = await criarELogarMotorista();
    ({ token: adminToken } = await criarELogarAdmin());

    const { veiculoId } = await criarVeiculoAprovado(tokenProp);

    const hoje = new Date();
    const inicio = hoje.toISOString().slice(0, 10);
    const fim1 = new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10);
    const { solicitacaoId } = await criarSolicitacao(tokenMot, veiculoId, { inicio, fim: fim1 });

    const { contratoId } = await aprovarSolicitacaoComoProprietario(tokenProp, solicitacaoId, {
      valor_por_dia: 120,
      forma_pagamento: 'pix',
      local_retirada: 'Pátio Central',
      local_devolucao: 'Pátio Norte'
    });

    const fim2 = new Date(hoje.getTime() + 2 * 86400000);
    const fim2Iso = fim2.toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const edit = await request(app)
      .put(`/contratos/${contratoId}`)
      .set('Authorization', `Bearer ${tokenProp}`)
      .send({
        pagamento: { valor_por_dia: 150 }
      });

    // DIAGNÓSTICO
    if (![200, 201, 204].includes(edit.statusCode)) {
      console.error(
        '[EDIT CONTRATO] status:',
        edit.statusCode,
        '| body:', edit.body,
        '| text:', edit.text
      );
    }
    expect([200, 201, 204]).toContain(edit.statusCode);

    const publicar = await request(app)
      .post(`/contratos/${contratoId}/publicar`)
      .set('Authorization', `Bearer ${tokenProp}`)
      .send();
    expect([200, 201, 204]).toContain(publicar.statusCode);

    const assinar = await request(app)
      .post(`/contratos/${contratoId}/assinar`)
      .set('Authorization', `Bearer ${tokenMot}`)
      .send();
    expect([200, 201, 204]).toContain(assinar.statusCode);

    const [[contrato]] = await pool.query(
      'SELECT status, assinatura_data, assinatura_ip, dados_json FROM contratos WHERE id=?',
      [contratoId]
    );
    expect(contrato.status).toBe('assinado');
    expect(contrato.assinatura_data).not.toBeNull();
    expect(contrato.assinatura_ip).not.toBeNull();
    const dados = typeof contrato.dados_json === 'string' ? JSON.parse(contrato.dados_json) : contrato.dados_json;
    expect(dados.aluguel.local_retirada).toBe('Ponto A');
    expect(dados.aluguel.local_devolucao).toBe('Ponto B');
    expect(dados.pagamento.valor_por_dia).toBe(150);
    expect(dados.aluguel.dias).toBe(2);
    expect(dados.aluguel.valor_total).toBe(300);
  });

  it('autorização: terceiros não podem editar/assinar; partes conseguem ler', async () => {
    const { token: tokenProp } = await criarELogarProprietario();
    const { token: tokenMot } = await criarELogarMotorista();
    ({ token: adminToken } = await criarELogarAdmin());
    const { veiculoId } = await criarVeiculoAprovado(tokenProp);
    const hoje = new Date();
    const inicio = hoje.toISOString().slice(0, 10);
    const fim1 = new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10);
    const { solicitacaoId } = await criarSolicitacao(tokenMot, veiculoId, { inicio, fim: fim1 });
    const { contratoId } = await aprovarSolicitacaoComoProprietario(tokenProp, solicitacaoId, {
      valor_por_dia: 100,
      forma_pagamento: 'pix',
      local_retirada: 'X',
      local_devolucao: 'Y'
    });

    const { token: tokenProp2 } = await criarELogarProprietario();
    const edit403 = await request(app)
      .put(`/contratos/${contratoId}`)
      .set('Authorization', `Bearer ${tokenProp2}`)
      .send({ pagamento: { valor_por_dia: 10 } });
    // DIAGNÓSTICO
    if (edit403.statusCode !== 403) {
      console.error(
        '[EDIT CONTRATO 403?] status:',
        edit403.statusCode,
        '| body:', edit403.body,
        '| text:', edit403.text
      );
    }

    expect(edit403.statusCode).toBe(403);

    const { token: tokenMot2 } = await criarELogarMotorista();
    const sign403 = await request(app)
      .post(`/contratos/${contratoId}/assinar`)
      .set('Authorization', `Bearer ${tokenMot2}`)
      .send();
    expect(sign403.statusCode).toBe(403);

    const getProp = await request(app)
      .get(`/contratos/${contratoId}`)
      .set('Authorization', `Bearer ${tokenProp}`);
    expect(getProp.statusCode).toBe(200);

    const getMot = await request(app)
      .get(`/contratos/${contratoId}`)
      .set('Authorization', `Bearer ${tokenMot}`);
    expect(getMot.statusCode).toBe(200);

    const get403 = await request(app)
      .get(`/contratos/${contratoId}`)
      .set('Authorization', `Bearer ${tokenProp2}`);
    expect(get403.statusCode).toBe(403);
  });
});
