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

// Module-level so every useSpeech instance shares the same pending state
let pendingVoicesHandler: (() => void) | null = null

export function useSpeech() {
  const speak = useCallback((text: string, lang: string = 'nl', rate = 0.85) => {
    if (!window.speechSynthesis || !text?.trim()) return
    const bcp = toBCP47(lang)
    const langPrefix = bcp.split('-')[0]

    // Cancel any ongoing speech and remove any stale voiceschanged listener
    window.speechSynthesis.cancel()
    if (pendingVoicesHandler !== null) {
      window.speechSynthesis.removeEventListener('voiceschanged', pendingVoicesHandler)
      pendingVoicesHandler = null
    }

    const doSpeak = () => {
      pendingVoicesHandler = null
      // Chrome: resume() after cancel() prevents the synthesis engine from getting stuck
      window.speechSynthesis.resume()

      const voices = window.speechSynthesis.getVoices()
      const preferredName = localStorage.getItem(`preferred_voice_${langPrefix}`)
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
      // Voices not yet loaded — speak once they arrive
      pendingVoicesHandler = doSpeak
      window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
    } else {
      // Synchronous call — no setTimeout — Chrome requires speak() in the same
      // execution context as the user gesture; a setTimeout breaks that chain
      doSpeak()
    }
  }, [])

  const cancel = useCallback(() => {
    if (pendingVoicesHandler !== null) {
      window.speechSynthesis?.removeEventListener('voiceschanged', pendingVoicesHandler)
      pendingVoicesHandler = null
    }
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, cancel }
}
