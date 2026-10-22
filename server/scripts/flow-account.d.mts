import type { Page } from 'playwright';
export function parseFlowCreditLabel(label: string): number | null;
export function isInsufficientCreditWarning(text: string): boolean;
export function readFlowAccount(page: Page): Promise<{ credits: number; account: string; tier: string } | null>;
