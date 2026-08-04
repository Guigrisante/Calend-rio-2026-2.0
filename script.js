"use strict";

const DB_NAME = "controle-vendas-offline";
const STORE = "vendas";
const DB_VERSION = 1;
let db;
let vendas = [];
let filtradas = [];
let vendaEmEdicao = null;

const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
  ligarEventos();
  $("taxaComissao").value = localStorage.getItem("taxaComissaoInstaladas") || "10";
  try {
    db = await abrirBanco();
    vendas = await lerTodas();
    popularFiltros();
    atualizarTela();
  } catch (erro) {
    console.error(erro);
    toast("Não foi possível abrir o banco offline.", true);
  }
}

function ligarEventos() {
  $("btnImportar").onclick = () => $("arquivoCsv").click();
  $("btnImportarTopo").onclick = () => $("arquivoCsv").click();
  $("arquivoCsv").onchange = importarArquivo;
  ["filtroMes", "filtroVendedor"].forEach(id => $(id).onchange = atualizarTela);
  $("busca").oninput = atualizarTela;
  $("taxaComissao").oninput = () => {
    localStorage.setItem("taxaComissaoInstaladas", $("taxaComissao").value);
    atualizarTela();
  };
  $("btnLimpar").onclick = () => {
    $("filtroMes").value = "todos";
    $("filtroVendedor").value = "todos";
    $("busca").value = "";
    atualizarTela();
  };
  $("btnExportar").onclick = exportarPeriodo;
  $("listaVendas").onclick = evento => {
    const botaoValor = evento.target.closest("[data-editar-valor]");
    const botaoTaxa = evento.target.closest("[data-editar-taxa]");
    if (botaoValor) abrirEdicaoValor(botaoValor.dataset.editarValor);
    if (botaoTaxa) abrirEdicaoTaxa(botaoTaxa.dataset.editarTaxa);
  };
  $("fecharModal").onclick = fecharEdicaoValor;
  $("salvarValor").onclick = salvarValorManual;
  $("restaurarValor").onclick = restaurarValorCalculado;
  $("modalValor").onclick = evento => { if (evento.target === $("modalValor")) fecharEdicaoValor(); };
  $("fecharModalTaxa").onclick = fecharEdicaoTaxa;
  $("salvarTaxa").onclick = salvarTaxaManual;
  $("restaurarTaxa").onclick = restaurarTaxaGeral;
  $("modalTaxa").onclick = evento => { if (evento.target === $("modalTaxa")) fecharEdicaoTaxa(); };
}

function abrirBanco() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const banco = e.target.result;
      const store = banco.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("dataISO", "dataISO");
      store.createIndex("vendedor", "vendedor");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function lerTodas() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.dataISO.localeCompare(a.dataISO)));
    req.onerror = () => reject(req.error);
  });
}

function gravarTodas(registros, substituir) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    if (substituir) store.clear();
    registros.forEach(item => store.put(item));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function importarArquivo(evento) {
  const arquivo = evento.target.files[0];
  evento.target.value = "";
  if (!arquivo) return;
  try {
    const texto = await arquivo.text();
    const matriz = parseCSV(texto, ";");
    if (matriz.length < 2) throw new Error("O arquivo não contém registros.");
    const cabecalhos = matriz[0].map(limparCabecalho);
    const obrigatorios = ["VENDEDOR", "CLIENTE", "DATA DA PROPOSTA", "SITUAÇÃO"];
    const faltantes = obrigatorios.filter(c => !cabecalhos.includes(c));
    if (faltantes.length) throw new Error(`Colunas não encontradas: ${faltantes.join(", ")}`);

    const registros = matriz.slice(1).filter(linha => linha.some(Boolean)).map((linha, indice) => normalizarRegistro(cabecalhos, linha, indice));
    const validos = registros.filter(r => r.dataISO);
    if (!validos.length) throw new Error("Nenhuma venda com data válida foi encontrada.");
    const substituir = $("modoImportacao").value === "substituir";
    if (!substituir) {
      const atuais = new Map(vendas.map(v => [v.id, v]));
      validos.forEach(v => {
        const existente = atuais.get(v.id);
        if (existente && existente.baseManual !== null && existente.baseManual !== undefined) {
          v.baseManual = existente.baseManual;
          v.base = existente.baseManual;
        }
        if (existente && existente.taxaManual !== null && existente.taxaManual !== undefined) {
          v.taxaManual = existente.taxaManual;
        }
      });
    }
    await gravarTodas(validos, substituir);
    vendas = await lerTodas();
    localStorage.setItem("ultimaImportacao", JSON.stringify({ nome: arquivo.name, data: new Date().toISOString(), quantidade: validos.length }));
    popularFiltros();
    atualizarTela();
    toast(`${validos.length} venda(s) importada(s) com sucesso.`);
  } catch (erro) {
    console.error(erro);
    toast(erro.message || "Falha ao importar a planilha.", true);
  }
}

