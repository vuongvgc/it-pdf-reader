let glossary: Record<string, string> | null = null

export async function lookupGlossary(text: string): Promise<string | null> {
  if (!glossary) {
    try {
      glossary = await (await fetch(`${import.meta.env.BASE_URL}it-glossary.json`)).json()
    } catch {
      glossary = {}
    }
  }
  const clean = text
    .toLowerCase()
    .trim()
    .replace(/^[^\w\s-]+|[^\w\s-]+$/g, '') // remove leading/trailing punctuation

  const g = glossary!

  // Direct match
  if (g[clean]) return g[clean]

  // With hyphens converted to spaces and vice versa
  const spaceVariant = clean.replace(/[-_]+/g, ' ')
  if (g[spaceVariant]) return g[spaceVariant]

  const hyphenVariant = clean.replace(/\s+/g, '-')
  if (g[hyphenVariant]) return g[hyphenVariant]

  // Lemmatized / suffix stripped (e.g. "characteristics" -> "characteristic", "services" -> "service")
  const stripped = clean.replace(/(ing|ed|es|s)$/, '')
  if (g[stripped]) return g[stripped]

  const strippedVariant = spaceVariant.replace(/(ing|ed|es|s)$/, '')
  if (g[strippedVariant]) return g[strippedVariant]

  return null
}

export interface DictResult {
  phonetic: string
  meanings: { pos: string; def: string }[]
}

export async function lookupDictionary(word: string): Promise<DictResult | null> {
  const clean = word.toLowerCase().trim().replace(/^[^\w]+|[^\w]+$/g, '')
  if (!clean || clean.includes(' ')) return null // Free Dict API is for single words

  try {
    const r = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`,
    )
    if (!r.ok) return null
    const d = (await r.json())[0]
    return {
      phonetic: d.phonetic || d.phonetics?.find((p: any) => p.text)?.text || '',
      meanings: (d.meanings ?? []).slice(0, 3).map((m: any) => ({
        pos: m.partOfSpeech,
        def: m.definitions?.[0]?.definition ?? '',
      })),
    }
  } catch {
    return null
  }
}

export function speak(text: string, rate = 1) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = rate
  speechSynthesis.speak(u)
}
