const pool = require('../config/db');
const allowedStatuses = ['disponivel', 'em uso', 'manutencao'];

// Listar todos os veículos (ativos)
exports.listarVeiculos = async (req, res) => {
  try {
    const [veiculos] = await pool.query(
      'SELECT * FROM veiculos WHERE ativo = 1'
    );
    const normalizados = veiculos.map(v => ({
      ...v,
      valor_diaria: v.valor_diaria ? parseFloat(v.valor_diaria) : null
    }));
    res.json(normalizados);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar veículos', detalhes: err.message });
  }
};
// Listar veículos do proprietário autenticado
exports.listarMeusVeiculos = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  if (req.user.role !== 'proprietario') {
    return res.status(403).json({ error: 'Apenas proprietários' });
  }
  try {
    const [veiculos] = await pool.query(
      'SELECT * FROM veiculos WHERE ativo = 1 AND proprietario_id = ? ORDER BY id DESC',
      [req.user.id]
    );
    const normalizados = veiculos.map(v => ({
      ...v,
      valor_diaria: v.valor_diaria ? parseFloat(v.valor_diaria) : null
    }));
    res.json(normalizados);
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Erro ao listar seus veículos', detalhes: err.message });
  }
};
// Obter um veículo por ID
exports.obterVeiculo = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM veiculos WHERE id = ? AND ativo = 1',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar veículo', detalhes: err.message });
  }
};

