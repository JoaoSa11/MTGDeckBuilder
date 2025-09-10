const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());

// Função para formatar nomes para a URL do EDHRec
const formatNameForEdhrec = (name) => {
    return name
        .toLowerCase()
        .replace(/,/g, '') // Remove vírgulas
        .replace(/'/g, '') // Remove apóstrofos
        .replace(/\s+/g, '-'); // Substitui espaços por hifens
};

app.get('/recommendations/:commanderName', async (req, res) => {
    const { commanderName } = req.params;
    console.log(`Recebida a busca por: ${commanderName}`);

    try {
        // 1. Primeiro, buscar no Scryfall para obter dados precisos da carta e verificar se há parceiros.
        const scryfallUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(commanderName)}`;
        const scryfallResponse = await axios.get(scryfallUrl);
        const cardData = scryfallResponse.data;

        let edhrecCommanderString = cardData.name;

        // 2. Verificar a mecânica "Partner with". O campo 'all_parts' lista cartas relacionadas.
        if (cardData.all_parts) {
            const partnerPart = cardData.all_parts.find(part =>
                part.component === 'partner' && part.name !== cardData.name
            );

            if (partnerPart) {
                console.log(`Parceiro encontrado: ${partnerPart.name}`);
                edhrecCommanderString += ` ${partnerPart.name}`; // Adicionar o nome do parceiro à string
            }
        }
        
        // 3. Formatar o nome (ou nomes combinados) para a URL da API JSON do EDHRec.
        const formattedCommander = formatNameForEdhrec(edhrecCommanderString);
        const edhrecJsonUrl = `https://json.edhrec.com/pages/commanders/${formattedCommander}.json`;
        console.log(`Nome formatado: "${formattedCommander}". Buscando em: ${edhrecJsonUrl}`);

        // 4. Fazer a requisição para a API JSON do EDHRec.
        const edhrecResponse = await axios.get(edhrecJsonUrl, {
            headers: { 
                // É uma boa prática manter um User-Agent, mesmo para APIs
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' 
            }
        });

        const recommendations = new Set();
        
        // 5. Extrair os nomes das cartas da estrutura do JSON.
        // A lista de cartas fica dentro de container.json_dict.cardlists
        if (edhrecResponse.data && edhrecResponse.data.container && edhrecResponse.data.container.json_dict && edhrecResponse.data.container.json_dict.cardlists) {
            const cardlists = edhrecResponse.data.container.json_dict.cardlists;
            cardlists.forEach(list => {
                list.cardviews.forEach(card => {
                    recommendations.add(card.name);
                });
            });
        }

        if (recommendations.size === 0) {
            return res.status(404).json({ error: `Nenhuma recomendação encontrada para "${commanderName}" na API do EDHRec.` });
        }

        // 6. Retornar a lista de cartas.
        res.json(Array.from(recommendations));

    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.error(`Erro 404: A carta "${commanderName}" não foi encontrada no Scryfall ou a página correspondente não existe no EDHRec.`);
            return res.status(404).json({ error: `A carta "${commanderName}" não foi encontrada ou não possui recomendações. Verifique o nome.` });
        }
        console.error('Erro no processo do backend:', error.message);
        res.status(500).json({ error: 'Falha ao processar a requisição. A API do EDHRec pode estar offline ou o nome do comandante é inválido.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

