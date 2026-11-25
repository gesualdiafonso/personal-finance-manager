"use client";

import { useRef, useState } from "react";
import { addMoney, money, subtractMoney } from "@/domain/money";
import { Money } from "@/components/shared/money";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { Field, MoneyInput } from "@/components/ui/field";
import { mutate } from "@/hooks/use-local-data";
import { es } from "@/lib/i18n/es";
import { parseMoneyInput } from "@/lib/formatting/money";
import { MONEY_ERRORS, saveErrorMessage } from "./account-form";
import type { AccountRow } from "./data";

const t = es.accounts.correction;

/**
 * Explicit, audited initial-balance correction (D3-04). Shows the current value, the new one
 * and the effect on the current balance before anything is written. The write is a normal
 * repository update: it lands in the outbox with the previous revision (baseRev) and the full
 * record, and travels in the next changeset for the owner to review. Transactions are never
 * touched.
 */
export function InitialBalanceDialog({
  open,
  row,
  onClose,
  onDone,
}: {
  open: boolean;
  row: AccountRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const { account, balance } = row;
  const parsed = parseMoneyInput(value, { allowNegative: true, currency: account.currency });
  const after = parsed.ok
    ? addMoney(
        subtractMoney(balance, money(account.initialBalance, account.currency)),
        money(parsed.value, account.currency),
      )
    : null;

  async function confirm() {
    if (busy.current) return;
    if (!parsed.ok) {
      setError(MONEY_ERRORS[parsed.error]);
      return;
    }
    if (parsed.value === account.initialBalance) {
      setError(t.same);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await mutate((r) =>
        r.accounts.update(
          account.id,
          { initialBalance: parsed.value },
          account.rev,
        ),
      );
      feedback(t.done);
      onClose();
      onDone();
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title={t.title}
      confirmLabel={t.confirm}
      busy={saving}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <p>{t.body}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-ink">
        <dt className="type-body-sm text-ink-2">{t.before}</dt>
        <dd className="text-right">
          <Money amount={account.initialBalance} currency={account.currency} />
        </dd>
        <dt className="type-body-sm text-ink-2">{t.currentNow}</dt>
        <dd className="text-right">
          <Money amount={balance.amount} currency={account.currency} />
        </dd>
        {after && (
          <>
            <dt className="type-body-sm text-ink-2">{t.currentAfter}</dt>
            <dd className="text-right" data-testid="balance-after">
              <Money amount={after.amount} currency={account.currency} />
            </dd>
          </>
        )}
      </dl>
      <Field label={t.newValue} error={error} className="mt-4">
        {(p) => (
          <MoneyInput
            {...p}
            name="newInitialBalance"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="0,00"
          />
        )}
      </Field>
    </ConfirmDialog>
  );
}
