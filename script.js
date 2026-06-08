// Controle da Tela Inicial
document.getElementById('start-btn').addEventListener('click', function() {
    const screen = document.getElementById('welcome-screen');
    screen.style.opacity = '0';
    setTimeout(() => { screen.style.visibility = 'hidden'; }, 500);
});

// Inicializa o Mapa Leaflet
let mapa = L.map('map').setView([-23.3106, -51.1628], 14);

// Camada de Satélite
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
}).addTo(mapa);

// Grupo global para gerenciar os desenhos
let areaTotalAcumulada = 0; // Nova variável para guardar a soma de todas as áreas
let camadaGrade = null;     // NOVA VARIÁVEL ADICIONADA AQUI para a grade do mapa
let grupoDesenhos = L.featureGroup().addTo(mapa);

// Variáveis de Controle do Desenho Ativo
let estaMapeando = false;
let pontosMarcados = [];
let marcadoresTemporarios = [];
let linhasRascunho = []; // Guarda as linhas criadas no meio do desenho atual

// Carrega dados iniciais da cidade padrão
obterCoordenadasEClima("Londrina, Paraná");

// Eventos dos Botões
document.getElementById('search-btn').addEventListener('click', buscarLocalizacao);
document.getElementById('location-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') buscarLocalizacao();
});
document.getElementById('map-area-btn').addEventListener('click', alternarModoMapeamento);
document.getElementById('clear-map-btn').addEventListener('click', limparMapeamentoTotal);

// Evento para Ativar/Desativar a Grade Topográfica
document.getElementById('grid-toggle-btn').addEventListener('click', function() {
    const btn = document.getElementById('grid-toggle-btn');
    
    if (!camadaGrade) {
        camadaGrade = L.gridLayer({
            tileSize: 150, 
            opacity: 0.3,  
            attribution: 'AgroGrid'
        });

        camadaGrade.createTile = function(coords) {
            let tile = document.createElement('div');
            tile.style.outline = '1px solid rgba(255, 255, 255, 0.7)'; 
            tile.style.boxShadow = 'inset 0 0 5px rgba(0,0,0,0.2)'; 
            return tile;
        };

        camadaGrade.addTo(mapa);
        btn.innerText = "🌐 Desativar Grade";
        btn.style.background = "#e53935"; 
    } else {
        mapa.removeLayer(camadaGrade);
        camadaGrade = null;
        btn.innerText = "🌐 Ativar Grade Topográfica";
        btn.style.background = "#2e7d32"; 
    }
});

function buscarLocalizacao() {
    const local = document.getElementById('location-input').value;
    if (local.trim() === "") return;
    obterCoordenadasEClima(local);
}

