const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../app');
const pool = require('../../config/db');
const { resetAll } = require('../helpers/resetDb');

describe('POST /auth/login — admin, motorista e proprietario', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('deve logar como ADMIN e retornar token + role do admin', async () => {
    const email = `admin_${Date.now()}@teste.com`;
    const hash = await bcrypt.hash('123456', 10);

    await pool.query(
      'INSERT INTO admins (nome, email, senha_hash, role, ativo) VALUES (?, ?, ?, ?, 1)',
      ['Admin Test', email, hash, 'comum']
    );

    const res = await request(app).post('/auth/login').send({ email, senha: '123456' });
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.token).toBe('string');
    // O controller retorna role do admin (comum ou super)
    expect(['comum', 'super']).toContain(res.body.role);
  });

  it('deve logar como MOTORISTA aprovado e retornar token + role "motorista"', async () => {
    const email = `mot_${Date.now()}@teste.com`;
    const hash = await bcrypt.hash('123456', 10);

    // Insere motorista diretamente (schema real exige vários NOT NULL)
    await pool.query(
      `INSERT INTO motoristas (
         nome, email, telefone, cpf, data_nascimento,
         cnh_numero, cnh_validade, cnh_data_emissao, cnh_categoria,
         senha_hash, cnh_foto_url, foto_perfil_url, selfie_cnh_url,
         comprovante_endereco_url, comprovante_vinculo_url, antecedentes_criminais_url,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aprovado')`,
      [
        'Mot Test', email, '31999990000', '12345678901', '1990-01-01',
        'CNH123', '2030-01-01', '2010-01-01', 'B',
        hash, 'cnh.jpg', 'perfil.jpg', 'selfie.jpg',
        'endereco.pdf', null, 'antecedentes.pdf'
      ]
    );

    const res = await request(app).post('/auth/login').send({ email, senha: '123456' });
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('motorista');
    expect(typeof res.body.token).toBe('string');
  });

  it('deve logar como PROPRIETARIO aprovado e retornar token + role "proprietario"', async () => {
    const email = `prop_${Date.now()}@teste.com`;
    const hash = await bcrypt.hash('123456', 10);

    await pool.query(
      `INSERT INTO proprietarios (nome, email, telefone, cpf_cnpj, senha_hash, status)
       VALUES (?, ?, ?, ?, ?, 'aprovado')`,
      ['Prop Test', email, '31988887777', '12345678000199', hash]
    );

    const res = await request(app).post('/auth/login').send({ email, senha: '123456' });
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('proprietario');
    expect(typeof res.body.token).toBe('string');
  });
});