const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5.4-mini';

function pickUniqueNumbers(candidates) {
  const valid = Array.from(
    new Set(
      (candidates || [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
    )
  );
  while (valid.length < 6) {
    const n = 1 + Math.floor(Math.random() * 45);
    if (!valid.includes(n)) valid.push(n);
  }
  return valid.slice(0, 6).sort((a, b) => a - b);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { birthDate, birthTime } = req.body || {};

  if (!birthDate || typeof birthDate !== 'string') {
    res.status(400).json({ error: '생년월일을 입력해주세요.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.' });
    return;
  }

  const timeText = birthTime ? `${birthTime}` : '모름 (시주 제외하고 분석)';

  const systemPrompt =
    '너는 사주(네 기둥) 명리학에 정통한 분석가다. 사용자의 생년월일과 태어난 시간을 바탕으로 사주를 간단히 풀이하고, ' +
    '그 풀이에서 느껴지는 기운/오행/숫자 인상을 근거로 1부터 45 사이의 서로 다른 정수 6개를 로또 번호로 추천한다. ' +
    '반드시 아래 JSON 형식으로만 답한다. 다른 텍스트는 포함하지 않는다.\n' +
    '{"analysis": "3~5문장의 한국어 사주 풀이", "numbers": [6개의 1~45 사이 서로 다른 정수]}';

  const userPrompt = `생년월일: ${birthDate}\n태어난 시간: ${timeText}\n이 정보로 사주를 풀이하고 로또 번호 6개를 추천해줘.`;

  try {
    const completion = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    });

    if (!completion.ok) {
      const errText = await completion.text();
      res.status(502).json({ error: 'AI 응답을 가져오지 못했습니다.', detail: errText.slice(0, 500) });
      return;
    }

    const data = await completion.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const numbers = pickUniqueNumbers(parsed.numbers);
    const analysis =
      typeof parsed.analysis === 'string' && parsed.analysis.trim()
        ? parsed.analysis.trim()
        : '사주 풀이 결과를 가져오지 못해 대신 번호를 추천했습니다.';

    res.status(200).json({ analysis, numbers });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
