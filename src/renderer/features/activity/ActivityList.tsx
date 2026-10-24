import { useState } from 'react';
import type { ActivityEvent } from '@shared/domain';
import type { Result } from '@shared/result';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { ErrorNotice, Loading } from '../../components/ui';
import { formatTimestamp, localToday } from '../../lib/format';
import { describeActivity, KIND_LABEL } from './describe';

export const ACTIVITY_PAGE = 50;

/**
 * Recorded changes, newest first (ADR-0021). With `showItem`, each entry names its item and
 * opens it; an item that is gone shows as plain text. "Show more" loads 50 more at a time.
 */
export function ActivityList({
  queryKey,
  load,
  label,
  showItem = false,
  pageSize = ACTIVITY_PAGE,
  more = true,
  empty = 'Nothing has changed yet.',
}: {
  queryKey: string;
  load: (limit: number) => Promise<Result<ActivityEvent[]>>;
  label: string;
  showItem?: boolean;
  pageSize?: number;
  /** Offer "Show more" when the page is full. */
  more?: boolean;
  empty?: string;
}) {
  const [limit, setLimit] = useState(pageSize);
  const events = useQuery(`activity:${queryKey}:${limit}`, () => load(limit));
  const today = localToday();
  const { navigate, openTask } = useNavigation();

  const open = (e: ActivityEvent) => {
    if (e.itemKind === 'task') openTask(e.itemId);
    else if (e.itemKind === 'note') navigate({ name: 'notes', noteId: e.itemId });
    else if (e.itemKind === 'project') navigate({ name: 'project', id: e.itemId });
    else navigate({ name: 'project', id: e.projectId!, milestoneId: e.itemId });
  };

  if (events.error) return <ErrorNotice error={events.error} onRetry={events.reload} />;
  if (!events.data) return <Loading />;
  if (events.data.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <>
      <ol className="activity-list" aria-label={label}>
        {events.data.map((e) => (
          <li key={e.id} className="activity-item">
            {showItem && (
              <span className="activity-item__item">
                <span className="activity-item__kind">{KIND_LABEL[e.itemKind]}</span>{' '}
                {e.live ? (
                  <button type="button" className="link" onClick={() => open(e)}>
                    {e.title}
                  </button>
                ) : (
                  <span title="No longer available">{e.title}</span>
                )}
              </span>
            )}
            <span className="activity-item__what">{describeActivity(e, today)}</span>
            <time className="activity-item__when" dateTime={e.at}>
              {formatTimestamp(e.at)}
            </time>
          </li>
        ))}
      </ol>
      {more && events.data.length === limit && (
        <button
          type="button"
          className="btn btn--quiet btn--small"
          onClick={() => setLimit((l) => l + pageSize)}
        >
          Show more
        </button>
      )}
    </>
  );
}
