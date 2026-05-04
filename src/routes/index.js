const express = require("express");
const router = express.Router();

const {
  register,
  login,
  logout,
  refreshToken,
  getMe,
} = require("../controllers/auth_controller");
const {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
} = require("../controllers/rooms_controller");
const {
  getUserBookings,
  getAllBookings,
  createBooking,
  cancelBooking,
} = require("../controllers/bookings_controller");
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateProfile,
} = require("../controllers/users_controller");
const { authenticate, adminOnly } = require("../middleware/auth_middleware");

// Auth routes
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.post("/auth/refresh", refreshToken);
router.get("/auth/me", authenticate, getMe);

// Room routes
router.get("/rooms", getAllRooms);
router.get("/rooms/:id", getRoomById);
router.post("/rooms", authenticate, adminOnly, createRoom);
router.put("/rooms/:id", authenticate, adminOnly, updateRoom);
router.delete("/rooms/:id", authenticate, adminOnly, deleteRoom);

// Booking routes
router.get("/bookings", authenticate, getUserBookings);
router.get("/bookings/all", authenticate, adminOnly, getAllBookings);
router.post("/bookings", authenticate, createBooking);
router.put("/bookings/:id/cancel", authenticate, cancelBooking);

// User management routes (admin only)
router.get("/users", authenticate, adminOnly, getAllUsers);
router.get("/users/:id", authenticate, adminOnly, getUserById);
router.post("/users", authenticate, adminOnly, createUser);
router.put("/users/:id", authenticate, adminOnly, updateUser);
router.delete("/users/:id", authenticate, adminOnly, deleteUser);

// Profile route (any authenticated user)
router.put("/profile", authenticate, updateProfile);

module.exports = router;
