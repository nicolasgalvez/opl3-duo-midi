import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store'

/** Modal for File ▸ Open and File ▸ Save Playlist. Collects a server-side path. */
export default function FileDialogs() {
  const dialog = useStore((s) => s.dialog)
  const setDialog = useStore((s) => s.setDialog)
  const [path, setPath] = useState('')
  const [format, setFormat] = useState<'m3u' | 'jspf'>('m3u')

  if (!dialog) return null

  const close = () => {
    setDialog(null)
    setPath('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const p = path.trim()
    if (!p) return
    if (dialog === 'open') await api('open', { paths: [p], recursive: true })
    else await api('save', { path: p, format })
    close()
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={dialog === 'open' ? 'Open' : 'Save playlist'}>
      <form className="dialog" onSubmit={submit}>
        <div className="dialog-title">
          {dialog === 'open' ? 'Open folder / file / playlist' : 'Save playlist'}
        </div>
        <input
          autoFocus
          className="dialog-input"
          aria-label="Path"
          placeholder={dialog === 'open' ? '/path/to/folder, .mid, .m3u or .jspf' : '/path/to/playlist.m3u'}
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        {dialog === 'save' && (
          <select aria-label="Format" value={format} onChange={(e) => setFormat(e.target.value as 'm3u' | 'jspf')}>
            <option value="m3u">.m3u</option>
            <option value="jspf">.jspf</option>
          </select>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit">{dialog === 'open' ? 'Open' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
