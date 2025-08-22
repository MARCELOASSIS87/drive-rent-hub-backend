const request = require('supertest');
const app = require('../../server');
const pool = require('../../config/db');

describe('Cadastro de Proprietário (POST /proprietarios)', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE proprietarios');
  });

  it('feliz: 201, senha hash, status pendente', async () => {
    const email = `prop_${Date.now()}@teste.com`;
    const body = {
      nome: 'Prop Teste',
      email,
      telefone: '31999990000',
      cpf_cnpj: String(Date.now()),
      senha: '123456',
    };

    const res = await request(app).post('/proprietarios').send(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');

    const [rows] = await pool.query('SELECT * FROM proprietarios WHERE email=?', [email]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('pendente');
    expect(rows[0].senha_hash).toBeDefined();
    expect(rows[0].senha_hash).not.toBe('123456');
  });

  it('duplicidade de email: 409/400', async () => {
    const email = `prop_dup_${Date.now()}@teste.com`;
    const base = {
      nome: 'A',
      telefone: '31',
      cpf_cnpj: String(Date.now()),
      senha: '123456',
    };

    await request(app).post('/proprietarios').send({ ...base, email });
    const res = await request(app)
      .post('/proprietarios')
      .send({ ...base, email, cpf_cnpj: String(Date.now() + 1) });

    expect([409, 400]).toContain(res.statusCode);
  });

  it('duplicidade de cpf_cnpj: 409/400', async () => {
    const email1 = `prop1_${Date.now()}@teste.com`;
    const email2 = `prop2_${Date.now()}@teste.com`;
    const doc = String(Date.now());

    await request(app)
      .post('/proprietarios')
      .send({ nome: 'A', email: email1, telefone: '31', cpf_cnpj: doc, senha: '123456' });

    const res = await request(app)
      .post('/proprietarios')
      .send({ nome: 'B', email: email2, telefone: '31', cpf_cnpj: doc, senha: '123456' });

    expect([409, 400]).toContain(res.statusCode);
  });

  it('payload inválido: 400/422', async () => {
    const res = await request(app).post('/proprietarios').send({
      nome: 'Sem Doc',
      email: `prop_sem_${Date.now()}@teste.com`,
      // cpf_cnpj faltando
      // senha faltando
    });

    expect([400, 422]).toContain(res.statusCode);
  });
});