function alternarModoMapeamento() {
    const btn = document.getElementById('map-area-btn');
    const btnLimpar = document.getElementById('clear-map-btn');
    
    if (!estaMapeando) {
        estaMapeando = true;
        pontosMarcados = []; 
        marcadoresTemporarios = [];
        linhasRascunho = [];
        
        btn.innerText = "🛑 Concluir Área";
        btn.classList.add('active');
        btnLimpar.style.display = "none";
        document.getElementById('area-result').style.display = "none";
        mapa.getContainer().style.cursor = 'crosshair';
    } else {
        estaMapeando = false;
        btn.innerText = "📐 Iniciar Mapeamento";
        btn.classList.remove('active');
        mapa.getContainer().style.cursor = '';

        if (pontosMarcados.length >= 3) {
            // Desenha a última linha fechando o polígono de rascunho
            let line = L.polyline([pontosMarcados[pontosMarcados.length - 1], pontosMarcados[0]], {color: '#000000', weight: 3}).addTo(mapa);
            linhasRascunho.push(line);

            // Criar um subgrupo exclusivo para ESTA fazenda/área específica
            let subGrupoArea = L.featureGroup();
            
            // Calcula hectares e dados de perímetro
            const hectaresCalculados = calcularAreaHectares();
            const dadosPoligono = processarLadosEPerimetro();

            // Adiciona o polígono verde principal ao subgrupo
            let novoPoligono = L.polygon(pontosMarcados, {
                color: '#4caf50', 
                fillColor: '#4caf50', 
                fillOpacity: 0.35
            }).addTo(subGrupoArea);

            // Transfere as linhas de contorno pretas permanentes para o subgrupo
            linhasRascunho.forEach(linha => linha.addTo(subGrupoArea));

            // Transfere as etiquetas de metros ocultas para o subgrupo
            dadosPoligono.etiquetas.forEach(etiqueta => etiqueta.addTo(subGrupoArea));

            // Garante que as etiquetas só aparecem se o popup estiver aberto
            dadosPoligono.etiquetas.forEach(etq => subGrupoArea.removeLayer(etq));

            // Configura o balão de clique na área com opção de apagar individualmente
            novoPoligono.bindPopup(`
                <div style="font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.4; min-width: 150px;">
                    <b style="color: #1b5e20; font-size: 13px;">📊 Dados do Terreno</b><br>
                    🌾 <b>Área Útil:</b> ${hectaresCalculados} ha<br>
                    🔄 <b>Perímetro:</b> ${Math.round(dadosPoligono.perimetro)} m<br><br>
                    <button class="btn-tool" style="background:#e53935; padding: 5px 10px; font-size: 11px;" 
                            onclick="apagarAreaEspecifica(${L.stamp(subGrupoArea)})">🗑️ Apagar esta área</button>
                </div>
            `);

            // Controle dinâmico para mostrar/esconder as medidas quando clica na área
            novoPoligono.on('popupopen', function() {
                dadosPoligono.etiquetas.forEach(etq => etq.addTo(mapa));
            });
            novoPoligono.on('popupclose', function() {
                dadosPoligono.etiquetas.forEach(etq => mapa.removeLayer(etq));
            });

            // Adiciona o bloco completo ao grupo de desenhos globais
            grupoDesenhos.addLayer(subGrupoArea);

            // Limpa as bolinhas vermelhas
            marcadoresTemporarios.forEach(m => mapa.removeLayer(m));
            btnLimpar.style.display = "block"; 
        } else {
            alert("Clique em pelo menos 3 pontos no mapa para cercar a área!");
            marcadoresTemporarios.forEach(m => mapa.removeLayer(m));
            linhasRascunho.forEach(l => mapa.removeLayer(l));
            if (grupoDesenhos.getLayers().length > 0) btnLimpar.style.display = "block";
        }
    }
}

