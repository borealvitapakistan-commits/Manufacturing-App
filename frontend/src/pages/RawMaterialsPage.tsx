// ============================================================================
// Raw Materials Page
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import {
  Card,
  Button,
  Input,
  NumberInput,
  Label,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
  ConfirmDialog,
  useToast
} from '@/components/ui'
import {
  initSupabase,
  fetchRawMaterials,
  saveRawMaterial,
  deleteRawMaterial
} from '@/lib/supabase/data'
import type { RawMaterial } from '@/types'

interface FormState {
  name: string
  qty: string
  category: string
  location: string
  coaLink: string
  comments: string
  pricePerKg: string
}

const defaultForm: FormState = {
  name: '',
  qty: '',
  category: '',
  location: '',
  coaLink: '',
  comments: '',
  pricePerKg: ''
}

// ============================================================================
// Code Generation Logic (from legacy)
// ============================================================================

function generateNameCode(nameOnly: string | string[]): string {
  const parts = Array.isArray(nameOnly) ? nameOnly : nameOnly.trim().split(/\s+/)

  if (!parts.length) return 'UNK'

  if (parts.length === 1) {
    return parts[0].substring(0, 3).toUpperCase()
  }

  if (parts.length === 2) {
    return (
      parts[0].substring(0, 3).toUpperCase() +
      '_' +
      parts[1].substring(0, 3).toUpperCase()
    )
  }

  const first = parts[0].substring(0, 3).toUpperCase()
  const second = parts[1].substring(0, 3).toUpperCase()
  const remaining = parts.slice(2).map(w => w[0].toUpperCase()).join('')

  return `${first}_${second}_${remaining}`
}

function parseMaterialParts(fullName: string): { nameWords: string[]; chemicalText: string; extractRatio: string } {
  const raw = (fullName || '').trim()
  if (!raw) return { nameWords: [], chemicalText: '', extractRatio: '' }

  const extractMatch = raw.match(/\b(\d+\s*:\s*\d+)\b/)
  const extractRatio = extractMatch ? extractMatch[1].replace(/\s+/g, '') : ''

  // Prefer % inside parentheses; otherwise fall back to any % token
  const parenChem = raw.match(/\(([^)]*?%[^)]*)\)/)
  let chemicalText = parenChem ? parenChem[1] : ''
  if (!chemicalText) {
    const anyPercent = raw.match(/[^()]*?(\d+(?:\.\d+)?)\s*%/)
    if (anyPercent) chemicalText = anyPercent[0].trim()
  }

  const nameWithoutParens = raw.replace(/\([^)]*\)/g, ' ')
  const cleanedName = nameWithoutParens
    .replace(/\b\d+\s*:\s*\d+\b/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, ' ')
  const nameWords = cleanedName.split(/\s+/).filter(Boolean)

  return { nameWords, chemicalText, extractRatio }
}

function buildChemicalCode(chemicalText: string): string {
  if (!chemicalText) return ''
  const percentMatch = chemicalText.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!percentMatch) return ''
  const percent = percentMatch[1] + '%'
  const chemOnly = chemicalText.replace(/(\d+(?:\.\d+)?)\s*%/g, '').trim()
  const chemWords = chemOnly.split(/\s+/).filter(Boolean)
  if (!chemWords.length) return percent
  const chemAbbrev = chemWords.map(w => w.substring(0, 3).toUpperCase()).join('_')
  return `${chemAbbrev}_${percent}`
}

function generateRMCode(fullName: string): string {
  const parts = parseMaterialParts(fullName)
  const nameCode = generateNameCode(parts.nameWords)
  const chemicalCode = buildChemicalCode(parts.chemicalText)
  const extractCode = parts.extractRatio

  const final = ['RM-' + nameCode]
  if (chemicalCode) final.push(chemicalCode)
  if (extractCode) final.push(extractCode)

  return final.join('-')
}

// ============================================================================
// Component
// ============================================================================

