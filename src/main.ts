import type { Models } from 'appwrite';
import { tablesDB } from './lib/appwrite';
import './styles.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const DEFAULT_ANCHOR = {
	date: '2026-03-02',
	week: 4,
};

type WeekParity = 'odd' | 'even';
type DataMode = 'count' | 'anchor';

type WeekConfig = {
	anchorDate: string;
	anchorWeek: number;
};

type WeekRow = Models.Row & {
	count?: number;
	anchorDate?: string;
	anchorWeek?: number;
};

const env = {
	databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined,
	tableId: import.meta.env.VITE_APPWRITE_TABLE_ID as string | undefined,
	rowId: import.meta.env.VITE_APPWRITE_ROW_ID as string | undefined,
	adminPassword: import.meta.env.VITE_ADMIN_PASSWORD as string | undefined,
};

const weekText = mustFind<HTMLHeadingElement>('#week-text');
const statusEl = mustFind<HTMLParagraphElement>('#status');
const oddCard = mustFind<HTMLElement>('#odd-card');
const evenCard = mustFind<HTMLElement>('#even-card');

const authBlock = mustFind<HTMLDivElement>('#auth-block');
const editorBlock = mustFind<HTMLDivElement>('#editor-block');
const unlockForm = mustFind<HTMLFormElement>('#unlock-form');
const configForm = mustFind<HTMLFormElement>('#config-form');
const unlockMessage = mustFind<HTMLParagraphElement>('#unlock-message');
const saveMessage = mustFind<HTMLParagraphElement>('#save-message');
const whoami = mustFind<HTMLParagraphElement>('#whoami');
const lockBtn = mustFind<HTMLButtonElement>('#lock');

const countModeFields = mustFind<HTMLDivElement>('#count-mode-fields');
const anchorModeFields = mustFind<HTMLDivElement>('#anchor-mode-fields');

const countWeekInput = mustFind<HTMLInputElement>('#count-week');
const anchorDateInput = mustFind<HTMLInputElement>('#anchor-date');
const anchorWeekInput = mustFind<HTMLInputElement>('#anchor-week');

let currentConfig: WeekConfig = {
	anchorDate: DEFAULT_ANCHOR.date,
	anchorWeek: DEFAULT_ANCHOR.week,
};
let currentRowId: string | null = null;
let dataMode: DataMode = 'count';

renderWeek(weekFromAnchor(currentConfig));
boot().catch((error) => {
	console.error(error);
	statusEl.textContent = 'Failed to load settings. Check console and environment variables.';
});

async function boot() {
	const hasRemoteConfig = hasAppwriteConfig();

	if (!hasRemoteConfig) {
		statusEl.textContent =
			'Remote settings are disabled: add VITE_APPWRITE_DATABASE_ID and VITE_APPWRITE_TABLE_ID.';
		bindEvents();
		return;
	}

	try {
		const row = await getWeekRow();
		const resolved = resolveWeekFromRow(row);
		dataMode = resolved.mode;
		setModeUI(dataMode);
		currentRowId = row.$id;

		if (dataMode === 'count') {
			countWeekInput.value = String(resolved.weekNumber);
			renderWeek(resolved.weekNumber);
		} else {
			currentConfig = resolved.config;
			fillAnchorEditor(resolved.config);
			renderWeek(resolved.weekNumber);
		}
	} catch (error) {
		console.error(error);
		statusEl.textContent = 'Failed to load config from Appwrite table. Local fallback is used.';
	}

	bindEvents();
}

