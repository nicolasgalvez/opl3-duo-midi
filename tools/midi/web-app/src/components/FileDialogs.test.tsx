import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FileDialogs from './FileDialogs'
import { useStore } from '../store'

describe('<FileDialogs>', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ dialog: null })
  })

  it('renders nothing when no dialog is open', () => {
    const { container } = render(<FileDialogs />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the open dialog with a path field when dialog = "open"', () => {
    useStore.setState({ dialog: 'open' })
    render(<FileDialogs />)
    expect(screen.getByRole('dialog', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByLabelText('Path')).toBeInTheDocument()
  })

  it('shows a format selector only in the save dialog', () => {
    useStore.setState({ dialog: 'save' })
    render(<FileDialogs />)
    expect(screen.getByLabelText('Format')).toBeInTheDocument()
  })

  it('Cancel closes the dialog', () => {
    useStore.setState({ dialog: 'open' })
    render(<FileDialogs />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(useStore.getState().dialog).toBeNull()
  })
})
