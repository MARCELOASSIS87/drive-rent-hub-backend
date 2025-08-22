const request = require('supertest');
const app = require('../../server');
const pool = require('../../config/db');

describe('Cadastro de Motorista (POST /motoristas)', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE motoristas');
  });

  it('feliz: 201, senha hash, status em_analise', async () => {
    const email = `mot_${Date.now()}@teste.com`;
    const body = {
      nome: 'Mot Teste',
      email,
      telefone: '31999990000',
      cpf: String(Date.now()).padStart(11, '0').slice(0, 11),
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
      antecedentes_criminais_url: 'antecedentes.pdf',
    };

    const res = await request(app).post('/motoristas').send(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');

    const [rows] = await pool.query('SELECT * FROM motoristas WHERE email=?', [email]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('em_analise');
    expect(rows[0].senha_hash).toBeDefined();
    expect(rows[0].senha_hash).not.toBe('123456');
  });

  it('duplicidade de email: 409/400', async () => {
    const email = `mot_dup_${Date.now()}@teste.com`;
    const base = {
      nome: 'A',
      telefone: '31',
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
      antecedentes_criminais_url: 'antecedentes.pdf',
    };

    await request(app).post('/motoristas').send({ ...base, email });
    const res = await request(app)
      .post('/motoristas')
      .send({ ...base, email, cpf: String(Date.now() + 1).slice(0, 11) });

    expect([409, 400]).toContain(res.statusCode);
  });

  it('duplicidade de cpf: 409/400', async () => {
    const cpf = String(Date.now()).slice(0, 11);
    const base = {
      nome: 'A',
      telefone: '31',
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
      antecedentes_criminais_url: 'antecedentes.pdf',
    };

    await request(app)
      .post('/motoristas')
      .send({ ...base, email: `a_${Date.now()}@t.com`, cpf });
    const res = await request(app)
      .post('/motoristas')
      .send({ ...base, email: `b_${Date.now()}@t.com`, cpf });

    expect([409, 400]).toContain(res.statusCode);
  });

  it('payload inválido (sem senha): 400/422', async () => {
    const res = await request(app).post('/motoristas').send({
      nome: 'Sem Senha',
      email: `no_pass_${Date.now()}@teste.com`,
      telefone: '31',
      cpf: String(Date.now()).slice(0, 11),
      data_nascimento: '1990-01-01',
      cnh_numero: 'CNH' + Date.now(),
      cnh_validade: '2030-01-01',
      cnh_data_emissao: '2015-01-01',
      cnh_categoria: 'B',
      // senha faltando
      cnh_foto_url: 'cnh.jpg',
      comprovante_endereco_url: 'endereco.pdf',
      foto_perfil_url: 'perfil.jpg',
      selfie_cnh_url: 'selfie.jpg',
      antecedentes_criminais_url: 'antecedentes.pdf',
    });

    expect([400, 422]).toContain(res.statusCode);
  });
});