function bindEvents() {
	unlockForm.addEventListener('submit', (event) => {
		event.preventDefault();
		unlockMessage.textContent = '';

		const formData = new FormData(unlockForm);
		const password = String(formData.get('password') ?? '');
		const expectedPassword = env.adminPassword ?? '';

		if (!expectedPassword) {
			unlockMessage.textContent = 'VITE_ADMIN_PASSWORD is not set.';
			return;
		}

		if (password !== expectedPassword) {
			unlockMessage.textContent = 'Wrong password.';
			return;
		}

		setEditorVisible(true);
		unlockForm.reset();
	});

	configForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		saveMessage.textContent = 'Saving...';

		try {
			if (dataMode === 'count') {
				const nextWeek = Number(countWeekInput.value);
				if (Number.isNaN(nextWeek) || nextWeek < 1) {
					saveMessage.textContent = 'Enter a valid week number.';
					return;
				}

				await updateWeekRow({ count: nextWeek });
				renderWeek(nextWeek);
				saveMessage.textContent = 'Saved.';
				return;
			}

			const nextConfig: WeekConfig = {
				anchorDate: anchorDateInput.value,
				anchorWeek: Number(anchorWeekInput.value),
			};

			if (!nextConfig.anchorDate || Number.isNaN(nextConfig.anchorWeek) || nextConfig.anchorWeek < 1) {
				saveMessage.textContent = 'Enter a valid date and week number.';
				return;
			}

			await updateWeekRow({ anchorDate: nextConfig.anchorDate, anchorWeek: nextConfig.anchorWeek });
			currentConfig = nextConfig;
			const weekNumber = weekFromAnchor(nextConfig);
			renderWeek(weekNumber);
			saveMessage.textContent = 'Saved.';
		} catch (error) {
			console.error(error);
			saveMessage.textContent = 'Save failed. Check table row permissions and columns.';
		}
	});

	lockBtn.addEventListener('click', () => {
		setEditorVisible(false);
		saveMessage.textContent = '';
		unlockMessage.textContent = 'Editor locked.';
	});
}

function resolveWeekFromRow(row: WeekRow) {
	const hasAnchor = typeof row.anchorDate === 'string' && typeof row.anchorWeek === 'number';
	if (hasAnchor) {
		const config: WeekConfig = {
			anchorDate: row.anchorDate as string,
			anchorWeek: Number(row.anchorWeek),
		};
		return {
			mode: 'anchor' as const,
			weekNumber: weekFromAnchor(config),
			config,
		};
	}

	const count = Number(row.count ?? DEFAULT_ANCHOR.week);
	return {
		mode: 'count' as const,
		weekNumber: Number.isNaN(count) || count < 1 ? DEFAULT_ANCHOR.week : count,
		config: {
			anchorDate: DEFAULT_ANCHOR.date,
			anchorWeek: DEFAULT_ANCHOR.week,
		},
	};
}

function setModeUI(mode: DataMode) {
	countModeFields.classList.toggle('hidden', mode !== 'count');
	anchorModeFields.classList.toggle('hidden', mode !== 'anchor');
}

function renderWeek(weekNumber: number) {
	const parity: WeekParity = weekNumber % 2 === 0 ? 'even' : 'odd';
	const parityLabel = parity === 'even' ? 'Четная' : 'Нечетная';

	weekText.textContent = `Неделя ${weekNumber}, ${parityLabel}`;

	oddCard.classList.toggle('active', parity === 'odd');
	evenCard.classList.toggle('active', parity === 'even');
}

function fillAnchorEditor(config: WeekConfig) {
	anchorDateInput.value = config.anchorDate;
	anchorWeekInput.value = String(config.anchorWeek);
}

function setEditorVisible(isVisible: boolean) {
	authBlock.classList.toggle('hidden', isVisible);
	editorBlock.classList.toggle('hidden', !isVisible);
	whoami.textContent = isVisible ? 'Editor unlocked.' : '';
}

function hasAppwriteConfig() {
	return Boolean(env.databaseId && env.tableId);
}

async function getWeekRow(): Promise<WeekRow> {
	if (!env.databaseId || !env.tableId) {
		throw new Error('Missing Appwrite table configuration');
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
		throw new Error('No rows found in table.');
	}

	return rows.rows[0] as WeekRow;
}

async function updateWeekRow(data: Record<string, unknown>) {
	if (!env.databaseId || !env.tableId) {
		throw new Error('Missing Appwrite table configuration');
	}

	const rowId = env.rowId ?? currentRowId;
	if (!rowId) {
		throw new Error('Unknown row ID. Set VITE_APPWRITE_ROW_ID or ensure the row is readable.');
	}

	await tablesDB.updateRow({
		databaseId: env.databaseId,
		tableId: env.tableId,
		rowId,
		data,
	});
}

function weekFromAnchor(config: WeekConfig) {
	const today = startOfDay(new Date());
	const anchorDate = parseDateInput(config.anchorDate);
	const diffWeeks = Math.floor((today.getTime() - anchorDate.getTime()) / WEEK_MS);
	return Math.max(1, config.anchorWeek + diffWeeks);
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
