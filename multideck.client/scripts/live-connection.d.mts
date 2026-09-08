import type { Plugin } from 'vite';
export function createLiveDescriptor(env: Record<string, string>): Record<string, unknown> | null;
export function liveConnectionPlugin(env: Record<string, string>): Plugin;
