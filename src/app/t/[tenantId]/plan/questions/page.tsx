"use client";

// Plan → Questions (PHASE2 Step 4, FEATURES.md §3.1).
//
// THE DEFAULT VIEW GROUPS BY `askWho`, and that grouping is the feature. "Here
// are the 6 things to raise with the caterer on Thursday" is useful in a way a
// flat list of questions is not — you read this screen standing in a venue
// lobby, not at a desk.
//
// SECURITY: member-read and member-write. Anyone who thinks of a question
// should be able to write it down before they forget it.
//
// READ COST: one bounded page of 100, newest first, with a "Load more" cursor.
// Status / category / event filters run over the LOADED page client-side rather
// than as Firestore queries — that keeps the grouping honest (a group must show
// ALL of its questions, not just those on the current page) and needs no
// composite index. If this wedding ever passes a few hundred questions, the
// filters would need to move server-side and gain an index; at 5-15 people
// planning one wedding, it will not.

import { useCallback, useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { contactsCol, questionDoc, questionsCol } from "@/lib/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import {
  ChipRow,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import {
  QUESTION_STATUSES,
  QUESTION_STATUS_LABELS,
  type QuestionStatus,
  type QuestionWithId,
} from "@/types";

const PAGE_SIZE = 100;
/** Contacts are loaded only to offer them as `askWho` suggestions and to link a
 *  question to one. Bounded like every other read. */
const MAX_CONTACT_SUGGESTIONS = 50;

/** Questions with no `askWho` still need a home, and "Unassigned" is more
 *  honest than silently filing them under someone. */
const UNASSIGNED = "Not sure who yet";

export default function QuestionsPage() {
  const { tenantId } = useTenant();
  const { categoryById, eventById } = useConfig();

  const [statusFilter, setStatusFilter] = useState<QuestionStatus | null>("open");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<QuestionWithId | null>(null);

  const [extraPages, setExtraPages] = useState<QuestionWithId[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [moreAvailable, setMoreAvailable] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    const [qSnap, cSnap] = await Promise.all([
      getDocs(query(questionsCol(tenantId), orderBy("createdAt", "desc"), limit(PAGE_SIZE))),
      getDocs(query(contactsCol(tenantId), orderBy("name"), limit(MAX_CONTACT_SUGGESTIONS))),
    ]);
    setExtraPages([]);
    setCursor(qSnap.docs.at(-1) ?? null);
    setMoreAvailable(qSnap.docs.length === PAGE_SIZE);
    return {
      questions: qSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as QuestionWithId),
      contacts: cSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) ?? "",
        organisation: (d.data().organisation as string) ?? "",
      })),
    };
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load questions.");

  const questions = useMemo(() => [...(data?.questions ?? []), ...extraPages], [data, extraPages]);
  const contacts = data?.contacts ?? [];

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          questionsCol(tenantId),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(PAGE_SIZE),
        ),
      );
      setExtraPages((prev) => [
        ...prev,
        ...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QuestionWithId),
      ]);
      setCursor(snap.docs.at(-1) ?? null);
      setMoreAvailable(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("[questions] load more failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }

  const visible = useMemo(
    () =>
      questions.filter((q) => {
        if (statusFilter && q.status !== statusFilter) return false;
        if (categoryFilter && q.categoryId !== categoryFilter) return false;
        if (eventFilter && q.eventId !== eventFilter) return false;
        return true;
      }),
    [questions, statusFilter, categoryFilter, eventFilter],
  );

  /** The grouping this screen exists for: one heading per person to ask, with
   *  their questions under it. Groups are ordered by how many open questions
   *  they hold — the person you most need to catch comes first. */
  const groups = useMemo(() => {
    const byWho = new Map<string, QuestionWithId[]>();
    for (const q of visible) {
      const who = q.askWho?.trim() || UNASSIGNED;
      const list = byWho.get(who);
      if (list) list.push(q);
      else byWho.set(who, [q]);
    }
    return [...byWho.entries()]
      .map(([who, items]) => ({
        who,
        items,
        openCount: items.filter((q) => q.status === "open").length,
      }))
      .sort(
        (x, y) =>
          y.openCount - x.openCount ||
          y.items.length - x.items.length ||
          x.who.localeCompare(y.who),
      );
  }, [visible]);

  if (editing || adding) {
    return (
      <div className="flex flex-1 flex-col px-5 py-6">
        <QuestionForm
          existing={editing ?? undefined}
          contacts={contacts}
          knownAskWho={
            [...new Set(questions.map((q) => q.askWho?.trim()).filter(Boolean))] as string[]
          }
          onDone={() => {
            setEditing(null);
            setAdding(false);
            reload();
          }}
          onCancel={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Questions</h1>
          <p className="mt-1 text-sm text-stone-500">Grouped by who to ask.</p>
        </div>
        <SecondaryButton onClick={() => setAdding(true)}>+ Add</SecondaryButton>
      </div>

      <FormMessage error={error} />

      {questions.length > 0 ? (
        <div className="flex flex-col gap-3">
          <ChipRow<QuestionStatus>
            options={QUESTION_STATUSES.map((s) => ({ value: s, label: QUESTION_STATUS_LABELS[s] }))}
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
          />
          <FilterRows
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-stone-300 px-4 py-6">
          <p className="text-sm text-stone-500">
            Nothing to ask yet. Jot down anything you want to raise with a venue, caterer or
            relative — you&rsquo;ll have the list ready when you next speak to them.
          </p>
          <PrimaryButton onClick={() => setAdding(true)}>Add the first question</PrimaryButton>
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.who} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-stone-800">{group.who}</h2>
                <span className="text-xs text-stone-400">
                  {group.openCount > 0
                    ? `${group.openCount} to ask`
                    : `${group.items.length} question${group.items.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {group.items.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    categoryName={categoryById(q.categoryId)?.name ?? null}
                    categoryColour={categoryById(q.categoryId)?.colour ?? null}
                    eventName={eventById(q.eventId)?.name ?? null}
                    onEdit={() => setEditing(q)}
                    onChanged={reload}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {moreAvailable ? (
        <SecondaryButton onClick={loadMore} disabled={loadingMore} className="self-center">
          {loadingMore ? "Loading…" : "Load more"}
        </SecondaryButton>
      ) : null}
    </div>
  );
}

function FilterRows({
  categoryFilter,
  setCategoryFilter,
  eventFilter,
  setEventFilter,
}: {
  categoryFilter: string | null;
  setCategoryFilter: (v: string | null) => void;
  eventFilter: string | null;
  setEventFilter: (v: string | null) => void;
}) {
  const { categories, events } = useConfig();
  return (
    <>
      {categories.length > 0 ? (
        <ChipRow
          options={categories.map((c) => ({ value: c.id, label: c.name, colour: c.colour }))}
          value={categoryFilter}
          onChange={setCategoryFilter}
          allowClear
        />
      ) : null}
      {events.length > 0 ? (
        <ChipRow
          options={events.map((e) => ({ value: e.id, label: e.name, colour: e.colour }))}
          value={eventFilter}
          onChange={setEventFilter}
          allowClear
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<QuestionStatus, string> = {
  open: "bg-rose-100 text-rose-700",
  asked: "bg-amber-100 text-amber-800",
  answered: "bg-emerald-100 text-emerald-700",
  moot: "bg-stone-100 text-stone-500",
};

function QuestionCard({
  question,
  categoryName,
  categoryColour,
  eventName,
  onEdit,
  onChanged,
}: {
  question: QuestionWithId;
  categoryName: string | null;
  categoryColour: string | null;
  eventName: string | null;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const [busy, setBusy] = useState(false);

  // One tap from "open" to "asked" is the action people take standing in front
  // of the vendor; anything more involved gets skipped and the list goes stale.
  async function markAsked() {
    if (busy || !user) return;
    setBusy(true);
    try {
      await updateDoc(questionDoc(tenantId, question.id), {
        status: "asked",
        askedBy: user.uid,
        askedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onChanged();
    } catch (err) {
      console.error("[questions] mark asked failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-base text-stone-800">{question.text}</p>
        <button
          onClick={onEdit}
          className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-400 hover:text-stone-800"
        >
          Edit
        </button>
      </div>

      {question.answer ? (
        <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm whitespace-pre-wrap text-stone-600">
          {question.answer}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLES[question.status] ?? STATUS_STYLES.moot}`}
        >
          {QUESTION_STATUS_LABELS[question.status] ?? question.status}
        </span>
        {categoryName ? (
          <span className="flex items-center gap-1 text-stone-400">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: categoryColour ?? undefined }}
              aria-hidden
            />
            {categoryName}
          </span>
        ) : null}
        {eventName ? <span className="text-stone-400">{eventName}</span> : null}
        {question.status === "open" ? (
          <button
            onClick={markAsked}
            disabled={busy}
            className="ml-auto min-h-[36px] rounded-full border border-stone-300 px-3 text-xs font-medium text-stone-600 disabled:opacity-40"
          >
            Mark asked
          </button>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function QuestionForm({
  existing,
  contacts,
  knownAskWho,
  onDone,
  onCancel,
}: {
  existing?: QuestionWithId;
  contacts: { id: string; name: string; organisation: string }[];
  knownAskWho: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { categories, events } = useConfig();

  const [text, setText] = useState(existing?.text ?? "");
  const [askWho, setAskWho] = useState(existing?.askWho ?? "");
  const [contactId, setContactId] = useState<string | null>(existing?.contactId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [eventId, setEventId] = useState<string | null>(existing?.eventId ?? null);
  const [status, setStatus] = useState<QuestionStatus>(existing?.status ?? "open");
  const [answer, setAnswer] = useState(existing?.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = text.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean || busy || !user) return;
    setBusy(true);
    setError(null);

    const answered = status === "asked" || status === "answered";
    const fields = {
      text: clean,
      askWho: askWho.trim(),
      contactId,
      categoryId,
      eventId,
      status,
      answer: answer.trim(),
      // Stamp who asked the moment it leaves "open", and keep the original
      // stamp on later edits rather than rewriting history.
      askedBy: existing?.askedBy ?? (answered ? user.uid : null),
      askedAt: existing?.askedAt ?? (answered ? serverTimestamp() : null),
      updatedAt: serverTimestamp(),
    };

    try {
      if (existing) {
        await updateDoc(questionDoc(tenantId, existing.id), fields);
      } else {
        await addDoc(questionsCol(tenantId), {
          ...fields,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      onDone();
    } catch (err) {
      console.error("[questions] save failed:", err);
      setError("Could not save that question.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm("Delete this question?")) return;
    setBusy(true);
    try {
      await deleteDoc(questionDoc(tenantId, existing.id));
      onDone();
    } catch (err) {
      console.error("[questions] delete failed:", err);
      setError("Could not delete that question.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-stone-800">
        {existing ? "Edit question" : "New question"}
      </h1>

      <Field label="Question">
        <TextArea
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="Is there a DJ curfew?"
        />
      </Field>

      <Field label="Who to ask" hint="Free text — it doesn't have to be someone in Contacts yet.">
        <TextInput
          value={askWho}
          onChange={(e) => setAskWho(e.target.value)}
          placeholder="Venue manager at Taj"
          list="ask-who-suggestions"
        />
      </Field>
      {/* Existing names offered as suggestions so the grouping doesn't fracture
          into "Caterer", "caterer" and "The caterer". */}
      <datalist id="ask-who-suggestions">
        {[...new Set([...knownAskWho, ...contacts.map((c) => c.name)])].map((who) => (
          <option key={who} value={who} />
        ))}
      </datalist>

      {contacts.length > 0 ? (
        <ChipRow
          label="Linked contact (optional)"
          options={contacts.map((c) => ({
            value: c.id,
            label: c.organisation ? `${c.name} · ${c.organisation}` : c.name,
          }))}
          value={contactId}
          onChange={setContactId}
          allowClear
        />
      ) : null}

      <ChipRow
        label="Category"
        options={categories.map((c) => ({ value: c.id, label: c.name, colour: c.colour }))}
        value={categoryId}
        onChange={setCategoryId}
        allowClear
        emptyLabel="No categories yet — add them in More → Setup."
      />
      <ChipRow
        label="Event"
        options={events.map((e) => ({ value: e.id, label: e.name, colour: e.colour }))}
        value={eventId}
        onChange={setEventId}
        allowClear
        emptyLabel="No events yet — add them in More → Setup."
      />

      <ChipRow<QuestionStatus>
        label="Status"
        options={QUESTION_STATUSES.map((s) => ({ value: s, label: QUESTION_STATUS_LABELS[s] }))}
        value={status}
        onChange={(v) => v && setStatus(v)}
      />

      <Field label="Answer (once you have one)">
        <TextArea value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </Field>

      <FormMessage error={error} />

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <PrimaryButton type="submit" disabled={!clean || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        {existing ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="ml-auto min-h-[44px] px-2 text-sm font-medium text-stone-400 hover:text-rose-600"
          >
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
