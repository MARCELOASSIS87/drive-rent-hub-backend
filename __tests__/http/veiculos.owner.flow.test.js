const request = require('supertest');
const app = require('../../server');
const pool = require('../../config/db');
const { resetAll } = require('../helpers/resetDb');

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
  if (res.statusCode !== 201) throw new Error('Falha ao criar proprietário');

  await pool.query('UPDATE proprietarios SET status="aprovado" WHERE email=?', [email]);
  const login = await request(app).post('/auth/login').send({ email, senha: '123456' });
  if (login.statusCode !== 200) throw new Error('Falha no login do proprietário');
  return { token: login.body.token, id: login.body.id || null, email };
}

async function criarELogarMotorista() {
  const email = `mot_${Date.now()}@teste.com`;
  const body = {
    nome: 'Mot Flow',
    email,
    telefone: '31999990000',
    cpf: String(Date.now()).slice(0,11),
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
  if (res.statusCode !== 201) throw new Error('Falha ao criar motorista');

  await pool.query('UPDATE motoristas SET status="aprovado" WHERE email=?', [email]);
  const login = await request(app).post('/auth/login').send({ email, senha: '123456' });
  if (login.statusCode !== 200) throw new Error('Falha no login do motorista');
  return { token: login.body.token, id: login.body.id || null, email };
}

describe('Fluxo de veículos para PROPRIETÁRIO', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('proprietário autenticado consegue criar veículo e ele aparece em /veiculos/meus', async () => {
    const { token } = await criarELogarProprietario();

    const placa = 'T' + String(Date.now()).slice(-6); // 7 chars
    const body = {
      modelo: 'Argo',
      marca: 'Fiat',
      ano: 2022,
      placa,
      renavam: 'REN' + String(Date.now()).slice(-8),
      cor: 'Prata',
      valor_diaria: 120
    };

    const create = await request(app)
      .post('/veiculos')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect([200,201]).toContain(create.statusCode);
    if (create.body.id) expect(create.body.id).toBeGreaterThan(0);

    const [rows] = await pool.query('SELECT proprietario_id FROM veiculos WHERE placa=?', [placa]);
    expect(rows.length).toBe(1);
    expect(rows[0].proprietario_id).not.toBeNull();

    const meus = await request(app)
      .get('/veiculos/meus')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(meus.statusCode).toBe(200);
    expect(Array.isArray(meus.body)).toBe(true);
    expect(meus.body.find(v => v.placa === placa)).toBeTruthy();
  });

  it('motorista NÃO consegue criar veículo (403)', async () => {
    const { token } = await criarELogarMotorista();

    const res = await request(app)
      .post('/veiculos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        modelo: 'Onix',
        marca: 'Chevrolet',
        ano: 2021,
        placa: 'M' + String(Date.now()).slice(-6),
        renavam: 'REN' + String(Date.now()).slice(-8),
        cor: 'Preto',
        valor_diaria: 100
      });

    expect([401,403]).toContain(res.statusCode);
  });

  it('proprietário A não pode editar veículo do proprietário B (403)', async () => {
    const { token: tokenA } = await criarELogarProprietario();
    const placa = 'A' + String(Date.now()).slice(-6);
    const create = await request(app)
      .post('/veiculos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        modelo: 'HB20',
        marca: 'Hyundai',
        ano: 2020,
        placa,
        renavam: 'REN' + String(Date.now()).slice(-8),
        cor: 'Branco',
        valor_diaria: 90
      });
    expect([200,201]).toContain(create.statusCode);

    const [rows] = await pool.query('SELECT id FROM veiculos WHERE placa=?', [placa]);
    const veiculoId = rows[0].id;

    const { token: tokenB } = await criarELogarProprietario();
    const edit = await request(app)
      .put(`/veiculos/${veiculoId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ cor: 'Vermelho' });

    expect([401,403]).toContain(edit.statusCode);
  });

  it('proprietário consegue atualizar status do próprio veículo', async () => {
    const { token } = await criarELogarProprietario();
    const placa = 'S' + String(Date.now()).slice(-6);

    const create = await request(app)
      .post('/veiculos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        modelo: 'Cronos',
        marca: 'Fiat',
        ano: 2019,
        placa,
        renavam: 'REN' + String(Date.now()).slice(-8),
        cor: 'Prata',
        valor_diaria: 80
      });
    expect([200,201]).toContain(create.statusCode);

    const [rows] = await pool.query('SELECT id FROM veiculos WHERE placa=?', [placa]);
    const veiculoId = rows[0].id;

    const up = await request(app)
      .put(`/veiculos/${veiculoId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'manutencao' });

    expect([200,204]).toContain(up.statusCode);
  });

  it('sem JWT → 401 em POST /veiculos', async () => {
    const res = await request(app).post('/veiculos').send({
      modelo: 'Gol',
      marca: 'VW',
      ano: 2018,
      placa: 'Z' + String(Date.now()).slice(-6),
      renavam: 'REN' + String(Date.now()).slice(-8),
      cor: 'Prata',
      valor_diaria: 70
    });
    expect(res.statusCode).toBe(401);
  });
});