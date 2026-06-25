import { useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { useStore } from '../store'
import { fetchLibrary, uploadFile, removeEntry, playEntries, addPaths } from '../lib/libraryApi'

export default function Library() {
  const entries = useStore((s) => s.library)
  const setLibrary = useStore((s) => s.setLibrary)
  const [q, setQ] = useState('')
  const [path, setPath] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const refresh = async (query = q) => setLibrary(await fetchLibrary(query))

  const onSearch = async (e: ChangeEvent<HTMLInputElement>) => {
    setQ(e.target.value)
    await refresh(e.target.value)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const f of Array.from(files)) await uploadFile(f)
    await refresh()
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    await addFiles(e.dataTransfer.files)
  }

  // Folders and playlists can't carry a path through a browser drop, so they're
  // added by server-side path (expanded via collectFiles on the backend).
  const onAddPath = async (e: FormEvent) => {
    e.preventDefault()
    const p = path.trim()
    if (!p) return
    await addPaths([p])
    setPath('')
    await refresh()
  }

  return (
    <aside
      className="panel library"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="panel-title">LIBRARY</div>
      <input
        className="lib-search"
        aria-label="Search library"
        placeholder="search…"
        value={q}
        onChange={onSearch}
      />
      <label className={`dropzone ${dragOver ? 'over' : ''}`}>
        Drop .mid here or click to add
        <input
          type="file"
          accept=".mid,.midi"
          multiple
          hidden
          aria-label="Add files to library"
          onChange={(e) => addFiles(e.target.files)}
        />
      </label>
      <form className="lib-addpath" onSubmit={onAddPath}>
        <input
          className="lib-search"
          aria-label="Add folder or playlist by path"
          placeholder="add folder / playlist by path…"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      <ul className="lib-list">
        {entries.map((e) => (
          <li key={e.id}>
            <button type="button" className="lib-name" aria-label={`Play ${e.name}`} onClick={() => playEntries([e.id])}>
              <span>{e.name}</span>
              <span className="lib-folder">{e.folder}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${e.name} from library`}
              onClick={async () => {
                await removeEntry(e.id)
                await refresh()
              }}
            >
              ✕
            </button>
          </li>
        ))}
        {entries.length === 0 && <li className="empty">Library is empty</li>}
      </ul>
    </aside>
  )
}
