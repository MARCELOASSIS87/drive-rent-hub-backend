// jest.globalTeardown.js
module.exports = async () => {
  const pool = require('./config/db');
  try {
    await pool.end();
  } catch (e) {
    // ignora se já estiver fechado
  }
};
