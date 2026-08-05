// Barrel export for the foundation collection types (FEATURES.md §1).
// Later phases add their own (budgets, contacts, expenses, households, …).
export type { Side, Role } from "./common";
export { SIDES } from "./common";
export type { User } from "./user";
export type { Tenant, TenantWithId, SideInfo } from "./tenant";
export type { Membership, MembershipWithId } from "./membership";
export type { Event, EventWithId } from "./event";
export type { Category, CategoryWithId } from "./category";
export type { CurrencySettings, GuestTargetSettings } from "./settings";
export type { BudgetAllocation, BudgetAllocationWithId, BudgetTotals } from "./budget";
export type { Contact, ContactWithId, ContactType } from "./contact";
export { CONTACT_TYPES, CONTACT_TYPE_LABELS } from "./contact";
export type { Question, QuestionWithId, QuestionStatus } from "./question";
export { QUESTION_STATUSES, QUESTION_STATUS_LABELS } from "./question";
export type {
  Comparison,
  ComparisonWithId,
  ComparisonOption,
  ComparisonOptionWithId,
  Criterion,
  CriterionType,
  OptionStatus,
  ValueMeta,
  ValueSource,
} from "./comparison";
export {
  CRITERION_TYPES,
  CRITERION_TYPE_LABELS,
  OPTION_STATUSES,
  OPTION_STATUS_LABELS,
} from "./comparison";
export type { Household, HouseholdWithId, Tier, HouseholdStatus } from "./household";
export {
  TIERS,
  TIER_LABELS,
  HOUSEHOLD_STATUSES,
  HOUSEHOLD_STATUS_LABELS,
} from "./household";
export type { Guest, GuestWithId, AgeGroup } from "./guest";
export { AGE_GROUPS, AGE_GROUP_LABELS } from "./guest";
export type {
  GuestTotals,
  GuestTotalsSlice,
  GuestLogAction,
  GuestLogEntry,
  GuestLogEntryWithId,
} from "./guestTotals";
export type { Expense, ExpenseWithId, ExpenseStatus, SplitMode, Share } from "./expense";
export { EXPENSE_STATUSES, EXPENSE_STATUS_LABELS, SPLIT_MODES, SPLIT_MODE_LABELS } from "./expense";
export type { Settlement, SettlementWithId } from "./settlement";
export type { ExpenseTotals, ExpenseTotalsSlice, Balances } from "./expenseTotals";
