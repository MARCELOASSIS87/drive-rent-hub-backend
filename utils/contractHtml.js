function generateContractHtml({ locador = {}, motorista = {}, veiculo = {}, aluguel = {}, pagamento = {} }) {
  return `
    <h1>Contrato de Locação de Veículo</h1>
    <h2>Identificação das Partes</h2>
    <p><strong>Locador:</strong> ${locador.nome || ''}</p>
    <p><strong>Locatário:</strong> ${motorista.nome || ''} - CPF: ${motorista.cpf || ''}</p>
    <h2>Veículo</h2>
    <p>${veiculo.marca || ''} ${veiculo.modelo || ''} - Placa ${veiculo.placa || ''}</p>
    <h2>Período</h2>
    <p>${aluguel.data_inicio || ''} a ${aluguel.data_fim || ''}</p>
    <h2>Valor</h2>
    <p>R$ ${aluguel.valor_total || ''}</p>
    <h2>Pagamento</h2>
    <p>Banco: ${pagamento.banco || ''} Agência: ${pagamento.agencia || ''} Conta: ${pagamento.conta || ''} Pix: ${pagamento.chave_pix || ''}</p>
  `;
}

module.exports = generateContractHtml;