// Criar novo veículo
exports.criarVeiculo = async (req, res) => {
  console.log('CONTEÚDO DE REQ.BODY:', req.body);
  console.log('CONTEÚDO DE REQ.FILES:', req.files);
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  if (req.user.role !== 'proprietario') {
    return res
      .status(403)
      .json({ error: 'Apenas proprietários podem cadastrar veículos' });
  }
  const proprietarioId = req.user.id;
  const {
    marca,
    modelo,
    ano,
    placa,
    renavam,
    cor,
    numero_seguro,
    manutencao_proxima_data,
    valor_diaria
  } = req.body;
  const status = req.body.status || 'disponivel';
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  const valorDiariaNumber = parseFloat(valor_diaria);
  if (isNaN(valorDiariaNumber) || valorDiariaNumber < 0) {
    return res
      .status(400)
      .json({ error: 'valor_diaria deve ser um número não negativo' });
  }
  let foto_principal_url = null;
  let fotos_urls = null;

  if (req.files && req.files.foto_principal) {
    foto_principal_url = `/uploads/veiculos/${req.files.foto_principal[0].filename}`;
  }
  if (req.files && req.files.fotos) {
    fotos_urls = req.files.fotos
      .map(f => `/uploads/veiculos/${f.filename}`)
      .join(',');
  }

  if (!marca || !modelo || !ano) {
    return res
      .status(400)
      .json({ error: 'Marca, modelo, ano são obrigatórios.' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO veiculos (marca, modelo, ano, placa, renavam, cor, numero_seguro, status, manutencao_proxima_data, valor_diaria, foto_principal_url, fotos_urls, proprietario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        marca,
        modelo,
        ano,
        placa,
        renavam,
        cor,
        numero_seguro,
        status,
        manutencao_proxima_data,
        valorDiariaNumber,
        foto_principal_url,
        fotos_urls,
        proprietarioId
      ]
    );
    res.status(201).json({
      id: result.insertId,
      marca,
      modelo,
      ano,
      placa,
      renavam,
      cor,
      numero_seguro,
      status,
      manutencao_proxima_data,
      valor_diaria: valorDiariaNumber,
      foto_principal_url,
      fotos_urls,
      proprietario_id: proprietarioId
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar veículo', detalhes: err.message });
  }
};

// Atualizar veículo existente
exports.editarVeiculo = async (req, res) => {
  const { id } = req.params;
  const {
    marca,
    modelo,
    ano,
    placa,
    renavam,
    cor,
    numero_seguro,
    manutencao_proxima_data,
    valor_diaria
  } = req.body;
  const status = req.body.status || 'disponivel';
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  const valorDiariaNumber = parseFloat(valor_diaria);
  if (isNaN(valorDiariaNumber) || valorDiariaNumber < 0) {
    return res
      .status(400)
      .json({ error: 'valor_diaria deve ser um número não negativo' });
  }
  let foto_principal_url;
  let fotos_urls;

  if (req.files && req.files.foto_principal) {
    foto_principal_url = `/uploads/veiculos/${req.files.foto_principal[0].filename}`;
  }
  if (req.files && req.files.fotos) {
    fotos_urls = req.files.fotos
      .map(f => `/uploads/veiculos/${f.filename}`)
      .join(',');
  }

  if (!marca || !modelo || !ano) {
    return res.status(400).json({ error: 'Marca, modelo e ano são obrigatórios.' });
  }

  try {
    let query =
      'UPDATE veiculos SET marca = ?, modelo = ?, ano = ?, placa = ?, renavam = ?, cor = ?, numero_seguro = ?, status = ?, manutencao_proxima_data = ?, valor_diaria = ?';
    const params = [
      marca,
      modelo,
      ano,
      placa,
      renavam,
      cor,
      numero_seguro,
      status,
      manutencao_proxima_data,
      valorDiariaNumber
    ];

    if (foto_principal_url) {
      query += ', foto_principal_url = ?';
      params.push(foto_principal_url);
    }
    if (fotos_urls) {
      query += ', fotos_urls = ?';
      params.push(fotos_urls);
    }
    if (req.user.role === 'proprietario') {
      const [rows] = await pool.query(
        'SELECT proprietario_id FROM veiculos WHERE id = ?',
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Veículo não encontrado' });
      }
      const proprietarioId = rows[0].proprietario_id;
      if (proprietarioId === null) {
        return res.status(403).json({ error: 'Somente admin pode editar' });
      }
      if (proprietarioId !== req.user.id) {
        return res.status(403).json({ error: 'Não autorizado' });
      }
      query += ' WHERE id = ? AND proprietario_id = ?';
      params.push(id, req.user.id);
    } else if (req.admin && ['comum', 'super'].includes(req.admin.role)) {
      query += ' WHERE id = ?';
      params.push(id);
    } else {
      return res.status(403).json({ error: 'Apenas proprietários ou admins' });
    }

    const [result] = await pool.query(query, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }
    res.json({
      id,
      marca,
      modelo,
      ano,
      placa,
      renavam,
      cor,
      numero_seguro,
      status,
      manutencao_proxima_data,
      valor_diaria: valorDiariaNumber,
      foto_principal_url,
      fotos_urls
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao editar veículo', detalhes: err.message });
  }
};

// Excluir (soft delete) veículo
exports.excluirVeiculo = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const { id } = req.params;
  try {
    if (req.user.role === 'proprietario') {
      const [rows] = await pool.query(
        'SELECT proprietario_id FROM veiculos WHERE id = ?',
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Veículo não encontrado' });
      }
      const proprietarioId = rows[0].proprietario_id;
      if (proprietarioId === null) {
        return res.status(403).json({ error: 'Somente admin pode excluir' });
      }
      if (proprietarioId !== req.user.id) {
        return res.status(403).json({ error: 'Não autorizado' });
      }
      const [result] = await pool.query(
        'UPDATE veiculos SET ativo = 0 WHERE id = ? AND proprietario_id = ?',
        [id, req.user.id]
      );
      if (result.affectedRows === 0) {
        return res.status(403).json({ error: 'Não autorizado' });
      }
    } else if (req.admin && ['comum', 'super'].includes(req.admin.role)) {
      const [result] = await pool.query(
        'UPDATE veiculos SET ativo = 0 WHERE id = ?',
        [id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Veículo não encontrado' });
      }
    } else {
      return res.status(403).json({ error: 'Apenas proprietários ou admins' });
    }
    res.json({ message: 'Veículo removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir veículo', detalhes: err.message });
  }
};
// Atualizar status do veículo
exports.atualizarStatus = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const { id } = req.params;
  const { status } = req.body;
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  try {
    if (req.user.role === 'proprietario') {
      const [rows] = await pool.query(
        'SELECT proprietario_id FROM veiculos WHERE id = ?',
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Veículo não encontrado' });
      }
      const proprietarioId = rows[0].proprietario_id;
      if (proprietarioId === null) {
        return res.status(403).json({ error: 'Somente admin pode alterar' });
      }
      if (proprietarioId !== req.user.id) {
        return res.status(403).json({ error: 'Não autorizado' });
      }
      const [result] = await pool.query(
        'UPDATE veiculos SET status = ? WHERE id = ? AND proprietario_id = ?',
        [status, id, req.user.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Veículo não encontrado' });
      }
    } else if (req.admin && ['comum', 'super'].includes(req.admin.role)) {
      const [result] = await pool.query(
        'UPDATE veiculos SET status = ? WHERE id = ?',
        [status, id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Veículo não encontrado' });
      }
    } else {
      return res.status(403).json({ error: 'Apenas proprietários ou admins' });
    }
    res.json({ message: 'Status atualizado com sucesso' });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'Erro ao atualizar status', detalhes: err.message });
  }
};