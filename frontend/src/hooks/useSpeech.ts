import { useCallback } from 'react'

const LANG_MAP: Record<string, string> = {
  nl: 'nl-NL',
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
}

function toBCP47(lang: string): string {
  return LANG_MAP[lang.toLowerCase()] ?? lang
}

const DEFAULT_BROWSER_VOICE: Record<string, string> = {
  en: 'Samantha',
}

// Module-level shared state
let currentAudio: HTMLAudioElement | null = null
let pendingVoicesHandler: (() => void) | null = null
let consecutiveFailures = 0
let bypassUntil = 0
let speakGeneration = 0  // monotonic counter — increment on each speak() call to cancel stale async work

// blob URL cache: tts-url → fully-downloaded blob URL (audio data fully in memory)
const blobCache = new Map<string, string>()
// deduplicate concurrent fetches for the same URL
const pendingFetches = new Map<string, Promise<string | null>>()

function buildUrl(text: string, lang: string): string {
  const langPrefix = lang.toLowerCase().split('-')[0]
  const voice = localStorage.getItem(`preferred_voice_${langPrefix}`) ?? ''
  return `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}${voice ? `&voice=${encodeURIComponent(voice)}` : ''}`
}

function getOrFetchBlob(url: string): Promise<string | null> {
  const cached = blobCache.get(url)
  if (cached) return Promise.resolve(cached)
  if (pendingFetches.has(url)) return pendingFetches.get(url)!
  const p = fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      blobCache.set(url, blobUrl)
      return blobUrl
    })
    .catch(() => null)
    .finally(() => pendingFetches.delete(url))
  pendingFetches.set(url, p)
  return p
}

function speakWithWebSpeech(text: string, lang: string, rate: number) {
  if (!window.speechSynthesis) return
  const bcp = toBCP47(lang)
  const langPrefix = bcp.split('-')[0]

  if (pendingVoicesHandler !== null) {
    window.speechSynthesis.removeEventListener('voiceschanged', pendingVoicesHandler)
    pendingVoicesHandler = null
  }

  const wasSpeaking = window.speechSynthesis.speaking
  window.speechSynthesis.cancel()

  const doSpeak = () => {
    pendingVoicesHandler = null
    window.speechSynthesis.resume()
    const voices = window.speechSynthesis.getVoices()
    const preferredName =
      localStorage.getItem(`preferred_voice_${langPrefix}`) ??
      DEFAULT_BROWSER_VOICE[langPrefix] ??
      null
    const voice =
      (preferredName ? voices.find(v => v.name === preferredName && v.lang.startsWith(langPrefix)) : null) ??
      voices.find(v => v.lang === bcp) ??
      voices.find(v => v.lang.startsWith(langPrefix)) ??
      null
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = voice?.lang ?? bcp
    utterance.rate = rate
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
  }

  if (window.speechSynthesis.getVoices().length === 0) {
    pendingVoicesHandler = doSpeak
    window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
  } else if (wasSpeaking) {
    setTimeout(doSpeak, 50)
  } else {
    doSpeak()
  }
}

function startAudio(audio: HTMLAudioElement, text: string, lang: string, rate: number) {
  currentAudio = audio
  audio.play().catch(() => {
    if (currentAudio === audio) currentAudio = null
    consecutiveFailures++
    if (consecutiveFailures >= 3) {
      bypassUntil = Date.now() + 30_000
      consecutiveFailures = 0
    }
    speakWithWebSpeech(text, lang, rate)
  })
  audio.addEventListener('ended', () => {
    if (currentAudio === audio) currentAudio = null
    consecutiveFailures = 0
  }, { once: true })
}

export function useSpeech() {
  const preload = useCallback((text: string, lang: string = 'nl') => {
    if (!text?.trim() || Date.now() < bypassUntil) return
    const url = buildUrl(text, lang)
    getOrFetchBlob(url)  // fire-and-forget; result stored in blobCache
  }, [])

  const speak = useCallback((text: string, lang: string = 'nl', rate = 0.85) => {
    if (!text?.trim()) return

    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }

    if (Date.now() < bypassUntil) {
      speakWithWebSpeech(text, lang, rate)
      return
    }

    const url = buildUrl(text, lang)
    const cachedBlob = blobCache.get(url)

    if (cachedBlob) {
      // Fully in memory — no buffering possible
      startAudio(new Audio(cachedBlob), text, lang, rate)
      return
    }

    // Fetch (or await an in-flight fetch), then play
    const gen = ++speakGeneration
    getOrFetchBlob(url).then(blobUrl => {
      if (speakGeneration !== gen) return  // a newer speak() fired — discard this result
      if (!blobUrl) {
        speakWithWebSpeech(text, lang, rate)
        return
      }
      startAudio(new Audio(blobUrl), text, lang, rate)
    })
  }, [])

  const cancel = useCallback(() => {
    speakGeneration++  // cancel any pending async speak
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    if (pendingVoicesHandler !== null) {
      window.speechSynthesis?.removeEventListener('voiceschanged', pendingVoicesHandler)
      pendingVoicesHandler = null
    }
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, preload, cancel }
}
