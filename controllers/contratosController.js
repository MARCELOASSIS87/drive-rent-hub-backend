const pool = require('../config/db');

exports.gerarContrato = async (req, res) => {
  const { aluguel_id, motorista_id, veiculo_id } = req.body;

  if (!aluguel_id || !motorista_id || !veiculo_id) {
    return res.status(400).json({
      error: 'aluguel_id, motorista_id e veiculo_id são obrigatórios'
    });
  }

  try {
    const [rowsAluguel] = await pool.query(
      'SELECT * FROM alugueis WHERE id = ?',
      [aluguel_id]
    );
    const [rowsMotorista] = await pool.query(
      'SELECT nome, cpf FROM motoristas WHERE id = ?',
      [motorista_id]
    );
    const [rowsVeiculo] = await pool.query(
      'SELECT marca, modelo, placa FROM veiculos WHERE id = ?',
      [veiculo_id]
    );

    const aluguel = rowsAluguel[0];
    const motorista = rowsMotorista[0];
    const veiculo = rowsVeiculo[0];

    if (!aluguel || !motorista || !veiculo) {
      return res.status(404).json({ error: 'Dados não encontrados' });
    }

    const contratoHtml = `
      <h1>Contrato de Locação de Veículo</h1>
      <p>Motorista: ${motorista.nome} - CPF: ${motorista.cpf}</p>
      <p>Veículo: ${veiculo.marca} ${veiculo.modelo} - Placa: ${veiculo.placa}</p>
      <p>Período: ${aluguel.data_inicio} a ${aluguel.data_fim}</p>
      <p>Valor: ${aluguel.valor_total || ''}</p>
    `;

    const [result] = await pool.query(
      `INSERT INTO contratos (aluguel_id, motorista_id, veiculo_id, html_contrato, status)
       VALUES (?, ?, ?, ?, 'aguardando_assinatura')`,
      [aluguel_id, motorista_id, veiculo_id, contratoHtml]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar contrato', detalhes: err.message });
  }
};