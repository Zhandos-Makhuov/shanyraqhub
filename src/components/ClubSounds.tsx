import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { playSound } from '../utils/sound';

/**
 * Sounds for good news (25.11.2026, owner's request): a new level — the sword "shing"; a new achievement —
 * a dombyra pluck. Only notifications that arrive while the site is open (never the ones already there),
 * one sound at a time (a level wins over an achievement). Reads notifications only; rewards are untouched.
 */
export const ClubSounds: React.FC = () => {
  const { notifications, currentUser } = useApp();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const mine = notifications.filter(n => n.userId === currentUser.id && (n.type === 'level_up' || n.type === 'achievement'));
    if (!seen.current) {
      seen.current = new Set(mine.map(n => n.id)); // first render: existing ones are history
      return;
    }
    const fresh = mine.filter(n => !n.read && !seen.current!.has(n.id));
    mine.forEach(n => seen.current!.add(n.id));
    if (fresh.some(n => n.type === 'level_up')) void playSound('sword');
    else if (fresh.length) void playSound('pluck');
  }, [notifications, currentUser.id]);

  // A different member (demo account switch) starts with a clean history.
  useEffect(() => { seen.current = null; }, [currentUser.id]);

  return null;
};
