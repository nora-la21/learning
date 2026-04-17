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

export function useSpeech() {
  const speak = useCallback((text: string, lang: string = 'nl', rate = 0.85) => {
    if (!window.speechSynthesis) return

    const bcp = toBCP47(lang)

    const doSpeak = () => {
      // Chrome bug workaround: cancel any stuck utterance, then resume
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = bcp
      utterance.rate = rate
      utterance.pitch = 1.0

      const voices = window.speechSynthesis.getVoices()
      utterance.voice =
        voices.find(v => v.lang === bcp) ??
        voices.find(v => v.lang.startsWith(bcp.split('-')[0])) ??
        null

      window.speechSynthesis.speak(utterance)
    }

    // Voices may not be loaded yet on first call
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
    } else {
      doSpeak()
    }
  }, [])

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, cancel }
}