// Escuta cliques de desenho
mapa.on('click', function(e) {
    if (!estaMapeando) return;

    const pontoAtual = e.latlng;
    pontosMarcados.push([pontoAtual.lat, pontoAtual.lng]);

    let marcador = L.circleMarker(pontoAtual, { radius: 5, color: '#000', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(mapa);
    marcadoresTemporarios.push(marcador);

    // FIX: Linhas visíveis em preto desde o início do clique
    if (pontosMarcados.length > 1) {
        const pontoAnterior = pontosMarcados[pontosMarcados.length - 2];
        let linha = L.polyline([pontoAnterior, [pontoAtual.lat, pontoAtual.lng]], {color: '#000000', weight: 3}).addTo(mapa);
        linhasRascunho.push(linha);
    }
});

// Calcula as medidas de comprimentos e perímetros de cada lado
function processarLadosEPerimetro() {
    let perimetroTotal = 0;
    let listaEtiquetas = [];

    for (let i = 0; i < pontosMarcados.length; i++) {
        let p1 = L.latLng(pontosMarcados[i][0], pontosMarcados[i][1]);
        let p2 = L.latLng(pontosMarcados[(i + 1) % pontosMarcados.length][0], pontosMarcados[(i + 1) % pontosMarcados.length][1]);
        
        let dist = p1.distanceTo(p2);
        perimetroTotal += dist;

        const meioLat = (pontosMarcados[i][0] + pontosMarcados[(i + 1) % pontosMarcados.length][0]) / 2;
        const meioLng = (pontosMarcados[i][1] + pontosMarcados[(i + 1) % pontosMarcados.length][1]) / 2;

        let etiqueta = L.marker([meioLat, meioLng], {
            icon: L.divIcon({
                className: 'medicao-label',
                html: `${Math.round(dist)} m`,
                iconSize: [60, 20],
                iconAnchor: [30, 10]
            })
        });
        listaEtiquetas.push(etiqueta);
    }
    return { perimetro: perimetroTotal, etiquetas: listaEtiquetas };
}

// CORREÇÃO: Função chamada de dentro do botão do popup para deletar só uma área
window.apagarAreaEspecifica = function(idCamada) {
    let camadaAlvo = grupoDesenhos.getLayer(idCamada);
    if (camadaAlvo) {
        // Remove do mapa as etiquetas caso o popup estivesse aberto
        grupoDesenhos.removeLayer(camadaAlvo);
        
        // Se não sobrar mais nenhuma fazenda mapeada, esconde o botão geral de limpar
        if (grupoDesenhos.getLayers().length === 0) {
            document.getElementById('clear-map-btn').style.display = "none";
            document.getElementById('area-result').style.display = "none";
        }
    }
};

function limparMapeamentoTotal() {
    grupoDesenhos.clearLayers();
    areaTotalAcumulada = 0; // Zera o contador acumulado na memória
    
    // CORREÇÃO: Força o texto da tela a voltar para 0.0 também
    const campoTotal = document.getElementById('hectares-total-val');
    if (campoTotal) {
        campoTotal.innerText = "0.0";
    }
    
    // Esconde os blocos visuais já que não tem mais nada mapeado
    document.getElementById('area-result').style.display = "none";
    document.getElementById('clear-map-btn').style.display = "none";
}

function calcularAreaHectares() {
    if (pontosMarcados.length < 3) return "0.0";
    let area = 0;
    const raioTerra = 6378137;
    
    for (let i = 0; i < pontosMarcados.length; i++) {
        let p1 = pontosMarcados[i];
        let p2 = pontosMarcados[(i + 1) % pontosMarcados.length];
        let x1 = p1[1] * Math.PI / 180 * raioTerra * Math.cos(p1[0] * Math.PI / 180);
        let y1 = p1[0] * Math.PI / 180 * raioTerra;
        let x2 = p2[1] * Math.PI / 180 * raioTerra * Math.cos(p2[0] * Math.PI / 180);
        let y2 = p2[0] * Math.PI / 180 * raioTerra;
        area += (x1 * y2) - (x2 * y1);
    }
    area = Math.abs(area / 2);
    const hectares = parseFloat((area / 10000).toFixed(1));

    // CORREÇÃO AQUI: Garante que o valor numérico seja somado corretamente
    areaTotalAcumulada = parseFloat((areaTotalAcumulada + hectares).toFixed(1));

    // Mostra o resultado na tela abrindo o bloco principal de resultado
    document.getElementById('area-result').style.display = "block";

    // Atualiza a Última Área na tela
    if (document.getElementById('hectares-val')) {
        document.getElementById('hectares-val').innerText = hectares.toFixed(1);
    }
    
    // CORREÇÃO DO ID: Atualiza o Total Acumulado na tela de forma garantida
    const campoTotal = document.getElementById('hectares-total-val');
    if (campoTotal) {
        campoTotal.innerText = areaTotalAcumulada.toFixed(1);
    }
    
    return hectares.toFixed(1); 
}

// --- API DE CLIMA COM NOVOS TIPOS DE CULTIVOS ---
function obterCoordenadasEClima(cidade) {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt&format=json`;

    fetch(geocodeUrl)
        .then(response => response.json())
        .then(data => {
            if (!data.results || data.results.length === 0) {
                document.getElementById('weather-desc').innerText = "Local incorreto.";
                return;
            }
            const resultado = data.results[0];
            const lat = resultado.latitude;
            const lon = resultado.longitude;
            const nomeFormatado = `${resultado.name}, ${resultado.admin1 || ''}`;

            mapa.flyTo([lat, lon], 14);

            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`;

            return fetch(weatherUrl)
                .then(res => res.json())
                .then(weatherData => {
                    atualizarPainelEPlanejamento(weatherData.current, nomeFormatado);
                });
        });
}

