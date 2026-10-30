const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { Notification, User } = require('../../models');
const { createTestUser } = require('../helpers/testUtils');
const secretCipher = require('../../shared/crypto/secretCipher');

// A public IP literal, so the SSRF check needs no DNS. axios is stubbed, so
// nothing is sent.
const TOPIC_URL = 'https://1.1.1.1/tududi-test';

const login = async (user) => {
    const agent = request.agent(app);
    await agent
        .post('/api/login')
        .send({ email: user.email, password: 'password123' });
    return agent;
};

let counter = 0;

describe('ntfy notifications', () => {
    let user, agent, post, previousSecret;

    beforeAll(() => {
        previousSecret = process.env.TUDUDI_SESSION_SECRET;
        process.env.TUDUDI_SESSION_SECRET = 'ntfy-test-secret';
    });

    afterAll(() => {
        if (previousSecret === undefined) {
            delete process.env.TUDUDI_SESSION_SECRET;
        } else {
            process.env.TUDUDI_SESSION_SECRET = previousSecret;
        }
    });

    beforeEach(async () => {
        post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
        user = await createTestUser({
            email: `ntfy_${Date.now()}_${++counter}@example.com`,
        });
        agent = await login(user);
    });

    afterEach(() => {
        post.mockRestore();
    });

    describe('settings', () => {
        it('requires a session', async () => {
            const res = await request(app).get('/api/ntfy');
            expect(res.status).toBe(401);
        });

        it('starts empty', async () => {
            const res = await agent.get('/api/ntfy');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ topic_url: null, has_token: false });
        });

        it('saves the topic and keeps the token encrypted and out of responses', async () => {
            const res = await agent
                .put('/api/ntfy')
                .send({ topic_url: `${TOPIC_URL}?x=1`, token: 'tk_secret' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ topic_url: TOPIC_URL, has_token: true });
            expect(JSON.stringify(res.body)).not.toContain('tk_secret');

            const row = await User.findByPk(user.id);
            expect(row.ntfy_token_encrypted).not.toContain('tk_secret');
            expect(secretCipher.decrypt(row.ntfy_token_encrypted)).toBe(
                'tk_secret'
            );

            const profile = await agent.get('/api/profile');
            expect(JSON.stringify(profile.body)).not.toContain('ntfy_token');
        });

        it('keeps the saved token when it is left out, removes it when empty', async () => {
            await agent
                .put('/api/ntfy')
                .send({ topic_url: TOPIC_URL, token: 'tk_secret' });

            let res = await agent
                .put('/api/ntfy')
                .send({ topic_url: TOPIC_URL });
            expect(res.body.has_token).toBe(true);

            res = await agent
                .put('/api/ntfy')
                .send({ topic_url: TOPIC_URL, token: '' });
            expect(res.body.has_token).toBe(false);
        });

        it('turns off with DELETE', async () => {
            await agent
                .put('/api/ntfy')
                .send({ topic_url: TOPIC_URL, token: 'tk_secret' });
            const res = await agent.delete('/api/ntfy');
            expect(res.body).toEqual({ topic_url: null, has_token: false });
        });

        it.each([
            ['not a url', 'ntfy'],
            ['ftp://ntfy.sh/topic', 'https'],
            ['https://ntfy.sh/', 'topic name'],
            ['https://ntfy.sh/bad%20topic', 'topic name'],
            ['https://user:pw@ntfy.sh/topic', 'token'],
        ])('rejects %s', async (topicUrl, hint) => {
            const res = await agent
                .put('/api/ntfy')
                .send({ topic_url: topicUrl });
            expect(res.status).toBe(400);
            expect(res.body.error).toEqual(expect.stringContaining(hint));
        });
    });

    describe('delivery', () => {
        const enable = async (prefKey = 'dueTasks') => {
            await agent
                .put('/api/ntfy')
                .send({ topic_url: TOPIC_URL, token: 'tk_secret' });
            const row = await User.findByPk(user.id);
            await row.update({
                notification_preferences: {
                    ...row.notification_preferences,
                    [prefKey]: { inApp: true, ntfy: true },
                },
            });
        };

        it('publishes JSON to the server with the token, title and a link', async () => {
            await enable();
            await Notification.createNotification({
                userId: user.id,
                type: 'task_overdue',
                title: 'Überfällig',
                message: 'Steuer machen is overdue',
                level: 'error',
                sources: ['ntfy'],
                data: { taskUid: 'abc123' },
            });

            expect(post).toHaveBeenCalledTimes(1);
            const [url, body, options] = post.mock.calls[0];
            expect(url).toBe('https://1.1.1.1/');
            expect(body).toMatchObject({
                topic: 'tududi-test',
                title: 'Überfällig',
                message: 'Steuer machen is overdue',
                priority: 4,
                tags: ['rotating_light'],
            });
            expect(body.click).toMatch(/\/task\/abc123$/);
            expect(options.headers.Authorization).toBe('Bearer tk_secret');
            expect(options.maxRedirects).toBe(0);
        });

        it('does not resend a recreated reminder within a day', async () => {
            await enable();
            const first = await Notification.createNotification({
                userId: user.id,
                type: 'task_due_soon',
                title: 'Due soon',
                message: 'Task is due',
                sources: ['ntfy'],
            });
            await first.reload();
            expect(first.channel_sent_at.ntfy).toBeTruthy();

            await Notification.createNotification({
                userId: user.id,
                type: 'task_due_soon',
                title: 'Due soon',
                message: 'Task is due',
                sources: ['ntfy'],
                channel_sent_at: first.channel_sent_at,
            });
            expect(post).toHaveBeenCalledTimes(1);
        });

        it('does nothing when ntfy is not set up', async () => {
            await Notification.createNotification({
                userId: user.id,
                type: 'task_due_soon',
                title: 'Due soon',
                message: 'Task is due',
                sources: ['ntfy'],
            });
            expect(post).not.toHaveBeenCalled();
        });

        it('keeps the in-app notification when the ntfy server fails', async () => {
            await enable();
            post.mockResolvedValue({ status: 500 });
            const notification = await Notification.createNotification({
                userId: user.id,
                type: 'task_due_soon',
                title: 'Due soon',
                message: 'Task is due',
                sources: ['ntfy'],
            });
            await notification.reload();
            expect(notification.id).toBeTruthy();
            expect(notification.channel_sent_at?.ntfy).toBeUndefined();
        });
    });

    describe('test notification', () => {
        it('sends through ntfy', async () => {
            await agent.put('/api/ntfy').send({ topic_url: TOPIC_URL });
            const res = await agent
                .post('/api/test-notifications/trigger')
                .send({ channel: 'ntfy' });
            expect(res.status).toBe(200);
            expect(post).toHaveBeenCalledTimes(1);
            expect(post.mock.calls[0][2].headers.Authorization).toBeUndefined();
        });

        it('explains a refused token', async () => {
            await agent
                .put('/api/ntfy')
                .send({ topic_url: TOPIC_URL, token: 'tk_wrong' });
            post.mockResolvedValue({ status: 403 });
            const res = await agent
                .post('/api/test-notifications/trigger')
                .send({ channel: 'ntfy' });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('access token');
        });

        it('asks for a topic first', async () => {
            const res = await agent
                .post('/api/test-notifications/trigger')
                .send({ channel: 'ntfy' });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('ntfy topic');
        });

        it('refuses private addresses', async () => {
            await agent
                .put('/api/ntfy')
                .send({ topic_url: 'http://127.0.0.1/topic' });
            const res = await agent
                .post('/api/test-notifications/trigger')
                .send({ channel: 'ntfy' });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('NTFY_ALLOW_PRIVATE_HOSTS');
            expect(post).not.toHaveBeenCalled();
        });
    });
});
