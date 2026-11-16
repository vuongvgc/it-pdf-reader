import type { Vocab } from '../db'

export type Grade = 0 | 1 | 2 | 3 // Quên / Khó / Tốt / Dễ
const QUALITY = [1, 3, 4, 5]
const DAY = 86400000

/** SM-2 */
export function review(v: Vocab, grade: Grade): Partial<Vocab> {
  const q = QUALITY[grade]
  let { srsStage, intervalDays, easeFactor } = v
  if (q < 3) {
    srsStage = 0
    intervalDays = 0
  } else {
    srsStage += 1
    intervalDays =
      srsStage === 1 ? 1 : srsStage === 2 ? 6 : Math.round(intervalDays * easeFactor)
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const nextReviewAt = q < 3 ? Date.now() + 60_000 : Date.now() + intervalDays * DAY
  return { srsStage, intervalDays, easeFactor, nextReviewAt }
}
