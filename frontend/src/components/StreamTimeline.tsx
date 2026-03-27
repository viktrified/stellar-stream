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

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Delay to ensure the user can observe the premium skeleton loaders
      await new Promise(r => setTimeout(r, 1000));

      const data = streamId 
        ? await getStreamHistory(streamId)
        : await listAllEvents();
      // Sort descending to show latest activity first
      setEvents([...data].sort((a, b) => b.timestamp - a.timestamp));
    } catch (err: any) {
      setError(err.message || "Failed to load stream history");
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function getEventIcon(eventType: string): string {
    switch (eventType) {
      case "created":
        return "✨";
      case "claimed":
        return "💎";
      case "canceled":
        return "🚫";
      case "start_time_updated":
        return "🗓️";
      default:
        return "⚡";
    }
  }

  function getEventTitle(event: StreamEvent): string {
    switch (event.eventType) {
      case "created":
        return "Stream Created";
      case "claimed":
        return "Funds Claimed";
      case "canceled":
        return "Stream Canceled";
      case "start_time_updated":
        return "Schedule Updated";
      default:
        return "Activity Recorded";
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

  if (loading) {
    return (
      <div className="activity-feed">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-item" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="activity-error">
        <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>⚠️</span>
        <h3>History Unavailable</h3>
        <p className="muted">{error}</p>
        <button className="retry-btn" onClick={loadHistory}>
          Retry Fetch
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="activity-empty">
        <span className="activity-empty-icon">📂</span>
        <p>No activity recorded yet for this stream.</p>
        <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
          Events will appear here as they are indexed from the network.
        </p>
      </div>
    );
  }

  return (
    <div className="activity-feed">
      {events.map((event: StreamEvent) => (
        <div key={event.id} className="activity-item">
          <div className="activity-icon">{getEventIcon(event.eventType)}</div>
          <div className="activity-content">
            <h4 className="activity-title">{getEventTitle(event)}</h4>
            <p className="muted" style={{ margin: "2px 0 6px 0" }}>
              {getEventDescription(event)}
            </p>
            <div className="activity-meta">
              <span>🕒 {timeAgo(event.timestamp)}</span>
              <span>•</span>
              <span className="truncate-address" style={{ fontSize: "0.7rem" }}>
                ID: {event.id}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

