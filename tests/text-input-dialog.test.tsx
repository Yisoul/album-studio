/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TextInputDialog from '../src/renderer/src/TextInputDialog'

afterEach(cleanup)

describe('TextInputDialog', () => {
  it('submits a trimmed name from the keyboard', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<TextInputDialog title="新建相册" label="相册名称" confirmLabel="创建相册" onClose={() => undefined} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('相册名称'), { target: { value: '  街拍  ' } })
    fireEvent.submit(screen.getByRole('button', { name: '创建相册' }).closest('form')!)

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('街拍'))
  })

  it('shows the create error inside the dialog', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('相册名称已存在'))
    render(<TextInputDialog title="新建相册" label="相册名称" onClose={() => undefined} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('相册名称'), { target: { value: '重复名称' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    expect((await screen.findByRole('alert')).textContent).toContain('相册名称已存在')
  })
})