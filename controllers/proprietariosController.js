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
    const senha_hash = await bcrypt.hash(senha, 10);

    const [result] = await pool.query(
      `INSERT INTO proprietarios (nome, email, telefone, cpf_cnpj, senha_hash, status)
       VALUES (?, ?, ?, ?, ?, 'pendente')`,
      [nome, email, telefone, cpf_cnpj, senha_hash]
    );

    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Erro ao criar proprietário:', err.message);
    return res.status(500).json({ error: 'Erro ao criar proprietário', detalhes: err.message });
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

module.exports = {
  criarProprietario,
  loginProprietario,
};

