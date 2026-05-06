const { z } = require("zod");
const prisma = require("../config/prisma");

const bookingSchema = z.object({
  roomId: z.string().uuid("Invalid room ID"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
});

const getUserBookings = async (req, res) => {
  try {
    const {
      page = 1,
      search = "",
      roomId = "",
      status = "",
      startDate = "",
      endDate = "",
    } = req.query;
    const take = 10;
    const skip = (parseInt(page) - 1) * take;

    const where = {
      userId: req.user.id,
      ...(status && { status }),
      ...(roomId && { roomId }),
      ...(search && {
        room: { name: { contains: search, mode: "insensitive" } },
      }),
      ...(startDate &&
        endDate && {
          checkIn: {
            gte: new Date(startDate),
            lte: new Date(new Date(endDate).setHours(23, 59, 59)),
          },
        }),
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          room: { select: { id: true, name: true, imageUrl: true } },
          user: { select: { id: true, name: true, division: true } },
        },
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
        page: parseInt(page),
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
      page = 1,
      search = "",
      roomId = "",
      status = "",
      startDate = "",
      endDate = "",
    } = req.query;
    const take = 10;
    const skip = (parseInt(page) - 1) * take;

    const where = {
      ...(status && { status }),
      ...(roomId && { roomId }),
      ...(search && {
        OR: [
          { room: { name: { contains: search, mode: "insensitive" } } },
          { user: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
      ...(startDate &&
        endDate && {
          checkIn: {
            gte: new Date(startDate),
            lte: new Date(new Date(endDate).setHours(23, 59, 59)),
          },
        }),
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          room: { select: { id: true, name: true, imageUrl: true } },
          user: {
            select: { id: true, name: true, division: true, email: true },
          },
        },
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
        page: parseInt(page),
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
      roomId = "",
      status = "",
      startDate = "",
      endDate = "",
    } = req.query;
    const isAdmin = req.user.role === "admin";

    const where = {
      ...(!isAdmin && { userId: req.user.id }),
      ...(status && { status }),
      ...(roomId && { roomId }),
      ...(search && {
        OR: [
          { room: { name: { contains: search, mode: "insensitive" } } },
          ...(isAdmin
            ? [{ user: { name: { contains: search, mode: "insensitive" } } }]
            : []),
        ],
      }),
      ...(startDate &&
        endDate && {
          checkIn: {
            gte: new Date(startDate),
            lte: new Date(new Date(endDate).setHours(23, 59, 59)),
          },
        }),
    };

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        room: { select: { name: true } },
        user: { select: { name: true, division: true, email: true } },
      },
      orderBy: { checkIn: "desc" },
    });

    // Build CSV
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

    const rows = bookings.map((b) => {
      const checkIn = new Date(b.checkIn);
      const checkOut = new Date(b.checkOut);
      const duration = Math.round((checkOut - checkIn) / 60000);
      const date = checkIn.toLocaleDateString("en-GB");
      const startTime = checkIn.toLocaleTimeString("en-GB", {
        timeStyle: "short",
      });
      const endTime = checkOut.toLocaleTimeString("en-GB", {
        timeStyle: "short",
      });
      const createdAt = new Date(b.createdAt).toLocaleString("en-GB");

      return [
        b.id,
        b.room.name,
        b.user.name,
        b.user.email,
        b.user.division,
        date,
        startTime,
        endTime,
        duration,
        b.status,
        createdAt,
      ]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="booking-report-${Date.now()}.csv"`,
    );
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Export bookings error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const createBooking = async (req, res) => {
  try {
    const result = bookingSchema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.errors[0].message;
      return res.status(400).json({ message: firstError });
    }

    const { roomId, date, startTime, endTime } = result.data;

    const checkInDate = new Date(`${date}T${startTime}:00`);
    const checkOutDate = new Date(`${date}T${endTime}:00`);
    const now = new Date();

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

    if (startTotal < 8 * 60 || endTotal > 18 * 60) {
      return res
        .status(400)
        .json({ message: "Booking is only available between 08:00 - 18:00." });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
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

      return await tx.booking.create({
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
    if (error.message === "ROOM_ALREADY_BOOKED") {
      return res
        .status(409)
        .json({ message: "Room is already booked for the selected time." });
    }
    if (error.message?.includes("bookings_no_overlap")) {
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

    const booking = await prisma.booking.findUnique({ where: { id } });
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

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return res
      .status(200)
      .json({ message: "Booking cancelled successfully.", booking: updated });
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
