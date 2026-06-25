import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MenuBar from './MenuBar'
import { useStore } from '../store'

describe('<MenuBar>', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({
      theme: 'green',
      layout: 'normal',
      showPlaylist: true,
      showEqualizer: true,
      lastIndex: 0,
      lastPosition: 0,
      player: null,
    })
  })

  it('renders the File, Edit, and View menus', () => {
    render(<MenuBar />)
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
  })

  it('menu items are hidden until the menu is opened', () => {
    render(<MenuBar />)
    expect(screen.queryByRole('menuitem', { name: 'Theme: Winamp' })).toBeNull()
  })

  it('opening View and clicking "Theme: Winamp" updates the store', () => {
    render(<MenuBar />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Theme: Winamp' }))
    expect(useStore.getState().theme).toBe('winamp')
  })

  it('clicking a menu item closes the menu afterwards', () => {
    render(<MenuBar />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Toggle Playlist' }))
    expect(screen.queryByRole('menuitem', { name: 'Toggle Playlist' })).toBeNull()
    expect(useStore.getState().showPlaylist).toBe(false)
  })
})
