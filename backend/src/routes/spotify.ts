/**
 * Spotify API Routes
 *
 * Server-side client credentials flow keeps the Spotify client secret on the backend.
 * The frontend calls GET /api/spotify/token to obtain a short-lived access token.
 */

import { Router, Request, Response } from 'express';

const router = Router();

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

type SpotifyTokenResponse = {
    access_token: string;
    expires_in: number;
};

type SpotifySearchResponse = {
    tracks?: {
        items?: unknown[];
    };
};

// Token cache to avoid requesting a new Spotify token on every request.
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

async function readErrorBody(response: globalThis.Response): Promise<string> {
    return (await response.text()).slice(0, 1000);
}

/**
 * GET /api/spotify/token
 * Returns a Spotify access token for client use.
 */
router.get('/token', async (_req: Request, res: Response) => {
    try {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return res.status(503).json({
                error: 'Spotify not configured',
                message: 'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars required',
            });
        }

        if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
            return res.json({ access_token: cachedToken });
        }

        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
            },
            body: new URLSearchParams({ grant_type: 'client_credentials' }),
        });

        if (!response.ok) {
            throw new Error(`Spotify token request failed (${response.status}): ${await readErrorBody(response)}`);
        }

        const tokenData = await response.json() as SpotifyTokenResponse;
        cachedToken = tokenData.access_token;
        tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 300000;

        return res.json({ access_token: cachedToken });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Spotify token error:', message);
        return res.status(500).json({ error: 'Failed to get Spotify token' });
    }
});

/**
 * GET /api/spotify/search
 * Searches Spotify tracks through the backend.
 */
router.get('/search', async (req: Request, res: Response) => {
    try {
        const { q } = req.query;

        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }

        const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
        const tokenResponse = await fetch(new URL('/api/spotify/token', baseUrl));

        if (!tokenResponse.ok) {
            throw new Error(`Spotify token endpoint failed (${tokenResponse.status}): ${await readErrorBody(tokenResponse)}`);
        }

        const tokenData = await tokenResponse.json() as { access_token?: string };
        if (!tokenData.access_token) {
            throw new Error('Spotify token endpoint did not return an access token');
        }

        const searchUrl = new URL('https://api.spotify.com/v1/search');
        searchUrl.searchParams.set('q', q);
        searchUrl.searchParams.set('type', 'track');
        searchUrl.searchParams.set('limit', '10');

        const searchResponse = await fetch(searchUrl, {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });

        if (!searchResponse.ok) {
            throw new Error(`Spotify search request failed (${searchResponse.status}): ${await readErrorBody(searchResponse)}`);
        }

        const searchData = await searchResponse.json() as SpotifySearchResponse;
        return res.json(searchData.tracks?.items ?? []);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Spotify search error:', message);
        return res.status(500).json({ error: 'Spotify search failed' });
    }
});

export default router;
