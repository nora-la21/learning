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

// Module-level so every useSpeech instance shares the same pending timer
let pendingTimer: ReturnType<typeof setTimeout> | null = null

export function useSpeech() {
  const speak = useCallback((text: string, lang: string = 'nl', rate = 0.85) => {
    if (!window.speechSynthesis || !text?.trim()) return
    const bcp = toBCP47(lang)
    const langPrefix = bcp.split('-')[0]

    // Cancel any queued speech AND any pending timer from a previous call
    window.speechSynthesis.cancel()
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }

    const doSpeak = () => {
      pendingTimer = null
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume()

      const voices = window.speechSynthesis.getVoices()
      const voice =
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
      window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
    } else {
      pendingTimer = setTimeout(doSpeak, 150)
    }
  }, [])

  const cancel = useCallback(() => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, cancel }
}
