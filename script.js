// ================================
// CONTROLE DE VENDAS
// ================================

let vendas = JSON.parse(localStorage.getItem("vendas")) || [];
let indiceEdicao = null;

// Campos
const cliente = document.getElementById("cliente");
const produto = document.getElementById("produto");
const valor = document.getElementById("valor");
const data = document.getElementById("data");
const pesquisar = document.getElementById("pesquisar");

// Botão
const btnSalvar = document.getElementById("btnSalvar");

// Dashboard
const quantidadeVendas = document.getElementById("quantidadeVendas");
const valorTotal = document.getElementById("valorTotal");

// Tabela
const listaVendas = document.getElementById("listaVendas");

// Comissões
let comissoes = JSON.parse(localStorage.getItem("comissoes")) || [];
let indiceEdicaoComissao = null;

const vendedor = document.getElementById("vendedor");
const valorVenda = document.getElementById("valorVenda");
const percentualComissao = document.getElementById("percentualComissao");
const dataComissao = document.getElementById("dataComissao");
const btnSalvarComissao = document.getElementById("btnSalvarComissao");
const totalComissoes = document.getElementById("totalComissoes");
const comissoesPendentes = document.getElementById("comissoesPendentes");
const listaComissoes = document.getElementById("listaComissoes");
const filtroMes = document.getElementById("filtroMes");
const btnLimparFiltro = document.getElementById("btnLimparFiltro");
const resumoMes = document.getElementById("resumoMes");

// ================================
// Salvar LocalStorage
// ================================

function salvarLocal() {
    localStorage.setItem("vendas", JSON.stringify(vendas));
}

// ================================
// Limpar formulário
// ================================

function limparFormulario() {
    cliente.value = "";
    produto.value = "";
    valor.value = "";
    data.value = "";

    indiceEdicao = null;

    btnSalvar.textContent = "Salvar Venda";
}

// ================================
// Dashboard
// ================================

function atualizarDashboard() {

    quantidadeVendas.textContent = vendas.length;

    let total = 0;

    vendas.forEach(venda => {
        total += Number(venda.valor);
    });

    valorTotal.textContent =
        total.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });

}

// ================================
// Cadastrar / Editar
// ================================

btnSalvar.addEventListener("click", () => {

    if (
        cliente.value.trim() === "" ||
        produto.value.trim() === "" ||
        valor.value === "" ||
        data.value === ""
    ) {
        alert("Preencha todos os campos.");
        return;
    }

    const venda = {

        cliente: cliente.value,

        produto: produto.value,

        valor: parseFloat(valor.value),

        data: data.value

    };

    if (indiceEdicao === null) {

        vendas.push(venda);

    } else {

        vendas[indiceEdicao] = venda;

    }

    salvarLocal();

    atualizarDashboard();

    renderizarTabela();

    limparFormulario();

});

// ================================
// Salvar comissões no LocalStorage
// ================================

function salvarComissoesLocal() {
    localStorage.setItem("comissoes", JSON.stringify(comissoes));
}

// ================================
// Limpar formulário de comissões
// ================================

function limparFormularioComissao() {
    vendedor.value = "";
    valorVenda.value = "";
    percentualComissao.value = "";
    dataComissao.value = "";

    indiceEdicaoComissao = null;

    btnSalvarComissao.textContent = "Salvar Comissão";
}

// ================================
// Calcular comissão
// ================================

function calcularComissao(valorVenda, percentual) {
    return (valorVenda * percentual) / 100;
}

// ================================
// Resumo das comissões
// ================================

