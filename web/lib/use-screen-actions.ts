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
import { accountsKey, knowledgeKey, listFetch } from "@/lib/live-resources"
import { invalidate, primeCache } from "@shared/web/store"
import type { AccountFormValues } from "@/components/account-form-dialog"
import type { LearningFormValues } from "@/components/learning-form-dialog"
import type { KnowledgeFormValues } from "@/components/knowledge-form-dialog"

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
    async (input: { description: string; helpType?: string }) => {
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

  return { runAction, createLearning, createHelp, createAccount, createKnowledge }
}
