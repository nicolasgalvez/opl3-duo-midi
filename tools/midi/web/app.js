'use strict'

const CH = 16
const channels = Array.from({ length: CH }, () => ({ notes: new Map(), vol: 1, exp: 1, level: 0, peak: 0 }))

const els = {
  device: document.getElementById('device'),
  list: document.getElementById('list'),
  npName: document.getElementById('np-name'),
  npFolder: document.getElementById('np-folder'),
  tCur: document.getElementById('t-cur'),
  tDur: document.getElementById('t-dur'),
  seek: document.getElementById('seek-fill'),
  eq: document.getElementById('eq'),
  btnRepeat: document.getElementById('btn-repeat'),
  btnShuffle: document.getElementById('btn-shuffle'),
}
const ctx = els.eq.getContext('2d')

// EQ palette pulled from the active theme's CSS variables.
function eqColors() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n, d) => cs.getPropertyValue(n).trim() || d
  return {
    low: v('--eq-low', '#4af07a'),
    mid: v('--eq-mid', '#ffcc33'),
    high: v('--eq-high', '#ff5a5a'),
    off: v('--eq-off', '#0f3d20'),
    labelOn: v('--eq-label-on', '#4af07a'),
    labelOff: v('--eq-label-off', '#1f7a3c'),
  }
}
const EQ = eqColors()

function api(action, extra = {}) {
  fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
}

// ---- live event stream ----
const es = new EventSource('/events')
es.onmessage = (e) => {
  const d = JSON.parse(e.data)
  if (d.type === 'ev') applyEvent(d)
  else if (d.type === 'reset') resetChannels()
  else if (d.type === 'pos') updatePos(d.t, d.d)
  else if (d.type === 'state') renderState(d)
}

function applyEvent(d) {
  if (d.k === 'raw') return applyRawEvent(d)
  const c = channels[d.c]
  if (!c) return
  if (d.k === 'on') c.notes.set(d.a, d.b)
  else if (d.k === 'off') c.notes.delete(d.a)
  else if (d.k === 'cc') {
    if (d.a === 7) c.vol = d.b / 127
    else if (d.a === 11) c.exp = d.b / 127
  }
}

// VGM playback has no MIDI channels/notes — approximate EQ activity from OPL
// key-on/off register writes (0xB0-0xB8 per register port, bit 5 = key-on),
// mapped onto the same 16 bars: port 0 -> channels 0-8, port 1 -> channels
// 9-17 (channels 16-17 have nowhere to go on a 16-bar display and are
// dropped). Doesn't reflect per-operator volume (Total Level) — key-on/off
// timing is the dominant visual signal for FM chip music anyway.
function applyRawEvent(d) {
  if (d.reg < 0xb0 || d.reg > 0xb8) return
  const chIdx = d.port === 0 ? d.reg - 0xb0 : 9 + (d.reg - 0xb0)
  const c = channels[chIdx]
  if (!c) return
  if (d.value & 0x20) c.notes.set('opl', 110)
  else c.notes.delete('opl')
}
function resetChannels() {
  for (const c of channels) {
    c.notes.clear()
    c.level = 0
    c.peak = 0
    c.vol = 1
    c.exp = 1
  }
}

