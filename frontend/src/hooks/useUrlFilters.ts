import { useCallback, useEffect, useState } from "react";
import type { ListStreamsFilters } from "../services/api";

export type ViewMode = "dashboard" | "recipient";

const VALID_STATUSES = new Set(["active", "scheduled", "completed", "canceled"]);
const VALID_VIEWS = new Set<ViewMode>(["dashboard", "recipient"]);

function sanitizeString(raw: string | null, maxLen = 64): string {
    if (!raw) return "";
    return raw.trim().replace(/[^\x20-\x7E]/g, "").slice(0, maxLen);
}

function parseViewMode(raw: string | null): ViewMode {
    const v = sanitizeString(raw);
    return VALID_VIEWS.has(v as ViewMode) ? (v as ViewMode) : "dashboard";
}

function parseStatus(raw: string | null): string {
    const v = sanitizeString(raw);
    return VALID_STATUSES.has(v) ? v : "";
}

function readParams(): { view: ViewMode; filters: ListStreamsFilters } {
    const p = new URLSearchParams(window.location.search);
    return {
        view: parseViewMode(p.get("view")),
        filters: {
            status: parseStatus(p.get("status")),
            asset: sanitizeString(p.get("asset")),
            sender: sanitizeString(p.get("sender")),
            recipient: sanitizeString(p.get("recipient")),
        },
    };
}

function buildSearch(view: ViewMode, filters: ListStreamsFilters): string {
    const p = new URLSearchParams();
    if (view !== "dashboard") p.set("view", view);
    if (filters.status) p.set("status", filters.status);
    if (filters.asset) p.set("asset", filters.asset);
    if (filters.sender) p.set("sender", filters.sender);
    if (filters.recipient) p.set("recipient", filters.recipient);
    const s = p.toString();
    return s ? `?${s}` : "";
}

export interface UrlFilterState {
    view: ViewMode;
    filters: ListStreamsFilters;
    setView: (v: ViewMode) => void;
    setFilters: (f: ListStreamsFilters) => void;
}

export function useUrlFilters(): UrlFilterState {
    const initial = readParams();
    const [view, setViewState] = useState<ViewMode>(initial.view);
    const [filters, setFiltersState] = useState<ListStreamsFilters>(initial.filters);

    useEffect(() => {
        const next = buildSearch(view, filters);
        const current = window.location.search;
        if (next !== current) {
            window.history.replaceState(null, "", next || window.location.pathname);
        }
    }, [view, filters]);

    useEffect(() => {
        function onPop() {
            const { view: v, filters: f } = readParams();
            setViewState(v);
            setFiltersState(f);
        }
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const setView = useCallback((v: ViewMode) => {
        setViewState(v);
        const next = buildSearch(v, filters);
        window.history.pushState(null, "", next || window.location.pathname);
    }, [filters]);

    const setFilters = useCallback((f: ListStreamsFilters) => {
        setFiltersState(f);
    }, []);

    return { view, filters, setView, setFilters };
}