const DEFAULT_SERVER = 'https://learning-production-fbb6.up.railway.app'

function getAPI() {
  return new Promise(res =>
    chrome.storage.local.get('dvh_server', v =>
      res(((v.dvh_server || DEFAULT_SERVER).replace(/\/$/, '')) + '/api')
    )
  )
}

let popup = null
let lists = []

// ── Fetch lists from the app ────────────────────────────────────────────────
async function fetchLists() {
  const API = await getAPI()
  try {
    const r = await fetch(`${API}/lists?builtin=false`)
    lists = await r.json()
  } catch {
    lists = []
  }
}

// ── Translate NL → EN via MyMemory (free, no key) ──────────────────────────
async function translate(word) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=nl|en`
    const r = await fetch(url)
    const d = await r.json()
    const t = d?.responseData?.translatedText
    return t && t.toLowerCase() !== word.toLowerCase() ? t : null
  } catch {
    return null
  }
}

// ── Look up Dutch article (de/het) via Wiktionary ──────────────────────────
async function lookupArticle(word) {
  if (word.includes(' ')) return null  // only single words
  try {
    const url = `https://nl.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word.toLowerCase())}&prop=revisions&rvprop=content&format=json&origin=*`
    const r = await fetch(url)
    const d = await r.json()
    const page = Object.values(d.query?.pages ?? {})[0]
    const content = page?.revisions?.[0]?.['*'] ?? page?.revisions?.[0]?.content ?? ''
    if (!content) return null
    const m = content.match(/\{\{nl-noun\|([mnf]+)/)
    if (!m) return null
    return m[1] === 'n' ? 'het' : 'de'
  } catch {
    return null
  }
}


function removePopup() {
  if (popup) { popup.remove(); popup = null }
}

// ── Build & show popup ──────────────────────────────────────────────────────
async function showPopup(word, x, y) {
  removePopup()
  await fetchLists()

  popup = document.createElement('div')
  popup.id = 'dvh-popup'

  const savedListId = await getStorage('dvh_list_id')

  popup.innerHTML = `
    <button class="dvh-close" title="Close">✕</button>
    <div class="dvh-word">${escHtml(word)}</div>
    <div class="dvh-translation dvh-loading">Translating…</div>
    <div class="dvh-row">
      <select id="dvh-list-sel">
        ${lists.length === 0
          ? '<option value="">— no lists yet —</option>'
          : lists.map(l => `<option value="${l.id}" ${l.id == savedListId ? 'selected' : ''}>${escHtml(l.name)}</option>`).join('')
        }
      </select>
      <button class="dvh-btn-add" id="dvh-add" disabled>+ Add</button>
    </div>
    <div class="dvh-row">
      <button class="dvh-new-list" id="dvh-new-list">+ Create new list</button>
    </div>
    <div class="dvh-status" id="dvh-status"></div>
  `

  // Position near selection but stay within viewport
  const margin = 12
  const pw = 280, ph = 160
  let left = x, top = y + 14
  if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin
  if (top + ph > window.innerHeight - margin) top = y - ph - 10
  if (left < margin) left = margin

  popup.style.left = left + 'px'
  popup.style.top  = top  + 'px'
  document.body.appendChild(popup)

  // Translate + look up article in parallel
  let translation = null
  let sourceWord = word
  Promise.all([translate(word), lookupArticle(word)]).then(([t, article]) => {
    if (!popup) return
    translation = t
    const el = popup.querySelector('.dvh-translation')
    if (el) {
      el.textContent = t || '(no translation found)'
      el.classList.remove('dvh-loading')
    }
    if (article) {
      sourceWord = `${article} ${word}`
      const wordEl = popup.querySelector('.dvh-word')
      if (wordEl) wordEl.textContent = sourceWord
    }
    // Enable Add only after lookup completes so sourceWord is final
    const addBtn = popup.querySelector('#dvh-add')
    if (addBtn && lists.length > 0) addBtn.disabled = false
  })

  // Close button
  popup.querySelector('.dvh-close').onclick = removePopup

  // List selector → remember choice
  popup.querySelector('#dvh-list-sel').onchange = e => {
    setStorage('dvh_list_id', e.target.value)
  }

  // Add button
  popup.querySelector('#dvh-add').onclick = async () => {
    const listId = Number(popup.querySelector('#dvh-list-sel').value)
    if (!listId) return
    const tgt = translation || word
    const btn = popup.querySelector('#dvh-add')
    const status = popup.querySelector('#dvh-status')
    btn.disabled = true
    btn.textContent = '…'
    try {
      const API = await getAPI()
      const r = await fetch(`${API}/words/quick-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: listId, source_word: sourceWord, target_word: tgt }),
      })
      if (!r.ok) throw new Error('Failed')
      if (!popup) return
      status.textContent = `✓ Added to list`
      btn.textContent = '✓'
      setTimeout(removePopup, 1200)
    } catch {
      status.textContent = 'Error — is the app running?'
      status.classList.add('dvh-err')
      btn.disabled = false
      btn.textContent = '+ Add'
    }
  }

  // Create new list
  popup.querySelector('#dvh-new-list').onclick = async () => {
    const name = prompt('New list name:')
    if (!name?.trim()) return
    try {
      const API = await getAPI()
      const r = await fetch(`${API}/lists?name=${encodeURIComponent(name.trim())}`, { method: 'POST' })
      const data = await r.json()
      lists.push({ id: data.id, name: name.trim() })
      if (!popup) return
      const sel = popup.querySelector('#dvh-list-sel')
      sel.innerHTML = lists.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('')
      sel.value = data.id
      setStorage('dvh_list_id', data.id)
      popup.querySelector('#dvh-add').disabled = false
    } catch {
      alert('Could not create list — is the app running?')
    }
  }
}

// ── Listen for text selection ───────────────────────────────────────────────
document.addEventListener('mouseup', e => {
  // Don't trigger inside the popup itself
  if (popup && popup.contains(e.target)) return

  const sel = window.getSelection()
  const word = sel?.toString().trim()

  if (!word || word.length < 2 || word.length > 300) {
    removePopup()
    return
  }

  getStorage('dvh_enabled').then(enabled => {
    if (enabled === false) return
    showPopup(word, e.clientX, e.clientY)
  })
})

// Close popup when clicking elsewhere
document.addEventListener('mousedown', e => {
  if (popup && !popup.contains(e.target)) removePopup()
})

// ── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function getStorage(key) {
  return new Promise(res => chrome.storage.local.get(key, v => res(v[key])))
}
function setStorage(key, val) {
  chrome.storage.local.set({ [key]: val })
}