function parseCSV(texto, delimitador) {
  texto = texto.replace(/^\uFEFF/, "");
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i + 1];
    if (c === '"' && aspas && prox === '"') { campo += '"'; i++; }
    else if (c === '"') aspas = !aspas;
    else if (c === delimitador && !aspas) { linha.push(campo.trim()); campo = ""; }
    else if ((c === "\n" || c === "\r") && !aspas) {
      if (c === "\r" && prox === "\n") i++;
      linha.push(campo.trim());
      if (linha.some(v => v !== "")) linhas.push(linha);
      linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo.trim()); linhas.push(linha); }
  return linhas;
}

function limparCabecalho(valor) { return valor.replace(/^\uFEFF/, "").trim().toUpperCase(); }

function normalizarRegistro(cabecalhos, linha, indice) {
  const original = {};
  cabecalhos.forEach((nome, i) => original[nome] = linha[i] || "");
  const dataISO = dataParaISO(original["DATA DA PROPOSTA"] || original["DATA DO PREENCHIMENTO DO CONTRATO"]);
  const codigo = original["CÓDIGO"] || "";
  const contrato = original["CONTRATO"] || "";
  const id = contrato && contrato !== "-" ? `contrato:${contrato}` : codigo && codigo !== "-" ? `codigo:${codigo}` : `linha:${dataISO}:${indice}:${original["CLIENTE"]}`;
  const servicos = ["TV", "INTERNET", "FONE", "CELULAR"].filter(tipo => {
    const possui = original[`POSSUI ${tipo}`];
    return possui === "SIM" || (original[`PLANO ${tipo}`] && original[`PLANO ${tipo}`] !== "-");
  });
  const base = servicos.reduce((soma, tipo) => {
    const promocional = parseMoeda(original[`PREÇO ${tipo} PROMOCIONAL`]);
    const normal = parseMoeda(original[`PREÇO ${tipo}`]);
    return soma + (promocional > 0 ? promocional : normal);
  }, 0);
  return { id, dataISO, codigo, contrato, vendedor: original["VENDEDOR"] || "Não informado", cliente: original["CLIENTE"] || "Não informado", situacao: original["SITUAÇÃO"] || "Não informada", cidade: original["CIDADE"] || "", uf: original["UF"] || "", servicos, baseCalculada: arredondar(base), baseManual: null, taxaManual: null, base: arredondar(base), original };
}

function parseMoeda(valor) {
  if (!valor || valor === "-") return 0;
  let limpo = String(valor).replace(/R\$|\s/g, "");
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(limpo) || 0;
}

