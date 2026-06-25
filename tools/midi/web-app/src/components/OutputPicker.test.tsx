import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OutputPicker from './OutputPicker'
import { useStore } from '../store'

describe('<OutputPicker>', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ outputMode: 'hardware' })
  })

  it('offers hardware and soundfont options, reflecting the current mode', () => {
    render(<OutputPicker />)
    const select = screen.getByLabelText<HTMLSelectElement>('Output mode')
    expect(select.value).toBe('hardware')
    expect(screen.getByRole('option', { name: 'Hardware MIDI' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'SoundFont (browser)' })).toBeInTheDocument()
  })

  it('switching to SoundFont updates the store', () => {
    render(<OutputPicker />)
    fireEvent.change(screen.getByLabelText('Output mode'), { target: { value: 'soundfont' } })
    expect(useStore.getState().outputMode).toBe('soundfont')
  })
})
