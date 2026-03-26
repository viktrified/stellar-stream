import { useEffect, useState } from "react";
import { getStreamHistory, StreamEvent } from "../services/api";

interface StreamTimelineProps {
  streamId: string;
}

export function StreamTimeline({ streamId }: StreamTimelineProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      setLoading(true);
      setError(null);
      try {
        const data = await getStreamHistory(streamId);
        if (active) setEvents(data);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load stream history");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, [streamId]);

  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  function getEventIcon(eventType: string): string {
    switch (eventType) {
      case "created":           return "🎉";
      case "claimed":           return "💰";
      case "canceled":          return "❌";
      case "start_time_updated": return "⏰";
      default:                  return "📌";
    }
  }

  function getEventDescription(event: StreamEvent): string {
    switch (event.eventType) {
      case "created":
        return `Stream created by ${event.actor?.slice(0, 8)}... for ${event.amount} tokens`;
      case "claimed":
        return `${event.actor?.slice(0, 8)}... claimed ${event.amount} tokens`;
      case "canceled":
        return `Stream canceled by ${event.actor?.slice(0, 8)}...`;
      case "start_time_updated":
        return `Start time updated by ${event.actor?.slice(0, 8)}...`;
      default:
        return "Unknown event";
    }
  }

  if (loading) return <p className="muted">Loading history…</p>;
  if (error)   return <p className="error-inline">{error}</p>;
  if (events.length === 0) return <p className="muted">No events recorded yet.</p>;

  return (
    <div className="stream-timeline">
      <h3>Stream timeline</h3>
      <ol className="timeline-list">
        {events.map((event) => (
          <li key={event.id} className="timeline-item">
            <span className="timeline-icon" aria-hidden>
              {getEventIcon(event.eventType)}
            </span>
            <div>
              <p className="timeline-description">{getEventDescription(event)}</p>
              <time
                className="muted"
                dateTime={new Date(event.timestamp * 1000).toISOString()}
              >
                {formatTimestamp(event.timestamp)}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}