const pool = require('../../config/db');

describe('DB pool smoke test (remote test DB)', () => {
  it('SELECT 1+1 deve funcionar', async () => {
    const [rows] = await pool.query('SELECT 1 + 1 AS ok');
    expect(rows[0].ok).toBe(2);
  });
});