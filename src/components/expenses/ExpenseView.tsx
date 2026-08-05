"use client";

// An expense's profile — read-only, reached by tapping its row on the list.
// Same shape as HouseholdView: view is the default tap, Edit is explicit.

import type { ReactNode } from "react";
import { OptionMark, PrimaryButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import {
  EXPENSE_STATUS_LABELS,
  SPLIT_MODE_LABELS,
  type CategoryWithId,
  type EventWithId,
  type ExpenseWithId,
} from "@/types";

export function ExpenseView({
  expense,
  category,
  event,
  members,
  onEdit,
  onBack,
}: {
  expense: ExpenseWithId;
  category: CategoryWithId | undefined;
  event: EventWithId | undefined;
  members: readonly { uid: string; label: string }[];
  onEdit: () => void;
  onBack: () => void;
}) {
  const nameFor = (uid: string) => members.find((m) => m.uid === uid)?.label ?? uid;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <PageHeader
        onBack={onBack}
        title={expense.description}
        subtitle={
          <>
            {EXPENSE_STATUS_LABELS[expense.status]} · {category?.name ?? "Uncategorised"}
            {event ? ` · ${event.name}` : ""}
          </>
        }
      />

      <div className="flex gap-3">
        <PrimaryButton onClick={onEdit}>Edit</PrimaryButton>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-medium text-stone-500">Amount</p>
        <p className="text-2xl font-semibold text-stone-800">
          {formatINR(toPaise(expense.amountPaise))}
        </p>
      </div>

      <dl className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <Row label="Category">
          <span className="flex items-center gap-2">
            <OptionMark colour={category?.colour} icon={category?.icon} />
            {category?.name ?? "Uncategorised"}
          </span>
        </Row>

        {event ? (
          <Row label="Event">
            <span className="flex items-center gap-2">
              <OptionMark colour={event.colour} icon={event.icon} />
              {event.name}
            </span>
          </Row>
        ) : null}

        <Row label="Date">{formatDate(expense.date)}</Row>

        <Row label="Paid by">{expense.paidBy ? nameFor(expense.paidBy) : "Not yet"}</Row>

        <Row label={`Split — ${SPLIT_MODE_LABELS[expense.splitMode]}`}>
          <ul className="flex flex-col gap-1">
            {expense.shares.map((s) => (
              <li key={s.uid} className="flex items-center justify-between gap-2">
                <span>{nameFor(s.uid)}</span>
                <span className="font-medium text-stone-700">
                  {formatINR(toPaise(s.amountPaise))}
                </span>
              </li>
            ))}
          </ul>
        </Row>

        {expense.notes ? <Row label="Notes">{expense.notes}</Row> : null}
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-stone-500">{label}</dt>
      <dd className="text-sm text-stone-700">{children}</dd>
    </div>
  );
}
