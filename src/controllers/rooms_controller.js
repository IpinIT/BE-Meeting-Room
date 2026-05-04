const { z } = require('zod')
const prisma = require('../config/prisma')

const roomSchema = z.object({
  name: z.string().min(1, 'Nama ruangan wajib diisi'),
  description: z.string().min(1, 'Deskripsi wajib diisi'),
  capacity: z.number({ invalid_type_error: 'Kapasitas harus berupa angka' }).int().positive('Kapasitas harus lebih dari 0'),
  sizeSqft: z.number({ invalid_type_error: 'Luas ruangan harus berupa angka' }).int().positive('Luas ruangan harus lebih dari 0'),
  facilities: z.array(z.string()).min(1, 'Fasilitas wajib diisi'),
  imageUrl: z.string().url('URL gambar tidak valid'),
  availableStart: z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu tidak valid').optional().default('08:00'),
  availableEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu tidak valid').optional().default('18:00'),
})

const getAllRooms = async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return res.status(200).json({ rooms })
  } catch (error) {
    console.error('Get rooms error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const getRoomById = async (req, res) => {
  try {
    const { id } = req.params

    const room = await prisma.room.findUnique({
      where: { id },
    })

    if (!room) return res.status(404).json({ message: 'Ruangan tidak ditemukan.' })

    // Get today's active bookings for this room to show who booked and when
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const bookings = await prisma.booking.findMany({
      where: {
        roomId: id,
        status: 'active',
        checkIn: { gte: today },
      },
      include: {
        user: { select: { name: true, division: true } },
      },
      orderBy: { checkIn: 'asc' },
    })

    return res.status(200).json({ room, bookings })
  } catch (error) {
    console.error('Get room by id error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const createRoom = async (req, res) => {
  try {
    // Parse facilities jika dikirim sebagai string
    if (typeof req.body.facilities === 'string') {
      req.body.facilities = req.body.facilities.split(',').map(f => f.trim()).filter(Boolean)
    }
    if (req.body.capacity) req.body.capacity = parseInt(req.body.capacity)
    if (req.body.sizeSqft) req.body.sizeSqft = parseInt(req.body.sizeSqft)

    const result = roomSchema.safeParse(req.body)
    if (!result.success) {
      const firstError = result.error.errors[0].message
      return res.status(400).json({ message: firstError })
    }

    const room = await prisma.room.create({ data: result.data })
    return res.status(201).json({ message: 'Ruangan berhasil ditambahkan.', room })
  } catch (error) {
    console.error('Create room error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const updateRoom = async (req, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.room.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Ruangan tidak ditemukan.' })

    if (typeof req.body.facilities === 'string') {
      req.body.facilities = req.body.facilities.split(',').map(f => f.trim()).filter(Boolean)
    }
    if (req.body.capacity) req.body.capacity = parseInt(req.body.capacity)
    if (req.body.sizeSqft) req.body.sizeSqft = parseInt(req.body.sizeSqft)

    const result = roomSchema.safeParse(req.body)
    if (!result.success) {
      const firstError = result.error.errors[0].message
      return res.status(400).json({ message: firstError })
    }

    const room = await prisma.room.update({ where: { id }, data: result.data })
    return res.status(200).json({ message: 'Ruangan berhasil diperbarui.', room })
  } catch (error) {
    console.error('Update room error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.room.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Ruangan tidak ditemukan.' })

    await prisma.room.delete({ where: { id } })
    return res.status(200).json({ message: 'Ruangan berhasil dihapus.' })
  } catch (error) {
    console.error('Delete room error:', error)
    return res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
}

module.exports = { getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom }