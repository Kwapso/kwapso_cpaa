"use client"

// useScreenActions — the deep-link host's WRITE layer: the named-action dispatcher
// plus the two rich-payload creators (learning article, help ticket). Lifted out of
// the component so the host's mutation surface is one named thing, not inline in the
// render path.
//
// Every action follows the same cache-first rule (CACHING.md): call the
// permission-checked endpoint, PRIME the actor's own cache with the returned list so
// their screen updates instantly, and INVALIDATE any sibling cache whose count the
// write changed — everyone else gets the realtime row ping and re-pulls. runAction
// THROWS on failure so the calling dialog / confirm surfaces the error; the creators
// let the ApiFailure propagate the same way. Nothing here bypasses a gate — these are
// the exact endpoints the manual UI calls.

import * as React from "react"

import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"

import { content as contentApi, tenancy } from "@/lib/api"
import {
  accountsKey,
  brandAssetsKey,
  knowledgeKey,
  listFetch,
  marketingKey,
  programmesKey,
  purposesKey,
  tasksKey,
} from "@/lib/live-resources"
import { invalidate, primeCache } from "@shared/web/store"
import type { AccountFormValues } from "@/components/account-form-dialog"
import type { LearningFormValues } from "@/components/learning-form-dialog"
import type { KnowledgeFormValues } from "@/components/knowledge-form-dialog"

/** The four agency-internal record kinds, keyed by their URL segment (which is
 * what the host has in hand when a panel opens). */
export type InternalKind = "marketing" | "brand" | "delivery" | "purposes"

/** Per kind: which door writes it, which cache holds it, which table its history
 * is under, and what to say when one is created. A table rather than a switch
 * with four near-identical arms — the arms would differ only in those four
 * values, and a switch hides that they are the only difference. */
const INTERNAL_WRITERS: Record<
  InternalKind,
  {
    table: string
    created: string
    key: (teamId: string) => string
    save: (v: Record<string, string>, id?: string) => Promise<unknown[]>
    setActive: (id: string, active: boolean) => Promise<unknown[]>
  }
> = {
  marketing: {
    table: "marketing_posts",
    created: "Post recorded.",
    key: marketingKey,
    save: async (v, id) => {
      const body = {
        title: v.title,
        channel: v.channel || undefined,
        status: v.status || undefined,
        summary: v.summary || undefined,
        body: v.body || undefined,
        link: v.link || undefined,
        publishedOn: v.publishedOn || undefined,
      }
      const r = id
        ? await contentApi.updateMarketingPost({ id, ...body })
        : await contentApi.createMarketingPost(body)
      return r.posts
    },
    setActive: (id, active) => contentApi.setMarketingPostActive(id, active).then((r) => r.posts),
  },
  brand: {
    table: "brand_assets",
    created: "Added to the brand library.",
    key: brandAssetsKey,
    save: async (v, id) => {
      const body = {
        name: v.name,
        category: v.category || undefined,
        description: v.description || undefined,
        fileUrl: v.fileUrl || undefined,
      }
      const r = id ? await contentApi.updateBrandAsset({ id, ...body }) : await contentApi.createBrandAsset(body)
      return r.assets
    },
    setActive: (id, active) => contentApi.setBrandAssetActive(id, active).then((r) => r.assets),
  },
  delivery: {
    table: "programs",
    created: "Programme added.",
    key: programmesKey,
    save: async (v, id) => {
      const body = {
        name: v.name,
        description: v.description || undefined,
        // The one numeric field in the four: the form hands back a string, and
        // an empty one means "leave it at the default" rather than zero.
        sequence: v.sequence ? Number(v.sequence) : undefined,
      }
      const r = id ? await contentApi.updateProgramme({ id, ...body }) : await contentApi.createProgramme(body)
      return r.programs
    },
    setActive: (id, active) => contentApi.setProgrammeActive(id, active).then((r) => r.programs),
  },
  purposes: {
    table: "meeting_purposes",
    created: "Meeting purpose added.",
    key: purposesKey,
    save: async (v, id) => {
      const body = {
        name: v.name,
        department: v.department || undefined,
        description: v.description || undefined,
      }
      const r = id
        ? await contentApi.updateMeetingPurpose({ id, ...body })
        : await contentApi.createMeetingPurpose(body)
      return r.purposes
    },
    setActive: (id, active) => contentApi.setMeetingPurposeActive(id, active).then((r) => r.purposes),
  },
}

