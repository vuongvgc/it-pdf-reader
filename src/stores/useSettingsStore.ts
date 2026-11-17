import { create } from 'zustand'

export type Theme = 'light' | 'sepia' | 'dark'
export interface Settings {
  theme: Theme
  aiProvider: 'gemini' | 'openai'
  apiKey: string
  targetLang: string
  ttsRate: number
  githubToken: string
  gistId: string
  autoSync: boolean
  syncApiKey: boolean
  lastSyncedAt: number
  underlineVocab: boolean
  cropMargins: boolean
}

const KEY = 'itpdf-settings'
const defaults: Settings = {
  theme: 'dark',
  aiProvider: 'gemini',
  apiKey: '',
  targetLang: 'vi',
  ttsRate: 1,
  githubToken: '',
  gistId: '',
  autoSync: true,
  syncApiKey: true,
  lastSyncedAt: 0,
  underlineVocab: true,
  cropMargins: false,
}

interface Store extends Settings {
  set: (p: Partial<Settings>) => void
}

export const useSettings = create<Store>((set, get) => ({
  ...defaults,
  ...JSON.parse(localStorage.getItem(KEY) || '{}'),
  set: (p) => {
    set(p)
    const { set: _s, ...rest } = get()
    localStorage.setItem(KEY, JSON.stringify(rest))
  },
}))
