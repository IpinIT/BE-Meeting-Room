require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit')
const routes = require('./routes')

const app = express()

// Validasi env variables wajib ada saat startup
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL']
const missingVars = requiredEnvVars.filter(v => !process.env[v])
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`)
  process.exit(1)
}

const isProduction = process.env.NODE_ENV === 'production'

// CORS — harus sebelum routes
const allowedOrigins = process.env.CLIENT_URL.split(',').map(o => o.trim())
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(cookieParser())

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again in 15 minutes.' },
})

app.use(globalLimiter)
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api', routes)

// Health check — untuk Railway
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' })
})

// Global error handler
app.use((err, req, res, next) => {
  // CORS error
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({ message: 'Not allowed by CORS.' })
  }
  console.error('Unhandled error:', err)
  res.status(500).json({ message: 'Internal server error.' })
})

const PORT = parseInt(process.env.PORT || '5000', 10)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🔗 Allowed origins: ${allowedOrigins.join(', ')}`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...')
  const { default: prisma } = await import('./config/prisma.js')
  await prisma.$disconnect()
  process.exit(0)
})

module.exports = app