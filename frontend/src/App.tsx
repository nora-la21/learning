import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LearnPage from './pages/LearnPage'
import ProgressPage from './pages/ProgressPage'
import LoginPage from './pages/LoginPage'
import { fetchMe } from './api/auth'

export default function App() {
  // null = still checking; the stored token is verified against the server
  // rather than trusted, so a revoked or expired session lands on sign-in.
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    fetchMe()
      .then(me => setAuthenticated(Boolean(me)))
      .catch(() => setAuthenticated(false))
  }, [])

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-ghost animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/learn/:listId" element={<LearnPage />} />
        <Route path="/progress/:listId" element={<ProgressPage />} />
      </Routes>
    </BrowserRouter>
  )
}
