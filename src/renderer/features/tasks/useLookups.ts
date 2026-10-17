import { useMemo } from 'react';
import type { Project, Tag } from '@shared/domain';
import { useQuery } from '../../app/data';

/** Projects (including archived) and tags, for names and colours in task rows and filters. */
export function useLookups() {
  const projects = useQuery('lookup:projects', () =>
    window.api.projects.list({ includeArchived: true }),
  );
  const tags = useQuery('lookup:tags', () => window.api.tags.list());
  return useMemo(() => {
    const projectList: Project[] = projects.data ?? [];
    const tagList: Tag[] = tags.data ?? [];
    return {
      projectList,
      tagList,
      projects: new Map(projectList.map((p) => [p.id, p])),
      tags: new Map(tagList.map((t) => [t.id, t])),
    };
  }, [projects.data, tags.data]);
}
