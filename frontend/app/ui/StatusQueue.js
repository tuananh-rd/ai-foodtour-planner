'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const PRIORITY_MAP = {
  error: 30,
  warning: 20,
  info: 10,
};

class StatusQueueManager {
  constructor() {
    this.items = [];
    this.listeners = new Set();
    this.nextSeq = 1;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getActive(), [...this.items]);
      } catch (err) {
        console.error('StatusQueue listener error:', err);
      }
    }
  }

  /**
   * Enqueue a new banner notification.
   * Priority: error (30) > warning (20) > info (10)
   */
  enqueue(item) {
    const id = item.id || `banner_${Date.now()}_${this.nextSeq++}`;
    const type = item.type || 'info';
    const priority = item.priority ?? (PRIORITY_MAP[type] || 10);
    const entry = {
      ...item,
      id,
      type,
      priority,
      seq: this.nextSeq++,
      timestamp: Date.now(),
    };

    // Remove any existing entry with the same ID
    this.items = this.items.filter((i) => i.id !== id);
    this.items.push(entry);
    this.notify();
    return id;
  }

  dismiss(id) {
    const prev = this.items.find((i) => i.id === id);
    this.items = this.items.filter((i) => i.id !== id);
    if (prev?.onDismiss) {
      try {
        prev.onDismiss();
      } catch (_) {}
    }
    this.notify();
  }

  clear() {
    this.items = [];
    this.notify();
  }

  /**
   * Guaranteed: ONLY ONE banner is active at any time,
   * strictly adhering to the priority order: error > warning > info,
   * then FIFO (earlier sequence number).
   */
  getActive() {
    if (this.items.length === 0) return null;
    const sorted = [...this.items].sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.seq - b.seq;
    });
    return sorted[0];
  }

  getAll() {
    return [...this.items];
  }
}

export const globalStatusQueue = new StatusQueueManager();

const StatusQueueContext = createContext({
  activeBanner: null,
  enqueue: (item) => globalStatusQueue.enqueue(item),
  dismiss: (id) => globalStatusQueue.dismiss(id),
  clear: () => globalStatusQueue.clear(),
  queueCount: 0,
});

export function StatusQueueProvider({ children, manager = globalStatusQueue }) {
  const [activeBanner, setActiveBanner] = useState(() => manager.getActive());
  const [queueCount, setQueueCount] = useState(() => manager.getAll().length);

  useEffect(() => {
    setActiveBanner(manager.getActive());
    setQueueCount(manager.getAll().length);

    const unsubscribe = manager.subscribe((active, all) => {
      setActiveBanner(active);
      setQueueCount(all.length);
    });
    return unsubscribe;
  }, [manager]);

  const value = useMemo(
    () => ({
      activeBanner,
      enqueue: (item) => manager.enqueue(item),
      dismiss: (id) => manager.dismiss(id),
      clear: () => manager.clear(),
      queueCount,
    }),
    [activeBanner, queueCount, manager]
  );

  return (
    <StatusQueueContext.Provider value={value}>
      {children}
    </StatusQueueContext.Provider>
  );
}

export function useStatusQueue() {
  return useContext(StatusQueueContext);
}
