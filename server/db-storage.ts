// @ts-nocheck
import { db } from "./db";
import { users, properties, bookings, reviews, favorites, verificationDocuments, rentPayments } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { IStorage } from "./storage";
import type { User, InsertUser, Property, InsertProperty, Booking, InsertBooking, Review, InsertReview, Favorite, InsertFavorite, VerificationDocument, InsertVerificationDocument, RentPayment, InsertRentPayment } from "@shared/schema";

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      ...insertUser,
      password: insertUser.password,  // <-- Plain text storage
      preferences: insertUser.preferences || null,
    })
    .returning();
  return user;
}

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Property methods
  async getProperty(id: number): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property;
  }

  async getPropertiesByOwner(ownerId: number): Promise<Property[]> {
    return await db.select().from(properties).where(eq(properties.ownerId, ownerId));
  }

  async getPropertiesByCity(city: string): Promise<Property[]> {
    return await db.select().from(properties).where(eq(properties.city, city));
  }

  async getAllProperties(): Promise<Property[]> {
    return await db.select().from(properties);
  }

  async searchProperties(filters: { city?: string; minRent?: number; maxRent?: number; gender?: string }): Promise<Property[]> {
    const results = await db.select().from(properties);
    
    // Apply filters in memory for now
    return results.filter(property => {
      if (filters.city && property.city !== filters.city) return false;
      if (filters.minRent && property.rent < filters.minRent) return false;
      if (filters.maxRent && property.rent > filters.maxRent) return false;
      if (filters.gender && property.gender !== filters.gender && property.gender !== 'any') return false;
      return true;
    });
  }

  async createProperty(insertProperty: InsertProperty): Promise<Property> {
    const [property] = await db
      .insert(properties)
      .values(insertProperty)
      .returning();
    return property;
  }

  async updateProperty(id: number, updates: Partial<Property>): Promise<Property | undefined> {
    const [property] = await db
      .update(properties)
      .set(updates)
      .where(eq(properties.id, id))
      .returning();
    return property;
  }

  async deleteProperty(id: number): Promise<boolean> {
    const result = await db
      .delete(properties)
      .where(eq(properties.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Booking methods
  async getBooking(id: number): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking;
  }

  async getBookingsByUser(userId: number): Promise<any[]> {
    // Join with properties to get complete booking information
    return await db
      .select({
        id: bookings.id,
        userId: bookings.userId,
        propertyId: bookings.propertyId,
        status: bookings.status,
        rent: bookings.rent,
        securityDeposit: bookings.securityDeposit,
        sharing: bookings.sharing,
        compatibilityScore: bookings.compatibilityScore,
        requestedDate: bookings.requestedDate,
        approvedDate: bookings.approvedDate,
        moveInDate: bookings.moveInDate,
        moveOutDate: bookings.moveOutDate,
        createdAt: bookings.createdAt,
        // Property details
        propertyName: properties.name,
        propertyAddress: properties.address,
        propertyCity: properties.city,
        propertyRent: properties.rent,
      })
      .from(bookings)
      .innerJoin(properties, eq(bookings.propertyId, properties.id))
      .where(eq(bookings.userId, userId));
  }

  async getBookingsByProperty(propertyId: number): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.propertyId, propertyId));
  }

  async getBookingsByOwner(ownerId: number): Promise<any[]> {
    // Join with properties and users to get complete booking information
    return await db
      .select({
        id: bookings.id,
        userId: bookings.userId,
        propertyId: bookings.propertyId,
        status: bookings.status,
        rent: bookings.rent,
        securityDeposit: bookings.securityDeposit,
        sharing: bookings.sharing,
        compatibilityScore: bookings.compatibilityScore,
        requestedDate: bookings.requestedDate,
        approvedDate: bookings.approvedDate,
        moveInDate: bookings.moveInDate,
        moveOutDate: bookings.moveOutDate,
        createdAt: bookings.createdAt,
        // Tenant details (so the owner can decide who to approve)
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userName: users.name,
        userEmail: users.email,
        userPhone: users.phone,
        userAge: users.age,
        userGender: users.gender,
        userOccupation: users.occupation,
        userProfession: users.profession,
        userCompany: users.company,
        userPreferences: users.preferences,
        // Property details
        propertyName: properties.name,
        propertyCity: properties.city,
        propertyAddress: properties.address,
      })
      .from(bookings)
      .innerJoin(properties, eq(bookings.propertyId, properties.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(eq(properties.ownerId, ownerId));
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const [booking] = await db
      .insert(bookings)
      .values(insertBooking)
      .returning();
    return booking;
  }

  async updateBooking(id: number, updates: Partial<Booking>): Promise<Booking | undefined> {
    const [booking] = await db
      .update(bookings)
      .set(updates)
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async deleteBooking(id: number): Promise<boolean> {
    const result = await db
      .delete(bookings)
      .where(eq(bookings.id, id));
    return result.rowCount > 0;
  }

  // Review methods
  async getReviewsByProperty(propertyId: number): Promise<Review[]> {
    return await db.select().from(reviews).where(eq(reviews.propertyId, propertyId));
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const [review] = await db
      .insert(reviews)
      .values(insertReview)
      .returning();
    return review;
  }

  // Favorite methods
  async getFavoritesByUser(userId: number): Promise<Favorite[]> {
    return await db.select().from(favorites).where(eq(favorites.userId, userId));
  }

  async createFavorite(insertFavorite: InsertFavorite): Promise<Favorite> {
    const [favorite] = await db
      .insert(favorites)
      .values(insertFavorite)
      .returning();
    return favorite;
  }

  async deleteFavorite(userId: number, propertyId: number): Promise<boolean> {
    const result = await db
      .delete(favorites)
      .where(eq(favorites.userId, userId));
    return (result.rowCount || 0) > 0;
  }

  // Verification methods
  async getVerificationDocumentsByUser(userId: number): Promise<VerificationDocument[]> {
    return await db.select().from(verificationDocuments).where(eq(verificationDocuments.userId, userId));
  }

  async createVerificationDocument(insertDoc: InsertVerificationDocument): Promise<VerificationDocument> {
    const [doc] = await db
      .insert(verificationDocuments)
      .values(insertDoc)
      .returning();
    return doc;
  }

  // Rent payment methods
  async getRentPaymentsByBooking(bookingId: number): Promise<RentPayment[]> {
    return await db.select().from(rentPayments).where(eq(rentPayments.bookingId, bookingId));
  }

  async getRentPayment(id: number): Promise<RentPayment | undefined> {
    const [payment] = await db.select().from(rentPayments).where(eq(rentPayments.id, id));
    return payment;
  }

  async getRentPaymentsByUser(userId: number): Promise<RentPayment[]> {
    return await db.select().from(rentPayments).where(eq(rentPayments.userId, userId));
  }

  // rent_payments has no ownerId column: go through the property's owner.
  async getRentPaymentsByOwner(ownerId: number): Promise<any[]> {
    return await db
      .select({
        id: rentPayments.id,
        bookingId: rentPayments.bookingId,
        userId: rentPayments.userId,
        propertyId: rentPayments.propertyId,
        amount: rentPayments.amount,
        paymentMonth: rentPayments.paymentMonth,
        paymentDate: rentPayments.paymentDate,
        status: rentPayments.status,
        paymentMethod: rentPayments.paymentMethod,
        notes: rentPayments.notes,
        propertyName: properties.name,
        tenantName: users.name,
        tenantFirstName: users.firstName,
        tenantLastName: users.lastName,
        tenantPhone: users.phone,
      })
      .from(rentPayments)
      .innerJoin(properties, eq(rentPayments.propertyId, properties.id))
      .innerJoin(users, eq(rentPayments.userId, users.id))
      .where(eq(properties.ownerId, ownerId));
  }

  async createRentPayment(insertPayment: InsertRentPayment): Promise<RentPayment> {
    const [payment] = await db
      .insert(rentPayments)
      .values(insertPayment)
      .returning();
    return payment;
  }

  async updateRentPayment(id: number, updates: Partial<RentPayment>): Promise<RentPayment | undefined> {
    const [payment] = await db
      .update(rentPayments)
      .set(updates)
      .where(eq(rentPayments.id, id))
      .returning();
    return payment;
  }

  async updateRentPaymentStatus(id: number, status: string): Promise<RentPayment | undefined> {
    return this.updateRentPayment(id, { status });
  }

  // How many beds are currently spoken for on a property
  async countBedHolders(propertyId: number, sharing?: number): Promise<number> {
    const rows = await db
      .select({ id: bookings.id, sharing: bookings.sharing })
      .from(bookings)
      .where(and(eq(bookings.propertyId, propertyId), inArray(bookings.status, ["pending", "approved"])));
    return sharing == null ? rows.length : rows.filter((r) => r.sharing === sharing).length;
  }

  async getActiveBookingForUserAndProperty(userId: number, propertyId: number): Promise<Booking | undefined> {
    const [b] = await db
      .select()
      .from(bookings)
      .where(and(
        eq(bookings.userId, userId),
        eq(bookings.propertyId, propertyId),
        inArray(bookings.status, ["pending", "approved"]),
      ));
    return b;
  }
}
