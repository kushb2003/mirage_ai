'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Send, User, Bot, Plus, MessageCircle, Settings, Home, Search, CheckCircle, ChevronDown, Menu, X } from 'lucide-react'
import Link from 'next/link'
import MessageFormatter from './MessageFormatter'
import { getChatAuthHeaders } from '../../lib/chatAuth'

const availableModels = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'Advanced reasoning, complex problem-solving, and multi-step analysis',
    icon: '/image/chatgpt.png',
    color: 'bg-pink-500',
  },
  {
    id: 'claude-4',
    name: 'Claude 4',
    description: 'Thoughtful analysis with ethical reasoning and balanced perspectives',
    icon: '/image/claude.png',
    color: 'bg-purple-500',
  },
  {
    id: 'gemini-2.5',
    name: 'Gemini 2.5',
    description: 'Real-time data integration and practical, actionable insights',
    icon: '/image/gemini.png',
    color: 'bg-blue-500',
  },
]

const responseModes = [
  { id: 'detailed', name: 'Comprehensive Analysis', description: 'In-depth explanations with examples and context' },
  { id: 'concise', name: 'Direct & Focused', description: 'Clear, efficient answers focused on key points' },
  { id: 'creative', name: 'Creative & Innovative', description: 'Imaginative thinking with unique perspectives' },
]

