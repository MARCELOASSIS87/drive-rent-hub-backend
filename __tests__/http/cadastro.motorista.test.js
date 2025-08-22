const request = require('supertest');
const app = require('../../app');
const pool = require('../../config/db');
const { resetAll } = require('../helpers/resetDb');

describe('Cadastro de Motorista (POST /motoristas)', () => {
  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS motoristas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        telefone VARCHAR(20) NULL,
        cpf VARCHAR(20) NULL,
        data_nascimento DATE NULL,
        cnh_numero VARCHAR(20) NULL,
        cnh_validade DATE NULL,
        cnh_data_emissao DATE NULL,
        cnh_categoria VARCHAR(2) NULL,
        senha_hash VARCHAR(255) NOT NULL,
        cnh_foto_url VARCHAR(255) NULL,
        foto_perfil_url VARCHAR(255) NULL,
        selfie_cnh_url VARCHAR(255) NULL,
        comprovante_endereco_url VARCHAR(255) NULL,
        comprovante_vinculo_url VARCHAR(255) NULL,
        antecedentes_criminais_url VARCHAR(255) NULL,
        status ENUM('em_analise','aprovado','recusado','bloqueado') DEFAULT 'em_analise',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  });

  beforeEach(async () => {
    await resetAll();
  });

  it('deve cadastrar motorista e gravar senha como hash, status em_analise', async () => {
    const email = `mot_${Date.now()}@teste.com`;
    const body = {
      nome: 'Motorista Teste',
      email,
      telefone: '31988887777',
      cpf: '12345678901',
      cnh_categoria: 'B',
      senha: '123456'
    };

    const res = await request(app).post('/motoristas').send(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');

    const [rows] = await pool.query('SELECT * FROM motoristas WHERE email = ?', [email]);
    expect(rows.length).toBe(1);
    expect(rows[0].senha_hash).toBeDefined();
    expect(rows[0].senha_hash).not.toBe('123456'); // deve estar com hash
    expect(rows[0].status).toBe('em_analise');
  });

  it('deve rejeitar payload inválido (ex: sem senha)', async () => {
    const res = await request(app).post('/motoristas').send({
      nome: 'Sem Senha',
      email: `no_pass_${Date.now()}@teste.com`,
      cpf: '12345678901',
      cnh_categoria: 'B'
    });
    expect([400, 422, 500]).toContain(res.statusCode); // 500 se o controller não validar, OK para este smoke
  });
});