import React from 'react'
import Modal from './Modal'
import Button from './Button'
export default function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', description = 'This action cannot be undone.', confirmLabel = 'Delete' }) { return <Modal open={open} onClose={onClose} title={title}><p className="text-sm text-muted">{description}</p><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="dark" onClick={onConfirm}>{confirmLabel}</Button></div></Modal> }