export default function FullChatMode() {
  const { user, signOut } = useAuth()
  const [input, setInput] = useState('')
  const [chats, setChats] = useState([
    { id: 1, name: 'New Conversation', active: true, conversations: { 'gpt-5': [], 'claude-4': [], 'gemini-2.5': [] } },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(true)
  const [responseMode, setResponseMode] = useState('detailed')
  const [selectedModel, setSelectedModel] = useState(null)
  const [showSingleModel, setShowSingleModel] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const messagesEndRef = useRef(null)

  const activeChat = chats.find(chat => chat.active)
  const conversations = activeChat?.conversations || { 'gpt-5': [], 'claude-4': [], 'gemini-2.5': [] }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [conversations])

  const switchChat = (chatId) => {
    setChats(prev => prev.map(chat => ({
      ...chat,
      active: chat.id === chatId
    })))
  }

  const createNewChat = () => {
    const newChatId = Math.max(...chats.map(c => c.id)) + 1
    const newChat = {
      id: newChatId,
      name: 'New Conversation',
      active: true,
      conversations: { 'gpt-5': [], 'claude-4': [], 'gemini-2.5': [] }
    }
    
    setChats(prev => [
      ...prev.map(chat => ({ ...chat, active: false })),
      newChat
    ])
    setSelectedModel(null)
    setShowSingleModel(false)
  }

  const updateChatName = (chatId, firstMessage) => {
    const truncatedName = firstMessage.length > 30 
      ? firstMessage.substring(0, 30) + '...' 
      : firstMessage
    
    setChats(prev => prev.map(chat => 
      chat.id === chatId && chat.name === 'New Conversation'
        ? { ...chat, name: truncatedName }
        : chat
    ))
  }

  const selectModel = (modelId) => {
    setSelectedModel(modelId)
    setShowSingleModel(true)
  }

  const backToComparison = () => {
    setSelectedModel(null)
    setShowSingleModel(false)
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    // Update chat name if it's a new conversation
    const activeChat = chats.find(chat => chat.active)
    if (activeChat && activeChat.name === 'New Conversation') {
      updateChatName(activeChat.id, userMessage)
    }

    // Determine which models to send to
    const modelsToProcess = showSingleModel ? 
      availableModels.filter(model => model.id === selectedModel) : 
      availableModels

    // Add user message to active chat's conversations
    const updatedChats = chats.map(chat => {
      if (chat.active) {
        const newConversations = { ...chat.conversations }
        modelsToProcess.forEach(model => {
          newConversations[model.id] = [
            ...newConversations[model.id],
            { type: 'user', content: userMessage, timestamp: Date.now() }
          ]
        })
        return { ...chat, conversations: newConversations }
      }
      return chat
    })
    setChats(updatedChats)

    // Add placeholder AI messages for streaming
    const streamingChats = updatedChats.map(chat => {
      if (chat.active) {
        const streamingConversations = { ...chat.conversations }
        modelsToProcess.forEach(model => {
          streamingConversations[model.id] = [
            ...streamingConversations[model.id],
            { 
              type: 'ai', 
              content: '',
              timestamp: Date.now(),
              streaming: true
            }
          ]
        })
        return { ...chat, conversations: streamingConversations }
      }
      return chat
    })
    setChats(streamingChats)

    // Generate streaming responses for selected models
    modelsToProcess.forEach(async (model) => {
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
                  setChats(prev => prev.map(chat => {
                    if (chat.active) {
                      const updated = { ...chat.conversations }
                      const lastIndex = updated[model.id].length - 1
                      updated[model.id][lastIndex] = {
                        ...updated[model.id][lastIndex],
                        content: `Error: ${data.error}`,
                        error: true,
                        streaming: false
                      }
                      return { ...chat, conversations: updated }
                    }
                    return chat
                  }))
                  break
                }

                if (data.done) {
                  setChats(prev => prev.map(chat => {
                    if (chat.active) {
                      const updated = { ...chat.conversations }
                      const lastIndex = updated[model.id].length - 1
                      updated[model.id][lastIndex] = {
                        ...updated[model.id][lastIndex],
                        streaming: false
                      }
                      return { ...chat, conversations: updated }
                    }
                    return chat
                  }))
                  break
                }

                if (data.chunk) {
                  accumulatedContent += data.chunk
                  
                  setChats(prev => prev.map(chat => {
                    if (chat.active) {
                      const updated = { ...chat.conversations }
                      const lastIndex = updated[model.id].length - 1
                      updated[model.id][lastIndex] = {
                        ...updated[model.id][lastIndex],
                        content: accumulatedContent
                      }
                      return { ...chat, conversations: updated }
                    }
                    return chat
                  }))
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e)
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error streaming for ${model.id}:`, error)
        setChats(prev => prev.map(chat => {
          if (chat.active) {
            const updated = { ...chat.conversations }
            const lastIndex = updated[model.id].length - 1
            updated[model.id][lastIndex] = {
              ...updated[model.id][lastIndex],
              content: 'Network error occurred',
              error: true,
              streaming: false
            }
            return { ...chat, conversations: updated }
          }
          return chat
        }))
      }
    })

    setIsLoading(false)
  }

  return (
    <div className="h-screen h-dvh bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex overflow-hidden">
      {/* Mobile Menu Overlay with improved visibility */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Enhanced Sidebar with improved contrast and mobile optimization */}
      <div className={`${sidebarCollapsed ? 'w-16' : 'w-72 md:w-80'} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} fixed md:relative z-50 md:z-auto bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 border-r border-pink-400/30 flex flex-col flex-shrink-0 transition-all duration-300 h-full max-h-screen shadow-2xl shadow-pink-500/20`}>
        {/* Header with improved contrast and mobile optimization */}
        <div className="p-4 md:p-6 border-b border-pink-400/40 flex-shrink-0 bg-gradient-to-r from-gray-950 to-gray-900 shadow-lg">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-r from-pink-500 to-pink-600 rounded-lg md:rounded-xl flex items-center justify-center animate-pulse-glow shadow-lg shadow-pink-500/50">
                <svg className="w-4 h-4 md:w-6 md:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              {!sidebarCollapsed && <h1 className="text-lg md:text-xl font-bold text-white"> Mirage AI</h1>}
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile close button */}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden p-2 text-pink-400 hover:text-pink-300 transition-colors rounded-lg hover:bg-pink-500/10"
              >
                <X size={18} />
              </button>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden md:block p-2 text-pink-400 hover:text-pink-300 transition-colors rounded-lg hover:bg-pink-500/10"
              >
                <ChevronDown size={16} className={`transform transition-transform ${sidebarCollapsed ? 'rotate-90' : '-rotate-90'}`} />
              </button>
            </div>
          </div>
          {!sidebarCollapsed && (
            <Link href="/" className="flex items-center gap-2 text-pink-400 hover:text-pink-300 transition-all duration-200 text-sm hover:translate-x-1">
              <Home size={16} />
              Back to Home
            </Link>
          )}
        </div>

        {/* Chat List with improved background and mobile optimization */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 md:space-y-3 min-h-0 bg-gradient-to-b from-gray-900/30 via-gray-900/20 to-gray-950/40">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => {
                switchChat(chat.id)
                setMobileMenuOpen(false) // Close mobile menu on selection
              }}
              className={`w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 text-left rounded-lg md:rounded-xl transition-all duration-200 group ${
                chat.active 
                  ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg md:shadow-xl shadow-pink-500/40 border border-pink-400/50' 
                  : 'text-gray-200 hover:bg-gradient-to-r hover:from-pink-500/15 hover:to-pink-600/10 hover:text-white hover:border hover:border-pink-400/30 border border-transparent'
              } ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? chat.name : ''}
            >
              <MessageCircle size={14} className="md:w-4 md:h-4 flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="font-medium truncate text-left flex-1 text-sm md:text-base">{chat.name}</span>
              )}
              {!sidebarCollapsed && chat.active && (
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-pink-500 rounded-full animate-pulse"></div>
              )}
            </button>
          ))}
        </div>

        {/* New Chat Button - Mobile optimized */}
        <div className="p-3 md:p-4">
          <button
            onClick={createNewChat}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-center gap-2'} bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white px-3 md:px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl font-semibold transition-all duration-300 hover:scale-105 shadow-lg md:shadow-xl shadow-pink-500/40 border border-pink-400/50 text-sm md:text-base`}
            style={{ boxShadow: '0 4px 15px rgba(236, 72, 153, 0.3)' }}
            title={sidebarCollapsed ? 'New Chat' : ''}
          >
            <Plus size={14} className="md:w-4 md:h-4" />
            {!sidebarCollapsed && 'New Chat'}
          </button>
        </div>

        {/* User Profile with improved contrast and mobile optimization */}
        <div className="p-3 md:p-4 border-t border-pink-400/40 bg-gradient-to-r from-gray-950 to-gray-900 flex-shrink-0 shadow-inner">
          <div className={`flex items-center gap-2 md:gap-3 mb-2 md:mb-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-r from-pink-500 to-pink-600 rounded-lg md:rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/30">
              <User size={16} className="md:w-5 md:h-5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-semibold text-white truncate">
                    {user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full"></span>
                    Online
                  </p>
                </div>
                <Settings size={14} className="md:w-4 md:h-4 text-pink-400 hover:text-pink-300 cursor-pointer transition-colors" />
              </>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={signOut}
              className="w-full text-xs text-gray-400 hover:text-red-400 transition-colors text-left px-2 py-1 rounded hover:bg-pink-500/10"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Main Chat Area - Mobile optimized */}
      <div className="flex-1 flex flex-col bg-black min-w-0 overflow-hidden">
        {/* Mobile Header - Enhanced */}
        <div className="md:hidden flex items-center justify-between p-3 bg-black/80 border-b border-pink-500/30 backdrop-blur-sm">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-pink-400 hover:text-pink-300 transition-colors rounded-lg hover:bg-pink-500/10"
          >
            <Menu size={18} />
          </button>
          <h1 className="text-base font-bold text-white">Mirage AI</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
        {/* Model Columns - Mobile: Vertical stack, Desktop: Grid */}
        <div className={`flex-1 ${showSingleModel ? 'flex' : 'flex flex-col lg:grid lg:grid-cols-3 lg:gap-px'} bg-black min-h-0 overflow-hidden`}>
          {showSingleModel ? (
            // Single Model View
            (() => {
              const model = availableModels.find(m => m.id === selectedModel)
              return (
                <div className="bg-black flex flex-col min-h-0 overflow-hidden w-full">
                  {/* Enhanced Model Header with better contrast */}
                  <div className="p-6 border-b border-pink-400/40 flex-shrink-0 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 shadow-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-pink-600 to-pink-700 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-pink-500/30">
                        <img 
                          src={model.icon} 
                          alt={model.name}
                          className="w-7 h-7 object-contain"
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-white text-xl">{model.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-3 py-1 bg-gradient-to-r from-green-600 to-green-700 text-white text-xs rounded-full flex items-center gap-1 shadow-lg">
                            <CheckCircle size={12} />
                            Active
                          </span>
                          <span className="text-xs text-gray-400">Single Model Mode</span>
                        </div>
                      </div>
                      <button
                        onClick={backToComparison}
                        className="p-2 text-pink-400 hover:text-pink-300 transition-colors rounded-lg hover:bg-pink-500/10"
                        title="Back to comparison"
                      >
                        <ChevronDown size={16} className="rotate-90" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-300 bg-black/50 border border-pink-500/20 rounded-lg p-3">{model.description}</p>
                  </div>

                  {/* Enhanced Messages */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0" style={{ scrollBehavior: 'smooth' }}>
                    {conversations[model.id].length === 0 && (
                      <div className="flex items-center justify-center h-full text-gray-500 text-center">
                        <div className="bg-gradient-to-br from-black to-gray-900 border border-pink-500/20 rounded-2xl p-12 max-w-md mx-auto shadow-xl shadow-pink-500/10">
                          <div className="w-20 h-20 bg-gradient-to-br from-pink-600 to-pink-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-pink-500/30">
                            <img 
                              src={model.icon} 
                              alt={model.name}
                              className="w-14 h-14 object-contain"
                            />
                          </div>
                          <h3 className="text-lg font-semibold text-white mb-2">Chat with {model.name}</h3>
                          <p className="text-gray-400 text-sm leading-relaxed">
                            Start a conversation and experience {model.name}'s unique capabilities. 
                            Ask questions, get insights, or explore creative ideas.
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {conversations[model.id].map((message, index) => (
                      <div 
                        key={index} 
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-300`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className={`message-bubble-enhanced group ${
                          message.type === 'user' 
                            ? 'user-bubble-enhanced' 
                            : message.error 
                              ? 'ai-bubble-enhanced border-red-500/50 bg-red-900/20'
                              : 'ai-bubble-enhanced'
                        }`}>
                          <div className="flex items-start gap-4">
                            {message.type === 'ai' && (
                              <div className="w-8 h-8 bg-gradient-to-br from-black to-gray-800 border border-pink-500/30 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 overflow-hidden shadow-lg">
                                <img 
                                  src={model.icon} 
                                  alt={model.name}
                                  className="w-5 h-5 object-contain"
                                />
                              </div>
                            )}
                            {message.type === 'user' && (
                              <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 shadow-lg shadow-pink-500/30">
                                <User size={16} className="text-white" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="message-content-enhanced">
                                <MessageFormatter 
                                  content={message.content} 
                                  isStreaming={message.streaming}
                                  model={message.type === 'ai' ? model.id : null}
                                />
                              </div>
                              {message.streaming && (
                                <div className="flex items-center gap-2 mt-3">
                                  <div className="status-typing">
                                    <div className="typing-dot-enhanced"></div>
                                    <div className="typing-dot-enhanced"></div>
                                    <div className="typing-dot-enhanced"></div>
                                  </div>
                                  <span className="text-xs text-gray-400">Thinking...</span>
                                </div>
                              )}
                              {message.type === 'ai' && !message.streaming && !message.error && (
                                <div className="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>{model.name}</span>
                                    <span>•</span>
                                    <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                                  </div>
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
              )
            })()
          ) : (
            // Comparison View - Mobile: Vertical stack, Desktop: Grid
            <div className="mobile-model-stack lg:contents lg:grid lg:grid-cols-3 lg:gap-px overflow-y-auto lg:overflow-y-visible">
              {availableModels.map((model) => (
                <div key={model.id} className="mobile-model-item bg-black flex flex-col min-h-0 overflow-hidden lg:min-w-0 border-b border-gray-800 lg:border-b-0 lg:border-r lg:border-gray-800 lg:last:border-r-0">
                  {/* Enhanced Model Header with improved visibility */}
                  <div className="p-3 lg:p-6 border-b border-pink-400/40 flex-shrink-0 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 shadow-lg">
                    <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3">
                      <div className="w-6 h-6 lg:w-10 lg:h-10 bg-gradient-to-br from-pink-600 to-pink-700 rounded-lg lg:rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-pink-500/30">
                        <img 
                          src={model.icon} 
                          alt={model.name}
                          className="w-4 h-4 lg:w-7 lg:h-7 object-contain"
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-white text-sm lg:text-lg">{model.name}</h3>
                        <div className="flex items-center gap-1 lg:gap-2 mt-1">
                          <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-pink-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-pink-400">Ready</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs lg:text-sm text-gray-300 mb-2 lg:mb-4 bg-black/50 border border-pink-500/20 rounded-lg p-2 lg:p-3">{model.description}</p>
                    
                    {/* Select Button */}
                    {conversations[model.id].length > 0 && conversations[model.id].some(msg => msg.type === 'ai' && !msg.streaming && !msg.error) && (
                      <button
                        onClick={() => selectModel(model.id)}
                        className="w-full px-3 py-2 lg:px-4 lg:py-3 bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white text-xs lg:text-sm rounded-lg lg:rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:scale-105"
                      >
                        <MessageCircle size={12} className="lg:w-4 lg:h-4" />
                        Focus on {model.name}
                      </button>
                    )}
                  </div>

                  {/* Enhanced Messages - Mobile optimized height */}
                  <div className="mobile-messages lg:flex-1 overflow-y-auto p-2 lg:p-6 space-y-2 lg:space-y-6 min-h-[200px] lg:min-h-0 max-h-[400px] lg:max-h-none custom-scrollbar" style={{ scrollBehavior: 'smooth' }}>
                    {conversations[model.id].length === 0 && (
                      <div className="flex items-center justify-center h-full text-gray-500 text-center">
                        <div className="bg-gradient-to-br from-black to-gray-900 border border-pink-500/20 rounded-xl lg:rounded-2xl p-4 lg:p-10 max-w-sm mx-auto shadow-xl shadow-pink-500/10">
                          <div className="w-10 h-10 lg:w-18 lg:h-18 bg-gradient-to-br from-pink-600 to-pink-700 rounded-xl lg:rounded-2xl flex items-center justify-center mx-auto mb-3 lg:mb-6 shadow-xl shadow-pink-500/30">
                            <img 
                              src={model.icon} 
                              alt={model.name}
                              className="w-6 h-6 lg:w-12 lg:h-12 object-contain"
                            />
                          </div>
                          <h4 className="text-xs lg:text-base font-semibold text-white mb-2">{model.name}</h4>
                          <p className="text-gray-400 text-xs lg:text-sm">Waiting for your first message...</p>
                        </div>
                      </div>
                    )}
                  
                  {conversations[model.id].map((message, index) => (
                    <div 
                      key={index} 
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-300`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className={`message-bubble-enhanced group ${
                        message.type === 'user' 
                          ? 'user-bubble-enhanced max-w-[85%] lg:max-w-[80%]' 
                          : message.error 
                            ? 'ai-bubble-enhanced border-red-500/50 bg-red-900/20 max-w-[90%] lg:max-w-[80%]'
                            : 'ai-bubble-enhanced max-w-[90%] lg:max-w-[80%]'
                      }`}>
                        <div className="flex items-start gap-2 lg:gap-3">
                          {message.type === 'ai' && (
                            <div className="w-6 h-6 lg:w-7 lg:h-7 bg-gradient-to-br from-black to-gray-800 border border-pink-500/30 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 overflow-hidden shadow-md">
                              <img 
                                src={model.icon} 
                                alt={model.name}
                                className="w-3.5 h-3.5 lg:w-4 lg:h-4 object-contain"
                              />
                            </div>
                          )}
                          {message.type === 'user' && (
                            <div className="w-6 h-6 lg:w-7 lg:h-7 bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 shadow-md shadow-pink-500/30">
                              <User size={12} className="lg:w-4 lg:h-4 text-white" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="message-content-enhanced text-sm lg:text-base">
                              <MessageFormatter 
                                content={message.content} 
                                isStreaming={message.streaming}
                                model={message.type === 'ai' ? model.id : null}
                              />
                            </div>
                            {message.streaming && (
                              <div className="flex items-center gap-2 mt-2">
                                <div className="status-typing">
                                  <div className="typing-dot-enhanced"></div>
                                  <div className="typing-dot-enhanced"></div>
                                  <div className="typing-dot-enhanced"></div>
                                </div>
                                <span className="text-xs text-gray-400">Generating...</span>
                              </div>
                            )}
                            {message.type === 'ai' && !message.streaming && !message.error && (
                              <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="text-xs text-gray-500">
                                  {new Date(message.timestamp).toLocaleTimeString()}
                                </div>
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
            ))}
            </div>
          )}
        </div>

        {/* Enhanced Input Area with better contrast - Mobile optimized */}
        <div className="border-t border-pink-400/40 p-3 md:p-4 lg:p-6 flex-shrink-0 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 shadow-2xl shadow-pink-500/10">
          {/* Controls - Mobile responsive */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 md:mb-4 lg:mb-6 gap-3 md:gap-4 lg:gap-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4 lg:gap-8">
              {/* Response Mode - Mobile responsive */}
              <div className="flex items-center gap-2 md:gap-3">
                <span className="text-xs lg:text-sm font-semibold text-pink-300 flex items-center gap-1 md:gap-2">
                  <Settings size={12} className="md:w-4 md:h-4" />
                  Mode:
                </span>
                <div className="relative">
                  <select
                    value={responseMode}
                    onChange={(e) => setResponseMode(e.target.value)}
                    className="bg-gray-900/90 border border-pink-400/40 rounded-lg md:rounded-xl px-2.5 py-1.5 md:px-3 md:py-1.5 lg:px-4 lg:py-2 text-xs lg:text-sm text-gray-100 appearance-none pr-6 md:pr-8 lg:pr-10 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all duration-200 backdrop-blur-sm focus-ring min-w-0"
                  >
                    {responseModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="md:w-4 md:h-4 absolute right-1.5 md:right-2 lg:right-3 top-1/2 transform -translate-y-1/2 text-pink-400 pointer-events-none" />
                </div>
              </div>
              
              {/* Web Search Toggle - Mobile responsive */}
              <div className="flex items-center gap-2 md:gap-3">
                <span className="text-xs lg:text-sm font-semibold text-pink-300 flex items-center gap-1 md:gap-2">
                  <Search size={12} className="md:w-4 md:h-4" />
                  Web Search:
                </span>
                <button
                  onClick={() => setUseWebSearch(!useWebSearch)}
                  className={`relative inline-flex h-5 w-8 md:h-6 md:w-10 lg:h-7 lg:w-12 items-center rounded-full transition-all duration-300 ${
                    useWebSearch ? 'bg-gradient-to-r from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30' : 'bg-black border border-pink-500/30'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
                      useWebSearch ? 'translate-x-3.5 md:translate-x-5 lg:translate-x-6' : 'translate-x-0.5 md:translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-xs font-medium ${useWebSearch ? 'text-pink-300' : 'text-gray-500'}`}>
                  {useWebSearch ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>

            {/* View Toggle */}
            {showSingleModel && (
              <button
                onClick={backToComparison}
                className="text-xs lg:text-sm text-pink-400 hover:text-pink-300 transition-all duration-200 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-pink-500/10 self-start lg:self-auto"
              >
                <ChevronDown size={14} className="lg:w-4 lg:h-4 rotate-90" />
                Back to Comparison
              </button>
            )}
          </div>
          
          <div className="flex items-end gap-3 lg:gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-500/30">
              <User size={18} className="lg:w-5 lg:h-5 text-white" />
            </div>
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  // Auto-resize textarea
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder={
                  showSingleModel 
                    ? `Message ${availableModels.find(m => m.id === selectedModel)?.name}${useWebSearch ? ' with web search' : ''}...`
                    : useWebSearch 
                      ? "Ask all models a question (web search enabled)..." 
                      : "Ask all models a question..."
                }
                className="w-full px-4 py-3 lg:px-6 lg:py-4 bg-gray-900/90 border border-pink-400/40 rounded-2xl text-gray-100 placeholder-gray-400 focus:outline-none transition-all duration-300 pr-12 lg:pr-16 resize-none min-h-[48px] lg:min-h-[56px] max-h-32 chat-textarea shadow-inner text-sm lg:text-base"
                style={{ 
                  border: '1px solid rgba(244, 114, 182, 0.4)',
                  fontSize: '16px', // Prevent zoom on iOS
                  lineHeight: '1.5',
                  backgroundColor: 'rgba(17, 24, 39, 0.95)'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(244, 114, 182, 0.8)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(244, 114, 182, 0.15), inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(244, 114, 182, 0.4)'
                  e.target.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
                disabled={isLoading}
                rows={1}
              />
              {isLoading && (
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  <div className="loading-shimmer w-6 h-6 rounded-full"></div>
                </div>
              )}
              <div className="absolute bottom-1 right-2 text-xs text-pink-400/60 hidden lg:block">
                Press Enter to send, Shift+Enter for new line
              </div>
            </div>
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
              className="px-4 py-3 lg:px-8 lg:py-4 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed text-white rounded-2xl font-semibold transition-all duration-300 flex items-center gap-2 lg:gap-3 flex-shrink-0 shadow-xl shadow-pink-500/40 hover:scale-105 disabled:hover:scale-100 border border-pink-400/50"
            >
              <Send size={16} className="lg:w-5 lg:h-5" />
              <span className="hidden sm:inline">
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="loading-dots">
                      <div></div>
                      <div></div>
                      <div></div>
                    </div>
                    Sending
                  </div>
                ) : (
                  'Send'
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}