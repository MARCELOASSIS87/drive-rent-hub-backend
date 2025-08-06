const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
exports.login = async (req, res) => {
  const { email, senha, password } = req.body;
  const senhaEntrada = senha || password;

  if (!senhaEntrada) {
    return res.status(400).json({ error: 'Senha não fornecida' });
  }

  try {
    // 1. Tenta como admin
    const [admins] = await pool.query(
      'SELECT * FROM admins WHERE email = ? LIMIT 1',
      [email]
    );

    if (admins.length > 0) {
      const admin = admins[0];
       // Alguns bancos podem armazenar a senha no campo `senha` ao invés de `senha_hash`.
      // Fazemos o fallback para evitar que o login quebre caso o nome da coluna seja diferente.
      const hash = admin.senha_hash || admin.senha;
      if (!hash) {
        return res
          .status(500)
          .json({ error: 'Senha não configurada para este usuário' });
      }

      const senhaOk = await bcrypt.compare(senhaEntrada, hash);
      if (!senhaOk) return res.status(401).json({ error: 'Senha incorreta' });

      const token = jwt.sign(
        { id: admin.id, nome: admin.nome, email: admin.email, role: admin.role },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      return res.json({ token, nome: admin.nome, role: admin.role });
    }

    // 2. Tenta como motorista
    const [motoristas] = await pool.query(
      'SELECT * FROM motoristas WHERE email = ? LIMIT 1',
      [email]
    );

    if (motoristas.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const motorista = motoristas[0];
    const senhaOk = await bcrypt.compare(senhaEntrada, motorista.senha_hash);
    if (!senhaOk) return res.status(401).json({ error: 'Senha incorreta' });

    if (motorista.status !== 'aprovado') {
      return res.status(403).json({ error: 'Cadastro ainda não aprovado' });
    }

    const token = jwt.sign(
      { id: motorista.id, nome: motorista.nome, email: motorista.email, role: 'motorista' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.json({ token, nome: motorista.nome, role: 'motorista' });

  } catch (err) {
    return res.status(500).json({ error: 'Erro ao fazer login', detalhes: err.message });
  }
};
