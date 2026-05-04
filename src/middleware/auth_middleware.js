const jwt = require('jsonwebtoken')
const prisma = require('../config/prisma')

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken

    if (!token) {
      return res.status(401).json({ message: 'Akses ditolak. Silakan login terlebih dahulu.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true, division: true }
    })

    if (!user) {
      return res.status(401).json({ message: 'User tidak ditemukan.' })
    }

    req.user = user
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sesi habis. Silakan login kembali.', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ message: 'Token tidak valid.' })
  }
}

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Akses ditolak. Hanya admin yang diizinkan.' })
  }
  next()
}

module.exports = { authenticate, adminOnly }