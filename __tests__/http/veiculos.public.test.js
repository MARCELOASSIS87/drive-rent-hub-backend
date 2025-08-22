jest.mock('../../config/db', () => ({
  query: jest.fn().mockRejectedValue({ code: 'ER_NO_SUCH_TABLE', message: 'no such table' }),
  end: jest.fn().mockResolvedValue(),
}));

const request = require('supertest');
const app = require('../../app');
const pool = require('../../config/db');

describe('GET /veiculos', () => {
  it('retorna lista vazia quando tabela nao existe', async () => {
    const res = await request(app).get('/veiculos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

afterAll(async () => {
  await pool.end();
});