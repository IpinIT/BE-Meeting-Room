const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { z } = require('zod')
const prisma = require('../config/prisma')

const registerSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().min(1, 'Nomor telepon wajib diisi'),
  division: z.string().min(1, 'Divisi wajib diisi'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
})

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  })
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  })
  return { accessToken, refreshToken }
}

const setCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
  })
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })
}

const register = async (req, res) => {
  try {
    const result = registerSchema.safeParse(req.body)
    if (!result.success) {
      const firstError = result.error.errors[0].message
      return res.status(400).json({ message: firstError })
    }

    const { name, email, phone, division, password, confirmPassword } = result.data

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Konfirmasi password tidak cocok.' })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(409).json({ message: 'Email sudah terdaftar, silakan coba email lain.' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.create({
      data: { name, email, phone, division, password: hashedPassword, role: 'user' },
    })

    return res.status(201).json({ message: 'Registrasi berhasil! Silakan login.' })
  } catch (error) {
    console.error('Register error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const login = async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) {
      const firstError = result.error.errors[0].message
      return res.status(400).json({ message: firstError })
    }

    const { email, password } = result.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ message: 'Email atau password salah.' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email atau password salah.' })
    }

    const { accessToken, refreshToken } = generateTokens(user.id)
    setCookies(res, accessToken, refreshToken)

    return res.status(200).json({
      message: 'Login berhasil.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        division: user.division,
        phone: user.phone,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const logout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production'
    res.clearCookie('accessToken', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax' })
    res.clearCookie('refreshToken', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax' })
    return res.status(200).json({ message: 'Logout berhasil.' })
  } catch (error) {
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ message: 'Refresh token tidak ditemukan.' })

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    if (!user) return res.status(401).json({ message: 'User tidak ditemukan.' })

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id)
    setCookies(res, accessToken, newRefreshToken)

    return res.status(200).json({ message: 'Token diperbarui.' })
  } catch (error) {
    return res.status(401).json({ message: 'Refresh token tidak valid atau kadaluarsa.' })
  }
}

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, phone: true, division: true, role: true, createdAt: true },
    })
    return res.status(200).json({ user })
  } catch (error) {
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

module.exports = { register, login, logout, refreshToken, getMe }