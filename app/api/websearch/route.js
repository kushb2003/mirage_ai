import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'

// Web search API configurations
const SERPER_API_URL = 'https://google.serper.dev/search'
const SERPER_API_KEY = process.env.SERPER_API_KEY

const BING_SEARCH_URL = 'https://api.bing.microsoft.com/v7.0/search'
const BING_API_KEY = process.env.BING_API_KEY

// Fallback search using DuckDuckGo (no API key required)
async function fallbackSearch(query) {
  try {
    // This is a simplified fallback - in production you might want to use a proper search API
    return {
      results: [
        {
          title: `Search results for: ${query}`,
          snippet: 'Web search functionality is available but requires API keys for full functionality. Please add SERPER_API_KEY or BING_API_KEY to your environment variables.',
          link: 'https://example.com',
          source: 'Fallback Search'
        }
      ],
      searchInfo: {
        totalResults: 1,
        searchTime: 0.1
      }
    }
  } catch (error) {
    throw new Error('Fallback search failed')
  }
}

// Search using Serper API (Google Search)
async function searchWithSerper(query) {
  if (!SERPER_API_KEY) {
    return await fallbackSearch(query)
  }

  try {
    const response = await fetch(SERPER_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: 5, // Number of results
        gl: 'us', // Country
        hl: 'en', // Language
      }),
    })

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`)
    }

    const data = await response.json()
    
    return {
      results: data.organic?.map(result => ({
        title: result.title,
        snippet: result.snippet,
        link: result.link,
        source: 'Google Search'
      })) || [],
      searchInfo: {
        totalResults: data.searchInformation?.totalResults || 0,
        searchTime: data.searchInformation?.searchTime || 0
      }
    }
  } catch (error) {
    console.error('Serper search failed:', error)
    return await fallbackSearch(query)
  }
}

// Search using Bing Search API
async function searchWithBing(query) {
  if (!BING_API_KEY) {
    return await fallbackSearch(query)
  }

  try {
    const response = await fetch(`${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&count=5`, {
      headers: {
        'Ocp-Apim-Subscription-Key': BING_API_KEY,
      },
    })

    if (!response.ok) {
      throw new Error(`Bing API error: ${response.status}`)
    }

    const data = await response.json()
    
    return {
      results: data.webPages?.value?.map(result => ({
        title: result.name,
        snippet: result.snippet,
        link: result.url,
        source: 'Bing Search'
      })) || [],
      searchInfo: {
        totalResults: data.webPages?.totalEstimatedMatches || 0,
        searchTime: 0.1
      }
    }
  } catch (error) {
    console.error('Bing search failed:', error)
    return await fallbackSearch(query)
  }
}

// Only trusted server-side callers (e.g. /api/chat) that present the shared
// internal token may run searches. Fails closed when the token is unset.
function isAuthorizedInternalCaller(request) {
  const expected = process.env.WEBSEARCH_INTERNAL_TOKEN
  if (typeof expected !== 'string' || expected.length === 0) {
    return false
  }
  const provided = request.headers.get('x-internal-token')
  if (typeof provided !== 'string' || provided.length === 0) {
    return false
  }
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

export async function POST(request) {
  if (!isAuthorizedInternalCaller(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { query, stream = false } = await request.json()

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Search query is required' },
        { status: 400 }
      )
    }

    if (stream) {
      // Return streaming response
      const encoder = new TextEncoder()

      const streamResponse = new ReadableStream({
        async start(controller) {
          try {
            // Send initial search status
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'search_start', 
              query: query,
              status: 'Starting web search...' 
            })}\n\n`))

            // Perform the search
            let searchResults
            
            if (SERPER_API_KEY) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'search_progress', 
                status: 'Searching with Google...' 
              })}\n\n`))
              searchResults = await searchWithSerper(query)
            } else if (BING_API_KEY) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'search_progress', 
                status: 'Searching with Bing...' 
              })}\n\n`))
              searchResults = await searchWithBing(query)
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'search_progress', 
                status: 'Using fallback search...' 
              })}\n\n`))
              searchResults = await fallbackSearch(query)
            }

            // Stream search results one by one
            if (searchResults.results && searchResults.results.length > 0) {
              for (let i = 0; i < searchResults.results.length; i++) {
                const result = searchResults.results[i]
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'search_result', 
                  result: result,
                  index: i + 1,
                  total: searchResults.results.length
                })}\n\n`))
                
                // Add small delay between results for streaming effect
                await new Promise(resolve => setTimeout(resolve, 100))
              }
            }

            // Send search completion with metadata
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'search_complete', 
              searchInfo: searchResults.searchInfo,
              totalResults: searchResults.results?.length || 0,
              query: query
            })}\n\n`))

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
            controller.close()

          } catch (error) {
            console.error('Streaming search error:', error)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              error: 'Search failed',
              done: true 
            })}\n\n`))
            controller.close()
          }
        }
      })

      return new Response(streamResponse, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } else {
      // Non-streaming response (original behavior)
      let searchResults
      
      if (SERPER_API_KEY) {
        searchResults = await searchWithSerper(query)
      } else if (BING_API_KEY) {
        searchResults = await searchWithBing(query)
      } else {
        searchResults = await fallbackSearch(query)
      }

      return NextResponse.json({
        success: true,
        query,
        ...searchResults
      })
    }

  } catch (error) {
    console.error('Web search error:', error)
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    )
  }
}