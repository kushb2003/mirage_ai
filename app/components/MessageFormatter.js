'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function MessageFormatter({ content, isStreaming = false, model = null }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  // Check if this is a Claude response
  const isClaude = model === 'claude-4' || (typeof content === 'string' && (content.includes('Claude') || content.includes('Anthropic')))

  // Format the content with proper line breaks and structure
  const formatContent = (text) => {
    if (!text) return ''
    
    // Handle inline formatting with proper bold/italic rendering
    const formatInlineText = (text) => {
      // Process text with proper formatting
      const processFormatting = (str) => {
        const parts = []
        let currentIndex = 0
        
        // Regex to match bold, italic, and inline code
        const formatRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
        let match
        
        while ((match = formatRegex.exec(str)) !== null) {
          // Add text before the match
          if (match.index > currentIndex) {
            parts.push(str.slice(currentIndex, match.index))
          }
          
          // Add formatted content with Claude-specific styling
          if (match[2]) {
            // Bold text - Claude uses more elegant bold styling
            parts.push(
              <strong key={match.index} className={isClaude ? "font-semibold text-orange-200" : "font-semibold text-white"}>
                {match[2]}
              </strong>
            )
          } else if (match[3]) {
            // Italic text - Claude uses more subtle italic styling
            parts.push(
              <em key={match.index} className={isClaude ? "italic text-orange-300/80" : "italic text-gray-200"}>
                {match[3]}
              </em>
            )
          } else if (match[4]) {
            // Inline code - Claude uses warmer code highlighting
            parts.push(
              <code key={match.index} className={
                isClaude 
                  ? "bg-orange-900/30 text-orange-300 px-2 py-1 rounded text-sm font-mono border border-orange-700/30" 
                  : "bg-gray-800 text-pink-400 px-2 py-1 rounded text-sm font-mono"
              }>
                {match[4]}
              </code>
            )
          }
          
          currentIndex = match.index + match[0].length
        }
        
        // Add remaining text
        if (currentIndex < str.length) {
          parts.push(str.slice(currentIndex))
        }
        
        return parts.length > 0 ? parts : [str]
      }
      
      return processFormatting(text)
    }
    
    // Split by double line breaks for paragraphs
    const paragraphs = text.split('\n\n')
    
    return paragraphs.map((paragraph, index) => {
      // Handle tables (markdown format)
      const lines = paragraph.split('\n')
      const tableLines = lines.filter(line => line.includes('|') && line.trim().length > 0)
      
      // Check if this looks like a table (has at least 2 lines with pipes)
      const isTable = tableLines.length >= 2 && 
                     tableLines.some(line => line.split('|').length >= 3) // At least 2 columns
      
      if (isTable) {
        // Find header and separator
        let headerIndex = -1
        let separatorIndex = -1
        
        for (let i = 0; i < tableLines.length; i++) {
          const line = tableLines[i].trim()
          if (line.includes('|') && !line.match(/^[\|\s\-:]+$/)) {
            if (headerIndex === -1) {
              headerIndex = i
            }
          } else if (line.match(/^[\|\s\-:]+$/) && headerIndex !== -1) {
            separatorIndex = i
            break
          }
        }
        
        if (headerIndex !== -1 && separatorIndex !== -1) {
          const headerLine = tableLines[headerIndex]
          const dataLines = tableLines.slice(separatorIndex + 1)
          
          // Parse header - handle both |header| and header| formats
          const headers = headerLine.split('|')
            .map(cell => cell.trim())
            .filter(cell => cell !== '')
          
          // Parse data rows
          const rows = dataLines.map(line => {
            const cells = line.split('|')
              .map(cell => cell.trim())
              .filter(cell => cell !== '')
            
            // Ensure row has same number of columns as header
            while (cells.length < headers.length) {
              cells.push('')
            }
            return cells.slice(0, headers.length)
          }).filter(row => row.some(cell => cell !== '')) // Remove empty rows
          
          if (headers.length > 0 && rows.length > 0) {
            return (
              <div key={index} className="mb-6 w-full -mx-4">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                  <table className={`min-w-full border-collapse border rounded-lg overflow-hidden table-fixed ${
                    isClaude 
                      ? 'border-orange-600/50' 
                      : 'border-gray-600'
                  }`}>
                    <thead>
                      <tr className={isClaude ? 'bg-orange-900/30' : 'bg-gray-800'}>
                        {headers.map((header, headerIndex) => (
                          <th 
                            key={headerIndex} 
                            className={`border px-2 py-2 text-left font-semibold text-xs ${
                              isClaude 
                                ? 'border-orange-600/50 text-orange-300' 
                                : 'border-gray-600 text-blue-400'
                            }`}
                            style={{ width: `${100 / headers.length}%` }}
                          >
                            <div className="break-words overflow-hidden">
                              {formatInlineText(header)}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className={
                          isClaude
                            ? (rowIndex % 2 === 0 ? 'bg-orange-950/30' : 'bg-orange-900/20')
                            : (rowIndex % 2 === 0 ? 'bg-gray-900/50' : 'bg-gray-800/30')
                        }>
                          {row.map((cell, cellIndex) => (
                            <td 
                              key={cellIndex} 
                              className={`border px-2 py-2 align-top text-xs ${
                                isClaude 
                                  ? 'border-orange-600/50 text-orange-100' 
                                  : 'border-gray-600 text-gray-200'
                              }`}
                              style={{ width: `${100 / headers.length}%` }}
                            >
                              <div className="break-words overflow-hidden leading-tight">
                                {formatInlineText(cell)}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }
        }
      }
      // Handle horizontal rules
      if (/^[-*_]{3,}$/.test(paragraph.trim())) {
        return (
          <hr key={index} className="my-6 border-gray-600" />
        )
      }

      // Handle blockquotes
      if (paragraph.trim().startsWith('>')) {
        const quoteContent = paragraph
          .split('\n')
          .map(line => line.replace(/^>\s?/, ''))
          .join('\n')
          .trim()
        
        return (
          <blockquote key={index} className={`border-l-4 pl-6 py-2 italic my-6 rounded-r-lg ${
            isClaude 
              ? 'border-orange-500 text-orange-200 bg-orange-900/20' 
              : 'border-pink-500 text-gray-300 bg-gray-800/30'
          }`}>
            {formatInlineText(quoteContent)}
          </blockquote>
        )
      }

      // Handle headers (markdown format)
      if (/^#{1,6}\s+/.test(paragraph.trim())) {
        const headerMatch = paragraph.trim().match(/^(#{1,6})\s+(.+)/)
        if (headerMatch) {
          const level = headerMatch[1].length
          const text = headerMatch[2]
          const HeaderTag = `h${Math.min(level, 6)}`
          const sizeClasses = {
            1: isClaude ? 'text-2xl font-bold text-orange-300 mb-4' : 'text-2xl font-bold text-blue-400 mb-4',
            2: isClaude ? 'text-xl font-bold text-orange-300 mb-3' : 'text-xl font-bold text-blue-300 mb-3',
            3: isClaude ? 'text-lg font-semibold text-orange-200 mb-3' : 'text-lg font-semibold text-blue-200 mb-3',
            4: isClaude ? 'text-base font-semibold text-orange-200 mb-2' : 'text-base font-semibold text-gray-200 mb-2',
            5: isClaude ? 'text-sm font-semibold text-orange-300 mb-2' : 'text-sm font-semibold text-gray-300 mb-2',
            6: isClaude ? 'text-sm font-medium text-orange-400 mb-2' : 'text-sm font-medium text-gray-400 mb-2'
          }
          
          return (
            <div key={index} className={`${sizeClasses[level]} border-b border-gray-700 pb-2`}>
              {formatInlineText(text)}
            </div>
          )
        }
      }

      // Handle lists (both numbered and bulleted) - improved detection
      const hasListItems = paragraph.includes('•') || 
                          paragraph.includes('-') || 
                          /^\s*[\*\-\+]\s+/m.test(paragraph) ||
                          /^\s*\d+\.\s+/m.test(paragraph)
      
      if (hasListItems) {
        const lines = paragraph.split('\n')
        return (
          <div key={index} className="mb-6">
            {lines.map((line, lineIndex) => {
              const trimmedLine = line.trim()
              if (!trimmedLine) return null
              
              // Check if it's a list item (more comprehensive)
              const isListItem = trimmedLine.startsWith('•') || 
                               trimmedLine.startsWith('-') || 
                               trimmedLine.startsWith('*') ||
                               /^\d+\./.test(trimmedLine) ||
                               /^[\*\-\+]\s+/.test(trimmedLine)
              
              if (isListItem) {
                const cleanedListItem = trimmedLine
                  .replace(/^[•\-\*\+\d+\.]\s*/, '')
                  .trim()
                
                return (
                  <div key={lineIndex} className="flex items-start gap-3 mb-3">
                    <span className={`mt-1 flex-shrink-0 font-bold ${
                      isClaude ? 'text-orange-400' : 'text-blue-400'
                    }`}>•</span>
                    <span className="flex-1 leading-relaxed">{formatInlineText(cleanedListItem)}</span>
                  </div>
                )
              } else {
                return (
                  <div key={lineIndex} className="mb-3 leading-relaxed">
                    {formatInlineText(trimmedLine)}
                  </div>
                )
              }
            })}
          </div>
        )
      }
      
      // Handle code blocks
      if (paragraph.includes('```')) {
        const parts = paragraph.split('```')
        return (
          <div key={index} className="mb-4">
            {parts.map((part, partIndex) => {
              if (partIndex % 2 === 1) {
                // This is a code block
                return (
                  <pre key={partIndex} className={`border rounded-lg p-4 my-3 overflow-x-auto ${
                    isClaude 
                      ? 'bg-orange-950/40 border-orange-700/40' 
                      : 'bg-gray-800 border-gray-700'
                  }`}>
                    <code className={`text-sm font-mono whitespace-pre ${
                      isClaude ? 'text-orange-300' : 'text-green-400'
                    }`}>
                      {part.trim()}
                    </code>
                  </pre>
                )
              } else {
                // Regular text
                return part.trim() ? (
                  <div key={partIndex} className="whitespace-pre-wrap">
                    {part.trim()}
                  </div>
                ) : null
              }
            })}
          </div>
        )
      }

      
      return (
        <div key={index} className="mb-6 leading-relaxed">
          <div className="whitespace-pre-wrap">
            {formatInlineText(paragraph)}
          </div>
        </div>
      )
    })
  }

  return (
    <div className="message-content group">
      <div className="typography-enhanced formatted-text">
        {formatContent(content)}
        {isStreaming && (
          <span className="inline-block w-0.5 h-4 bg-primary-500 ml-1 animate-pulse"></span>
        )}
      </div>
      
      {content && !isStreaming && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button
            onClick={copyToClipboard}
            className="p-2 rounded-lg glass-light hover:bg-gray-700/50 transition-all duration-200 flex items-center justify-center"
            title="Copy message"
          >
            {copied ? (
              <Check size={16} className="text-green-400" />
            ) : (
              <Copy size={16} className="text-gray-400 hover:text-gray-200" />
            )}
          </button>
        </div>
      )}
    </div>
  )
}