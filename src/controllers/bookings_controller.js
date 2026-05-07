const { z } = require("zod");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");

const bookingSchema = z.object({
  roomId: z.string().uuid("Invalid room ID"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
});

// Escape string untuk LIKE query agar aman dari ReDoS
const escapeLike = (str) => str.replace(/[%_\\]/g, "\\$&");

// Builder filter yang reusable
const buildBookingFilter = ({
  userId,
  search,
  status,
  roomId,
  startDate,
  endDate,
  isAdmin,
}) => {
  const where = {};

  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (roomId) where.roomId = roomId;

  if (search) {
    const safeSearch = escapeLike(search);
    where.OR = [
      { room: { name: { contains: safeSearch, mode: "insensitive" } } },
      ...(isAdmin
        ? [{ user: { name: { contains: safeSearch, mode: "insensitive" } } }]
        : []),
    ];
  }

  if (startDate && endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    where.checkIn = {
      gte: new Date(startDate),
      lte: end,
    };
  }

  return where;
};

const BOOKING_INCLUDE = {
  room: { select: { id: true, name: true, imageUrl: true } },
  user: { select: { id: true, name: true, division: true, email: true } },
};

const getUserBookings = async (req, res) => {
  try {
    const {
      page = "1",
      search = "",
      status = "",
      startDate = "",
      endDate = "",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const take = 10;
    const skip = (pageNum - 1) * take;

    const where = buildBookingFilter({
      userId: req.user.id,
      search,
      status,
      startDate,
      endDate,
      isAdmin: false,
    });

    const [bookings, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        include: BOOKING_INCLUDE,
        orderBy: { checkIn: "desc" },
        take,
        skip,
      }),
      prisma.booking.count({ where }),
    ]);

    return res.status(200).json({
      bookings,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Get user bookings error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const {
      page = "1",
      search = "",
      status = "",
      roomId = "",
      startDate = "",
      endDate = "",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const take = 10;
    const skip = (pageNum - 1) * take;

    const where = buildBookingFilter({
      search,
      status,
      roomId,
      startDate,
      endDate,
      isAdmin: true,
    });

    const [bookings, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        include: BOOKING_INCLUDE,
        orderBy: { checkIn: "desc" },
        take,
        skip,
      }),
      prisma.booking.count({ where }),
    ]);

    return res.status(200).json({
      bookings,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Get all bookings error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const exportBookings = async (req, res) => {
  try {
    const {
      search = "",
      status = "",
      roomId = "",
      startDate = "",
      endDate = "",
    } = req.query;
    const isAdmin = req.user.role === "admin";

    const where = buildBookingFilter({
      ...(!isAdmin && { userId: req.user.id }),
      search,
      status,
      roomId,
      startDate,
      endDate,
      isAdmin,
    });

    // Limit export maksimal 10.000 rows untuk cegah crash
    const EXPORT_LIMIT = 10000;
    const bookings = await prisma.booking.findMany({
      where,
      include: {
        room: { select: { name: true } },
        user: { select: { name: true, division: true, email: true } },
      },
      orderBy: { checkIn: "desc" },
      take: EXPORT_LIMIT,
    });

    const headers = [
      "Booking ID",
      "Room Name",
      "Booked By",
      "Email",
      "Division",
      "Date",
      "Start Time",
      "End Time",
      "Duration (minutes)",
      "Status",
      "Created At",
    ];

    const escapeCSV = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = bookings.map((b) => {
      const checkIn = new Date(b.checkIn);
      const checkOut = new Date(b.checkOut);
      const duration = Math.round((checkOut - checkIn) / 60000);

      return [
        b.id,
        b.room.name,
        b.user.name,
        b.user.email,
        b.user.division,
        checkIn.toLocaleDateString("en-GB"),
        checkIn.toLocaleTimeString("en-GB", { timeStyle: "short" }),
        checkOut.toLocaleTimeString("en-GB", { timeStyle: "short" }),
        duration,
        b.status,
        new Date(b.createdAt).toLocaleString("en-GB"),
      ]
        .map(escapeCSV)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const filename = `booking-report-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send("\uFEFF" + csv); // BOM untuk Excel compatibility
  } catch (error) {
    console.error("Export bookings error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const createBooking = async (req, res) => {
  try {
    const result = bookingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message });
    }

    const { roomId, date, startTime, endTime } = result.data;
    const checkInDate = new Date(`${date}T${startTime}:00`);
    const checkOutDate = new Date(`${date}T${endTime}:00`);
    const now = new Date();

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return res.status(400).json({ message: "Invalid date or time format." });
    }

    if (checkInDate <= now) {
      return res
        .status(400)
        .json({ message: "Start time must be in the future." });
    }

    if (checkOutDate <= checkInDate) {
      return res
        .status(400)
        .json({ message: "End time must be after start time." });
    }

    const startTotal = checkInDate.getHours() * 60 + checkInDate.getMinutes();
    const endTotal = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();

    if (startTotal < 480 || endTotal > 1080) {
      return res
        .status(400)
        .json({ message: "Booking is only available between 08:00 - 18:00." });
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, name: true },
    });
    if (!room) return res.status(404).json({ message: "Room not found." });

    const booking = await prisma.$transaction(async (tx) => {
      const overlapping = await tx.$queryRaw`
        SELECT id FROM "bookings"
        WHERE "room_id"::text = ${roomId}
          AND "status"::text = 'active'
          AND tstzrange("check_in", "check_out") && tstzrange(${checkInDate}::timestamptz, ${checkOutDate}::timestamptz)
        FOR UPDATE
      `;

      if (overlapping.length > 0) {
        throw new Error("ROOM_ALREADY_BOOKED");
      }

      return tx.booking.create({
        data: {
          roomId,
          userId: req.user.id,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          status: "active",
        },
        include: {
          room: { select: { name: true } },
        },
      });
    });

    return res
      .status(201)
      .json({ message: "Room booked successfully!", booking });
  } catch (error) {
    if (
      error.message === "ROOM_ALREADY_BOOKED" ||
      error.message?.includes("bookings_no_overlap")
    ) {
      return res
        .status(409)
        .json({ message: "Room is already booked for the selected time." });
    }
    console.error("Create booking error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });

    if (!booking)
      return res.status(404).json({ message: "Booking not found." });

    if (req.user.role !== "admin" && booking.userId !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to cancel this booking." });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Booking is already cancelled." });
    }

    await prisma.booking.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return res.status(200).json({ message: "Booking cancelled successfully." });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = {
  getUserBookings,
  getAllBookings,
  exportBookings,
  createBooking,
  cancelBooking,
};
