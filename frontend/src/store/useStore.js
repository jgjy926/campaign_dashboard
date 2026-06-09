// Single source of truth. Mutations update the in-memory doc, persist to
// IndexedDB immediately (local-first), and schedule a debounced cloud save.
import { create } from 'zustand'
import { defaultDocument } from '../lib/schema'
import { loadState, saveState } from '../lib/storage'
import { hydrateFromRemote, scheduleSave } from '../lib/sync'
import { generateCycles } from '../lib/cycles'

// Apply a mutation: stamp last_updated, persist locally, schedule remote save.
function persist(set, get, nextDoc) {
  const doc = { ...nextDoc, last_updated: new Date().toISOString() }
  set({ doc })
  saveState(doc) // fire-and-forget; IndexedDB write
  scheduleSave(doc, (syncStatus) => set({ syncStatus }))
  return doc
}

function replaceCampaign(doc, campaignId, updater) {
  return {
    ...doc,
    campaigns: doc.campaigns.map((c) => (c.campaign_id === campaignId ? updater(c) : c)),
  }
}

export const useStore = create((set, get) => ({
  doc: defaultDocument(),
  ready: false,
  syncStatus: 'idle', // 'idle' | 'saving' | 'saved' | 'error'

  // Mount: load local cache, render, then reconcile with remote.
  init: async () => {
    const local = await loadState()
    if (local) set({ doc: local })
    set({ ready: true })
    try {
      const winner = await hydrateFromRemote(local)
      if (winner) {
        set({ doc: winner })
        saveState(winner)
      }
    } catch (e) {
      console.warn('remote hydrate skipped:', e.message)
    }
  },

  // ---- Cards ----
  upsertCard: (card) =>
    set((s) => {
      const exists = s.doc.cards.some((c) => c.card_id === card.card_id)
      const cards = exists
        ? s.doc.cards.map((c) => (c.card_id === card.card_id ? card : c))
        : [...s.doc.cards, card]
      return { doc: persist(set, get, { ...s.doc, cards }) }
    }),

  deleteCard: (cardId) =>
    set((s) => ({
      doc: persist(set, get, {
        ...s.doc,
        cards: s.doc.cards.filter((c) => c.card_id !== cardId),
      }),
    })),

  // ---- Campaigns ----
  upsertCampaign: (campaign) =>
    set((s) => {
      // Keep monthly cycles in sync with the date window.
      const withCycles = {
        ...campaign,
        cycles: generateCycles(campaign.start_date, campaign.end_date, campaign.cycles || []),
      }
      const exists = s.doc.campaigns.some((c) => c.campaign_id === campaign.campaign_id)
      const campaigns = exists
        ? s.doc.campaigns.map((c) => (c.campaign_id === campaign.campaign_id ? withCycles : c))
        : [...s.doc.campaigns, withCycles]
      return { doc: persist(set, get, { ...s.doc, campaigns }) }
    }),

  deleteCampaign: (campaignId) =>
    set((s) => ({
      doc: persist(set, get, {
        ...s.doc,
        campaigns: s.doc.campaigns.filter((c) => c.campaign_id !== campaignId),
      }),
    })),

  // ---- Cycles (monthly tracker rows) ----
  updateCycle: (campaignId, cycleId, patch) =>
    set((s) => ({
      doc: persist(
        set,
        get,
        replaceCampaign(s.doc, campaignId, (c) => ({
          ...c,
          cycles: c.cycles.map((cy) => (cy.cycle_id === cycleId ? { ...cy, ...patch } : cy)),
        })),
      ),
    })),

  deleteCycle: (campaignId, cycleId) =>
    set((s) => ({
      doc: persist(
        set,
        get,
        replaceCampaign(s.doc, campaignId, (c) => ({
          ...c,
          cycles: c.cycles.filter((cy) => cy.cycle_id !== cycleId),
        })),
      ),
    })),

  // ---- Attachments (T&C snapshot / SMS image) ----
  addAttachment: (campaignId, attachment) =>
    set((s) => ({
      doc: persist(
        set,
        get,
        replaceCampaign(s.doc, campaignId, (c) => ({
          ...c,
          attachments: [...(c.attachments || []), attachment],
        })),
      ),
    })),

  removeAttachment: (campaignId, attId) =>
    set((s) => ({
      doc: persist(
        set,
        get,
        replaceCampaign(s.doc, campaignId, (c) => ({
          ...c,
          attachments: (c.attachments || []).filter((a) => a.att_id !== attId),
        })),
      ),
    })),
}))
