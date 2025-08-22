const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// 1º carrega .env sempre
dotenv.config({ path: '.env' });

// 2º, se for testes, carrega .env.test por cima (override)
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test', override: true });
}

// Seleciona o DB pelo ambiente
const DB_NAME =
  process.env.NODE_ENV === 'test'
    ? (process.env.DB_NAME_TEST || process.env.DB_NAME)
    : process.env.DB_NAME;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
