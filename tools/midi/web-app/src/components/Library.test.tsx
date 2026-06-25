import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Library from './Library'
import { useStore } from '../store'

describe('<Library>', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ library: [] })
  })

  it('shows an empty state and a drop zone when the library is empty', () => {
    render(<Library />)
    expect(screen.getByText('Library is empty')).toBeInTheDocument()
    expect(screen.getByLabelText('Add files to library')).toBeInTheDocument()
    expect(screen.getByLabelText('Search library')).toBeInTheDocument()
  })

  it('renders an entry with play + remove controls from store state', () => {
    useStore.setState({
      library: [{ id: 7, path: '/m/song.mid', name: 'song.mid', folder: 'm', addedAt: 1, tags: [] }],
    })
    render(<Library />)
    expect(screen.getByRole('button', { name: 'Play song.mid' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove song.mid from library' })).toBeInTheDocument()
  })
})
