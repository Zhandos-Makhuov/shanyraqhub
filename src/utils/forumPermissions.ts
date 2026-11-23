import { ForumReply, ForumTopic, UserRole } from '../types';
import { hasRole } from './permissions';

/**
 * Who may do what in the forum (Phase 2.4 remaining scope).
 *
 * The database already allows (RLS + trigger guard_forum_moderation):
 *  - the author: change the text of their own topic/reply, delete it;
 *  - moderator+: everything above for any post, plus pin, close and hide.
 *
 * The site offers a narrower set on purpose (security concerns S-1/S-2 wait for the owner's decision):
 *  - a topic's author may edit or delete it only while nobody else has replied
 *    (deleting a topic also deletes other people's replies; editing could change what they answered);
 *  - in a closed topic members change nothing (a moderator still can hide or delete);
 *  - a moderator never edits someone else's text — they hide or delete it.
 */
type Actor = { id: string; role: UserRole };

export const canModerateForum = (role: UserRole) => hasRole(role, 'moderator');

export const othersReplied = (topic: ForumTopic, userId: string) => topic.replies.some(r => r.authorId !== userId);

/** Hidden posts are visible only to their author and moderators (as in RLS topics_read / replies_read). */
export const canSeeForumPost = (post: { authorId: string; isHidden?: boolean }, actor: Actor) =>
  !post.isHidden || post.authorId === actor.id || canModerateForum(actor.role);

export const canEditTopic = (topic: ForumTopic, actor: Actor) =>
  topic.authorId === actor.id && !topic.isClosed && !othersReplied(topic, actor.id);

export const canDeleteTopic = (topic: ForumTopic, actor: Actor) =>
  canModerateForum(actor.role) || (topic.authorId === actor.id && !topic.isClosed && !othersReplied(topic, actor.id));

export const canEditReply = (topic: ForumTopic, reply: ForumReply, actor: Actor) =>
  reply.authorId === actor.id && !topic.isClosed && !topic.isHidden;

export const canDeleteReply = (topic: ForumTopic, reply: ForumReply, actor: Actor) =>
  canModerateForum(actor.role) || (reply.authorId === actor.id && !topic.isClosed);
