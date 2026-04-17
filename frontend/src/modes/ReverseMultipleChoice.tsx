import type { GameQuestion } from '../types'
import MultipleChoice from './MultipleChoice'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
}

// Reverse MC: prompt is target_word (translation), options are source_words
// The speaker should use target_lang for prompt, source_lang for options
export default function ReverseMultipleChoice({ question, onAnswer }: Props) {
  return (
    <MultipleChoice
      question={question}
      onAnswer={onAnswer}
      showSourceSpeaker={true}
    />
  )
}
