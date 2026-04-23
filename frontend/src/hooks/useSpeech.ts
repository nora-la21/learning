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

// Preload cache: url → Audio element already fetching
const preloadCache = new Map<string, HTMLAudioElement>()

function buildUrl(text: string, lang: string): string {
  const langPrefix = lang.toLowerCase().split('-')[0]
  const voice = localStorage.getItem(`preferred_voice_${langPrefix}`) ?? ''
  return `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}${voice ? `&voice=${encodeURIComponent(voice)}` : ''}`
}

function speakWithWebSpeech(text: string, lang: string, rate: number) {
  if (!window.speechSynthesis) return
  const bcp = toBCP47(lang)
  const langPrefix = bcp.split('-')[0]

  if (pendingVoicesHandler !== null) {
    window.speechSynthesis.removeEventListener('voiceschanged', pendingVoicesHandler)
    pendingVoicesHandler = null
  }

  // Check before cancel — after cancel() speaking becomes false immediately
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
    // Give Safari time to fully cancel before speaking again — prevents first-syllable repeat
    setTimeout(doSpeak, 50)
  } else {
    doSpeak()
  }
}

export function useSpeech() {
  const preload = useCallback((text: string, lang: string = 'nl') => {
    if (!text?.trim() || Date.now() < bypassUntil) return
    const url = buildUrl(text, lang)
    if (preloadCache.has(url)) return
    const audio = new Audio(url)
    audio.preload = 'auto'
    preloadCache.set(url, audio)
    // Evict after 60s to avoid stale entries
    setTimeout(() => preloadCache.delete(url), 60_000)
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

    // Use preloaded element if available, otherwise create fresh
    const audio = preloadCache.get(url) ?? new Audio(url)
    preloadCache.delete(url)
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
    })
  }, [])

  const cancel = useCallback(() => {
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
