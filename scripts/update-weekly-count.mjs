const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const TIME_ZONE = 'Europe/Moscow';

const requiredEnv = [
	'VITE_APPWRITE_ENDPOINT',
	'VITE_APPWRITE_PROJECT_ID',
	'VITE_APPWRITE_DATABASE_ID',
	'VITE_APPWRITE_TABLE_ID',
	'APPWRITE_API_KEY',
];

for (const key of requiredEnv) {
	if (!process.env[key]) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
}

const endpoint = process.env.VITE_APPWRITE_ENDPOINT.replace(/\/$/, '');
const projectId = process.env.VITE_APPWRITE_PROJECT_ID;
const databaseId = process.env.VITE_APPWRITE_DATABASE_ID;
const tableId = process.env.VITE_APPWRITE_TABLE_ID;
const rowId = process.env.VITE_APPWRITE_ROW_ID;
const apiKey = process.env.APPWRITE_API_KEY;

const headers = {
	'Content-Type': 'application/json',
	'X-Appwrite-Project': projectId,
	'X-Appwrite-Key': apiKey,
};

const row = await getRow();

if (typeof row.anchorDate === 'string' && typeof row.anchorWeek === 'number') {
	console.log('Row uses anchor mode. Weekly count update skipped.');
	process.exit(0);
}

const currentCount = Number(row.count);

if (Number.isNaN(currentCount) || currentCount < 1) {
	throw new Error('Row count is missing or invalid.');
}

const weeksPassed = weeksSinceWeekStart(row.$updatedAt);

if (weeksPassed <= 0) {
	console.log('No weekly rollover needed yet.');
	process.exit(0);
}

const nextCount = currentCount + weeksPassed;

await fetchJson(`${endpoint}/tablesdb/${databaseId}/tables/${tableId}/rows/${row.$id}`, {
	method: 'PATCH',
	headers,
	body: JSON.stringify({
		data: {
			count: nextCount,
		},
	}),
});

console.log(`Updated week count from ${currentCount} to ${nextCount}.`);

async function getRow() {
	if (rowId) {
		return fetchJson(`${endpoint}/tablesdb/${databaseId}/tables/${tableId}/rows/${rowId}`, {
			method: 'GET',
			headers,
		});
	}

	const response = await fetchJson(`${endpoint}/tablesdb/${databaseId}/tables/${tableId}/rows`, {
		method: 'GET',
		headers,
	});

	if (!response.rows?.[0]) {
		throw new Error('No rows found in the Appwrite table.');
	}

	return response.rows[0];
}

function weeksSinceWeekStart(isoDate) {
	const nowWeekStart = getMoscowWeekStart(Date.now());
	const sourceWeekStart = getMoscowWeekStart(Date.parse(isoDate));

	return Math.max(0, Math.floor((nowWeekStart - sourceWeekStart) / WEEK_MS));
}

function getMoscowWeekStart(timestamp) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const parts = formatter.formatToParts(new Date(timestamp));
	const year = Number(parts.find((part) => part.type === 'year')?.value);
	const month = Number(parts.find((part) => part.type === 'month')?.value);
	const day = Number(parts.find((part) => part.type === 'day')?.value);
	const utcMidnight = Date.UTC(year, month - 1, day);
	const weekday = new Date(utcMidnight).getUTCDay();
	const mondayOffset = (weekday + 6) % 7;

	return utcMidnight - mondayOffset * DAY_MS;
}

async function fetchJson(url, init) {
	const response = await fetch(url, init);

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Appwrite request failed (${response.status}): ${body}`);
	}

	return response.json();
}
