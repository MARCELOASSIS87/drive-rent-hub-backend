const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const criarProprietario = async (req, res) => {
  const { nome, email, telefone, cpf_cnpj, senha } = req.body;

  if (!nome || !email || !cpf_cnpj || !senha) {
    return res.status(400).json({ error: 'nome, email, cpf_cnpj e senha são obrigatórios' });
  }

  try {
    // normalizar o e-mail pra evitar duplicidade com maiúsculas/minúsculas
    const emailNorm = String(email).trim().toLowerCase();

    // 1) checar em motoristas
    const [rows] = await pool.query(
      "SELECT id FROM motoristas WHERE email = ? LIMIT 1",
      [emailNorm]
    );
    if (rows.length) {
      return res.status(409).json({ error: "E-mail já cadastrado como motorista" });
    }
    // 2) hash e insert (já aprovando)
    const senhaHash = await bcrypt.hash(senha, 10);

    const [result] = await pool.query(
      `INSERT INTO proprietarios (nome, email, telefone, cpf_cnpj, senha_hash, status)
        VALUES (?, ?, ?, ?, ?, 'aprovado')`,
      [nome, emailNorm, telefone || null, cpf_cnpj, senhaHash]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "E-mail ou CPF/CNPJ já cadastrado como proprietário" });
    }
    console.error("[proprietarios] erro:", err);
    return res.status(500).json({ error: "Erro ao criar proprietário" });
  }


};

const loginProprietario = async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM proprietarios WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email não encontrado' });
    }

    const proprietario = rows[0];
    const senhaValida = await bcrypt.compare(senha, proprietario.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    if (proprietario.status !== 'aprovado') {
      return res.status(403).json({ error: 'Cadastro ainda não aprovado' });
    }

    const token = jwt.sign(
      { id: proprietario.id, email: proprietario.email, role: 'proprietario' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      proprietario: {
        id: proprietario.id,
        nome: proprietario.nome,
        email: proprietario.email,
      },
    });
  } catch (err) {
    console.error('Erro no login do proprietário:', err.message);
    return res.status(500).json({ error: 'Erro no login', detalhes: err.message });
  }
};
// KPIs do proprietário: veículos alugados, aluguéis ativos, solicitações pendentes
async function getOwnerStats(req, res) {
  try {
    // tenta pegar do middleware de auth (req.user.id); se não tiver, tenta Bearer token
    let ownerId = req.user?.id;
    if (!ownerId) {
      const auth = req.headers.authorization;
      const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded?.role === "proprietario") ownerId = decoded.id;
        } catch (_) { }
      }
    }
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    // 1) Veículos do owner com status 'alugado'
    const [rowsVeiculosAlugados] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM veiculos v
       WHERE v.proprietario_id = ?
         AND v.status = 'alugado'`,
      [ownerId]
    );

    // 2) Aluguéis ativos (em uso) dos veículos do owner
    const [rowsAlugueisAtivos] = await pool.query(
      `SELECT COUNT(a.id) AS total
       FROM alugueis a
       JOIN veiculos v ON v.id = a.veiculo_id
       WHERE v.proprietario_id = ?
         AND a.status IN ('em_uso')`,
      [ownerId]
    );

    // 3) Solicitações pendentes para veículos do owner
    const [rowsSolicPend] = await pool.query(
      `SELECT COUNT(s.id) AS total
       FROM solicitacoes_aluguel s
       JOIN veiculos v ON v.id = s.veiculo_id
       WHERE v.proprietario_id = ?
         AND s.status = 'pendente'`,
      [ownerId]
    );

    return res.json({
      veiculosAlugados: rowsVeiculosAlugados[0]?.total ?? 0,
      alugueisAtivos: rowsAlugueisAtivos[0]?.total ?? 0,
      solicitacoesPendentes: rowsSolicPend[0]?.total ?? 0,
    });
  } catch (err) {
    console.error("[proprietariosController.getOwnerStats] error:", err);
    return res
      .status(500)
      .json({ error: "Erro ao calcular estatísticas do proprietário" });
  }
}

module.exports = {
  criarProprietario,
  loginProprietario,
  getOwnerStats,
};