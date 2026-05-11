import { useState } from 'react'

interface Props {
  keyword: string
  wordId: number
}

export default function WordImage({ keyword, wordId }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) return null

  // loremflickr.com: free, no API key, lock param = stable image per word
  const src = `https://loremflickr.com/320/220/${encodeURIComponent(keyword)}?lock=${wordId}`

  return (
    <div className="flex justify-center my-3">
      {!loaded && (
        <div className="w-[200px] h-[138px] rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
      )}
      <img
        src={src}
        alt={keyword}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`rounded-xl object-cover shadow-sm transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0 absolute'}`}
        style={{ width: 200, height: 138 }}
      />
    </div>
  )
}
