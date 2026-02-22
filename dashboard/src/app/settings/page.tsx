'use client'

import { PERSONALITIES } from '@opengt/shared/personalities'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { io, type Socket } from 'socket.io-client'

interface ConfigState {
    apiKeyHint: string
    hasApiKey: boolean
    engineerEnabled: boolean
    apiKeyValid: boolean | null
}

const LS_PERSONALITY_KEY = 'opengt:personalityId'
const LS_INSTRUCTIONS_KEY = 'opengt:customInstructions'

export default function SettingsPage() {
    const [config, setConfig] = useState<ConfigState>({
        apiKeyHint: '',
        hasApiKey: false,
        engineerEnabled: false,
        apiKeyValid: null,
    })
    const [apiKey, setApiKey] = useState('')
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const socketRef = useRef<Socket | null>(null)

    // Engineer settings (persisted to localStorage)
    const [personalityId, setPersonalityId] = useState('marcus')
    const [customInstructions, setCustomInstructions] = useState('')
    const [showSaved, setShowSaved] = useState(false)
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Load from localStorage on mount
    useEffect(() => {
        const storedPersonality = localStorage.getItem(LS_PERSONALITY_KEY)
        if (storedPersonality) setPersonalityId(storedPersonality)

        const storedInstructions = localStorage.getItem(LS_INSTRUCTIONS_KEY)
        if (storedInstructions) setCustomInstructions(storedInstructions)
    }, [])

    // Persist personality to localStorage
    function handlePersonalityChange(id: string) {
        setPersonalityId(id)
        localStorage.setItem(LS_PERSONALITY_KEY, id)
    }

    // Persist custom instructions to localStorage with "Saved" feedback
    function handleInstructionsChange(value: string) {
        setCustomInstructions(value)
        localStorage.setItem(LS_INSTRUCTIONS_KEY, value)
        setShowSaved(false)
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => {
            setShowSaved(true)
            savedTimerRef.current = setTimeout(() => setShowSaved(false), 1500)
        }, 1600)
    }

    const selectedPersonality = PERSONALITIES.find(p => p.id === personalityId) ?? PERSONALITIES[0]

    useEffect(() => {
        const socket = io('http://localhost:4401', { transports: ['websocket'] })
        socketRef.current = socket

        socket.on('config:state', (state: ConfigState) => {
            setConfig(state)
        })

        socket.on('connect', () => {
            socket.emit('config:testKey', (result: { valid: boolean; error?: string }) => {
                if (!result.valid && result.error && result.error !== 'API key is empty') {
                    setMessage(result.error)
                }
            })
        })

        return () => {
            socket.disconnect()
        }
    }, [])

    const saveKey = useCallback(() => {
        if (!socketRef.current || !apiKey.trim()) return
        setSaving(true)
        setMessage(null)

        socketRef.current.emit(
            'config:setApiKey',
            { apiKey: apiKey.trim() },
            (result: { valid: boolean; error?: string }) => {
                setSaving(false)
                if (result.valid) {
                    setMessage(null)
                    setApiKey('')
                } else {
                    setMessage(result.error ?? 'Invalid API key')
                }
            },
        )
    }, [apiKey])

    const deleteKey = useCallback(() => {
        if (!socketRef.current) return
        socketRef.current.emit('config:deleteKey')
        setApiKey('')
        setMessage(null)
    }, [])

    const toggleEngineer = useCallback((enabled: boolean) => {
        socketRef.current?.emit('config:setEngineerEnabled', { enabled })
    }, [])

    return (
        <div className="min-h-screen p-4 max-w-xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-lg font-bold tracking-wider text-muted-foreground uppercase">Settings</h1>
                <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition">
                    ← Dashboard
                </a>
            </div>

            {/* AI Race Engineer */}
            <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                            AI Race Engineer
                        </h2>
                        <p className="text-xs text-muted-foreground/80">Voice engineer powered by Gemini</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => toggleEngineer(!config.engineerEnabled)}
                        disabled={!config.hasApiKey}
                        className={`w-12 h-6 rounded-full transition relative disabled:opacity-30 disabled:cursor-not-allowed ${
                            config.engineerEnabled ? 'bg-accent-green' : 'bg-border'
                        }`}
                    >
                        <span
                            className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-foreground transition-transform ${
                                config.engineerEnabled ? 'translate-x-[22px]' : 'translate-x-0'
                            }`}
                        />
                    </button>
                </div>

                {config.engineerEnabled && (
                    <div className="mt-5 space-y-6">
                        {/* API Key */}
                        <div>
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">Gemini API key</span>
                                {config.apiKeyValid === false && (
                                    <span className="text-accent-red text-xs">✗ Invalid</span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground/60 mb-1.5">
                                Get a key at{' '}
                                <a
                                    href="https://aistudio.google.com/apikey"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-muted-foreground/80"
                                >
                                    aistudio.google.com
                                </a>
                            </p>

                            {config.hasApiKey ? (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground font-mono">
                                        {config.apiKeyHint || '••••••••••••••••'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={deleteKey}
                                        className="text-xs text-accent-red/70 hover:text-accent-red transition"
                                    >
                                        Delete
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={e => setApiKey(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && saveKey()}
                                        placeholder="Enter your Gemini API key..."
                                        className="flex-1 bg-muted border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-accent-blue"
                                    />
                                    <button
                                        type="button"
                                        onClick={saveKey}
                                        disabled={saving || !apiKey.trim()}
                                        className="px-4 py-2 rounded text-xs font-medium bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            )}

                            {message && (
                                <div className="mt-2 rounded px-3 py-2 text-xs bg-accent-red/10 text-accent-red border border-accent-red/20">
                                    {message}
                                </div>
                            )}
                        </div>

                        {/* Personality Switcher */}
                        <div>
                            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Personality</span>
                            <div className="space-y-1">
                                {PERSONALITIES.map(p => (
                                    <button
                                        type="button"
                                        key={p.id}
                                        onClick={() => handlePersonalityChange(p.id)}
                                        className={`w-full text-left px-3 py-2 rounded text-xs transition ${
                                            personalityId === p.id
                                                ? 'bg-muted text-foreground'
                                                : 'text-muted-foreground hover:bg-muted/50'
                                        }`}
                                    >
                                        <span className="font-medium">
                                            {personalityId === p.id ? '✓ ' : ''}
                                            {p.name}
                                        </span>
                                        <span className="text-muted-foreground/80 ml-1">— {p.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Readonly System Prompt — hidden for Custom */}
                        {selectedPersonality.systemPrompt && (
                            <div>
                                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                                    Default instructions
                                </label>
                                <textarea
                                    readOnly
                                    value={selectedPersonality.systemPrompt}
                                    className="w-full bg-muted border border-border rounded px-3 py-2 text-xs text-muted-foreground font-mono leading-relaxed resize-none focus:outline-none cursor-default"
                                    rows={6}
                                />
                            </div>
                        )}

                        {/* Custom Instructions */}
                        <div>
                            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Custom instructions</label>
                            <p className="text-xs text-muted-foreground/60 mb-1.5">
                                Added on top of the personality above
                            </p>
                            <textarea
                                value={customInstructions}
                                onChange={e => handleInstructionsChange(e.target.value)}
                                placeholder="e.g. Call me Max. Focus on tyre management. Give lap times in seconds only. Speak in Portuguese."
                                className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:border-accent-blue resize-none"
                                rows={6}
                            />
                            <p className={`text-xs text-accent-green/70 mt-1 h-4 transition-opacity ${showSaved ? 'opacity-100' : 'opacity-0'}`}>
                                Saved
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
