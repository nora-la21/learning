import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LearnPage from './pages/LearnPage'
import ProgressPage from './pages/ProgressPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  const [authRequired, setAuthRequired] = useState<boolean | null>(null)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    fetch('/api/auth-status')
      .then(r => r.json())
      .then(({ required }) => {
        setAuthRequired(required)
        if (!required) {
          setAuthenticated(true)
        } else {
          setAuthenticated(Boolean(localStorage.getItem('app_auth')))
        }
      })
      .catch(() => {
        setAuthRequired(false)
        setAuthenticated(true)
      })
  }, [])

  if (authRequired === null) return null

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
