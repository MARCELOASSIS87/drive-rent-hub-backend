const bcrypt = require('bcrypt');

jest.mock('../config/db', () => ({
  query: jest.fn(),
}));

const pool = require('../config/db');
const authController = require('../controllers/authController');

function createRes() {
  return {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };
}

describe('authController.login', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it('authenticates admin using senha_hash field', async () => {
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    pool.query.mockResolvedValueOnce([[{ id: 1, nome: 'comum', email: 'admin@test.com', role: 'super', senha_hash: hash }]]);

    const req = { body: { email: 'admin@test.com', senha: password } };
    const res = createRes();

    await authController.login(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData).toHaveProperty('token');
    expect(res.jsonData).toMatchObject({ nome: 'Admin', role: 'super' });
  });

  it('authenticates admin using senha fallback', async () => {
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    pool.query.mockResolvedValueOnce([[{ id: 1, nome: 'Admin', email: 'admin@test.com', role: 'super', senha: hash }]]);

    const req = { body: { email: 'admin@test.com', senha: password } };
    const res = createRes();

    await authController.login(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData).toHaveProperty('token');
    expect(res.jsonData).toMatchObject({ nome: 'Admin', role: 'super' });
  });
});