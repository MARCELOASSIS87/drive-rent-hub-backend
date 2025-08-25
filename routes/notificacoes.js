const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const pool = require('../config/db');

router.get('/contador', auth, async (req, res) => {
  try {
    const { id, role } = req.user || {};
    let solicitacoesCount = 0;
    let contratosCount = 0;

    if (role === 'motorista') {
      const [solRows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM solicitacoes_aluguel
         WHERE motorista_id = ? AND visto_por_motorista = 0`,
        [id]
      );
      const [contRows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM contratos
         WHERE motorista_id = ? AND visto_por_motorista = 0`,
        [id]
      );
      solicitacoesCount = solRows[0]?.cnt || 0;
      contratosCount = contRows[0]?.cnt || 0;
    } else if (role === 'proprietario' || role === 'admin') {
      const [solRows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM solicitacoes_aluguel s
         JOIN veiculos v ON v.id = s.veiculo_id
         WHERE v.proprietario_id = ? AND s.visto_por_proprietario = 0`,
        [id]
      );
      const [contRows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM contratos c
         JOIN veiculos v ON v.id = c.veiculo_id
         WHERE v.proprietario_id = ? AND c.visto_por_proprietario = 0`,
        [id]
      );
      solicitacoesCount = solRows[0]?.cnt || 0;
      contratosCount = contRows[0]?.cnt || 0;
    }

    return res.json({ total_nao_lidas: solicitacoesCount + contratosCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;