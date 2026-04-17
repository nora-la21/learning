# Language Learning App

A personal vocabulary learning tool with Lingualeo-style gamification. Upload your own word lists and practice through 4 game modes with TTS pronunciation.

## Features

- **Upload** your own words in CSV, TXT, PDF, or Word (.docx) format
- **4 practice modes**: Multiple Choice, Reverse Multiple Choice, Listening (TTS), Type It
- **Pronunciation on every click** — each answer option speaks when selected
- **Spaced repetition** (SM-2 algorithm) tracks your progress
- **Multi-language** support (Dutch, English, French, German, Spanish, and more)
- **Progress charts** — mastery donut, 7-day activity bar chart, per-word stats

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173

## Word File Formats

Upload a file where each line is `word, translation`:

**CSV / TXT:**
```
hond,dog
kat,cat
boom,tree
fiets,bicycle
```

**Word (.docx) or PDF:** Use a 2-column table (first column = word to learn, second = translation).

Tab-separated files also work. The first non-empty cell is always the word to learn.

## Data

The SQLite database is stored at `data/learning.db` (auto-created on first run).
