const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET

exports.criarMotorista = async (req, res) => {
  if (process.env.NODE_ENV !== 'test') console.log('req.body:', req.body);
  if (process.env.NODE_ENV !== 'test') console.log('req.files:', req.files);
  const { senha, password, cnh_categoria, nome, email } = req.body;
  const senhaEntrada = senha || password;
  if (!nome || !email || !cnh_categoria || cnh_categoria.length < 1 || cnh_categoria.length > 2 || !senhaEntrada) {
    console.warn('Campos obrigatórios ausentes');
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }
  const {
    telefone,
    cpf,
    data_nascimento,
    cnh_numero,
    cnh_validade,
    cnh_data_emissao
  } = req.body;
  try {
    const foto_cnh_url = req.files?.foto_cnh ? `/uploads/motoristas/${req.files.foto_cnh[0].filename}` : null;
    const foto_perfil_url = req.files?.foto_perfil ? `/uploads/motoristas/${req.files.foto_perfil[0].filename}` : null;
    const selfie_cnh_url = req.files?.selfie_cnh ? `/uploads/motoristas/${req.files.selfie_cnh[0].filename}` : null;
    const comprovante_endereco_url = req.files?.comprovante_endereco ? `/uploads/motoristas/${req.files.comprovante_endereco[0].filename}` : null;
    const documento_vinculo_url = req.files?.documento_vinculo ? `/uploads/motoristas/${req.files.documento_vinculo[0].filename}` : null;
    const antecedentes_criminais_url = req.files?.antecedentes_criminais ? `/uploads/motoristas/${req.files.antecedentes_criminais[0].filename}` : null;
    const senha_hash = await bcrypt.hash(senhaEntrada, 10);
    // normaliza e-mail
    const emailNorm = String(email).trim().toLowerCase();

    // impede e-mail já usado por PROPRIETÁRIO
    const [rowsOwner] = await pool.query(
      "SELECT id FROM proprietarios WHERE email = ? LIMIT 1",
      [emailNorm]
    );
    if (rowsOwner.length) {
      return res.status(409).json({
        error: "E-mail já cadastrado como proprietário. Use outro e-mail."
      });
    }

    const [result] = await pool.query(
      `INSERT INTO motoristas (
          nome, email, telefone, cpf, data_nascimento,
          cnh_numero, cnh_validade, cnh_data_emissao, cnh_categoria,
          senha_hash, cnh_foto_url, foto_perfil_url, selfie_cnh_url,
          comprovante_endereco_url, comprovante_vinculo_url,
          antecedentes_criminais_url,
          status
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_analise')`,
      [
        nome,
        emailNorm,
        telefone,
        cpf,
        data_nascimento,
        cnh_numero,
        cnh_validade,
        cnh_data_emissao,
        cnh_categoria,
        senha_hash,
        foto_cnh_url,
        foto_perfil_url,
        selfie_cnh_url,
        comprovante_endereco_url,
        documento_vinculo_url,
        antecedentes_criminais_url
      ]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      console.warn('DUPLICIDADE AO CADASTRAR MOTORISTA:', err.message);
      return res.status(409).json({ error: 'Email ou CPF já cadastrado' });
    }
    console.error('ERRO AO CADASTRAR MOTORISTA:', err.message);
    return res.status(500).json({ error: 'Erro ao cadastrar motorista', detalhes: err.message });
  }
};
exports.loginMotorista = async (req, res) => {
  const { email, senha, password } = req.body;
  const senhaEntrada = senha || password;

  if (!senhaEntrada) {
    return res.status(400).json({ error: 'Senha não fornecida' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM motoristas WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email não encontrado' });
    }

    const motorista = rows[0];
    const senhaValida = await bcrypt.compare(senhaEntrada, motorista.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    if (motorista.status !== 'aprovado') {
      return res.status(403).json({ error: 'Cadastro ainda não aprovado' });
    }

    // Aqui pode gerar JWT futuramente, por enquanto retorna dados básicos
    const token = jwt.sign(
      { id: motorista.id, email: motorista.email, role: 'motorista' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      token,
      motorista: {
        id: motorista.id,
        nome: motorista.nome,
        email: motorista.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro no login', detalhes: err.message });
  }
};
exports.listarMotoristas = async (req, res) => {
  const { status } = req.query;
  try {
    let query = `SELECT
         id, nome, email, telefone, cpf,
         data_nascimento, cnh_numero, cnh_validade, cnh_data_emissao,
         cnh_categoria,
         cnh_foto_url, foto_perfil_url, selfie_cnh_url,
         comprovante_endereco_url, comprovante_vinculo_url, antecedentes_criminais_url,
         status
       FROM motoristas`;
    const params = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar motoristas' });
  }
};
exports.atualizarStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!req.admin || !['comum', 'super'].includes(req.admin.role)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  if (!['aprovado', 'recusado', 'bloqueado', 'em_analise'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  try {
    await pool.query('UPDATE motoristas SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: 'Status atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
};
exports.bloquearMotorista = (req, res) => {
  req.body.status = 'bloqueado';
  return exports.atualizarStatus(req, res);
};

exports.desbloquearMotorista = (req, res) => {
  req.body.status = 'aprovado';
  return exports.atualizarStatus(req, res);
};