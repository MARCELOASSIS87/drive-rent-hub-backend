require('dotenv').config();
const app = require('./app');
const pool = require('./config/db'); // importa a pool de conexão do banco

const PORT = process.env.PORT || 3001;

// Exporta o app para o supertest
module.exports = app;

// Em testes (NODE_ENV==='test'), NÃO sobe o servidor.
// Só conecta e dá listen se for execução direta e não for ambiente de teste.
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  (async () => {
    try {
      await pool.getConnection(); // faz um teste de conexão
      console.log('Conectado ao banco MySQL!');
      app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
      });
    } catch (err) {
      console.error('Erro ao conectar no banco de dados:', err.message);
      process.exit(1);
    }
  })();
}