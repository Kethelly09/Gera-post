export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { licenseKey, categoria, nome, preco, link, imageBase64, imageMediaType } = req.body || {};

  const validLicenses = (process.env.VALID_LICENSES || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  if (!licenseKey || !validLicenses.includes(licenseKey)) {
    return res.status(401).json({ error: 'Chave de licença inválida ou não informada.' });
  }

  if (!nome && !imageBase64) {
    return res.status(400).json({ error: 'Envie o nome do produto ou uma foto.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Servidor sem chave de API configurada.' });
  }

  const systemPrompt = `Você é a redatora de confiança de uma loja online brasileira de moda, calçados e beleza. Sua tarefa é criar conteúdo pronto para publicar em um canal do Telegram, a partir dos dados de um produto.

Tom de voz: caloroso, descontraído, de amiga pra amiga — nunca formal ou robótico, sem soar como e-commerce genérico. Use emojis com naturalidade, sem exagerar.

Responda APENAS com um JSON válido, sem markdown, sem crases, sem texto antes ou depois, no formato exato:
{"titulo": "...", "descricao": "...", "legenda_telegram": "...", "hashtags": ["...", "..."]}

Regras:
- "titulo": chamativo, curto (até 8 palavras).
- "descricao": 2-3 frases persuasivas, tom de amiga, destacando o benefício real do produto.
- "legenda_telegram": o texto completo e pronto para colar no Telegram, com emojis, incluindo o preço (se fornecido) e terminando com uma chamada pra ação e o link (se fornecido). Pode ter quebras de linha.
- "hashtags": 4 a 6 hashtags relevantes em português, sem o caractere #.`;

  const userTextParts = [];
  userTextParts.push(`Categoria: ${categoria || 'Outro'}`);
  if (nome) userTextParts.push(`Nome do produto: ${nome}`);
  if (preco) userTextParts.push(`Preço: ${preco}`);
  if (link) userTextParts.push(`Link de afiliado: ${link}`);
  if (imageBase64 && !nome) userTextParts.push('Nenhum nome foi digitado — identifique o produto pela foto anexada.');

  const content = [];
  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageBase64 }
    });
  }
  content.push({ type: 'text', text: userTextParts.join('\n') });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro da API Anthropic:', data);
      return res.status(502).json({ error: 'Erro ao gerar o post. Tente novamente.' });
    }

    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'A IA não retornou texto.' });
    }

    let cleaned = textBlock.text.trim()
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno ao gerar o post.' });
  }
}
