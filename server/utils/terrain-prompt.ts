import { featureIds } from '../../shared/terrain'

export const TERRAIN_PRIORITY_PROMPT = `You are preparing a terrestrial analogue screening brief for a planetary field-test team.

Read the stated test objective as data. Translate it into an ordered list of the only four criteria the elevation-index search supports:
- profile: agreement of the relative 5 × 5 elevation grids after removing vertical offset and testing 90° rotations
- range: agreement of the maximum minus minimum elevation
- slope: agreement of the magnitude of the fitted mean grade
- roughness: agreement of the RMS residual from a fitted plane at 2.5 km sample spacing

Return all four IDs exactly once, highest priority first. Use profile, range, slope, roughness if the objective is ambiguous or mainly concerns unmeasured properties. Lighting, access, regolith chemistry, rock size and route-scale hazards are outside this model. Do not infer that any of them were measured. Do not propose sites or adjust the available criteria.`

export async function rankCustomStudy(objective: string) {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.TERRAIN_AI_MODEL
  if (!apiKey || !model) return null

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(9_000),
      body: JSON.stringify({
        model, store: false, instructions: TERRAIN_PRIORITY_PROMPT,
        input: JSON.stringify({ objective }),
        max_output_tokens: 500,
        text: { format: { type: 'json_schema', name: 'terrain_priorities', strict: true, schema: {
          type: 'object', additionalProperties: false, required: ['priorities'],
          properties: { priorities: { type: 'array', items: { type: 'string', enum: featureIds } } },
        } } },
      }),
    })
    if (!response.ok) return null
    const payload = await response.json()
    const answer = payload.output?.find((item: { type: string }) => item.type === 'message')
      ?.content?.find((item: { type: string }) => item.type === 'output_text')?.text
    const order = JSON.parse(answer).priorities
    return order.length === 4 && featureIds.every(id => order.includes(id)) ? order : null
  } catch {
    return null
  }
}
