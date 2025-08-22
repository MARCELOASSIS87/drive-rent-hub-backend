const request = require('supertest');
const app = require('../../app');
const pool = require('../../config/db');

describe('Cadastro de Proprietário (POST /proprietarios)', () => {
  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proprietarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        telefone VARCHAR(20) NULL,
        cpf_cnpj VARCHAR(20) NOT NULL UNIQUE,
        senha_hash VARCHAR(255) NOT NULL,
        status ENUM('pendente','aprovado','recusado','bloqueado') DEFAULT 'pendente',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE proprietarios');
  });

  it('deve cadastrar e gravar senha como hash, status pendente', async () => {
    const email = `prop_${Date.now()}@teste.com`;
    const body = {
      nome: 'Prop Teste',
      email,
      telefone: '31999990000',
      cpf_cnpj: '12345678000199',
      senha: '123456'
    };

    const res = await request(app).post('/proprietarios').send(body);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');

    const [rows] = await pool.query('SELECT * FROM proprietarios WHERE email = ?', [email]);
    expect(rows.length).toBe(1);
    expect(rows[0].senha_hash).toBeDefined();
    expect(rows[0].senha_hash).not.toBe('123456'); // deve estar com hash
    expect(rows[0].status).toBe('pendente');
  });

  it('deve rejeitar payload inválido (ex: sem senha)', async () => {
    const res = await request(app).post('/proprietarios').send({
      nome: 'Sem Senha',
      email: `no_pass_${Date.now()}@teste.com`,
      cpf_cnpj: '11122233344'
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});