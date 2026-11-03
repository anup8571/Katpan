import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  coins: integer('coins').default(1000).notNull(),
  highestBalance: integer('highest_balance').default(1000).notNull(),
  totalWins: integer('total_wins').default(0).notNull(),
  totalRounds: integer('total_rounds').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const gameSessions = pgTable('game_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
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
}));

export const gameSessionsRelations = relations(gameSessions, ({ one }) => ({
  user: one(users, {
    fields: [gameSessions.userId],
    references: [users.id],
  }),
}));
