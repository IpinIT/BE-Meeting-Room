const { z } = require("zod");
const prisma = require("../config/prisma");

const bookingSchema = z.object({
  roomId: z.string().uuid("ID ruangan tidak valid"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  startTime: z.string().min(1, "Jam mulai wajib diisi"),
  endTime: z.string().min(1, "Jam selesai wajib diisi"),
});

const getUserBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user.id },
      include: {
        room: { select: { id: true, name: true, imageUrl: true } },
      },
      orderBy: { checkIn: "desc" },
    });
    return res.status(200).json({ bookings });
  } catch (error) {
    console.error("Get user bookings error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        room: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, division: true, email: true } },
      },
      orderBy: { checkIn: "desc" },
    });
    return res.status(200).json({ bookings });
  } catch (error) {
    console.error("Get all bookings error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server." });
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

    // Gabungkan date + time menjadi datetime string
    const checkInDate = new Date(`${date}T${startTime}:00`);
    const checkOutDate = new Date(`${date}T${endTime}:00`);
    const now = new Date();

    // Validasi: tidak boleh backdate
    if (checkInDate <= now) {
      return res
        .status(400)
        .json({ message: "Jam mulai harus lebih dari waktu sekarang." });
    }

    // Validasi: jam selesai harus setelah jam mulai
    if (checkOutDate <= checkInDate) {
      return res
        .status(400)
        .json({ message: "Jam selesai harus setelah jam mulai." });
    }

    // Validasi: jam kerja 08:00 - 18:00
    const startHour = checkInDate.getHours();
    const startMinutes = checkInDate.getMinutes();
    const endHour = checkOutDate.getHours();
    const endMinutes = checkOutDate.getMinutes();

    const startTotal = startHour * 60 + startMinutes;
    const endTotal = endHour * 60 + endMinutes;

    if (startTotal < 8 * 60 || endTotal > 18 * 60) {
      return res
        .status(400)
        .json({ message: "Booking hanya tersedia pada jam 08:00 - 18:00." });
    }

    // Validasi: room exists
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room)
      return res.status(404).json({ message: "Ruangan tidak ditemukan." });

    // Concurrency handling dengan transaction + SELECT FOR UPDATE
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

      const newBooking = await tx.booking.create({
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

      return newBooking;
    });

    return res
      .status(201)
      .json({ message: "Ruangan berhasil dibooking!", booking });
  } catch (error) {
    if (error.message === "ROOM_ALREADY_BOOKED") {
      return res
        .status(409)
        .json({ message: "Ruangan sudah dibooking pada waktu yang dipilih." });
    }
    if (
      error.code === "P2010" ||
      (error.message && error.message.includes("bookings_no_overlap"))
    ) {
      return res
        .status(409)
        .json({ message: "Ruangan sudah dibooking pada waktu yang dipilih." });
    }
    console.error("Create booking error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });

    if (!booking)
      return res.status(404).json({ message: "Booking tidak ditemukan." });

    if (req.user.role !== "admin" && booking.userId !== req.user.id) {
      return res
        .status(403)
        .json({
          message: "Anda tidak memiliki akses untuk membatalkan booking ini.",
        });
    }

    if (booking.status === "cancelled") {
      return res
        .status(400)
        .json({ message: "Booking sudah dibatalkan sebelumnya." });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return res
      .status(200)
      .json({ message: "Booking berhasil dibatalkan.", booking: updated });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = {
  getUserBookings,
  getAllBookings,
  createBooking,
  cancelBooking,
};
