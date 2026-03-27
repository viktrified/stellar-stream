import { useEffect, useState, useCallback, useMemo } from "react";
import { getStreamHistory, listAllEvents, StreamEvent } from "../services/api";

interface StreamTimelineProps {
  streamId?: string;
}

/** Simple "time ago" formatter */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function StreamTimeline({ streamId }: StreamTimelineProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  }, [streamId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function getEventIcon(eventType: string): string {
    switch (eventType) {

    }
  }

  function getEventDescription(event: StreamEvent): string {
    const actor = event.actor ? `${event.actor.slice(0, 6)}...${event.actor.slice(-4)}` : "Unknown";
    switch (event.eventType) {
      case "created":
        return `Initiated by ${actor} for ${event.amount} tokens`;
      case "claimed":
        return `Claim of ${event.amount} tokens processed by ${actor}`;
      case "canceled":
        return `Closed by ${actor}`;
      case "start_time_updated":
        return `New start time set by ${actor}`;
      default:
        return `Action performed by ${actor}`;
    }
  }

