import './globals.css'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { AuthProvider } from './providers/AuthProvider'
import MobileOptimizations from './components/MobileOptimizations'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
})

export const metadata = {
  title: '🤖 Mirage AI - Next-Gen Multi-Model AI Platform',
  description: 'Compare responses from multiple AI models simultaneously. Experience GPT-5, Claude-4, and Gemini 2.5 in one beautiful interface with real-time streaming and web search.',
  keywords: ['AI', 'ChatGPT', 'Claude', 'Gemini', 'Multi-model', 'AI comparison', 'Chat interface', 'Machine Learning'],
  authors: [{ name: 'Mirage AI Team' }],
  creator: 'Mirage AI',
  publisher: 'Mirage AI',
  robots: 'index, follow',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://mirage-ai.vercel.app',
    title: '🤖 Mirage AI - Next-Gen Multi-Model AI Platform',
    description: 'Compare responses from multiple AI models simultaneously. Experience the future of AI interaction.',
    siteName: 'Mirage AI',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Mirage AI - Multi-Model AI Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '🤖 Mirage AI - Next-Gen Multi-Model AI Platform',
    description: 'Compare responses from multiple AI models simultaneously.',
    images: ['/og-image.png'],
    creator: '@MirageAI',
  },
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no',
  themeColor: '#ec4899',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={inter.className}>
        <MobileOptimizations />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}