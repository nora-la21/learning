import { useEffect, useState } from 'react'

interface Props {
  keyword: string
  wordId: number
}

export default function WordImage({ keyword }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setSrc(null)
    setError(false)
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(keyword)}&prop=pageimages&format=json&pithumbsize=300&origin=*`
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const pages = data.query?.pages
        if (!pages) { setError(true); return }
        const page = Object.values(pages)[0] as any
        if (page?.thumbnail?.source) {
          setSrc(page.thumbnail.source)
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
  }, [keyword])

  if (error) return null

  return (
    <div className="flex justify-center my-3">
      {!src && (
        <div className="w-[200px] h-[138px] rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
      )}
      {src && (
        <img
          src={src}
          alt={keyword}
          onError={() => setError(true)}
          className="rounded-xl object-cover shadow-sm"
          style={{ width: 200, height: 138 }}
        />
      )}
    </div>
  )
}