export default function RawMaterialsPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [form, setForm] = useState<FormState>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()
  const editingMaterial = materials.find(m => m.id === editingId) || null

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      await initSupabase()
      const list = await fetchRawMaterials()
      setMaterials(list as RawMaterial[])
    } catch (err) {
      console.error('Failed to load raw materials:', err)
      setError('Failed to load raw materials.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return 'Material name is required.'
    return null
  }

  async function handleSave() {
    setError('')
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setSaving(true)

      const code = generateRMCode(form.name.trim())

      const payload = {
        id: editingId || undefined,
        name: form.name.trim(),
        code,
        qty: Number(form.qty) || 0,
        category: form.category.trim() || null,
        location: form.location.trim() || null,
        coaLink: form.coaLink.trim() || null,
        comments: form.comments.trim() || null,
        pricePerKg: Number(form.pricePerKg) || 0
      }

      await saveRawMaterial(payload)

      showToast({
        message: editingId ? 'Material updated' : 'Material created',
        type: 'success'
      })

      resetForm()
      await loadData()
    } catch (err) {
      console.error('Failed to save material:', err)
      setError('Failed to save material.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      setDeleting(true)
      await deleteRawMaterial(deleteTarget.id)
      setMaterials(prev => prev.filter(m => m.id !== deleteTarget.id))
      showToast({ message: 'Material deleted', type: 'success' })
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete material:', err)
      showToast({ message: 'Failed to delete material', type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(material: RawMaterial) {
    setEditingId(material.id)
    setForm({
      name: material.name || '',
      qty: material.qty?.toString() || '',
      category: material.category || '',
      location: material.location || '',
      coaLink: material.coaLink || '',
      comments: material.comments || '',
      pricePerKg: material.pricePerKg?.toString() || ''
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(defaultForm)
    setEditingId(null)
    setError('')
  }

  // Preview the generated code as user types
  const previewCode = form.name.trim() ? generateRMCode(form.name.trim()) : '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Raw Materials</h1>
        <p className="text-zinc-600">Manage raw material inventory and pricing</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-100 text-rose-800 border border-rose-200">
          {error}
        </div>
      )}

      {/* Form */}
      <Card
        title={editingId ? 'Edit Material' : 'Add Material'}
        actions={
          <div className="flex gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            )}
            {editingId && editingMaterial && (
              <Button
                variant="danger"
                onClick={() => setDeleteTarget(editingMaterial)}
              >
                Delete
              </Button>
            )}
            <Button onClick={handleSave} loading={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Material' : 'Save Material'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Material Name *</Label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Curcumin (Curcuminoids 95%) 10:1"
            />
            <p className="mt-1 text-sm text-zinc-500">
              Code preview: <span className="font-mono font-semibold">{previewCode}</span>
            </p>
          </div>
          <div>
            <Label>Quantity (KG)</Label>
            <NumberInput
              value={form.qty}
              onChange={e => setForm({ ...form, qty: e.target.value })}
              placeholder="e.g., 100"
            />
          </div>
          <div>
            <Label>Family / Category</Label>
            <Input
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              placeholder="e.g., Red Clover Extract"
            />
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., Rack A-3"
            />
          </div>
          <div>
            <Label>COA Link</Label>
            <Input
              value={form.coaLink}
              onChange={e => setForm({ ...form, coaLink: e.target.value })}
              placeholder="Certificate file name or URL"
            />
          </div>
          <div>
            <Label>Comments</Label>
            <Input
              value={form.comments}
              onChange={e => setForm({ ...form, comments: e.target.value })}
              placeholder="Optional receiving notes"
            />
          </div>
          <div>
            <Label>Price per KG (USD)</Label>
            <NumberInput
              value={form.pricePerKg}
              onChange={e => setForm({ ...form, pricePerKg: e.target.value })}
              placeholder="e.g., 25.50"
              step="0.01"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card title="All Raw Materials">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Sr</TableHead>
              <TableHead>RM Code</TableHead>
              <TableHead>Raw Material name</TableHead>
              <TableHead>Remaining Qty (KG)</TableHead>
              <TableHead>COA Link</TableHead>
              <TableHead>Comments</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={7} />
            ) : materials.length === 0 ? (
              <TableEmpty colSpan={7} message="No raw materials yet. Add your first material!" />
            ) : (
              materials.map((material, index) => (
                <TableRow
                  key={material.id}
                  clickable
                  onClick={() => startEdit(material)}
                >
                  <TableCell className="text-zinc-500">{index + 1}</TableCell>
                  <TableCell className="font-mono font-semibold">{material.code}</TableCell>
                  <TableCell>{material.name}</TableCell>
                  <TableCell>{material.qty ?? 0}</TableCell>
                  <TableCell>{material.coaLink || '-'}</TableCell>
                  <TableCell>{material.comments || '-'}</TableCell>
                  <TableCell>{material.location || '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Material?"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This may affect products that use this material.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
