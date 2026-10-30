import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import {
    DailyPlanItem,
    DailyPlanResponse,
    concludeDailyPlan,
    reopenDailyPlan,
} from '../../utils/dailyPlanService';
import { useToast } from '../Shared/ToastContext';
import { addDays, isItemDone } from './planUtils';

interface EndDayCardProps {
    date: string;
    items: DailyPlanItem[];
    // The day was ended; otherwise the card asks what to carry over.
    concluded: boolean;
    onSaved: (response: DailyPlanResponse) => void;
    onCancel: () => void;
}

// "End day" without the AI: pick the unfinished tasks that move to
// tomorrow's plan, then offer to plan tomorrow.
const EndDayCard: React.FC<EndDayCardProps> = ({
    date,
    items,
    concluded,
    onSaved,
    onCancel,
}) => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();
    const unfinished = items.filter((item) => !isItemDone(item));
    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(unfinished.map((item) => item.task_uid))
    );
    const [saving, setSaving] = useState(false);
    const doneCount = items.length - unfinished.length;
    const tomorrow = addDays(date, 1);

    const run = async (action: () => Promise<DailyPlanResponse>) => {
        setSaving(true);
        try {
            onSaved(await action());
        } catch (err) {
            showErrorToast(
                err instanceof Error
                    ? err.message
                    : t('dailyPlan.saveError', 'Could not save the plan.')
            );
        } finally {
            setSaving(false);
        }
    };

    if (concluded) {
        return (
            <section
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 px-5 py-4 dark:bg-emerald-900/20"
                data-testid="day-ended-card"
            >
                <CheckCircleIcon className="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base text-gray-900 dark:text-gray-100">
                        {t('dailyPlan.endDay.endedTitle', 'Day done')}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t('dailyPlan.progress', '{{done}} of {{total}} done', {
                            done: doneCount,
                            total: items.length,
                        })}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => run(() => reopenDailyPlan(date))}
                    disabled={saving}
                    className="text-sm text-gray-600 underline-offset-2 hover:underline disabled:opacity-60 dark:text-gray-400"
                    data-testid="day-ended-reopen"
                >
                    {t('dailyPlan.endDay.reopen', 'Reopen day')}
                </button>
                <Link
                    to={`/today/plan?date=${tomorrow}`}
                    className="inline-flex min-h-[40px] items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
                    data-testid="day-ended-plan-tomorrow"
                >
                    {t('dailyPlan.planTomorrow', 'Plan tomorrow')}
                </Link>
            </section>
        );
    }

    return (
        <section
            className="flex flex-col gap-3 rounded-2xl bg-emerald-50 px-5 py-4 dark:bg-emerald-900/20"
            data-testid="end-day-card"
        >
            <p className="text-base text-gray-900 dark:text-gray-100">
                {t('dailyPlan.endDay.title', 'End the day')}
                <span className="text-sm text-gray-600 dark:text-gray-400">
                    {' · '}
                    {t('dailyPlan.progress', '{{done}} of {{total}} done', {
                        done: doneCount,
                        total: items.length,
                    })}
                </span>
            </p>
            {unfinished.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {t('dailyPlan.endDay.carryTitle', 'Move to tomorrow')}
                    </p>
                    {unfinished.map((item) => (
                        <label
                            key={item.task_uid}
                            className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200"
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={selected.has(item.task_uid)}
                                onChange={(e) =>
                                    setSelected((current) => {
                                        const next = new Set(current);
                                        if (e.target.checked) {
                                            next.add(item.task_uid);
                                        } else {
                                            next.delete(item.task_uid);
                                        }
                                        return next;
                                    })
                                }
                            />
                            <span>{item.task.name}</span>
                        </label>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() =>
                        run(() => concludeDailyPlan(date, [...selected]))
                    }
                    disabled={saving}
                    className="inline-flex min-h-[36px] items-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    data-testid="end-day-confirm"
                >
                    {selected.size > 0
                        ? t(
                              'dailyPlan.endDay.confirmCarry',
                              'Move {{count}} and end day',
                              { count: selected.size }
                          )
                        : t('dailyPlan.endDay.confirm', 'End day')}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    className="text-sm text-gray-600 underline-offset-2 hover:underline disabled:opacity-60 dark:text-gray-400"
                >
                    {t('common.cancel', 'Cancel')}
                </button>
            </div>
        </section>
    );
};

export default EndDayCard;
