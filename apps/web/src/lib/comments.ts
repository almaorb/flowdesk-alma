import type { CommentDto } from '@flowdesk/shared';

export const isOptimistic = (comment: CommentDto): boolean => comment.id.startsWith('optimistic-');

/**
 * Inserts a server-confirmed comment into a thread exactly once.
 *
 * A reply reaches the cache twice — from the mutation's response and from the
 * realtime broadcast — and the two can arrive in either order. This drops the
 * matching optimistic placeholder (by id, or by author+body when the socket
 * wins the race) and refuses to append an id that is already present, so the
 * thread never doubles up.
 */
export function upsertComment(
  comments: CommentDto[],
  incoming: CommentDto,
  optimisticId?: string,
): CommentDto[] {
  const pruned = comments.filter((comment) => {
    if (optimisticId && comment.id === optimisticId) return false;
    if (isOptimistic(comment) && comment.author?.id === incoming.author?.id && comment.body === incoming.body) {
      return false;
    }
    return true;
  });

  if (pruned.some((comment) => comment.id === incoming.id)) return pruned;
  return [...pruned, incoming];
}
