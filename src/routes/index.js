const express = require('express')
const router = express.Router()

const { register, login, logout, refreshToken, getMe } = require('../controllers/auth_controller')
const { getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom } = require('../controllers/rooms_controller')
const { getUserBookings, getAllBookings, exportBookings, createBooking, cancelBooking } = require('../controllers/bookings_controller')
const { getAllUsers, getUserById, createUser, updateUser, deleteUser, updateProfile } = require('../controllers/users_controller')
const { authenticate, adminOnly, validateUUIDParam } = require('../middleware/auth_middleware')

// ─── Auth ────────────────────────────────────────────────────────────────────
router.post('/auth/register', register)
router.post('/auth/login', login)
router.post('/auth/logout', logout)
router.post('/auth/refresh', refreshToken)
router.get('/auth/me', authenticate, getMe)

// ─── Rooms ───────────────────────────────────────────────────────────────────
router.get('/rooms', getAllRooms)
router.post('/rooms', authenticate, adminOnly, createRoom)
// PENTING: static routes HARUS sebelum dynamic routes (:id)
router.get('/rooms/:id', validateUUIDParam('id'), getRoomById)
router.put('/rooms/:id', authenticate, adminOnly, validateUUIDParam('id'), updateRoom)
router.delete('/rooms/:id', authenticate, adminOnly, validateUUIDParam('id'), deleteRoom)

// ─── Bookings ────────────────────────────────────────────────────────────────
// PENTING: /bookings/all dan /bookings/export HARUS sebelum /bookings/:id
router.get('/bookings/all', authenticate, adminOnly, getAllBookings)
router.get('/bookings/export', authenticate, exportBookings)
router.get('/bookings', authenticate, getUserBookings)
router.post('/bookings', authenticate, createBooking)
router.put('/bookings/:id/cancel', authenticate, validateUUIDParam('id'), cancelBooking)

// ─── Users ───────────────────────────────────────────────────────────────────
router.get('/users', authenticate, adminOnly, getAllUsers)
router.post('/users', authenticate, adminOnly, createUser)
router.get('/users/:id', authenticate, adminOnly, validateUUIDParam('id'), getUserById)
router.put('/users/:id', authenticate, adminOnly, validateUUIDParam('id'), updateUser)
router.delete('/users/:id', authenticate, adminOnly, validateUUIDParam('id'), deleteUser)

// ─── Profile ─────────────────────────────────────────────────────────────────
router.put('/profile', authenticate, updateProfile)

module.exports = router