function dataParaISO(valor) {
  const match = String(valor || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}

function taxa() { return Math.max(0, Number($("taxaComissao").value) || 0); }
function taxaDaVenda(venda) { return venda.taxaManual !== null && venda.taxaManual !== undefined ? Number(venda.taxaManual) : taxa(); }
function comissao(venda) { return arredondar(venda.base * taxaDaVenda(venda) / 100); }
function arredondar(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function popularFiltros() {
  const valorMes = $("filtroMes").value;
  const meses = [...new Set(vendas.map(v => v.dataISO.slice(0, 7)))].filter(Boolean).sort().reverse();
  preencherSelect($("filtroMes"), meses, "Todos os meses", formatarMes, valorMes);
  const vendedores = [...new Set(vendas.map(v => v.vendedor))].sort(collator.compare);
  preencherSelect($("filtroVendedor"), vendedores, "Todos os vendedores", v => v, $("filtroVendedor").value);
}

function preencherSelect(select, valores, todos, formatar, anterior) {
  select.innerHTML = `<option value="todos">${todos}</option>`;
  valores.forEach(valor => select.add(new Option(formatar(valor), valor)));
  select.value = valores.includes(anterior) ? anterior : "todos";
}

function atualizarTela() {
  const mes = $("filtroMes").value;
  const vendedor = $("filtroVendedor").value;
  const termo = normalizarTexto($("busca").value);
  filtradas = vendas.filter(v =>
    normalizarTexto(v.situacao) === "instalada" &&
    (mes === "todos" || v.dataISO.startsWith(mes)) &&
    (vendedor === "todos" || v.vendedor === vendedor) &&
    (!termo || normalizarTexto(`${v.cliente} ${v.vendedor} ${v.contrato} ${v.codigo} ${v.cidade}`).includes(termo))
  );
  const total = filtradas.reduce((s, v) => s + v.base, 0);
  $("qtdVendas").textContent = filtradas.length.toLocaleString("pt-BR");
  $("valorVendido").textContent = money.format(total);
  $("valorComissao").textContent = money.format(filtradas.reduce((s, v) => s + comissao(v), 0));
  $("qtdVendedores").textContent = new Set(filtradas.map(v => v.vendedor)).size;
  const ajustesIndividuais = filtradas.filter(v => v.taxaManual !== null && v.taxaManual !== undefined).length;
  $("taxaLabel").textContent = ajustesIndividuais ? `Taxa geral ${formatarNumero(taxa())}% • ${ajustesIndividuais} ajuste(s)` : `Taxa de ${formatarNumero(taxa())}%`;
  $("periodoLabel").textContent = mes === "todos" ? (vendas.length ? "Base completa" : "Nenhum dado") : formatarMes(mes);
  $("contagemTabela").textContent = `${filtradas.length} registro(s) encontrado(s)`;
  atualizarStatusBase();
  renderTabela();
  renderRanking();
}

function renderTabela() {
  const corpo = $("listaVendas");
  if (!filtradas.length) { corpo.innerHTML = `<tr><td colspan="8" class="empty">Nenhuma venda encontrada para os filtros selecionados.</td></tr>`; return; }
  corpo.innerHTML = filtradas.map(v => `<tr>
    <td>${formatarData(v.dataISO)}</td>
    <td><strong>${esc(v.vendedor)}</strong><small>${esc(v.cliente)}</small></td>
    <td><strong>${esc(v.contrato || "-")}</strong><small>Cód. ${esc(v.codigo || "-")}</small></td>
    <td>${esc(v.servicos.join(" + ") || "-")}</td>
    <td><span class="pill ${normalizarTexto(v.situacao) === "instalada" ? "" : "other"}">${esc(v.situacao)}</span></td>
    <td class="right"><strong>${money.format(v.base)}</strong>${v.baseManual !== null && v.baseManual !== undefined ? '<small class="manual-tag">Valor manual</small>' : ''}</td>
    <td class="right"><strong>${money.format(comissao(v))}</strong><small>${formatarNumero(taxaDaVenda(v))}%${v.taxaManual !== null && v.taxaManual !== undefined ? ' • manual' : ''}</small></td>
    <td><div class="row-actions"><button class="edit-value" type="button" data-editar-valor="${esc(v.id)}">Editar valor</button><button class="edit-rate" type="button" data-editar-taxa="${esc(v.id)}">Editar %</button></div></td>
  </tr>`).join("");
}

function abrirEdicaoValor(id) {
  vendaEmEdicao = vendas.find(v => v.id === id);
  if (!vendaEmEdicao) return;
  const calculado = vendaEmEdicao.baseCalculada ?? vendaEmEdicao.base;
  $("vendaSelecionada").textContent = `${vendaEmEdicao.cliente} • Contrato ${vendaEmEdicao.contrato || "não informado"}`;
  $("novoValorVenda").value = Number(vendaEmEdicao.base).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $("valorCalculadoInfo").textContent = `Valor calculado pela planilha: ${money.format(calculado)}`;
  $("modalValor").showModal();
  $("novoValorVenda").focus();
  $("novoValorVenda").select();
}

function fecharEdicaoValor() {
  $("modalValor").close();
  vendaEmEdicao = null;
}

async function salvarValorManual() {
  if (!vendaEmEdicao) return;
  const valor = parseValorDigitado($("novoValorVenda").value);
  if (!Number.isFinite(valor) || valor < 0) return toast("Informe um valor válido.", true);
  vendaEmEdicao.baseManual = arredondar(valor);
  vendaEmEdicao.base = vendaEmEdicao.baseManual;
  await gravarVenda(vendaEmEdicao);
  fecharEdicaoValor();
  atualizarTela();
  toast("Valor da venda atualizado.");
}

async function restaurarValorCalculado() {
  if (!vendaEmEdicao) return;
  vendaEmEdicao.base = vendaEmEdicao.baseCalculada ?? vendaEmEdicao.base;
  vendaEmEdicao.baseManual = null;
  await gravarVenda(vendaEmEdicao);
  fecharEdicaoValor();
  atualizarTela();
  toast("Valor calculado pela planilha restaurado.");
}

function gravarVenda(venda) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(venda);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function parseValorDigitado(valor) {
  let limpo = String(valor || "").replace(/R\$|\s/g, "");
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

function abrirEdicaoTaxa(id) {
  vendaEmEdicao = vendas.find(v => v.id === id);
  if (!vendaEmEdicao) return;
  $("vendaTaxaSelecionada").textContent = `${vendaEmEdicao.cliente} • Contrato ${vendaEmEdicao.contrato || "não informado"}`;
  $("novaTaxaVenda").value = String(taxaDaVenda(vendaEmEdicao));
  $("taxaPadraoInfo").textContent = `Taxa geral atual: ${formatarNumero(taxa())}%`;
  $("modalTaxa").showModal();
  $("novaTaxaVenda").focus();
  $("novaTaxaVenda").select();
}

function fecharEdicaoTaxa() {
  $("modalTaxa").close();
  vendaEmEdicao = null;
}

async function salvarTaxaManual() {
  if (!vendaEmEdicao) return;
  const valor = Number(String($("novaTaxaVenda").value).replace(",", "."));
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) return toast("Informe uma porcentagem entre 0 e 100.", true);
  vendaEmEdicao.taxaManual = arredondar(valor);
  await gravarVenda(vendaEmEdicao);
  fecharEdicaoTaxa();
  atualizarTela();
  toast("Porcentagem individual atualizada.");
}

async function restaurarTaxaGeral() {
  if (!vendaEmEdicao) return;
  vendaEmEdicao.taxaManual = null;
  await gravarVenda(vendaEmEdicao);
  fecharEdicaoTaxa();
  atualizarTela();
  toast("A venda voltou a usar a taxa geral.");
}

function renderRanking() {
  const mapa = new Map();
  filtradas.forEach(v => {
    const item = mapa.get(v.vendedor) || { nome: v.vendedor, qtd: 0, base: 0, comissao: 0 };
    item.qtd++; item.base += v.base; item.comissao += comissao(v); mapa.set(v.vendedor, item);
  });
  const lista = [...mapa.values()].sort((a, b) => b.comissao - a.comissao);
  if (!lista.length) { $("ranking").innerHTML = `<div class="empty compact">Sem dados para exibir.</div>`; return; }
  const max = lista[0].comissao || 1;
  $("ranking").innerHTML = lista.map((r, i) => `<div class="rank-item"><div class="rank-top"><strong>${i + 1}. ${esc(r.nome)}</strong><span>${money.format(r.comissao)}</span></div><div class="rank-meta"><span>${r.qtd} venda(s)</span><span>${money.format(r.base)} em base</span></div><div class="bar"><i style="width:${Math.max(4, r.comissao / max * 100)}%"></i></div></div>`).join("");
}

function atualizarStatusBase() {
  const info = JSON.parse(localStorage.getItem("ultimaImportacao") || "null");
  if (!vendas.length) { $("statusBase").textContent = "Nenhuma planilha importada"; return; }
  const quando = info ? new Date(info.data).toLocaleString("pt-BR") : "anteriormente";
  $("statusBase").textContent = `${vendas.length} venda(s) armazenada(s) • última importação ${quando}`;
}

function exportarPeriodo() {
  const inicio = $("dataInicial").value;
  const fim = $("dataFinal").value;
  if (inicio && fim && inicio > fim) return toast("A data inicial deve ser anterior à data final.", true);
  const base = filtradas.filter(v => (!inicio || v.dataISO >= inicio) && (!fim || v.dataISO <= fim));
  if (!base.length) return toast("Não há vendas para exportar nesse período.", true);
  const xml = montarRelatorioExcel(base, inicio, fim);
  baixarArquivo(xml, `relatorio_comissoes_${inicio || "inicio"}_${fim || "fim"}.xls`, "application/vnd.ms-excel;charset=utf-8");
  toast(`Relatório profissional exportado com ${base.length} venda(s).`);
}

function montarRelatorioExcel(base, inicio, fim) {
  const totalVendido = base.reduce((s, v) => s + v.base, 0);
  const totalComissao = base.reduce((s, v) => s + comissao(v), 0);
  const vendedores = consolidarVendedores(base, totalVendido);
  const meses = consolidarMeses(base);
  const servicos = consolidarServicos(base);
  const combinacoes = consolidarCombinacoes(base);
  const datas = base.map(v => v.dataISO).sort();
  const periodoInicial = inicio || datas[0];
  const periodoFinal = fim || datas[datas.length - 1];
  const ticketMedio = totalVendido / base.length;
  const taxaEfetiva = totalVendido ? totalComissao / totalVendido : 0;
  const top = vendedores[0];
  const valoresManuais = base.filter(v => v.baseManual !== null && v.baseManual !== undefined).length;
  const taxasManuais = base.filter(v => v.taxaManual !== null && v.taxaManual !== undefined).length;

  const painel = [
    linhaExcel([celulaExcel("RELATÓRIO EXECUTIVO DE VENDAS E COMISSÕES", "String", "Title", 5)]),
    linhaExcel([celulaExcel(`Período: ${formatarData(periodoInicial)} a ${formatarData(periodoFinal)}  |  Gerado em: ${new Date().toLocaleString("pt-BR")}`, "String", "Subtitle", 5)]),
    linhaExcel([]),
    linhaExcel([celulaExcel("VENDAS", "String", "MetricLabel"), celulaExcel("VALOR VENDIDO", "String", "MetricLabel"), celulaExcel("COMISSÃO", "String", "MetricLabel"), celulaExcel("TICKET MÉDIO", "String", "MetricLabel"), celulaExcel("VENDEDORES", "String", "MetricLabel")], 24),
    linhaExcel([celulaExcel(base.length, "Number", "MetricInteger"), celulaExcel(totalVendido, "Number", "MetricCurrency"), celulaExcel(totalComissao, "Number", "MetricCurrency"), celulaExcel(ticketMedio, "Number", "MetricCurrency"), celulaExcel(vendedores.length, "Number", "MetricInteger")], 32),
    linhaExcel([]),
    linhaExcel([celulaExcel("INDICADORES EXECUTIVOS", "String", "Section", 5)]),
    linhaExcel([celulaExcel("Indicador", "String", "Header"), celulaExcel("Resultado", "String", "Header"), celulaExcel("Leitura gerencial", "String", "Header", 3)]),
    linhaExcel([celulaExcel("Taxa efetiva de comissão"), celulaExcel(taxaEfetiva, "Number", "Percent"), celulaExcel("Comissão total dividida pelo valor vendido", "String", "Text", 3)]),
    linhaExcel([celulaExcel("Comissão média por venda"), celulaExcel(totalComissao / base.length, "Number", "Currency"), celulaExcel("Média estimada por registro", "String", "Text", 3)]),
    linhaExcel([celulaExcel("Melhor vendedor"), celulaExcel(top ? top.nome : "-", "String", "Highlight"), celulaExcel(top ? `${top.qtd} venda(s) e ${money.format(top.comissao)} em comissão` : "-", "String", "Text", 3)]),
    linhaExcel([celulaExcel("Valores ajustados manualmente"), celulaExcel(valoresManuais, "Number", "Integer"), celulaExcel(`${formatarNumero(valoresManuais / base.length * 100)}% das vendas`, "String", "Text", 3)]),
    linhaExcel([celulaExcel("Taxas ajustadas manualmente"), celulaExcel(taxasManuais, "Number", "Integer"), celulaExcel(`${formatarNumero(taxasManuais / base.length * 100)}% das vendas`, "String", "Text", 3)]),
    linhaExcel([]),
    linhaExcel([celulaExcel("CONTEXTO DO RELATÓRIO", "String", "Section", 5)]),
    linhaExcel([celulaExcel("Filtro de vendedor"), celulaExcel($("filtroVendedor").value === "todos" ? "Todos os vendedores" : $("filtroVendedor").value, "String", "Text", 4)]),
    linhaExcel([celulaExcel("Filtro de mês"), celulaExcel($("filtroMes").value === "todos" ? "Todos os meses" : formatarMes($("filtroMes").value), "String", "Text", 4)]),
    linhaExcel([celulaExcel("Regra de situação"), celulaExcel("Somente vendas instaladas", "String", "Text", 4)]),
    linhaExcel([celulaExcel("Taxa geral configurada"), celulaExcel(taxa() / 100, "Number", "Percent"), celulaExcel("Ajustes individuais prevalecem sobre a taxa geral", "String", "Text", 3)])
  ];

  const vendedoresRows = [
    linhaExcel([celulaExcel("RANKING GERAL DE VENDEDORES", "String", "Title", 8)]),
    linhaExcel([celulaExcel(`Período: ${formatarData(periodoInicial)} a ${formatarData(periodoFinal)}`, "String", "Subtitle", 8)]), linhaExcel([]),
    linhaExcel(["POSIÇÃO", "VENDEDOR", "VENDAS", "VALOR VENDIDO", "PARTICIPAÇÃO", "TICKET MÉDIO", "TAXA EFETIVA", "COMISSÃO"].map(v => celulaExcel(v, "String", "Header")))
  ];
  vendedores.forEach((v, i) => vendedoresRows.push(linhaExcel([
    celulaExcel(i + 1, "Number", "Integer"), celulaExcel(v.nome), celulaExcel(v.qtd, "Number", "Integer"), celulaExcel(v.base, "Number", "Currency"),
    celulaExcel(v.participacao, "Number", "Percent"), celulaExcel(v.ticket, "Number", "Currency"), celulaExcel(v.taxaEfetiva, "Number", "Percent"), celulaExcel(v.comissao, "Number", "Currency")
  ])));
  vendedoresRows.push(linhaExcel([celulaExcel("TOTAL", "String", "Total", 2), celulaExcel(base.length, "Number", "TotalInteger"), celulaExcel(totalVendido, "Number", "TotalCurrency"), celulaExcel(1, "Number", "TotalPercent"), celulaExcel(ticketMedio, "Number", "TotalCurrency"), celulaExcel(taxaEfetiva, "Number", "TotalPercent"), celulaExcel(totalComissao, "Number", "TotalCurrency")]));

  const mesesRows = [
    linhaExcel([celulaExcel("EVOLUÇÃO MENSAL", "String", "Title", 7)]), linhaExcel([celulaExcel("Visão consolidada da performance ao longo do tempo", "String", "Subtitle", 7)]), linhaExcel([]),
    linhaExcel(["MÊS", "VENDAS", "VENDEDORES", "VALOR VENDIDO", "TICKET MÉDIO", "TAXA EFETIVA", "COMISSÃO"].map(v => celulaExcel(v, "String", "Header")))
  ];
  meses.forEach(m => mesesRows.push(linhaExcel([celulaExcel(formatarMes(m.mes)), celulaExcel(m.qtd, "Number", "Integer"), celulaExcel(m.vendedores, "Number", "Integer"), celulaExcel(m.base, "Number", "Currency"), celulaExcel(m.ticket, "Number", "Currency"), celulaExcel(m.taxaEfetiva, "Number", "Percent"), celulaExcel(m.comissao, "Number", "Currency")])));

  const servicosRows = [
    linhaExcel([celulaExcel("ANÁLISE DE SERVIÇOS", "String", "Title", 4)]), linhaExcel([celulaExcel("Quantidade e penetração dos serviços nas vendas", "String", "Subtitle", 4)]), linhaExcel([]),
    linhaExcel(["SERVIÇO", "VENDAS COM O SERVIÇO", "PARTICIPAÇÃO NAS VENDAS", "VALOR DAS VENDAS ASSOCIADAS"].map(v => celulaExcel(v, "String", "Header")))
  ];
  servicos.forEach(s => servicosRows.push(linhaExcel([celulaExcel(s.nome), celulaExcel(s.qtd, "Number", "Integer"), celulaExcel(s.qtd / base.length, "Number", "Percent"), celulaExcel(s.base, "Number", "Currency")])));
  servicosRows.push(linhaExcel([]), linhaExcel([celulaExcel("COMBINAÇÕES DE SERVIÇOS", "String", "Section", 4)]), linhaExcel(["COMBINAÇÃO", "VENDAS", "PARTICIPAÇÃO", "TICKET MÉDIO"].map(v => celulaExcel(v, "String", "Header"))));
  combinacoes.forEach(s => servicosRows.push(linhaExcel([celulaExcel(s.nome), celulaExcel(s.qtd, "Number", "Integer"), celulaExcel(s.qtd / base.length, "Number", "Percent"), celulaExcel(s.base / s.qtd, "Number", "Currency")])));

  const detalhesRows = [
    linhaExcel([celulaExcel("DETALHAMENTO DAS VENDAS", "String", "Title", 13)]),
    linhaExcel([celulaExcel(`${base.length} registro(s) | ${formatarData(periodoInicial)} a ${formatarData(periodoFinal)}`, "String", "Subtitle", 13)]), linhaExcel([]),
    linhaExcel(["DATA", "VENDEDOR", "CLIENTE", "CÓDIGO", "CONTRATO", "SITUAÇÃO", "SERVIÇOS", "CIDADE", "UF", "VALOR VENDIDO", "ORIGEM DO VALOR", "TAXA", "COMISSÃO"].map(v => celulaExcel(v, "String", "Header")))
  ];
  base.slice().sort((a, b) => a.dataISO.localeCompare(b.dataISO)).forEach(v => detalhesRows.push(linhaExcel([
    celulaExcel(formatarData(v.dataISO), "String", "Center"), celulaExcel(v.vendedor), celulaExcel(v.cliente), celulaExcel(v.codigo), celulaExcel(v.contrato), celulaExcel(v.situacao), celulaExcel(v.servicos.join(" + ") || "-"), celulaExcel(v.cidade), celulaExcel(v.uf, "String", "Center"),
    celulaExcel(v.base, "Number", "Currency"), celulaExcel(v.baseManual !== null && v.baseManual !== undefined ? "Manual" : "Calculado", "String", "Center"), celulaExcel(taxaDaVenda(v) / 100, "Number", "Percent"), celulaExcel(comissao(v), "Number", "Currency")
  ])));

  const planilhasGerais = [
    planilhaExcel("Painel Executivo", painel, [120, 135, 135, 135, 120], false),
    planilhaExcel("Ranking Vendedores", vendedoresRows, [65, 190, 70, 110, 95, 105, 90, 110], true),
    planilhaExcel("Evolucao Mensal", mesesRows, [120, 75, 85, 115, 110, 95, 115], true),
    planilhaExcel("Servicos", servicosRows, [185, 125, 135, 170], true),
    planilhaExcel("Detalhamento", detalhesRows, [85, 160, 190, 90, 95, 90, 145, 105, 45, 105, 105, 70, 105], true)
  ];
  const nomesAbas = nomesAbasVendedores(vendedores.map(v => v.nome));
  const planilhasIndividuais = vendedores.map((resumo, indice) => {
    const vendasDoVendedor = base.filter(v => v.vendedor === resumo.nome).sort((a, b) => a.dataISO.localeCompare(b.dataISO));
    const linhas = linhasVendedorExcel(resumo, vendasDoVendedor, periodoInicial, periodoFinal, indice + 1);
    return planilhaExcel(nomesAbas[indice], linhas, [85, 190, 90, 95, 90, 145, 105, 45, 105, 105, 70, 105], true);
  });
  const planilhas = [...planilhasGerais, ...planilhasIndividuais].join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${estilosExcel()}${planilhas}</Workbook>`;
}

function linhasVendedorExcel(resumo, vendasDoVendedor, inicio, fim, posicao) {
  return [
    linhaExcel([celulaExcel(`VENDAS DE ${resumo.nome.toUpperCase()}`, "String", "Title", 12)]),
    linhaExcel([celulaExcel(`#${posicao} no ranking  |  ${resumo.qtd} venda(s)  |  ${money.format(resumo.base)} vendidos  |  ${money.format(resumo.comissao)} em comissão  |  Período: ${formatarData(inicio)} a ${formatarData(fim)}`, "String", "Subtitle", 12)]),
    linhaExcel([]),
    linhaExcel(["DATA", "CLIENTE", "CÓDIGO", "CONTRATO", "SITUAÇÃO", "SERVIÇOS", "CIDADE", "UF", "VALOR VENDIDO", "ORIGEM DO VALOR", "TAXA", "COMISSÃO"].map(v => celulaExcel(v, "String", "Header"))),
    ...vendasDoVendedor.map(v => linhaExcel([
      celulaExcel(formatarData(v.dataISO), "String", "Center"), celulaExcel(v.cliente), celulaExcel(v.codigo), celulaExcel(v.contrato), celulaExcel(v.situacao), celulaExcel(v.servicos.join(" + ") || "-"), celulaExcel(v.cidade), celulaExcel(v.uf, "String", "Center"),
      celulaExcel(v.base, "Number", "Currency"), celulaExcel(v.baseManual !== null && v.baseManual !== undefined ? "Manual" : "Calculado", "String", "Center"), celulaExcel(taxaDaVenda(v) / 100, "Number", "Percent"), celulaExcel(comissao(v), "Number", "Currency")
    ])),
    linhaExcel([celulaExcel("TOTAL DO VENDEDOR", "String", "Total", 8), celulaExcel(resumo.base, "Number", "TotalCurrency"), celulaExcel("", "String", "Total"), celulaExcel(resumo.taxaEfetiva, "Number", "TotalPercent"), celulaExcel(resumo.comissao, "Number", "TotalCurrency")])
  ];
}

function nomesAbasVendedores(nomes) {
  const usados = new Set(["painel executivo", "ranking vendedores", "evolucao mensal", "servicos", "detalhamento"]);
  return nomes.map(nome => {
    const base = `Vend - ${String(nome).replace(/[\\/:?*\[\]]/g, " ").replace(/\s+/g, " ").trim() || "Sem nome"}`.slice(0, 31);
    let candidato = base, numero = 2;
    while (usados.has(candidato.toLowerCase())) {
      const sufixo = ` (${numero++})`;
      candidato = `${base.slice(0, 31 - sufixo.length)}${sufixo}`;
    }
    usados.add(candidato.toLowerCase());
    return candidato;
  });
}

function consolidarVendedores(base, totalVendido) {
  const mapa = new Map();
  base.forEach(v => {
    const r = mapa.get(v.vendedor) || { nome: v.vendedor, qtd: 0, base: 0, comissao: 0 };
    r.qtd++; r.base += v.base; r.comissao += comissao(v); mapa.set(v.vendedor, r);
  });
  return [...mapa.values()].map(r => ({ ...r, participacao: totalVendido ? r.base / totalVendido : 0, ticket: r.base / r.qtd, taxaEfetiva: r.base ? r.comissao / r.base : 0 })).sort((a, b) => b.comissao - a.comissao);
}

function consolidarMeses(base) {
  const mapa = new Map();
  base.forEach(v => {
    const mes = v.dataISO.slice(0, 7), r = mapa.get(mes) || { mes, qtd: 0, base: 0, comissao: 0, nomes: new Set() };
    r.qtd++; r.base += v.base; r.comissao += comissao(v); r.nomes.add(v.vendedor); mapa.set(mes, r);
  });
  return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map(r => ({ ...r, vendedores: r.nomes.size, ticket: r.base / r.qtd, taxaEfetiva: r.base ? r.comissao / r.base : 0 }));
}

function consolidarServicos(base) {
  const mapa = new Map();
  base.forEach(v => v.servicos.forEach(nome => { const r = mapa.get(nome) || { nome, qtd: 0, base: 0 }; r.qtd++; r.base += v.base; mapa.set(nome, r); }));
  return [...mapa.values()].sort((a, b) => b.qtd - a.qtd);
}

function consolidarCombinacoes(base) {
  const mapa = new Map();
  base.forEach(v => { const nome = v.servicos.join(" + ") || "Sem serviço identificado"; const r = mapa.get(nome) || { nome, qtd: 0, base: 0 }; r.qtd++; r.base += v.base; mapa.set(nome, r); });
  return [...mapa.values()].sort((a, b) => b.qtd - a.qtd);
}

function estilosExcel() {
  return `<Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Borders/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#24332E"/><Interior/><NumberFormat/><Protection/></Style>
  <Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#173D35" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Subtitle"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#DDEAE5"/><Interior ss:Color="#173D35" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Section"><Font ss:Bold="1" ss:Color="#173D35"/><Interior ss:Color="#DCEAE5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#9CB9AE"/></Borders></Style>
  <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#276B5C" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#173D35"/></Borders></Style>
  <Style ss:ID="Text"><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style><Style ss:ID="Center"><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="Currency"><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/></Style><Style ss:ID="Percent"><NumberFormat ss:Format="0.00%"/></Style><Style ss:ID="Integer"><Alignment ss:Horizontal="Center"/><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="Highlight"><Font ss:Bold="1" ss:Color="#9A6517"/><Interior ss:Color="#FFF3D6" ss:Pattern="Solid"/></Style>
  <Style ss:ID="MetricLabel"><Alignment ss:Horizontal="Center"/><Font ss:Size="9" ss:Bold="1" ss:Color="#5C6B66"/><Interior ss:Color="#EDF4F1" ss:Pattern="Solid"/></Style>
  <Style ss:ID="MetricInteger"><Alignment ss:Horizontal="Center"/><Font ss:Size="16" ss:Bold="1" ss:Color="#173D35"/><Interior ss:Color="#EDF4F1" ss:Pattern="Solid"/><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="MetricCurrency"><Alignment ss:Horizontal="Center"/><Font ss:Size="16" ss:Bold="1" ss:Color="#173D35"/><Interior ss:Color="#EDF4F1" ss:Pattern="Solid"/><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/></Style>
  <Style ss:ID="Total"><Font ss:Bold="1" ss:Color="#173D35"/><Interior ss:Color="#DCEAE5" ss:Pattern="Solid"/></Style>
  <Style ss:ID="TotalCurrency" ss:Parent="Total"><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/></Style><Style ss:ID="TotalPercent" ss:Parent="Total"><NumberFormat ss:Format="0.00%"/></Style><Style ss:ID="TotalInteger" ss:Parent="Total"><Alignment ss:Horizontal="Center"/><NumberFormat ss:Format="0"/></Style>
  </Styles>`;
}

function planilhaExcel(nome, linhas, larguras, congelar) {
  const colunas = larguras.map(l => `<Column ss:AutoFitWidth="0" ss:Width="${l}"/>`).join("");
  const opcoes = congelar ? `<FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>` : "";
  return `<Worksheet ss:Name="${xmlEsc(nome)}"><Table>${colunas}${linhas.join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Selected/>${opcoes}<ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
}

function linhaExcel(celulas, altura) { return `<Row${altura ? ` ss:Height="${altura}"` : ""}>${celulas.join("")}</Row>`; }
function celulaExcel(valor, tipo = "String", estilo = "Text", mesclar = 0) { return `<Cell ss:StyleID="${estilo}"${mesclar ? ` ss:MergeAcross="${mesclar - 1}"` : ""}><Data ss:Type="${tipo}">${xmlEsc(valor)}</Data></Cell>`; }
function xmlEsc(valor) { return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]); }

function baixarArquivo(conteudo, nome, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function normalizarTexto(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function formatarData(iso) { if (!iso) return "-"; const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
function formatarMes(mes) { const [a, m] = mes.split("-"); return new Date(Number(a), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); }
function formatarNumero(n) { return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }
function toast(mensagem, erro = false) { const el = $("toast"); el.textContent = mensagem; el.className = `toast show${erro ? " error" : ""}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "toast", 3500); }
