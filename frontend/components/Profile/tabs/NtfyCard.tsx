import React from 'react';
import { useTranslation } from 'react-i18next';
import { BellAlertIcon } from '@heroicons/react/24/outline';
import {
    NtfySettings,
    fetchNtfySettings,
    removeNtfySettings,
    saveNtfySettings,
} from '../../../utils/ntfyService';

interface NtfyCardProps {
    onConfiguredChange: (configured: boolean) => void;
}

const NtfyCard: React.FC<NtfyCardProps> = ({ onConfiguredChange }) => {
    const { t } = useTranslation();
    const [settings, setSettings] = React.useState<NtfySettings | null>(null);
    const [topicUrl, setTopicUrl] = React.useState('');
    const [token, setToken] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState<{
        ok: boolean;
        text: string;
    } | null>(null);

    const apply = React.useCallback(
        (next: NtfySettings) => {
            setSettings(next);
            setTopicUrl(next.topic_url || '');
            setToken('');
            onConfiguredChange(!!next.topic_url);
        },
        [onConfiguredChange]
    );

    React.useEffect(() => {
        fetchNtfySettings()
            .then(apply)
            .catch(() => apply({ topic_url: null, has_token: false }));
    }, [apply]);

    const run = async (action: () => Promise<NtfySettings>, done: string) => {
        setBusy(true);
        setMessage(null);
        try {
            apply(await action());
            setMessage({ ok: true, text: done });
        } catch (error) {
            setMessage({
                ok: false,
                text:
                    (error as Error).message ||
                    t(
                        'notifications.ntfy.failed',
                        'Something went wrong. Please try again.'
                    ),
            });
        } finally {
            setBusy(false);
        }
    };

    const handleSave = (event: React.FormEvent) => {
        event.preventDefault();
        run(
            () =>
                saveNtfySettings({
                    topic_url: topicUrl.trim(),
                    // An empty field keeps the saved token.
                    ...(token.trim() ? { token: token.trim() } : {}),
                }),
            t('notifications.ntfy.saved', 'Saved.')
        );
    };

    const handleRemoveToken = () =>
        run(
            () => saveNtfySettings({ topic_url: topicUrl.trim(), token: '' }),
            t('notifications.ntfy.tokenRemoved', 'Access token removed.')
        );

    const handleRemove = () =>
        run(
            removeNtfySettings,
            t('notifications.ntfy.removed', 'ntfy is turned off.')
        );

    if (settings === null) return null;

    const inputClass =
        'block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
    const buttonClass =
        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    const secondaryButton = `${buttonClass} text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600`;

    return (
        <form
            onSubmit={handleSave}
            className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/60"
        >
            <div className="flex items-start gap-3">
                <BellAlertIcon className="w-5 h-5 mt-0.5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t('notifications.ntfy.title', 'ntfy')}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        {settings.topic_url
                            ? t(
                                  'notifications.ntfy.configured',
                                  'Notifications go to this ntfy topic. Choose which ones in the ntfy column below.'
                              )
                            : t(
                                  'notifications.ntfy.prompt',
                                  'Send notifications to a topic on ntfy.sh or your own ntfy server, and get them in the ntfy app on your phone.'
                              )}
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t(
                                    'notifications.ntfy.topicUrl',
                                    'Topic address'
                                )}
                            </span>
                            <input
                                type="url"
                                inputMode="url"
                                value={topicUrl}
                                onChange={(e) => setTopicUrl(e.target.value)}
                                placeholder="https://ntfy.sh/my-topic"
                                autoComplete="off"
                                spellCheck={false}
                                className={inputClass}
                            />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t(
                                    'notifications.ntfy.token',
                                    'Access token (optional)'
                                )}
                            </span>
                            <input
                                type="password"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder={
                                    settings.has_token
                                        ? t(
                                              'notifications.ntfy.tokenSaved',
                                              'Saved. Type a new one to replace it.'
                                          )
                                        : 'tk_...'
                                }
                                autoComplete="new-password"
                                className={inputClass}
                            />
                        </label>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {t(
                            'notifications.ntfy.hint',
                            'Anyone who knows a topic name on ntfy.sh can read it, so pick one that is hard to guess, or use a protected topic with an access token.'
                        )}
                    </p>

                    {message && (
                        <p
                            role="status"
                            className={`text-xs mt-2 ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
                        >
                            {message.text}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3">
                        <button
                            type="submit"
                            disabled={busy || !topicUrl.trim()}
                            className={`${buttonClass} text-white bg-blue-600 hover:bg-blue-700`}
                        >
                            {t('notifications.ntfy.save', 'Save')}
                        </button>
                        {settings.has_token && (
                            <button
                                type="button"
                                onClick={handleRemoveToken}
                                disabled={busy}
                                className={secondaryButton}
                            >
                                {t(
                                    'notifications.ntfy.removeToken',
                                    'Remove token'
                                )}
                            </button>
                        )}
                        {settings.topic_url && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                disabled={busy}
                                className={secondaryButton}
                            >
                                {t('notifications.ntfy.remove', 'Turn off')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </form>
    );
};

export default NtfyCard;
