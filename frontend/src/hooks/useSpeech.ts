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
    if (!window.speechSynthesis || !text?.trim()) return
    const bcp = toBCP47(lang)
    const langPrefix = bcp.split('-')[0]

    const doSpeak = () => {
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume()

      // Brief pause so the engine fully stops before the next utterance
      setTimeout(() => {
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
      }, 80)
    }

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