function atualizarPainelEPlanejamento(dadosAtuais, nomeCidade) {
    const temp = Math.round(dadosAtuais.temperature_2m);
    document.getElementById('temp-val').innerText = temp;
    document.getElementById('humidity-val').innerText = dadosAtuais.relative_humidity_2m + "%";
    document.getElementById('wind-val').innerText = Math.round(dadosAtuais.wind_speed_10m) + " km/h";
    document.getElementById('rain-val').innerText = dadosAtuais.precipitation > 0 ? "Ocorrendo" : "0mm";

    const cropIcon = document.getElementById('crop-icon');
    const cropTitle = document.getElementById('crop-title');
    const cropDesc = document.getElementById('crop-desc');

    // ADICIONADO: Matriz muito maior de culturas agrícolas baseado na temperatura real
    if (temp >= 28) {
        cropIcon.innerText = "🤠";
        cropTitle.innerText = "Cana-de-Açúcar ou Algodão";
        cropDesc.innerText = `Calor forte (${temp}°C) em ${nomeCidade}. Clima ideal para o desenvolvimento rápido de canaviais ou expansão da fibra do algodão.`;
    } else if (temp >= 22 && temp < 28) {
        cropIcon.innerText = "🌽";
        cropTitle.innerText = "Milho, Soja ou Café";
        cropDesc.innerText = `Condições perfeitas (${temp}°C) para grãos de grife. Temperatura excelente para grãos de soja e maturação de frutos do café.`;
    } else if (temp >= 16 && temp < 22) {
        cropIcon.innerText = "🌾";
        cropTitle.innerText = "Trigo, Feijão ou Arroz";
        cropDesc.innerText = `Clima ameno e favorável (${temp}°C). Perfeito para ciclos de arroz irrigado ou enchimento de grãos de trigo e feijoeiro.`;
    } else if (temp >= 10 && temp < 16) {
        cropIcon.innerText = "🥔";
        cropTitle.innerText = "Batata, Cenoura ou Cevada";
        cropDesc.innerText = `Frio leve (${temp}°C). Temperaturas subterrâneas ideais para tubérculos como batata e cenoura ganharem tamanho e peso.`;
    } else {
        cropIcon.innerText = "🥦";
        cropTitle.innerText = "Hortaliças de Inverno / Pastagens";
        cropDesc.innerText = `Frio intenso (${temp}°C). Janela excelente para repolho, brócolis ou manejo de pastagem de inverno (azevém).`;
    }

    const codigoClima = dadosAtuais.weather_code;
    let desc = "Céu Limpo";
    let eco = "";

    if (codigoClima === 0) {
        desc = "Céu limpo";
        eco = "💡 Dica Econômica: Evaporação alta. Acione a irrigação apenas em turnos noturnos para poupar água.";
    } else if (codigoClima >= 1 && codigoClima <= 3) {
        desc = "Parcialmente nublado";
        eco = "🍃 Dica Verde: Condição perfeita para monitoramento fitossanitário por drone sem riscos de deriva.";
    } else if (codigoClima >= 51 && codigoClima <= 67) {
        desc = "Chuva leve";
        eco = "🌧️ Manejo Ecológico: Desligue sistemas de irrigação. Deixe a água da chuva infiltrar naturalmente.";
    } else {
        desc = "Alerta de instabilidade";
        eco = "⚠️ Alerta Protetor: Evite fertilizar áreas inclinadas para prevenir que o adubo seja lavado até aos rios.";
    }

    document.getElementById('weather-desc').innerText = desc;
    document.getElementById('eco-tip').innerText = eco;
}