const request = require('supertest');
const app = require('../../app'); // ajuste se o app for exportado de outro caminho

describe('GET /veiculos (público)', () => {
  it('deve responder 200 e um array', async () => {
    const res = await request(app).get('/veiculos').send();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});