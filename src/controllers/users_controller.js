const bcrypt = require('bcryptjs')
const { z } = require('zod')
const prisma = require('../config/prisma')

const createUserSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().min(1, 'Nomor telepon wajib diisi'),
  division: z.string().min(1, 'Divisi wajib diisi'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['admin', 'user']).optional().default('user'),
})

const updateUserSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().min(1, 'Nomor telepon wajib diisi'),
  division: z.string().min(1, 'Divisi wajib diisi'),
  role: z.enum(['admin', 'user']).optional(),
  password: z.string().min(6, 'Password minimal 6 karakter').optional().or(z.literal('')),
})

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  phone: z.string().min(1, 'Nomor telepon wajib diisi'),
  division: z.string().min(1, 'Divisi wajib diisi'),
  password: z.string().min(6, 'Password minimal 6 karakter').optional().or(z.literal('')),
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
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const getUserById = async (req, res) => {
  try {
    const { id } = req.params
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, division: true, role: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan.' })
    return res.status(200).json({ user })
  } catch (error) {
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
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
      return res.status(409).json({ message: 'Email sudah terdaftar, silakan coba email lain.' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { name, email, phone, division, password: hashedPassword, role },
      select: { id: true, name: true, email: true, phone: true, division: true, role: true },
    })

    return res.status(201).json({ message: 'User berhasil ditambahkan.', user })
  } catch (error) {
    console.error('Create user error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const updateUser = async (req, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'User tidak ditemukan.' })

    const result = updateUserSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message })
    }

    const { name, email, phone, division, role, password } = result.data

    // Cek email duplikat jika email berubah
    if (email !== existing.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } })
      if (emailExists) return res.status(409).json({ message: 'Email sudah dipakai user lain.' })
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

    return res.status(200).json({ message: 'User berhasil diperbarui.', user })
  } catch (error) {
    console.error('Update user error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params

    // Prevent self-delete
    if (id === req.user.id) {
      return res.status(400).json({ message: 'Tidak bisa menghapus akun sendiri.' })
    }

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'User tidak ditemukan.' })

    await prisma.user.delete({ where: { id } })
    return res.status(200).json({ message: 'User berhasil dihapus.' })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
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
      return res.status(400).json({ message: 'Konfirmasi password tidak cocok.' })
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

    return res.status(200).json({ message: 'Profil berhasil diperbarui.', user })
  } catch (error) {
    console.error('Update profile error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, updateProfile }