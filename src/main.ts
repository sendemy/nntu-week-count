import type { Models } from 'appwrite';
import translations from '../ru.json';
import { tablesDB } from './lib/appwrite';
import './styles.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const DEFAULT_ANCHOR = {
	date: '2026-03-02',
	week: 4,
};

type WeekParity = 'odd' | 'even';

type WeekConfig = {
	anchorDate: string;
	anchorWeek: number;
};

type WeekRow = Models.Row & {
	count?: number;
	anchorDate?: string;
	anchorWeek?: number;
};

type CountModeMeta = {
	storedCount: number;
	lastUpdatedAt: string;
};

type ResolvedWeek = {
	weekNumber: number;
	meta: CountModeMeta | null;
};

const env = {
	databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined,
	tableId: import.meta.env.VITE_APPWRITE_TABLE_ID as string | undefined,
	rowId: import.meta.env.VITE_APPWRITE_ROW_ID as string | undefined,
};

document.documentElement.lang = 'ru';
document.title = translations.pageTitle;

const counterLabel = mustFind<HTMLParagraphElement>('#counter-label');
const weekText = mustFind<HTMLHeadingElement>('#week-text');
const statusEl = mustFind<HTMLParagraphElement>('#status');
const scheduleSection = mustFind<HTMLElement>('#schedule-section');
const oddCard = mustFind<HTMLElement>('#odd-card');
const evenCard = mustFind<HTMLElement>('#even-card');
const oddImage = mustFind<HTMLImageElement>('#odd-image');
const evenImage = mustFind<HTMLImageElement>('#even-image');

applyTranslations();
renderWeek(
	weekFromAnchor({
		anchorDate: DEFAULT_ANCHOR.date,
		anchorWeek: DEFAULT_ANCHOR.week,
	}),
	translations.statusLocalDefault
);
boot().catch((error) => {
	console.error(error);
	statusEl.textContent = translations.statusLoadFailed;
});

async function boot() {
	if (!hasAppwriteConfig()) {
		statusEl.textContent = translations.statusRemoteDisabled;
		return;
	}

	try {
		const row = await getWeekRow();
		const resolved = resolveWeekFromRow(row);

		if (resolved.meta) {
			renderWeek(resolved.weekNumber, buildCountModeStatus(resolved.meta));
			return;
		}

		renderWeek(resolved.weekNumber, translations.statusAnchorCalculated);
	} catch (error) {
		console.error(error);
		statusEl.textContent = translations.statusTableFallback;
	}
}

function applyTranslations() {
	counterLabel.textContent = translations.counterLabel;
	weekText.textContent = translations.loading;
	scheduleSection.setAttribute('aria-label', translations.scheduleAriaLabel);
	oddImage.alt = translations.oddWeekAlt;
	evenImage.alt = translations.evenWeekAlt;
}

function resolveWeekFromRow(row: WeekRow): ResolvedWeek {
	const hasAnchor = typeof row.anchorDate === 'string' && typeof row.anchorWeek === 'number';

	if (hasAnchor) {
		const config: WeekConfig = {
			anchorDate: row.anchorDate as string,
			anchorWeek: Number(row.anchorWeek),
		};

		return {
			weekNumber: weekFromAnchor(config),
			meta: null,
		};
	}

	const count = Number(row.count ?? DEFAULT_ANCHOR.week);
	const storedCount = Number.isNaN(count) || count < 1 ? DEFAULT_ANCHOR.week : count;
	const meta: CountModeMeta = {
		storedCount,
		lastUpdatedAt: row.$updatedAt,
	};

	return {
		weekNumber: storedCount + weeksSinceWeekStart(meta.lastUpdatedAt),
		meta,
	};
}

function renderWeek(weekNumber: number, statusMessage = '') {
	const parity: WeekParity = weekNumber % 2 === 0 ? 'even' : 'odd';
	const parityLabel = parity === 'even' ? translations.weekEven : translations.weekOdd;

	weekText.textContent = formatString(translations.weekFormat, {
		weekNumber: String(weekNumber),
		parityLabel,
	});
	statusEl.textContent = statusMessage;

	oddCard.classList.toggle('active', parity === 'odd');
	evenCard.classList.toggle('active', parity === 'even');
}

function hasAppwriteConfig() {
	return Boolean(env.databaseId && env.tableId);
}

async function getWeekRow(): Promise<WeekRow> {
	if (!env.databaseId || !env.tableId) {
		throw new Error(translations.missingTableConfig);
	}

	if (env.rowId) {
		return (await tablesDB.getRow({
			databaseId: env.databaseId,
			tableId: env.tableId,
			rowId: env.rowId,
		})) as WeekRow;
	}

	const rows = await tablesDB.listRows({
		databaseId: env.databaseId,
		tableId: env.tableId,
	});

	if (!rows.rows[0]) {
		throw new Error(translations.noRowsFound);
	}

	return rows.rows[0] as WeekRow;
}

function weekFromAnchor(config: WeekConfig) {
	const today = startOfDay(new Date());
	const anchorDate = parseDateInput(config.anchorDate);
	const diffWeeks = Math.floor((today.getTime() - anchorDate.getTime()) / WEEK_MS);

	return Math.max(1, config.anchorWeek + diffWeeks);
}

function weeksSinceWeekStart(isoDate: string) {
	const nowWeekStart = getMoscowWeekStart(Date.now());
	const sourceWeekStart = getMoscowWeekStart(Date.parse(isoDate));

	return Math.max(0, Math.floor((nowWeekStart - sourceWeekStart) / WEEK_MS));
}

function getMoscowWeekStart(timestamp: number) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Moscow',
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

function buildCountModeStatus(meta: CountModeMeta | null) {
	if (!meta) {
		return '';
	}

	const weeksPassed = weeksSinceWeekStart(meta.lastUpdatedAt);

	if (weeksPassed === 0) {
		return formatString(translations.countStatusNoRollover, {
			storedCount: String(meta.storedCount),
		});
	}

	const template = weeksPassed === 1 ? translations.countStatusRolloverOne : translations.countStatusRollover;
	return formatString(template, {
		storedCount: String(meta.storedCount),
		weeksPassed: String(weeksPassed),
	});
}

function formatString(template: string, values: Record<string, string>) {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function parseDateInput(value: string) {
	const [year, month, day] = value.split('-').map((chunk) => Number(chunk));

	return startOfDay(new Date(year, month - 1, day));
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mustFind<T extends Element>(selector: string): T {
	const node = document.querySelector<T>(selector);

	if (!node) {
		throw new Error(`Element not found: ${selector}`);
	}

	return node;
}
