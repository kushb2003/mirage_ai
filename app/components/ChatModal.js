'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, CheckCircle, ChevronDown, Search, ArrowLeft, User, Bot, MessageCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import MessageFormatter from './MessageFormatter'
import { getChatAuthHeaders } from '../../lib/chatAuth'

const availableModels = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'Advanced reasoning, complex problem-solving, and multi-step analysis',
    icon: '/image/chatgpt.png',
    color: 'border-pink-500',
  },
  {
    id: 'claude-4',
    name: 'Claude 4',
    description: 'Thoughtful analysis with ethical reasoning and balanced perspectives',
    icon: '/image/claude.png',
    color: 'border-pink-400',
  },
  {
    id: 'gemini-2.5',
    name: 'Gemini 2.5',
    description: 'Real-time data integration and practical, actionable insights',
    icon: '/image/gemini.png',
    color: 'border-pink-300',
  },
]

const responseModes = [
  { id: 'detailed', name: 'Comprehensive Analysis', description: 'In-depth explanations with examples and context' },
  { id: 'concise', name: 'Direct & Focused', description: 'Clear, efficient answers focused on key points' },
  { id: 'creative', name: 'Creative & Innovative', description: 'Imaginative thinking with unique perspectives' },
]

export default function ChatModal({ onClose }) {
  const { user, signOut } = useAuth()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [responseMode, setResponseMode] = useState('detailed')
  const [modelResponses, setModelResponses] = useState({})
  const [selectedModel, setSelectedModel] = useState(null)
  const [useWebSearch, setUseWebSearch] = useState(true)
  const [showFullMode, setShowFullMode] = useState(false)
  const [fullModeConversation, setFullModeConversation] = useState([])
  const [lastUserMessage, setLastUserMessage] = useState('')

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setLastUserMessage(userMessage)
    setInput('')
    setIsLoading(true)
    setSelectedModel(null)

    // Initialize responses for all models
    const initialResponses = {}
    availableModels.forEach(model => {
      initialResponses[model.id] = {
        model: model.id,
        response: '',
        loading: true,
        error: null
      }
    })
    setModelResponses(initialResponses)

    // Generate responses for all models in parallel
    const responsePromises = availableModels.map(async (model) => {
      try {
        const authHeaders = await getChatAuthHeaders()
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            message: userMessage,
            model: model.id,
            mode: responseMode,
            useWebSearch: useWebSearch,
          }),
        })
        
        const data = await response.json()
        
        return {
          modelId: model.id,
          success: data.success,
          response: data.response,
          error: data.error
        }
      } catch (error) {
        return {
          modelId: model.id,
          success: false,
          response: '',
          error: 'Network error'
        }
      }
    })

    // Process responses as they come in
    const results = await Promise.allSettled(responsePromises)
    
    const finalResponses = {}
    results.forEach((result, index) => {
      const modelId = availableModels[index].id
      if (result.status === 'fulfilled') {
        const data = result.value
        finalResponses[modelId] = {
          model: modelId,
          response: data.success ? data.response : `Error: ${data.error}`,
          loading: false,
          error: data.success ? null : data.error
        }
      } else {
        finalResponses[modelId] = {
          model: modelId,
          response: 'Failed to generate response',
          loading: false,
          error: 'Request failed'
        }
      }
    })

    setModelResponses(finalResponses)
    setIsLoading(false)
  }

  const selectModel = (modelId) => {
    setSelectedModel(modelId)
    
    // Get the current conversation for full mode
    const selectedModelData = availableModels.find(m => m.id === modelId)
    const response = modelResponses[modelId]
    
    if (response && !response.error) {
      // Create conversation history for full mode
      const conversation = [
        { type: 'user', content: lastUserMessage || 'Previous question', timestamp: Date.now() - 1000 },
        { type: 'ai', content: response.response, timestamp: Date.now() }
      ]
      
      setFullModeConversation(conversation)
      setShowFullMode(true)
    }
  }

  const exitFullMode = () => {
    setShowFullMode(false)
    setSelectedModel(null)
    setFullModeConversation([])
  }

  const handleFullModeMessage = async (message) => {
    if (!selectedModel || isLoading) return

    setIsLoading(true)
    
    // Add user message to conversation
    const userMessage = { type: 'user', content: message, timestamp: Date.now() }
    setFullModeConversation(prev => [...prev, userMessage])
    
    // Add placeholder AI message for streaming
    const aiMessage = { type: 'ai', content: '', timestamp: Date.now(), streaming: true }
    setFullModeConversation(prev => [...prev, aiMessage])

    try {
      const authHeaders = await getChatAuthHeaders()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          message: message,
          model: selectedModel,
          mode: responseMode,
          stream: true,
          useWebSearch: useWebSearch,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulatedContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.error) {
                setFullModeConversation(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: `Error: ${data.error}`,
                    error: true,
                    streaming: false
                  }
                  return updated
                })
                break
              }

              if (data.done) {
                setFullModeConversation(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    streaming: false
                  }
                  return updated
                })
                break
              }

              if (data.chunk) {
                accumulatedContent += data.chunk
                
                setFullModeConversation(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: accumulatedContent
                  }
                  return updated
                })
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error streaming for ${selectedModel}:`, error)
      setFullModeConversation(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: 'Network error occurred',
          error: true,
          streaming: false
        }
        return updated
      })
    }

    setIsLoading(false)
  }

  const messagesEndRef = useRef(null)
  const [fullModeInput, setFullModeInput] = useState('')

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (showFullMode) {
      scrollToBottom()
    }
  }, [fullModeConversation, showFullMode])

  const handleFullModeSubmit = () => {
    if (!fullModeInput.trim() || isLoading) return
    
    const message = fullModeInput.trim()
    setFullModeInput('')
    handleFullModeMessage(message)
  }

  // Full Mode UI
  if (showFullMode && selectedModel) {
    const selectedModelData = availableModels.find(m => m.id === selectedModel)
    
    return (
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="modal-content dark-theme animate-slide-up w-full h-full max-w-none max-h-none md:w-auto md:h-auto md:max-w-4xl md:max-h-[90vh] md:rounded-2xl" onClick={e => e.stopPropagation()}>
          {/* Full Mode Header - Mobile responsive */}
          <div className="flex items-center justify-between p-3 md:p-4 lg:p-6 border-b border-gray-700">
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={exitFullMode}
                className="p-1.5 md:p-2 hover:bg-gray-700 rounded-full transition-colors"
              >
                <ArrowLeft size={18} className="lg:w-5 lg:h-5 text-gray-400" />
              </button>
              <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
                <img 
                  src={selectedModelData.icon} 
                  alt={selectedModelData.name}
                  className="w-4 h-4 lg:w-6 lg:h-6 object-contain"
                />
              </div>
              <div>
                <h2 className="text-lg lg:text-xl font-semibold text-gray-100">{selectedModelData.name}</h2>
                <p className="text-xs lg:text-sm text-gray-400">Full Chat Mode</p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:gap-4">
              <span className="text-xs lg:text-sm text-gray-400 hidden sm:block">
                {user?.email}
              </span>
              <button
                onClick={signOut}
                className="text-xs lg:text-sm text-gray-400 hover:text-gray-200 px-2 py-1 rounded transition-colors hidden lg:block"
              >
                Sign Out
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-700 rounded-full transition-colors"
              >
                <X size={18} className="lg:w-5 lg:h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Settings Bar */}
          <div className="p-3 lg:p-4 border-b border-gray-700 bg-gray-800/50">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-4">
                <label className="text-xs lg:text-sm font-medium text-gray-300">Response Mode:</label>
                <div className="relative">
                  <select
                    value={responseMode}
                    onChange={(e) => setResponseMode(e.target.value)}
                    className="dropdown-select appearance-none pr-8 text-xs lg:text-sm"
                  >
                    {responseModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-300">Web Search:</label>
                <button
                  onClick={() => setUseWebSearch(!useWebSearch)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    useWebSearch ? 'bg-pink-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useWebSearch ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-6 overflow-y-auto" style={{ maxHeight: '500px' }}>
            <div className="space-y-4">
              {fullModeConversation.map((message, index) => (
                <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${
                    message.type === 'user' 
                      ? 'bg-pink-600 text-white rounded-2xl rounded-br-md px-4 py-3' 
                      : message.error 
                        ? 'bg-red-900/20 border border-red-500/50 text-red-300 rounded-2xl rounded-bl-md px-4 py-3'
                        : 'bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md px-4 py-3'
                  }`}>
                    <div className="flex items-start gap-3">
                      {message.type === 'ai' && (
                        <div className="w-6 h-6 rounded-lg overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1">
                          <img 
                            src={selectedModelData.icon} 
                            alt={selectedModelData.name}
                            className="w-4 h-4 object-contain"
                          />
                        </div>
                      )}
                      {message.type === 'user' && (
                        <div className="w-6 h-6 bg-pink-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                          <User size={14} className="text-white" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <MessageFormatter 
                          content={message.content} 
                          isStreaming={message.streaming}
                          model={message.type === 'ai' ? selectedModel : null}
                        />
                        {message.streaming && (
                          <div className="flex items-center gap-1 mt-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Full Mode Input */}
          <div className="p-6 border-t border-gray-700">
            <div className="flex gap-3">
              <input
                type="text"
                value={fullModeInput}
                onChange={(e) => setFullModeInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleFullModeSubmit()}
                placeholder={`Continue chatting with ${selectedModelData.name}...`}
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                disabled={isLoading}
              />
              <button
                onClick={handleFullModeSubmit}
                disabled={isLoading || !fullModeInput.trim()}
                className="px-6 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2"
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal-content dark-theme animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header - Mobile responsive */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-700">
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="w-6 h-6 lg:w-8 lg:h-8 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 lg:w-5 lg:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-lg lg:text-xl font-semibold text-gray-100">AI Model Comparison</h2>
          </div>
          <div className="flex items-center gap-2 lg:gap-4">
            <span className="text-xs lg:text-sm text-gray-400 hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={signOut}
              className="text-xs lg:text-sm text-gray-400 hover:text-gray-200 px-2 py-1 rounded transition-colors hidden sm:block"
            >
              Sign Out
            </button>
            <button
              onClick={onClose}
              className="p-1.5 lg:p-2 hover:bg-gray-700 rounded-full transition-colors"
            >
              <X size={18} className="lg:w-5 lg:h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Response Mode Selector */}
        <div className="p-4 lg:p-6 border-b border-gray-700">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-4">
              <label className="text-xs lg:text-sm font-medium text-gray-300">Response Mode:</label>
              <div className="relative">
                <select
                  value={responseMode}
                  onChange={(e) => setResponseMode(e.target.value)}
                  className="dropdown-select appearance-none pr-8 text-xs lg:text-sm"
                >
                  {responseModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="lg:w-4 lg:h-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <span className="text-xs text-gray-500 hidden lg:block">
                {responseModes.find(m => m.id === responseMode)?.description}
              </span>
            </div>
            
            {/* Web Search Toggle */}
            <div className="flex items-center gap-2">
              <label className="text-xs lg:text-sm font-medium text-gray-300">Web Search:</label>
              <button
                onClick={() => setUseWebSearch(!useWebSearch)}
                className={`relative inline-flex h-5 w-9 lg:h-6 lg:w-11 items-center rounded-full transition-colors ${
                  useWebSearch ? 'bg-pink-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 lg:h-4 lg:w-4 transform rounded-full bg-white transition-transform ${
                    useWebSearch ? 'translate-x-5 lg:translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-500">
                {useWebSearch ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        {/* Model Columns - Mobile: Vertical stack, Desktop: Grid */}
        <div className="flex-1 p-3 lg:p-6 overflow-y-auto">
          <div className="mobile-model-stack lg:grid lg:grid-cols-3 gap-3 lg:gap-6 min-h-full">
            {availableModels.map((model) => {
              const response = modelResponses[model.id]
              const isSelected = selectedModel === model.id
              
              return (
                <div
                  key={model.id}
                  className={`mobile-model-item model-column ${isSelected ? 'selected' : ''} min-h-[250px] lg:min-h-full`}
                >
                  {/* Model Header */}
                  <div className="p-3 lg:p-4 border-b border-gray-700">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
                        <img 
                          src={model.icon} 
                          alt={model.name}
                          className="w-6 h-6 object-contain"
                        />
                      </div>
                      <h3 className="font-semibold text-gray-100">{model.name}</h3>
                    </div>
                    <p className="text-sm text-gray-400">{model.description}</p>
                  </div>

                  {/* Response Area */}
                  <div className="flex-1 p-4">
                    <div className="response-area">
                      {!response && (
                        <div className="flex items-center justify-center h-full text-gray-500">
                          <p className="text-center">
                            Ask a question to see<br />
                            {model.name}'s response
                          </p>
                        </div>
                      )}
                      
                      {response?.loading && (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <Loader2 size={24} className="animate-spin text-pink-500 mx-auto mb-2" />
                            <p className="text-gray-400">Generating response...</p>
                          </div>
                        </div>
                      )}
                      
                      {response && !response.loading && (
                        <div className="w-full">
                          {response.error ? (
                            <div className="text-red-400 text-sm">
                              Error: {response.error}
                            </div>
                          ) : (
                            <div className="text-gray-200 text-sm leading-relaxed w-full">
                              <MessageFormatter 
                                content={response.response} 
                                isStreaming={false}
                                model={model.id}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Select Button */}
                  <div className="p-4">
                    <button
                      onClick={() => selectModel(model.id)}
                      disabled={!response || response.loading || response.error}
                      className={`select-button w-full ${isSelected ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                      {isSelected ? (
                        <div className="flex items-center justify-center gap-2">
                          <CheckCircle size={16} />
                          Selected
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <MessageCircle size={16} />
                          Chat with {model.name}
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Input Area */}
        <div className="input-area p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask me anything..."
              className="flex-1 px-4 py-3 lg:py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-base lg:text-sm"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap min-h-[44px]"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              <span className="hidden sm:inline">{isLoading ? 'Generating...' : 'Send'}</span>
              <span className="sm:hidden">{isLoading ? '...' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}