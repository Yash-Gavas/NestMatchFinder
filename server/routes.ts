// @ts-nocheck
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import {
  loginSchema,
  insertBookingSchema,
  insertPropertySchema,
  insertReviewSchema,
  insertFavoriteSchema,
} from "../shared/schema.js";
import jwt from "jsonwebtoken";
import { generateOtpCode, sendOtpEmail } from "./email.js";
import { normalizeCity, isValidCoord } from "../shared/cities.js";
import { getRoomTypes, parseRoomTypes, aggregateRoomTypes, sharingLabel } from "../shared/roomtypes.js";

const JWT_SECRET = process.env.JWT_SECRET || "nestmatch_secret_key";
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Extend Express Request interface
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    userType: string;
  };
}

// Authentication middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

// ---- shared business rules -------------------------------------------------
// A booking "holds" a bed while it is pending or approved. Any status change that
// moves a booking into/out of this set must adjust the property's availableBeds.
const BED_HOLDING = ["pending", "approved"];
const holdsBed = (status: string) => BED_HOLDING.includes(status);
const toInt = (v: any) => (v === "" || v == null ? NaN : Math.trunc(Number(v)));
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// Change availableBeds by delta on the booked room type (and keep the property totals
// in sync). Old properties without room types just use the plain counters.
async function adjustBeds(property: any, sharing: number | null | undefined, delta: number) {
  const types = getRoomTypes(property);
  if (types.length > 0 && sharing != null) {
    const next = types.map((t) =>
      t.sharing === sharing
        ? { ...t, availableBeds: Math.max(0, Math.min(t.totalBeds, t.availableBeds + delta)) }
        : t
    );
    const agg = aggregateRoomTypes(next);
    return storage.updateProperty(property.id, {
      roomTypes: next,
      totalBeds: agg.totalBeds,
      availableBeds: agg.availableBeds,
    } as any);
  }
  return storage.updateProperty(property.id, {
    availableBeds: Math.max(0, Math.min(property.totalBeds, property.availableBeds + delta)),
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // In-memory OTP store (works without DB table; cleared on restart)
  const otpStore = new Map<
    string,
    {
      code: string;
      expiresAt: number;
      userType: string;
      signupPayload?: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        userType: "user" | "owner";
      };
    }
  >();

  // Passwordless OTP Signup: validates user info, sends OTP via Resend, and awaits /api/auth/verify-otp
  app.post("/api/auth/signup", async (req, res) => {
    try {
      console.log("Signup request body:", req.body);
      const { firstName, lastName, email, phone, userType } = req.body || {};

      if (
        !firstName ||
        !String(firstName).trim() ||
        !lastName ||
        !String(lastName).trim() ||
        !email ||
        !String(email).trim() ||
        !phone ||
        !String(phone).trim() ||
        (userType !== "user" && userType !== "owner")
      ) {
        return res.status(400).json({
          message:
            "First name, last name, email, phone, and userType ('user' or 'owner') are required",
        });
      }

      const normalized = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      const existingUser = await storage.getUserByEmail(normalized);
      if (existingUser) {
        console.log("Signup failed: User already exists", {
          email: normalized,
          userType,
        });
        return res
          .status(400)
          .json({ message: "User already exists with this email" });
      }

      const code = generateOtpCode();
      const expiresAt = Date.now() + OTP_TTL_MS;
      const signupPayload = {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: normalized,
        phone: String(phone).trim(),
        userType: userType as "user" | "owner",
      };

      otpStore.set(normalized, {
        code,
        expiresAt,
        userType,
        signupPayload,
      });

      try {
        const { pool } = await import("./db.js");
        await pool.query(
          `CREATE TABLE IF NOT EXISTS otps (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            "expiresAt" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )`
        );
        await pool.query(`DELETE FROM otps WHERE email = $1`, [normalized]);
        await pool.query(
          `INSERT INTO otps (email, code, "expiresAt") VALUES ($1, $2, to_timestamp($3 / 1000.0))`,
          [normalized, code, expiresAt]
        );
      } catch (dbErr) {
        console.log("OTP DB store skipped:", (dbErr as Error).message);
      }

      const result = await sendOtpEmail(normalized, code);
      if (!result.ok) {
        return res.status(502).json({
          message: result.error || "Failed to send OTP email",
          hint: "Check RESEND_API_KEY and that the from-domain is verified in Resend.",
        });
      }

      return res.status(200).json({
        message:
          "OTP sent. Check your inbox — and your spam folder if this is the first time.",
        email: normalized,
        requiresOtp: true,
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      return res.status(400).json({
        message: error.message || "Invalid input data",
      });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log("Login attempt:", req.body);
      const { email, password, userType } = req.body;

      if (!email || !password || !userType) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const user = await storage.getUserByEmail(email);
      console.log(
        "User found:",
        user
          ? { id: user.id, email: user.email, userType: user.userType }
          : "No user found"
      );

      if (!user || user.userType !== userType) {
        console.log("Login failed: User not found or wrong userType", {
          email,
          requestedUserType: userType,
          userExists: !!user,
          actualUserType: user?.userType,
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = user.password && password === user.password;
      if (!isValidPassword) {
        console.log("Login failed: Invalid password for user:", email);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, userType: user.userType },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      res.json({
        message: "Login successful",
        user: { ...user, password: undefined },
        token,
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid input", error });
    }
  });

  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { email, userType = "user" } = req.body || {};
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      const existing = otpStore.get(normalized);
      const code = generateOtpCode();
      const expiresAt = Date.now() + OTP_TTL_MS;

      otpStore.set(normalized, {
        code,
        expiresAt,
        userType: userType === "owner" ? "owner" : "user",
        signupPayload: existing?.signupPayload,
      });

      try {
        const { pool } = await import("./db.js");
        await pool.query(
          `CREATE TABLE IF NOT EXISTS otps (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            "expiresAt" TIMESTAMP NOT NULL,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )`
        );
        await pool.query(`DELETE FROM otps WHERE email = $1`, [normalized]);
        await pool.query(
          `INSERT INTO otps (email, code, "expiresAt") VALUES ($1, $2, to_timestamp($3 / 1000.0))`,
          [normalized, code, expiresAt]
        );
      } catch (dbErr) {
        console.log("OTP DB store skipped:", (dbErr as Error).message);
      }

      const result = await sendOtpEmail(normalized, code);
      if (!result.ok) {
        return res.status(502).json({
          message: result.error || "Failed to send OTP email",
          hint: "Check RESEND_API_KEY and that the from-domain is verified in Resend.",
        });
      }

      res.json({
        message:
          "OTP sent. Check your inbox — and your spam folder if this is the first time.",
        email: normalized,
      });
    } catch (error: any) {
      console.error("send-otp error:", error);
      res.status(500).json({ message: error.message || "Failed to send OTP" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const rawCode = req.body?.code ?? req.body?.otp;
      const { email, userType = "user" } = req.body || {};
      if (!email || !rawCode) {
        return res.status(400).json({ message: "Email and code are required" });
      }
      const normalized = String(email).trim().toLowerCase();
      const entered = String(rawCode).trim();

      let stored = otpStore.get(normalized);

      if (!stored) {
        try {
          const { pool } = await import("./db.js");
          const r = await pool.query(
            `SELECT code, "expiresAt" FROM otps WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1`,
            [normalized]
          );
          if (r.rows[0]) {
            stored = {
              code: r.rows[0].code,
              expiresAt: new Date(r.rows[0].expiresAt).getTime(),
              userType: userType === "owner" ? "owner" : "user",
            };
          }
        } catch {
          // ignore
        }
      }

      if (!stored) {
        return res
          .status(400)
          .json({ message: "No OTP found. Please request a new code." });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(normalized);
        return res
          .status(400)
          .json({ message: "OTP expired. Please request a new code." });
      }
      if (stored.code !== entered) {
        return res
          .status(401)
          .json({ message: "Invalid OTP. Please try again." });
      }

      const signupPayload = stored.signupPayload;
      otpStore.delete(normalized);
      try {
        const { pool } = await import("./db.js");
        await pool.query(`DELETE FROM otps WHERE email = $1`, [normalized]);
      } catch {
        // ignore
      }

      const role =
        userType === "owner"
          ? "owner"
          : signupPayload?.userType || stored.userType || "user";

      let user = await storage.getUserByEmail(normalized);

      if (!user) {
        const firstName =
          signupPayload?.firstName || normalized.split("@")[0] || "User";
        const lastName = signupPayload?.lastName || "";
        const fullName = `${firstName} ${lastName}`.trim();

        user = await storage.createUser({
          email: normalized,
          password: null,
          firstName,
          lastName,
          name: fullName,
          phone: signupPayload?.phone || "N/A",
          userType: role,
          isVerified: true,
        } as any);
      } else if (!user.isVerified) {
        try {
          const { pool } = await import("./db.js");
          await pool.query(
            `UPDATE users SET "isVerified" = true WHERE id = $1`,
            [user.id]
          );
          user = { ...user, isVerified: true };
        } catch {
          // ignore
        }
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, userType: user.userType },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      res.json({
        message: "Login successful",
        user: { ...user, password: undefined },
        token,
      });
    } catch (error: any) {
      console.error("verify-otp error:", error);
      res.status(500).json({ message: error.message || "Verification failed" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res: any) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      console.log(
        `User authenticated: ID ${user.id}, Email: ${user.email}, Type: ${user.userType}`
      );
      res.json({ ...user, password: undefined });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Property routes
  app.get("/api/properties", async (req, res) => {
    try {
      const { city, minRent, maxRent, gender } = req.query;

      if (city || minRent || maxRent || gender) {
        const properties = await storage.searchProperties({
          city: city as string,
          minRent: minRent ? parseInt(minRent as string) : undefined,
          maxRent: maxRent ? parseInt(maxRent as string) : undefined,
          gender: gender as string,
        });
        res.json(properties);
      } else {
        const properties = await storage.getAllProperties();
        console.log(`All properties in system:`, properties.length);
        res.json(properties);
      }
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getProperty(parseInt(req.params.id));
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      res.json(property);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post(
    "/api/properties",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        if (req.user.userType !== "owner") {
          return res
            .status(403)
            .json({ message: "Only owners can create properties" });
        }

        const body = req.body || {};
        let rent = toInt(body.rent);
        let securityDeposit = toInt(body.securityDeposit ?? 0);
        let totalBeds = toInt(body.totalBeds);
        let availableBeds = toInt(body.availableBeds);

        // Room types (1/2/3 sharing, each with its own price and beds). The property's
        // headline rent and bed totals are derived from them.
        let roomTypes: any[] | null = null;
        if (Array.isArray(body.roomTypes) && body.roomTypes.length > 0) {
          const parsed = parseRoomTypes(body.roomTypes);
          if (parsed.error) return res.status(400).json({ message: parsed.error });
          roomTypes = parsed.types!;
          ({ rent, securityDeposit, totalBeds, availableBeds } = aggregateRoomTypes(roomTypes));
        }
        const city = normalizeCity(body.city);

        if (!String(body.name || "").trim() || !String(body.address || "").trim() || !city) {
          return res.status(400).json({ message: "Name, address and city are required" });
        }
        if (!(rent > 0)) {
          return res.status(400).json({ message: "Rent must be greater than 0" });
        }
        if (!(securityDeposit >= 0)) {
          return res.status(400).json({ message: "Security deposit cannot be negative" });
        }
        if (!(totalBeds > 0) || !(availableBeds >= 0) || availableBeds > totalBeds) {
          return res.status(400).json({
            message: "Total beds must be at least 1 and available beds cannot exceed total beds",
          });
        }
        const hasCoords = isValidCoord(body.latitude, body.longitude);
        if ((body.latitude || body.longitude) && !hasCoords) {
          return res.status(400).json({ message: "Latitude/longitude are not valid coordinates" });
        }

        const propertyData = insertPropertySchema.parse({
          name: String(body.name).trim(),
          description: body.description || "",
          address: String(body.address).trim(),
          city,
          state: String(body.state || "").trim() || "NA",
          pincode: String(body.pincode || "").trim() || "NA",
          latitude: hasCoords ? String(body.latitude) : undefined,
          longitude: hasCoords ? String(body.longitude) : undefined,
          rent,
          securityDeposit,
          totalRooms: toInt(body.totalRooms) > 0 ? toInt(body.totalRooms) : null,
          roomTypes,
          totalBeds,
          availableBeds,
          gender: ["male", "female", "any"].includes(body.gender) ? body.gender : "any",
          amenities: Array.isArray(body.amenities) ? body.amenities : [],
          images: Array.isArray(body.images) ? body.images : [],
          ownerId: req.user.id,
          isVerified: true,
        });

        const property = await storage.createProperty(propertyData);
        console.log("Property created successfully:", property.id);
        res.status(201).json(property);
      } catch (error) {
        console.error("Property creation error:", error);
        res.status(400).json({ message: "Invalid input", error });
      }
    }
  );

  app.get(
    "/api/properties/owner/:ownerId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const ownerId = parseInt(req.params.ownerId);
        console.log(
          `Requested owner ID: ${ownerId}, User ID: ${req.user.id}, User email: ${req.user.email}`
        );

        if (req.user.id !== ownerId) {
          return res.status(403).json({ message: "Access denied" });
        }

        const properties = await storage.getPropertiesByOwner(ownerId);
        console.log(
          `Fetching properties for owner ${ownerId}:`,
          properties.length,
          properties.map((p) => p.name)
        );
        res.json(properties);
      } catch (error) {
        console.error("Error fetching owner properties:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  app.get("/api/properties/city/:city", async (req, res) => {
    try {
      const properties = await storage.getPropertiesByCity(req.params.city);
      res.json(properties);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update property route
  app.put(
    "/api/properties/:id",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }

        if (property.ownerId !== req.user.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Whitelist: bed counts are changed only through the bed endpoint / bookings
        const body = req.body || {};
        const updateData: Record<string, any> = {};
        for (const k of ["name", "description", "address", "state", "pincode", "amenities", "images"]) {
          if (body[k] !== undefined) updateData[k] = body[k];
        }
        if (body.city !== undefined) {
          const city = normalizeCity(body.city);
          if (!city) return res.status(400).json({ message: "City cannot be empty" });
          updateData.city = city;
        }
        const existingTypes = getRoomTypes(property);
        if (body.roomTypes !== undefined) {
          let merged: any[];
          if (existingTypes.length === 0) {
            // old property being converted: only possible while nobody holds a bed
            if ((await storage.countBedHolders(propertyId)) > 0) {
              return res.status(400).json({
                message: "Resolve current booking requests and tenants before adding room types to this property",
              });
            }
            const parsed = parseRoomTypes(body.roomTypes);
            if (parsed.error) return res.status(400).json({ message: parsed.error });
            merged = parsed.types!;
          } else {
            // existing types: only prices change; unknown sharings are added as new types
            const incoming = Array.isArray(body.roomTypes) ? body.roomTypes : [];
            merged = [...existingTypes];
            for (const t of incoming) {
              const sharing = toInt(t?.sharing);
              const i = merged.findIndex((m) => m.sharing === sharing);
              if (i >= 0) {
                const rent = toInt(t.rent ?? merged[i].rent);
                const dep = toInt(t.securityDeposit ?? merged[i].securityDeposit);
                if (!(rent > 0) || !(dep >= 0)) {
                  return res.status(400).json({ message: `${sharingLabel(sharing)}: enter a valid rent and deposit` });
                }
                merged[i] = { ...merged[i], rent, securityDeposit: dep };
              } else {
                const parsed = parseRoomTypes([t]);
                if (parsed.error) return res.status(400).json({ message: parsed.error });
                merged.push(parsed.types![0]);
              }
            }
            const check = parseRoomTypes(merged);
            if (check.error) return res.status(400).json({ message: check.error });
            merged = check.types!;
          }
          const agg = aggregateRoomTypes(merged);
          updateData.roomTypes = merged;
          Object.assign(updateData, agg);
        }
        if (body.rent !== undefined && existingTypes.length === 0 && body.roomTypes === undefined) {
          const rent = toInt(body.rent);
          if (!(rent > 0)) return res.status(400).json({ message: "Rent must be greater than 0" });
          updateData.rent = rent;
        }
        if (body.securityDeposit !== undefined && existingTypes.length === 0 && body.roomTypes === undefined) {
          const dep = toInt(body.securityDeposit);
          if (!(dep >= 0)) return res.status(400).json({ message: "Security deposit cannot be negative" });
          updateData.securityDeposit = dep;
        }
        if (body.totalRooms !== undefined && toInt(body.totalRooms) > 0) {
          updateData.totalRooms = toInt(body.totalRooms);
        }
        if (body.gender !== undefined) {
          updateData.gender = ["male", "female", "any"].includes(body.gender) ? body.gender : "any";
        }
        if (body.latitude !== undefined || body.longitude !== undefined) {
          if (!isValidCoord(body.latitude, body.longitude)) {
            return res.status(400).json({ message: "Latitude/longitude are not valid coordinates" });
          }
          updateData.latitude = String(body.latitude);
          updateData.longitude = String(body.longitude);
        }

        const updatedProperty = await storage.updateProperty(propertyId, updateData);
        if (!updatedProperty) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.json(updatedProperty);
      } catch (error) {
        console.error("Property update error:", error);
        res.status(400).json({ message: "Invalid input", error });
      }
    }
  );

  // Owner bed management (per room type): add a bed, remove an empty bed, or free a bed
  app.post(
    "/api/properties/:id/beds",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);
        if (!property) return res.status(404).json({ message: "Property not found" });
        if (property.ownerId !== req.user.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        const action = req.body?.action;
        const types = getRoomTypes(property);
        let sharing: number | undefined;
        let target: { totalBeds: number; availableBeds: number };

        if (types.length > 0) {
          sharing = toInt(req.body?.sharing);
          const t = types.find((x) => x.sharing === sharing);
          if (!t) return res.status(400).json({ message: "Choose which room type (sharing) to change" });
          target = { totalBeds: t.totalBeds, availableBeds: t.availableBeds };
        } else {
          target = { totalBeds: property.totalBeds, availableBeds: property.availableBeds };
        }

        const holders = await storage.countBedHolders(propertyId, sharing);
        let { totalBeds, availableBeds } = target;

        if (action === "add") {
          totalBeds += 1;
          availableBeds += 1;
        } else if (action === "free") {
          // Only possible when the counter is lower than the real vacancy
          if (availableBeds >= totalBeds - holders) {
            return res.status(400).json({
              message:
                holders > 0
                  ? "All empty beds are already counted as available. To free a bed that a tenant is using, remove that tenant first."
                  : "All beds are already available.",
            });
          }
          availableBeds += 1;
        } else if (action === "remove") {
          if (availableBeds <= 0 || totalBeds <= 1) {
            return res.status(400).json({
              message: "There is no empty bed to remove. Remove a tenant first.",
            });
          }
          totalBeds -= 1;
          availableBeds -= 1;
        } else {
          return res.status(400).json({ message: "Invalid action" });
        }

        let updates: any;
        if (types.length > 0) {
          const next = types.map((t) => (t.sharing === sharing ? { ...t, totalBeds, availableBeds } : t));
          const agg = aggregateRoomTypes(next);
          updates = { roomTypes: next, totalBeds: agg.totalBeds, availableBeds: agg.availableBeds };
        } else {
          updates = { totalBeds, availableBeds };
        }
        res.json(await storage.updateProperty(propertyId, updates));
      } catch (error) {
        console.error("Bed update error:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  // Delete property route
  app.delete(
    "/api/properties/:id",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }

        if (property.ownerId !== req.user.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        const bookings = await storage.getBookingsByProperty(propertyId);
        const activeBookings = bookings.filter((b) => holdsBed(b.status));

        if (activeBookings.length > 0) {
          return res.status(400).json({
            message:
              "Cannot delete property with active bookings. Please cancel all bookings first.",
          });
        }

        const success = await storage.deleteProperty(propertyId);
        if (!success) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.json({ message: "Property deleted successfully" });
      } catch (error) {
        console.error("Property deletion error:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  // Booking routes
  app.post("/api/bookings", authenticateToken, async (req: any, res: any) => {
    try {
      console.log("Booking creation attempt:", {
        user: req.user,
        body: req.body,
      });

      if (req.user.userType !== "user") {
        return res
          .status(403)
          .json({ message: "Only users can create bookings" });
      }

      const propertyId = toInt(req.body?.propertyId);
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      const types = getRoomTypes(property);
      let type: any = null;
      if (types.length > 0) {
        type = types.find((t) => t.sharing === toInt(req.body?.sharing));
        if (!type) {
          return res.status(400).json({ message: "Please choose a room type (sharing)" });
        }
        if (type.availableBeds <= 0) {
          return res.status(400).json({ message: `No beds available in ${sharingLabel(type.sharing)}` });
        }
      } else if (property.availableBeds <= 0) {
        return res.status(400).json({ message: "No beds available" });
      }

      const existing = await storage.getActiveBookingForUserAndProperty(
        req.user.id,
        property.id
      );
      if (existing) {
        return res.status(409).json({
          message: "You already have a booking request for this property",
        });
      }

      const moveIn = req.body?.moveInDate ? new Date(req.body.moveInDate) : new Date();
      const moveOut = req.body?.moveOutDate ? new Date(req.body.moveOutDate) : null;
      if (isNaN(moveIn.getTime()) || (moveOut && isNaN(moveOut.getTime()))) {
        return res.status(400).json({ message: "Invalid dates" });
      }
      if (moveOut && moveOut <= moveIn) {
        return res.status(400).json({ message: "Move-out date must be after move-in date" });
      }

      // Rent and deposit ALWAYS come from the property, never from the client
      const booking = await storage.createBooking({
        userId: req.user.id,
        propertyId: property.id,
        status: "pending",
        sharing: type ? type.sharing : null,
        rent: type ? type.rent : property.rent,
        securityDeposit: type ? type.securityDeposit : property.securityDeposit ?? 0,
        compatibilityScore: req.body?.compatibilityScore ?? null,
        requestedDate: new Date(),
        moveInDate: moveIn,
        moveOutDate: moveOut,
      } as any);

      // The bed is held from the moment the request is made
      await adjustBeds(property, type ? type.sharing : null, -1);

      res.status(201).json(booking);
    } catch (error) {
      console.error("Booking creation error:", error);
      res.status(400).json({ message: "Invalid input", error });
    }
  });

  app.get(
    "/api/bookings/user/:userId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const userId = parseInt(req.params.userId);
        console.log(
          "Getting bookings for user:",
          userId,
          "authenticated user:",
          req.user.id
        );

        if (req.user.id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }

        const bookings = await storage.getBookingsByUser(userId);
        console.log("Found bookings for user:", bookings);
        res.json(bookings);
      } catch (error) {
        console.error("Error getting user bookings:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  app.get(
    "/api/bookings/owner/:ownerId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const ownerId = parseInt(req.params.ownerId);
        console.log(
          "Getting bookings for owner:",
          ownerId,
          "authenticated user:",
          req.user.id
        );

        if (req.user.id !== ownerId) {
          return res.status(403).json({ message: "Access denied" });
        }

        const bookings = await storage.getBookingsByOwner(ownerId);
        console.log("Found bookings for owner:", bookings);
        res.json(bookings);
      } catch (error) {
        console.error("Error getting owner bookings:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  app.patch("/api/bookings/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const bookingId = parseInt(req.params.id);
      const booking = await storage.getBooking(bookingId);

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const property = await storage.getProperty(booking.propertyId);
      if (!property || property.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const next = req.body?.status;
      if (!["approved", "rejected", "removed"].includes(next)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      if (next === booking.status) return res.json(booking);

      const allowed: Record<string, string[]> = {
        pending: ["approved", "rejected"],
        approved: ["removed", "rejected"],
      };
      if (!(allowed[booking.status] || []).includes(next)) {
        return res.status(400).json({
          message: `A ${booking.status} booking cannot be changed to ${next}`,
        });
      }

      // Bed accounting: pending -> approved keeps the bed held (nothing changes);
      // leaving pending/approved (rejected / removed) gives the bed back.
      if (holdsBed(booking.status) && !holdsBed(next)) {
        await adjustBeds(property, booking.sharing, +1);
      }

      const updatedBooking = await storage.updateBooking(bookingId, {
        status: next,
        approvedDate: next === "approved" ? new Date() : booking.approvedDate,
        moveOutDate: next === "removed" ? new Date() : booking.moveOutDate,
      } as any);

      res.json(updatedBooking);
    } catch (error) {
      res.status(400).json({ message: "Invalid input", error });
    }
  });

  app.delete(
    "/api/bookings/:id",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const bookingId = parseInt(req.params.id);
        const booking = await storage.getBooking(bookingId);

        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }

        const property = await storage.getProperty(booking.propertyId);
        if (
          booking.userId !== req.user.id &&
          (!property || property.ownerId !== req.user.id)
        ) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Cancelling a booking that held a bed gives the bed back
        if (property && holdsBed(booking.status)) {
          await adjustBeds(property, booking.sharing, +1);
        }

        // Keep payment history consistent: remove payments tied to this booking
        try {
          const { pool } = await import("./db.js");
          await pool.query(`DELETE FROM rent_payments WHERE "bookingId" = $1`, [bookingId]);
        } catch {
          // ignore
        }

        const deleted = await storage.deleteBooking(bookingId);
        if (deleted) {
          res.json({ message: "Booking cancelled successfully" });
        } else {
          res.status(500).json({ message: "Failed to cancel booking" });
        }
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  // Rating routes
  app.post("/api/ratings", authenticateToken, async (req: any, res: any) => {
    try {
      if (req.user.userType !== "user") {
        return res
          .status(403)
          .json({ message: "Only users can rate properties" });
      }

      const { propertyId, rating } = req.body;

      if (!propertyId || !rating || rating < 1 || rating > 5) {
        return res
          .status(400)
          .json({ message: "Valid property ID and rating (1-5) required" });
      }

      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      const ratingData = {
        userId: req.user.id,
        propertyId: parseInt(propertyId),
        rating: parseInt(rating),
      };

      const createdRating = await storage.createReview(ratingData);

      const allRatings = await storage.getReviewsByProperty(propertyId);
      const avgRating =
        allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

      await storage.updateProperty(propertyId, {
        rating: (Math.round(avgRating * 10) / 10).toString(),
        reviewCount: allRatings.length,
      });

      res.json({
        rating: createdRating.rating,
        message: "Rating submitted successfully",
      });
    } catch (error) {
      console.error("Rating creation error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Favorites routes
  app.get(
    "/api/favorites/user/:userId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const userId = parseInt(req.params.userId);
        if (req.user.id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }

        const favorites = await storage.getFavoritesByUser(userId);
        res.json(favorites);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  app.post("/api/favorites", authenticateToken, async (req: any, res: any) => {
    try {
      const favoriteData = insertFavoriteSchema.parse({
        ...req.body,
        userId: req.user.id,
      });

      const favorite = await storage.createFavorite(favoriteData);
      res.status(201).json(favorite);
    } catch (error) {
      res.status(400).json({ message: "Invalid input", error });
    }
  });

  app.delete(
    "/api/favorites/:propertyId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const propertyId = parseInt(req.params.propertyId);
        const deleted = await storage.deleteFavorite(req.user.id, propertyId);

        if (deleted) {
          res.json({ message: "Favorite removed" });
        } else {
          res.status(404).json({ message: "Favorite not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  // Reviews routes
  app.get("/api/reviews/property/:propertyId", async (req, res) => {
    try {
      const propertyId = parseInt(req.params.propertyId);
      const reviews = await storage.getReviewsByProperty(propertyId);
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/reviews", authenticateToken, async (req: any, res: any) => {
    try {
      const reviewData = insertReviewSchema.parse({
        ...req.body,
        userId: req.user.id,
      });

      const review = await storage.createReview(reviewData);
      res.status(201).json(review);
    } catch (error) {
      res.status(400).json({ message: "Invalid input", error });
    }
  });

  // User profile update route
  app.put("/api/users/:id", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = parseInt(req.params.id);

      if (req.user.id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Only profile fields may be changed here. Never userType, isVerified, id,
      // email or password.
      const allowed = [
        "firstName",
        "lastName",
        "name",
        "phone",
        "age",
        "gender",
        "occupation",
        "profession",
        "company",
        "bio",
        "profilePhoto",
        "preferences",
      ];
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (req.body && req.body[key] !== undefined) updates[key] = req.body[key];
      }

      if (Object.keys(updates).length === 0) {
        const existing = await storage.getUser(userId);
        if (!existing) return res.status(404).json({ message: "User not found" });
        return res.json({ ...existing, password: undefined });
      }

      const updatedUser = await storage.updateUser(userId, updates as any);

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ ...updatedUser, password: undefined });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  });

  // Favorites routes
  app.get(
    "/api/favorites/:userId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const userId = parseInt(req.params.userId);

        if (req.user.id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }

        const favorites = await storage.getFavoritesByUser(userId);
        res.json(favorites);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  app.delete(
    "/api/favorites/:userId/:propertyId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const userId = parseInt(req.params.userId);
        const propertyId = parseInt(req.params.propertyId);

        if (req.user.id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }

        const deleted = await storage.deleteFavorite(userId, propertyId);
        if (deleted) {
          res.json({ message: "Favorite removed successfully" });
        } else {
          res.status(404).json({ message: "Favorite not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  // ---- Rent payments --------------------------------------------------------
  // Flow: tenant marks a month as paid (cash / online) -> status "submitted"
  //       owner approves -> "paid"   (or rejects -> "rejected", tenant may resubmit)
  app.get(
    "/api/rent-payments/user/:userId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const userId = parseInt(req.params.userId);
        if (req.user.id !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
        res.json(await storage.getRentPaymentsByUser(userId));
      } catch (error) {
        console.error("rent-payments user error:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  app.get(
    "/api/rent-payments/owner/:ownerId",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const ownerId = parseInt(req.params.ownerId);
        if (req.user.id !== ownerId) {
          return res.status(403).json({ message: "Access denied" });
        }
        res.json(await storage.getRentPaymentsByOwner(ownerId));
      } catch (error) {
        console.error("rent-payments owner error:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  app.post(
    "/api/rent-payments",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const bookingId = toInt(req.body?.bookingId);
        const paymentMonth = String(req.body?.paymentMonth || "");
        const paymentMethod = req.body?.paymentMethod;

        if (!["cash", "online"].includes(paymentMethod)) {
          return res.status(400).json({ message: "Payment method must be cash or online" });
        }
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(paymentMonth)) {
          return res.status(400).json({ message: "Invalid month" });
        }

        const booking = await storage.getBooking(bookingId);
        if (!booking || booking.userId !== req.user.id) {
          return res.status(404).json({ message: "Booking not found" });
        }
        if (booking.status !== "approved") {
          return res.status(400).json({ message: "Rent can only be paid for an approved booking" });
        }

        // Month must be between move-in month and next month
        const start = new Date(booking.moveInDate || booking.approvedDate || booking.createdAt);
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const lastAllowed = monthKey(start) > monthKey(nextMonth) ? monthKey(start) : monthKey(nextMonth);
        if (paymentMonth < monthKey(start) || paymentMonth > lastAllowed) {
          return res.status(400).json({ message: "That month is outside your stay" });
        }

        const existing = (await storage.getRentPaymentsByBooking(bookingId)).find(
          (p: any) => p.paymentMonth === paymentMonth
        );
        const fields = {
          amount: booking.rent, // always the booked rent
          paymentDate: new Date(),
          paymentMethod,
          notes: req.body?.notes ? String(req.body.notes).slice(0, 300) : null,
          status: "submitted",
        };

        if (existing) {
          if (existing.status !== "rejected") {
            return res.status(409).json({
              message:
                existing.status === "paid"
                  ? "This month is already paid"
                  : "This month is already waiting for the owner's approval",
            });
          }
          return res.json(await storage.updateRentPayment(existing.id, fields as any));
        }

        const payment = await storage.createRentPayment({
          userId: booking.userId,
          propertyId: booking.propertyId,
          bookingId,
          paymentMonth,
          ...fields,
        } as any);
        res.status(201).json(payment);
      } catch (error) {
        console.error("rent-payment create error:", error);
        res.status(400).json({ message: "Invalid input" });
      }
    }
  );

  app.patch(
    "/api/rent-payments/:id/status",
    authenticateToken,
    async (req: any, res: any) => {
      try {
        const paymentId = parseInt(req.params.id);
        const { status } = req.body || {};
        if (!["paid", "rejected"].includes(status)) {
          return res.status(400).json({ message: "Status must be paid or rejected" });
        }

        const payment = await storage.getRentPayment(paymentId);
        if (!payment) return res.status(404).json({ message: "Payment not found" });

        const property = await storage.getProperty(payment.propertyId);
        if (!property || property.ownerId !== req.user.id) {
          return res.status(403).json({ message: "Only the property owner can approve payments" });
        }
        if (payment.status !== "submitted") {
          return res.status(400).json({ message: "Only submitted payments can be reviewed" });
        }

        res.json(await storage.updateRentPaymentStatus(paymentId, status));
      } catch (error) {
        console.error("rent-payment status error:", error);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}