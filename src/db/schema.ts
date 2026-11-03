import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase UID or email-auth UID
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash'), // Salted scrypt hash (scrypt$salt$hash)
  authProvider: text('auth_provider').default('email').notNull(), // 'email' | 'google'
  preferredSeat: text('preferred_seat').default('D').notNull(),
  coins: integer('coins').default(1000).notNull(),
  highestBalance: integer('highest_balance').default(1000).notNull(),
  totalWins: integer('total_wins').default(0).notNull(),
  totalRounds: integer('total_rounds').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(), // HMAC-SHA256 hash of 6-digit reset code
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const multiplayerRooms = pgTable('multiplayer_rooms', {
  id: serial('id').primaryKey(),
  roomCode: text('room_code').notNull().unique(),
  roomName: text('room_name').notNull(),
  hostUid: text('host_uid').notNull(),
  hostName: text('host_name').notNull(),
  isPublic: boolean('is_public').default(true).notNull(),
  maxPlayers: integer('max_players').default(6).notNull(),
  playerCount: integer('player_count').default(1).notNull(),
  status: text('status').default('waiting').notNull(), // 'waiting' | 'playing'
  dealerSeat: text('dealer_seat').default('A').notNull(),
  cutterSeat: text('cutter_seat').default('B').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const gameSessions = pgTable('game_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  roomCode: text('room_code'),
  dealerSeat: text('dealer_seat').notNull(),
  cutterSeat: text('cutter_seat').notNull(),
  winningSide: text('winning_side').notNull(),
  pointCard: text('point_card').notNull(),
  wager: integer('wager').notNull(),
  coinDelta: integer('coin_delta').notNull(),
  finalBalance: integer('final_balance').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(gameSessions),
  resetTokens: many(passwordResetTokens),
}));

export const gameSessionsRelations = relations(gameSessions, ({ one }) => ({
  user: one(users, {
    fields: [gameSessions.userId],
    references: [users.id],
  }),
}));
