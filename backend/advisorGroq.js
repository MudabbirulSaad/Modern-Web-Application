import nodeFetch from 'node-fetch';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_TIMEOUT_MS = 4000;

export const getGroqConfig = (env = process.env) => ({
  apiKey: env.GROQ_API_KEY || env.GROQ_API || '',
  model: env.GROQ_MODEL || env.GROQ_model || DEFAULT_GROQ_MODEL,
  timeoutMs: DEFAULT_TIMEOUT_MS
});

const candidatePayload = (recommendation) => ({
  course: recommendation.course,
  score: recommendation.score,
  reason: recommendation.reason,
  evidence: recommendation.evidence,
  tutors: recommendation.tutors,
  limitations: recommendation.limitations
});

export const buildGroqMessages = (preferences, recommendations) => [
  {
    role: 'system',
    content: [
      'You rank and explain Course recommendations for the app AI Course Advisor.',
      'Use only the supplied app-owned Course candidate data, evidence, tutors, ratings, reviews, and user preferences.',
      'Do not invent prerequisites, fees, availability, career outcomes, official university facts, or any facts not supplied.',
      'Return strict JSON only with summary and recommendations.',
      'Each recommendation must reference a supplied courseId and may only use supplied evidence or limitations.'
    ].join(' ')
  },
  {
    role: 'user',
    content: JSON.stringify({
      preferences,
      candidates: recommendations.map(candidatePayload),
      responseShape: {
        summary: 'short string',
        recommendations: [
          {
            courseId: 'number from candidates[].course.id',
            score: 'number',
            reason: 'short grounded explanation',
            evidence: ['strings from supplied candidate evidence'],
            limitations: ['strings from supplied candidate limitations']
          }
        ]
      }
    })
  }
];

const parseJsonContent = (content) => {
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    throw new Error('Groq response content is empty');
  }

  return JSON.parse(trimmed);
};

export const normalizeGroqRecommendations = (groqBody, localRecommendations) => {
  if (!groqBody || typeof groqBody.summary !== 'string' || !Array.isArray(groqBody.recommendations)) {
    throw new Error('Groq response shape is invalid');
  }

  const localById = new Map(localRecommendations.map((recommendation) => [
    recommendation.course.id,
    recommendation
  ]));

  const recommendations = groqBody.recommendations.map((item) => {
    const local = localById.get(Number(item.courseId));
    if (!local || typeof item.reason !== 'string' || !Array.isArray(item.evidence) || !Array.isArray(item.limitations)) {
      throw new Error('Groq recommendation shape is invalid');
    }

    const allowedEvidence = new Set(local.evidence);
    const allowedLimitations = new Set(local.limitations);
    const evidence = item.evidence.map((value) => String(value));
    const limitations = item.limitations.map((value) => String(value));

    if (!evidence.every((value) => allowedEvidence.has(value)) || !limitations.every((value) => allowedLimitations.has(value))) {
      throw new Error('Groq recommendation is not grounded in supplied candidate signals');
    }

    return {
      ...local,
      score: Number.isFinite(Number(item.score)) ? Number(item.score) : local.score,
      reason: item.reason,
      evidence,
      limitations
    };
  });

  if (recommendations.length === 0) {
    throw new Error('Groq returned no recommendations');
  }

  return {
    summary: groqBody.summary,
    recommendations
  };
};

export const rankRecommendationsWithGroq = async (preferences, recommendations, options = {}) => {
  const config = {
    ...getGroqConfig(),
    ...options
  };

  if (!config.apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const fetcher = options.fetcher || globalThis.fetch || nodeFetch;

  try {
    const response = await fetcher(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: buildGroqMessages(preferences, recommendations)
      })
    });

    if (!response.ok) {
      throw new Error(`Groq request failed with ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    return normalizeGroqRecommendations(parseJsonContent(content), recommendations);
  } finally {
    clearTimeout(timeout);
  }
};
