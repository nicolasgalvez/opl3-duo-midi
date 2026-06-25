import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MenuBar from './MenuBar'
import { useStore } from '../store'
import { DEFAULT_CONFIG } from '../lib/config'

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
      config: DEFAULT_CONFIG,
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

  it('hides the Edit menu and the library toggle when those features are disabled', () => {
    useStore.setState({
      config: {
        ...DEFAULT_CONFIG,
        features: { ...DEFAULT_CONFIG.features, edit: false, library: false },
      },
    })
    render(<MenuBar />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.queryByRole('menuitem', { name: 'Toggle Library' })).toBeNull()
    // View ▸ theme still present
    expect(screen.getByRole('menuitem', { name: 'Theme: Winamp' })).toBeInTheDocument()
  })

  it('clicking a menu item closes the menu afterwards', () => {
    render(<MenuBar />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Toggle Playlist' }))
    expect(screen.queryByRole('menuitem', { name: 'Toggle Playlist' })).toBeNull()
    expect(useStore.getState().showPlaylist).toBe(false)
  })
})