const fmt = (s) => {
  s = Math.max(0, s | 0)
  return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`
}

function syncScrollTitle(el) {
  if (!el) return
  el.classList.remove('scroll')
  el.style.removeProperty('--scroll-dist')
  requestAnimationFrame(() => {
    if (el.scrollWidth > el.clientWidth + 1) {
      el.style.setProperty('--scroll-dist', `${el.clientWidth - el.scrollWidth}px`)
      el.classList.add('scroll')
    }
  })
}

function updatePos(t, d) {
  els.tCur.textContent = fmt(t)
  els.tDur.textContent = fmt(d)
  els.seek.style.width = d ? `${Math.min(100, (t / d) * 100)}%` : '0'
}

function renderState(s) {
  const devSig = JSON.stringify(s.devices)
  if (els.device.dataset.sig !== devSig) {
    els.device.dataset.sig = devSig
    els.device.innerHTML = ''
    for (const name of s.devices) {
      const o = document.createElement('option')
      o.value = name
      o.textContent = name
      els.device.appendChild(o)
    }
  }
  if (s.device) els.device.value = s.device

  const listSig = JSON.stringify(s.playlist.map((p) => p.name))
  if (els.list.dataset.sig !== listSig) {
    els.list.dataset.sig = listSig
    els.list.innerHTML = ''
    for (const p of s.playlist) {
      const li = document.createElement('li')
      li.innerHTML = `<span class="num">${String(p.i + 1).padStart(2, '0')}</span>${p.name.replace(/\.midi?$/i, '')}`
      li.onclick = () => {
        api('load', { index: p.i })
        api('play')
      }
      els.list.appendChild(li)
    }
  }
  ;[...els.list.children].forEach((li, i) => li.classList.toggle('cur', i === s.index))
  const cur = s.playlist[s.index]
  const name = cur ? cur.name.replace(/\.midi?$/i, '') : '—'
  els.npName.textContent = name
  syncScrollTitle(els.npName)
  els.npFolder.textContent = cur ? cur.folder : '—'
  if (!s.playing) els.tDur.textContent = fmt(s.duration)
  els.btnRepeat.classList.toggle('on', !!s.repeat)
  els.btnShuffle.classList.toggle('on', !!s.shuffle)
  const curLi = els.list.children[s.index]
  if (curLi) curLi.scrollIntoView({ block: 'nearest' })
}

els.device.onchange = () => api('device', { name: els.device.value })
document.querySelectorAll('.transport button').forEach((b) => {
  b.onclick = () => {
    const act = b.dataset.act
    if (act === 'repeat' || act === 'shuffle') api(act, { on: !b.classList.contains('on') })
    else api(act)
  }
})

// ---- equalizer ----
function frame() {
  const dpr = window.devicePixelRatio || 1
  const w = els.eq.clientWidth
  const h = els.eq.clientHeight
  if (els.eq.width !== w * dpr || els.eq.height !== h * dpr) {
    els.eq.width = w * dpr
    els.eq.height = h * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const segs = 24
  const gap = 6
  const barW = (w - gap * (CH + 1)) / CH
  const segH = (h - 18) / segs

  for (let i = 0; i < CH; i++) {
    const c = channels[i]
    let maxv = 0
    for (const v of c.notes.values()) if (v > maxv) maxv = v
    const target = Math.min(1, (maxv / 127) * c.vol * c.exp * 1.1)
    c.level += (target - c.level) * (target > c.level ? 0.6 : 0.12) // fast attack, slow release
    c.peak = c.level > c.peak ? c.level : Math.max(c.level, c.peak - 0.012)

    const x = gap + i * (barW + gap)
    const lit = Math.round(c.level * segs)
    const peakSeg = Math.round(c.peak * segs)

    for (let s = 0; s < segs; s++) {
      const y = h - 14 - (s + 1) * segH + 1
      const frac = s / segs
      const col = frac > 0.82 ? EQ.high : frac > 0.6 ? EQ.mid : EQ.low
      if (s < lit) {
        ctx.fillStyle = col
        ctx.shadowColor = col
        ctx.shadowBlur = 6
      } else if (s === peakSeg && peakSeg > 0) {
        ctx.fillStyle = col
        ctx.shadowColor = col
        ctx.shadowBlur = 8
      } else {
        ctx.fillStyle = EQ.off
        ctx.shadowBlur = 0
      }
      ctx.fillRect(x, y, barW, segH - 2)
    }
    ctx.shadowBlur = 0
    ctx.fillStyle = lit > 0 ? EQ.labelOn : EQ.labelOff
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), x + barW / 2, h - 2)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