export function useScreenActions(teamId: string | null) {
  // The named-action dispatcher — the flat `{key: string}` payloads the engine emits.
  const runAction = React.useCallback(
    async (actionId: string, payload: Record<string, string>) => {
      if (!teamId) return
      switch (actionId) {
        case "members.changeRole": {
          const { members } = await tenancy.setMemberRole(payload.userId, payload.roleId)
          primeCache(`members:${teamId}`, members)
          invalidate(`member_roles:${teamId}`) // member counts per role changed
          invalidate(`activity:user:${payload.userId}`) // their activity feed gained a row
          toast.success("Role updated.")
          break
        }
        case "members.remove": {
          const { members } = await tenancy.removeMember(payload.userId)
          primeCache(`members:${teamId}`, members)
          invalidate(`member_roles:${teamId}`)
          invalidate(`activity:user:${payload.userId}`)
          toast.success("Member removed.")
          break
        }
        case "invites.create": {
          const { invites } = await tenancy.createInvite(payload.email, payload.roleId)
          primeCache(`invites:${teamId}`, invites)
          toast.success(`Invited ${payload.email}.`)
          break
        }
        case "invites.revoke": {
          const { invites } = await tenancy.revokeInvite(payload.inviteId)
          primeCache(`invites:${teamId}`, invites)
          toast.success("Invite revoked.")
          break
        }
        case "roles.create": {
          const { roles: next } = await tenancy.createRole(payload.title, payload.description)
          primeCache(`member_roles:${teamId}`, next)
          toast.success(`Created ${payload.title}.`)
          break
        }
        // OUR OWN ADMIN, ticked off — and untickable, because a task marked done
        // by mistake is a task somebody has to be able to put back. It needs no
        // confirm: nothing is lost either way, and a confirm on a tick is the
        // kind of ceremony that teaches people to click through dialogs.
        case "tasks.done": {
          const { tasks } = await contentApi.setTaskDone(payload.id, payload.done === "true")
          primeCache(tasksKey(teamId), tasks)
          invalidate(`activity:record:tasks:${payload.id}`)
          toast.success(payload.done === "true" ? "Ticked off." : "Put back.")
          break
        }
      }
    },
    [teamId]
  )

  // Create a learning article — its own handler (a rich payload, not the flat string
  // map runAction takes). Primes the list so the new article appears at once; the
  // realtime "add" ping refreshes it for everyone else.
  const createLearning = React.useCallback(
    async (values: LearningFormValues) => {
      if (!teamId) return
      const { learning: next } = await contentApi.createLearning({
        title: values.title,
        category: values.category || null,
        contentType: values.contentType || null,
        contentLink: values.contentLink || null,
        body: values.body || null,
      })
      primeCache(`learning:${teamId}`, next)
      toast.success(`Created "${values.title}".`)
    },
    [teamId]
  )

  // Raise a help ticket — its own handler (a small object payload). Primes the list
  // so the ticket shows at once; the realtime "add" ping refreshes everyone else.
  const createHelp = React.useCallback(
    async (input: { description: string; helpType?: string; accountId?: string }) => {
      if (!teamId) return
      const { tickets } = await contentApi.createHelp(input)
      primeCache(`help:${teamId}`, tickets)
      toast.success("Ticket raised.")
    },
    [teamId]
  )

  // Add an account (a company or a person). The list is PAGED, so the create call
  // can't hand back "the new list" — we re-pull page ONE instead, which is where
  // the newest row now sits, and that same fetcher re-primes the exact total and
  // the cursor. Everyone else gets the realtime "add" ping.
  const createAccount = React.useCallback(
    async (values: AccountFormValues) => {
      if (!teamId) return
      await tenancy.createAccount({
        accountType: values.accountType,
        name: values.name.trim(),
        parentAccountId: values.parentAccountId || undefined,
        code: values.code.trim() || undefined,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        address: values.address.trim() || undefined,
        status: values.status.trim() || undefined,
      })
      primeCache(accountsKey(teamId), await listFetch.accounts(teamId))
      toast.success(`Added ${values.name.trim()}.`)
    },
    [teamId]
  )

  // Add a knowledge source. The list is PAGED, so the create call can't hand back
  // "the new list" — page ONE is re-pulled instead, which is where the newest row
  // now sits, and that same fetcher re-primes the exact total and the cursor
  // (accounts does the same thing for the same reason). Everyone else gets the
  // realtime "add" ping.
  const createKnowledge = React.useCallback(
    async (values: KnowledgeFormValues) => {
      if (!teamId) return
      await contentApi.createKnowledge({
        title: values.title,
        body: values.body || null,
        sourceUrl: values.sourceUrl || null,
        accountId: values.accountId || null,
        visibility: values.visibility,
      })
      primeCache(knowledgeKey(teamId), await listFetch.knowledge(teamId))
      toast.success(`The assistant can now use "${values.title}".`)
    },
    [teamId]
  )

  // Upload a FILE as a source. Same cache move as the typed note above (page one
  // is re-pulled, because the list pages), and one thing it does not share: the
  // toast is DERIVED FROM THE ANSWER rather than assumed. A file we could not
  // read is stored and listed on purpose, and telling somebody "the assistant
  // can now use it" when it cannot is the exact lie this feature is built not to
  // tell — so the door's own sentence is what gets shown.
  const uploadKnowledgeFile = React.useCallback(
    async (values: {
      fileName: string
      fileDataUrl: string
      title: string
      accountId: string
      visibility: "team" | "private"
    }) => {
      if (!teamId) return
      const { source } = await contentApi.uploadKnowledgeFile({
        fileName: values.fileName,
        fileDataUrl: values.fileDataUrl,
        title: values.title || undefined,
        accountId: values.accountId || null,
        visibility: values.visibility,
      })
      primeCache(knowledgeKey(teamId), await listFetch.knowledge(teamId))
      if (source?.fileNote) toast.warning(source.fileNote)
      else toast.success(`The assistant can now use "${source?.title ?? values.fileName}".`)
    },
    [teamId]
  )

  // THE AGENCY'S OWN HOUSEKEEPING — one writer for the four record kinds, because
  // they are one shape: a create or an edit against a CAPPED list, whose door
  // hands back the whole (small) collection, so the actor's cache is primed
  // straight from the response and everyone else gets the row-level ping. No
  // re-pull, unlike accounts and knowledge above — those page, and a page-one
  // refetch is the honest way to find a new row in a list you only hold part of.
  const saveInternalRecord = React.useCallback(
    async (kind: InternalKind, values: Record<string, string>, id?: string) => {
      if (!teamId) return
      const spec = INTERNAL_WRITERS[kind]
      const next = await spec.save(values, id)
      primeCache(spec.key(teamId), next)
      // The record's own history gained a row; its Activity tab reads that key.
      if (id) invalidate(`activity:record:${spec.table}:${id}`)
      toast.success(id ? "Saved." : spec.created)
    },
    [teamId]
  )

  /** Archive or restore one of those records. Separate from the save above
   * because it is the DELETE right rather than the edit one, and because it is
   * the half a confirm panel stands in front of. */
  const setInternalActive = React.useCallback(
    async (kind: InternalKind, id: string, active: boolean) => {
      if (!teamId) return
      const spec = INTERNAL_WRITERS[kind]
      primeCache(spec.key(teamId), await spec.setActive(id, active))
      invalidate(`activity:record:${spec.table}:${id}`)
      toast.success(active ? "Restored." : "Archived.")
    },
    [teamId]
  )

  return {
    runAction,
    createLearning,
    createHelp,
    createAccount,
    createKnowledge,
    uploadKnowledgeFile,
    saveInternalRecord,
    setInternalActive,
  }
}
