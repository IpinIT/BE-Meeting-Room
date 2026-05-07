const jwt = require('jsonwebtoken')
const { z } = require('zod')
const prisma = require('../config/prisma')

// UUID validator — reusable
const uuidSchema = z.string().uuid()

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken
    if (!token) {
      return res.status(401).json({ message: 'Access denied. Please login first.' })
    }

    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: 'Session expired. Please login again.',
          code: 'TOKEN_EXPIRED'
        })
      }
      return res.status(401).json({ message: 'Invalid token.' })
    }

    // Validasi userId adalah UUID yang valid
    if (!uuidSchema.safeParse(decoded.userId).success) {
      return res.status(401).json({ message: 'Invalid token payload.' })
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true, division: true },
    })

    if (!user) {
      return res.status(401).json({ message: 'User not found.' })
    }

    req.user = user
    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' })
  }
  next()
}

// Middleware validasi UUID param — reusable
const validateUUIDParam = (paramName = 'id') => (req, res, next) => {
  const value = req.params[paramName]
  if (!uuidSchema.safeParse(value).success) {
    return res.status(400).json({ message: `Invalid ${paramName} format.` })
  }
  next()
}

module.exports = { authenticate, adminOnly, validateUUIDParam }