import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LearnPage from './pages/LearnPage'
import ProgressPage from './pages/ProgressPage'

export default function App() {
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
