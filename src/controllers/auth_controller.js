const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { z } = require('zod')
const prisma = require('../config/prisma')

const registerSchema = z.object({
  name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email format').max(255),
  phone: z.string().min(1, 'Phone number is required').max(20),
  division: z.string().min(1, 'Division is required').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  )
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  )
  return { accessToken, refreshToken }
}

const COOKIE_OPTIONS = (isProduction) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
})

const setCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production'
  const baseOptions = COOKIE_OPTIONS(isProduction)

  res.cookie('accessToken', accessToken, {
    ...baseOptions,
    maxAge: 15 * 60 * 1000,
  })
  res.cookie('refreshToken', refreshToken, {
    ...baseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

const clearCookies = (res) => {
  const isProduction = process.env.NODE_ENV === 'production'
  const baseOptions = COOKIE_OPTIONS(isProduction)
  res.clearCookie('accessToken', baseOptions)
  res.clearCookie('refreshToken', baseOptions)
}

const register = async (req, res) => {
  try {
    const result = registerSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message })
    }

    const { name, email, phone, division, password, confirmPassword } = result.data

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    })
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered. Please use another email.' })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        division: division.trim(),
        password: hashedPassword,
        role: 'user',
      },
    })

    return res.status(201).json({ message: 'Registration successful! Please login.' })
  } catch (error) {
    console.error('Register error:', error)
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const login = async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message })
    }

    const { email, password } = result.data

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    // Timing-safe: selalu jalankan bcrypt meski user tidak ada
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, '$2a$12$invalidhashfortimingreasons000')

    if (!user || !isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    const { accessToken, refreshToken } = generateTokens(user.id)
    setCookies(res, accessToken, refreshToken)

    return res.status(200).json({
      message: 'Login successful.',
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
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const logout = async (req, res) => {
  try {
    clearCookies(res)
    return res.status(200).json({ message: 'Logged out successfully.' })
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) {
      return res.status(401).json({ message: 'Refresh token not found.' })
    }

    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
    } catch {
      return res.status(401).json({ message: 'Invalid or expired refresh token.' })
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true },
    })
    if (!user) {
      return res.status(401).json({ message: 'User not found.' })
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id)
    setCookies(res, accessToken, newRefreshToken)

    return res.status(200).json({ message: 'Token refreshed.' })
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        division: true,
        role: true,
        createdAt: true,
      },
    })
    if (!user) return res.status(404).json({ message: 'User not found.' })
    return res.status(200).json({ user })
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

module.exports = { register, login, logout, refreshToken, getMe }