function atualizarResumoComissoes() {
    let total = 0;
    let pendentes = 0;

    comissoes.forEach(comissao => {
        total += Number(comissao.valorComissao || 0);

        if (comissao.status !== "recebida") {
            pendentes += Number(comissao.valorComissao || 0);
        }
    });

    totalComissoes.textContent = total.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

    comissoesPendentes.textContent = pendentes.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// ================================
// Cadastrar / Editar comissão
// ================================

btnSalvarComissao.addEventListener("click", () => {

    if (
        vendedor.value.trim() === "" ||
        valorVenda.value === "" ||
        percentualComissao.value === "" ||
        dataComissao.value === ""
    ) {
        alert("Preencha todos os campos da comissão.");
        return;
    }

    const valor = parseFloat(valorVenda.value);
    const percentual = parseFloat(percentualComissao.value);

    const comissao = {
        vendedor: vendedor.value.trim(),
        valorVenda: valor,
        percentual: percentual,
        data: dataComissao.value,
        valorComissao: parseFloat(calcularComissao(valor, percentual).toFixed(2)),
        status: "pendente"
    };

    if (indiceEdicaoComissao === null) {
        comissoes.push(comissao);
    } else {
        comissoes[indiceEdicaoComissao] = comissao;
    }

    salvarComissoesLocal();
    atualizarResumoComissoes();
    popularFiltroMes();
    renderizarTabelaComissoes();
    limparFormularioComissao();

});

// ================================
// Inicialização
// ================================

atualizarDashboard();
renderizarTabela();
popularFiltroMes();
atualizarResumoComissoes();
renderizarTabelaComissoes();

// ================================
// Renderizar tabela
// ================================

function renderizarTabela(lista = vendas) {

    listaVendas.innerHTML = "";

    if (lista.length === 0) {

        listaVendas.innerHTML = `
            <tr>
                <td colspan="5">Nenhuma venda cadastrada.</td>
            </tr>
        `;

        return;
    }

    lista.forEach((venda, indice) => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${venda.cliente}</td>
            <td>${venda.produto}</td>
            <td>${Number(venda.valor).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL"
            })}</td>
            <td>${formatarData(venda.data)}</td>
            <td>
                <button class="editar" onclick="editarVenda(${indice})">
                    Editar
                </button>

                <button class="excluir" onclick="excluirVenda(${indice})">
                    Excluir
                </button>
            </td>
        `;

        listaVendas.appendChild(tr);

    });

}

// ================================
// Popular filtro de mês
// ================================

function popularFiltroMes() {
    const meses = [...new Set(comissoes.map(comissao => comissao.data.slice(0, 7)))].sort();

    filtroMes.innerHTML = '<option value="todos">Todos</option>';

    meses.forEach(mes => {
        const option = document.createElement("option");
        option.value = mes;
        option.textContent = formatarMes(mes);
        filtroMes.appendChild(option);
    });

    if (filtroMes.value === "" || !Array.from(filtroMes.options).some(option => option.value === filtroMes.value)) {
        filtroMes.value = "todos";
    }
}

function formatarMes(mes) {
    const [ano, mesNumero] = mes.split("-");
    const data = new Date(`${ano}-${mesNumero}-01`);
    return data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// ================================
// Renderizar tabela de comissões
// ================================

function renderizarTabelaComissoes() {

    const listaExibida = filtroMes.value === "todos"
        ? comissoes
        : comissoes.filter(comissao => comissao.data.startsWith(filtroMes.value));

    listaComissoes.innerHTML = "";

    if (listaExibida.length === 0) {

        listaComissoes.innerHTML = `
            <tr>
                <td colspan="7">Nenhuma comissão cadastrada para este mês.</td>
            </tr>
        `;

        resumoMes.textContent = "Nenhuma comissão para o mês selecionado.";

        return;
    }

    let totalMes = 0;
    let pendentesMes = 0;

    listaExibida.forEach((comissao, indice) => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${comissao.vendedor}</td>
            <td>${Number(comissao.valorVenda).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL"
            })}</td>
            <td>${comissao.percentual}%</td>
            <td>${Number(comissao.valorComissao).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL"
            })}</td>
            <td>${formatarData(comissao.data)}</td>
            <td>
                <span class="status ${comissao.status === "recebida" ? "recebida" : "pendente"}">
                    ${comissao.status === "recebida" ? "Recebida" : "Pendente"}
                </span>
            </td>
            <td>
                <button class="copiar" onclick="copiarDadosComissao(${indice})">
                    Copiar
                </button>

                <button class="editar" onclick="editarComissao(${indice})">
                    Editar
                </button>

                <button class="excluir" onclick="excluirComissao(${indice})">
                    Excluir
                </button>

                <button class="editar" onclick="marcarRecebida(${indice})">
                    Recebida
                </button>
            </td>
        `;

        totalMes += Number(comissao.valorComissao || 0);

        if (comissao.status !== "recebida") {
            pendentesMes += Number(comissao.valorComissao || 0);
        }

        listaComissoes.appendChild(tr);

    });

    resumoMes.textContent = `Mostrando ${listaExibida.length} comissão(ões) • Total: ${totalMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} • Pendentes: ${pendentesMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
}

// ================================
// Formatar data
// ================================

function formatarData(data) {

    const partes = data.split("-");

    return `${partes[2]}/${partes[1]}/${partes[0]}`;

}

// ================================
// Excluir venda
// ================================

function excluirVenda(indice) {

    if (!confirm("Deseja excluir esta venda?")) {
        return;
    }

    vendas.splice(indice, 1);

    salvarLocal();

    atualizarDashboard();

    renderizarTabela();

}

// ================================
// Editar venda
// ================================

function editarVenda(indice) {

    const venda = vendas[indice];

    cliente.value = venda.cliente;
    produto.value = venda.produto;
    valor.value = venda.valor;
    data.value = venda.data;

    indiceEdicao = indice;

    btnSalvar.textContent = "Salvar Alterações";

}

// ================================
// Copiar dados da comissão para o formulário
// ================================

function copiarDadosComissao(indice) {
    const comissao = comissoes[indice];

    vendedor.value = comissao.vendedor;
    valorVenda.value = comissao.valorVenda;
    percentualComissao.value = comissao.percentual;
    dataComissao.value = comissao.data;

    indiceEdicaoComissao = null;
    btnSalvarComissao.textContent = "Salvar Comissão";

    document.querySelector(".comissoes").scrollIntoView({ behavior: "smooth" });
}

// ================================
// Excluir comissão
// ================================

function excluirComissao(indice) {

    if (!confirm("Deseja excluir esta comissão?")) {
        return;
    }

    comissoes.splice(indice, 1);

    salvarComissoesLocal();
    popularFiltroMes();
    atualizarResumoComissoes();
    renderizarTabelaComissoes();

}

// ================================
// Editar comissão
// ================================

function editarComissao(indice) {

    const comissao = comissoes[indice];

    vendedor.value = comissao.vendedor;
    valorVenda.value = comissao.valorVenda;
    percentualComissao.value = comissao.percentual;
    dataComissao.value = comissao.data;

    indiceEdicaoComissao = indice;

    btnSalvarComissao.textContent = "Salvar Alterações";

}

// ================================
// Marcar como recebida
// ================================

function marcarRecebida(indice) {
    comissoes[indice].status = "recebida";
    salvarComissoesLocal();
    popularFiltroMes();
    atualizarResumoComissoes();
    renderizarTabelaComissoes();
}

// ================================
// Filtro de mês
// ================================

filtroMes.addEventListener("change", renderizarTabelaComissoes);

btnLimparFiltro.addEventListener("click", () => {
    filtroMes.value = "todos";
    renderizarTabelaComissoes();
});

// ================================
// Pesquisa
// ================================

pesquisar.addEventListener("keyup", () => {

    const texto = pesquisar.value.toLowerCase();

    const resultado = vendas.filter(venda =>

        venda.cliente.toLowerCase().includes(texto) ||

        venda.produto.toLowerCase().includes(texto)

    );

    renderizarTabela(resultado);

});

// ================================
// Atualizar tela ao iniciar
// ================================

renderizarTabela();
atualizarDashboard();
