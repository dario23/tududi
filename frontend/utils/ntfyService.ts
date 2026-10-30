import { getApiPath } from '../config/paths';
import { getCsrfToken } from './csrfService';

// ntfy (https://ntfy.sh or a self-hosted server): the server publishes to
// one topic per account, and the ntfy app on the phone shows it.

export interface NtfySettings {
    topic_url: string | null;
    has_token: boolean;
}

const readJson = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || fallback);
    return data;
};

export const fetchNtfySettings = async (): Promise<NtfySettings> => {
    const response = await fetch(getApiPath('ntfy'), {
        credentials: 'include',
    });
    return readJson(response, 'Could not load the ntfy settings');
};

// Leave `token` out to keep the saved one; pass '' to remove it.
export const saveNtfySettings = async (settings: {
    topic_url: string;
    token?: string;
}): Promise<NtfySettings> => {
    const response = await fetch(getApiPath('ntfy'), {
        method: 'PUT',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify(settings),
    });
    return readJson(response, 'Could not save the ntfy settings');
};

export const removeNtfySettings = async (): Promise<NtfySettings> => {
    const response = await fetch(getApiPath('ntfy'), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': await getCsrfToken() },
    });
    return readJson(response, 'Could not remove the ntfy settings');
};
