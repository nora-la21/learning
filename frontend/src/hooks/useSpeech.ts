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
// null = not yet checked, true/false = result cached after first attempt
let ttsAvailable: boolean | null = null

function speakWithWebSpeech(text: string, lang: string, rate: number) {
  if (!window.speechSynthesis) return
  const bcp = toBCP47(lang)
  const langPrefix = bcp.split('-')[0]

  window.speechSynthesis.cancel()
  if (pendingVoicesHandler !== null) {
    window.speechSynthesis.removeEventListener('voiceschanged', pendingVoicesHandler)
    pendingVoicesHandler = null
  }

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
  } else {
    doSpeak()
  }
}

export function useSpeech() {
  const speak = useCallback((text: string, lang: string = 'nl', rate = 0.85) => {
    if (!text?.trim()) return

    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }

    // Skip TTS endpoint if we already know it's unavailable
    if (ttsAvailable === false) {
      speakWithWebSpeech(text, lang, rate)
      return
    }

    const langPrefix = lang.toLowerCase().split('-')[0]
    const voice = localStorage.getItem(`preferred_voice_${langPrefix}`) ?? ''
    const url = `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}${voice ? `&voice=${encodeURIComponent(voice)}` : ''}`

    const audio = new Audio(url)
    currentAudio = audio
    let failTimer: ReturnType<typeof setTimeout> | null = null
    audio.play().catch(() => {
      if (failTimer) { clearTimeout(failTimer); failTimer = null }
      if (currentAudio === audio) currentAudio = null
      ttsAvailable = false
      speakWithWebSpeech(text, lang, rate)
    })
    audio.addEventListener('ended', () => {
      if (failTimer) { clearTimeout(failTimer); failTimer = null }
      if (currentAudio === audio) currentAudio = null
      ttsAvailable = true
    })
    // Reset after 3 minutes so transient failures don't permanently disable TTS
    failTimer = setTimeout(() => { ttsAvailable = null }, 3 * 60 * 1000)
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

  return { speak, cancel }
}
