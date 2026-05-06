const jwt = require('jsonwebtoken')
const prisma = require('../config/prisma')

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken

    if (!token) {
      return res.status(401).json({ message: 'Access denied. Please log in first..' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true, division: true }
    })

    if (!user) {
      return res.status(401).json({ message: 'User not found.' })
    }

    req.user = user
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ message: 'Invalid token.' })
  }
}

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Only admins are allowed.' })
  }
  next()
}

module.exports = { authenticate, adminOnly }