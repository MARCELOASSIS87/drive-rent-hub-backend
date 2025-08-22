function buildContractSnapshot({ solicitacao, aluguel, veiculo, proprietario, motorista, detalhes }) {
  const inicio = new Date(solicitacao.data_inicio);
  const fim = new Date(solicitacao.data_fim);
  const dias = Math.max(1, Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)));
  const valor_total = dias * detalhes.valor_por_dia;
  return {
    aluguel: {
      id: aluguel.id,
      data_inicio: solicitacao.data_inicio,
      data_fim: solicitacao.data_fim,
      dias,
      valor_total,
      local_retirada: detalhes.local_retirada,
      local_devolucao: detalhes.local_devolucao,
    },
    locador: proprietario,
    veiculo: {
      id: veiculo.id,
      ano: veiculo.ano,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      placa: veiculo.placa,
      renavam: veiculo.renavam,
    },
    motorista,
    pagamento: {
      forma: detalhes.forma_pagamento,
      valor_por_dia: detalhes.valor_por_dia,
    },
  };
}

function generateContractHtml({ locador, motorista, veiculo, aluguel, pagamento }) {
  return `
    <h1>CONTRATO DE LOCAÇÃO DE AUTOMÓVEL POR PRAZO DETERMINADO</h1>

    <h2>IDENTIFICAÇÃO DAS PARTES CONTRATANTES</h2>
    <p><strong>LOCADOR:</strong> ${locador.nome}, ${locador.nacionalidade}, ${locador.estado_civil}, ${locador.profissao}, portador do CPF nº ${locador.cpf} e RG nº ${locador.rg}, residente à ${locador.endereco}.</p>
    <p><strong>LOCATÁRIO:</strong> ${motorista.nome}, ${motorista.nacionalidade || '[nacionalidade]'}, ${motorista.estado_civil || '[estado civil]'}, ${motorista.profissao || '[profissão]'}, portador do CPF nº ${motorista.cpf} e RG nº ${motorista.rg || '[rg]'}, residente à ${motorista.endereco || '[endereço]'}.</p>

    <h2>CLÁUSULA 1ª – DO OBJETO</h2>
    <p>O presente contrato tem por objeto a locação do veículo marca/modelo: ${veiculo.marca}/${veiculo.modelo}, placa: ${veiculo.placa}, RENAVAM: ${veiculo.renavam || '[renavam]'}, ano/modelo: ${veiculo.ano}/${veiculo.ano || '[modelo]'}, pertencente ao LOCADOR.</p>

    <h2>CLÁUSULA 2ª – DO USO</h2>
    <p>O veículo será utilizado exclusivamente pelo LOCATÁRIO, sendo vedada sua cessão a terceiros, sublocação, uso para fins ilícitos ou não previstos neste contrato. O descumprimento acarretará rescisão imediata e multa.</p>

    <h2>CLÁUSULA 3ª – DA DEVOLUÇÃO</h2>
    <p>O LOCATÁRIO se compromete a devolver o veículo nas mesmas condições de uso e conservação, conforme laudo de vistoria anexo, respondendo por eventuais danos.</p>

    <h2>CLÁUSULA 4ª – DO PRAZO</h2>
    <p>O presente contrato terá duração de ${aluguel.dias} dias, com início em ${new Date(aluguel.data_inicio).toLocaleDateString('pt-BR')} e término em ${new Date(aluguel.data_fim).toLocaleDateString('pt-BR')}, podendo ser renovado mediante acordo escrito.</p>
    <h2>RETIRADA E DEVOLUÇÃO</h2>
    <p>Retirada: ${aluguel.local_retirada || '[definir]'}</p>
    <p>Devolução: ${aluguel.local_devolucao || '[definir]'}</p>

    <h2>CLÁUSULA 5ª – DA PRORROGAÇÃO OU ATRASO</h2>
    <p>Caso o LOCATÁRIO não devolva na data estipulada, continuará responsável pelo pagamento proporcional do aluguel e por eventuais danos.</p>

    <h2>CLÁUSULA 6ª – DA RESCISÃO</h2>
    <p>Qualquer das partes pode rescindir mediante notificação prévia de 10 dias. Em caso de inadimplemento, a rescisão poderá ocorrer imediata.</p>

    <h2>CLÁUSULA 7ª – DA MULTA</h2>
    <p>O descumprimento acarretará multa de R$ 1.600,00 (mil e seiscentos reais).</p>

    <h2>CLÁUSULA 8ª – DO PAGAMENTO</h2>
    <p>O valor da locação é de ${pagamento.valor_por_dia || '[valor]'} por dia, pago via ${pagamento.forma}</p>
   
    <p>Em caso de atraso, multa de 2% e juros de 1% ao mês, pro rata die.</p>

    <h2>CLÁUSULA 9ª – DAS MULTAS E INFRAÇÕES</h2>
    <p>O LOCATÁRIO é responsável por multas e infrações, devendo indicar o condutor no prazo legal.</p>

    <h2>CLÁUSULA 10 – DOS ENCARGOS</h2>
    <p>Todos os encargos (IPVA, DPVAT, licenciamento, seguro) são de responsabilidade do LOCADOR.</p>

    <h2>CLÁUSULA 11 – DAS CONDIÇÕES DE USO</h2>
    <ul>
      <li>Manter o veículo em boas condições;</li>
      <li>Comunicar avarias;</li>
      <li>Arcar com custos de manutenção por mau uso;</li>
      <li>Zelar pelos itens obrigatórios (macaco, estepe, triângulo).</li>
    </ul>

    <h2>CLÁUSULA 12 – DO SEGURO</h2>
    <p>O veículo está segurado contra furto, roubo e colisão. Em caso de sinistro por culpa do LOCATÁRIO, este arcará com a franquia.</p>

    <h2>CLÁUSULA 13 – DO FORO</h2>
    <p>Fica eleito o foro da comarca de ${locador.endereco.split(',').slice(-2).join(', ')}.</p>

    <p>______________________________<br/>
    <strong>LOCADOR</strong><br/>
    ${locador.nome} – CPF: ${locador.cpf}</p>

    <p>______________________________<br/>
    <strong>LOCATÁRIO</strong><br/>
    ${motorista.nome} – CPF: ${motorista.cpf}</p>

    <p>______________________________<br/>
    <strong>TESTEMUNHA</strong><br/>
    Nome: __________________ – CPF: ________________</p>
  `;
};
module.exports = { buildContractSnapshot, generateContractHtml };