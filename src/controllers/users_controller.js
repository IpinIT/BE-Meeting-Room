const bcrypt = require('bcryptjs')
const { z } = require('zod')
const prisma = require('../config/prisma')

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(1, 'Phone number is required'),
  division: z.string().min(1, 'Division is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'user']).optional().default('user'),
})

const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(1, 'Phone number is required'),
  division: z.string().min(1, 'Division is required'),
  role: z.enum(['admin', 'user']).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
})

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone number is required'),
  division: z.string().min(1, 'Division is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
  confirmPassword: z.string().optional(),
})

const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, phone: true, division: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    return res.status(200).json({ users })
  } catch (error) {
    console.error('Get all users error:', error)
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const getUserById = async (req, res) => {
  try {
    const { id } = req.params
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, division: true, role: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ message: 'User not found.' })
    return res.status(200).json({ user })
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const createUser = async (req, res) => {
  try {
    const result = createUserSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message })
    }

    const { name, email, phone, division, password, role } = result.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ message: 'Email is already registered, please try another email.' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { name, email, phone, division, password: hashedPassword, role },
      select: { id: true, name: true, email: true, phone: true, division: true, role: true },
    })

    return res.status(201).json({ message: 'User successfully added.', user })
  } catch (error) {
    console.error('Create user error:', error)
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const updateUser = async (req, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'User not found.' })

    const result = updateUserSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message })
    }

    const { name, email, phone, division, role, password } = result.data

    // Check duplicate email if email changes
    if (email !== existing.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } })
      if (emailExists) return res.status(409).json({ message: 'Email has been used by another user.' })
    }

    const updateData = { name, email, phone, division, role }
    if (password && password.length > 0) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, division: true, role: true },
    })

    return res.status(200).json({ message: 'User successfully updated.', user })
  } catch (error) {
    console.error('Update user error:', error)
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params

    // Prevent self-delete
    if (id === req.user.id) {
      return res.status(400).json({ message: 'Can\'t delete own account.' })
    }

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'User not found.' })

    await prisma.user.delete({ where: { id } })
    return res.status(200).json({ message: 'User successfully deleted.' })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

const updateProfile = async (req, res) => {
  try {
    const result = updateProfileSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message })
    }

    const { name, phone, division, password, confirmPassword } = result.data

    if (password && password.length > 0 && password !== confirmPassword) {
      return res.status(400).json({ message: 'Confirm password does not match.' })
    }

    const updateData = { name, phone, division }
    if (password && password.length > 0) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, division: true, role: true },
    })

    return res.status(200).json({ message: 'Profile updated successfully.', user })
  } catch (error) {
    console.error('Update profile error:', error)
    return res.status(500).json({ message: 'Internal server error.' })
  }
}

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, updateProfile }