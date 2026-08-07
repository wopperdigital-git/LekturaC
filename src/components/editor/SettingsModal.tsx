import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Label } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useSettingsStore } from '@/store/settingsStore'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { geminiApiKey, setGeminiApiKey } = useSettingsStore()
  const [value, setValue] = useState(geminiApiKey)

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <Label>Gemini API key</Label>
          <Input
            type="password"
            placeholder="AIza..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-app-muted">
            Free at aistudio.google.com/apikey. Stored only in this browser's local storage and sent
            directly to Google's API — never through any server of ours.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setGeminiApiKey(value.trim())
            onClose()
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  )
}
