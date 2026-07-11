const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5.4-mini';

function pickNumbers(mainCandidates, bonusCandidate) {
  const pool = [];
  const pushValid = (n) => {
    n = Number(n);
    if (Number.isInteger(n) && n >= 1 && n <= 45 && !pool.includes(n)) pool.push(n);
  };
  (mainCandidates || []).forEach(pushValid);

  const bonusNum = Number(bonusCandidate);
  const bonusValid = Number.isInteger(bonusNum) && bonusNum >= 1 && bonusNum <= 45;
  if (bonusValid) pushValid(bonusNum);

  while (pool.length < 7) {
    const n = 1 + Math.floor(Math.random() * 45);
    if (!pool.includes(n)) pool.push(n);
  }

  const sevenNums = pool.slice(0, 7);
  const bonus = bonusValid && sevenNums.includes(bonusNum) ? bonusNum : sevenNums[sevenNums.length - 1];
  const main = sevenNums.filter((n) => n !== bonus).sort((a, b) => a - b);

  return { main, bonus };
}

async function saveToSupabase(record) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/saju_draws`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([record]),
    });
  } catch (err) {
    console.error('Supabase insert failed:', err);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { birthDate, birthTime, gender } = req.body || {};

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
  const genderText = gender ? gender : '선택 안 함';

  const systemPrompt =
    '너는 사주(네 기둥) 명리학에 정통한 분석가다. 사용자의 생년월일, 태어난 시간, 성별을 바탕으로 사주를 간단히 풀이하고, ' +
    '그 풀이에서 느껴지는 기운/오행/숫자 인상을 근거로 1부터 45 사이의 서로 다른 정수 7개(메인 번호 6개 + 보너스 번호 1개)를 로또 번호로 추천한다. ' +
    '반드시 아래 JSON 형식으로만 답한다. 다른 텍스트는 포함하지 않는다.\n' +
    '{"analysis": "3~5문장의 한국어 사주 풀이", "numbers": [6개의 1~45 사이 서로 다른 정수], "bonusNumber": 1~45 사이 정수 (numbers와 겹치지 않음)}';

  const userPrompt =
    `생년월일: ${birthDate}\n태어난 시간: ${timeText}\n성별: ${genderText}\n` +
    '이 정보로 사주를 풀이하고 메인 로또 번호 6개와 보너스 번호 1개를 추천해줘.';

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

    const { main, bonus } = pickNumbers(parsed.numbers, parsed.bonusNumber);
    const analysis =
      typeof parsed.analysis === 'string' && parsed.analysis.trim()
        ? parsed.analysis.trim()
        : '사주 풀이 결과를 가져오지 못해 대신 번호를 추천했습니다.';

    await saveToSupabase({
      birth_date: birthDate,
      birth_time: birthTime || null,
      gender: gender || null,
      analysis,
      numbers: main,
      bonus_number: bonus,
    });

    res.status(200).json({ analysis, numbers: main, bonus });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
