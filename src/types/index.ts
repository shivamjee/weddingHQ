// Barrel export for the foundation collection types (FEATURES.md §1).
// Later phases add their own (budgets, contacts, expenses, households, …).
export type { Side, Role } from "./common";
export { SIDES } from "./common";
export type { User } from "./user";
export type { Tenant, TenantWithId, SideInfo } from "./tenant";
export type { Membership, MembershipWithId } from "./membership";
export type { Event, EventWithId } from "./event";
export type { Category, CategoryWithId } from "./category";
export type { CurrencySettings } from "./settings";
export type { BudgetAllocation, BudgetAllocationWithId, BudgetTotals } from "./budget";
