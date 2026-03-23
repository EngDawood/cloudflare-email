"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { getEmails, type Email } from "@/lib/api";
import { EmailList } from "@/components/email-list";
import { EmailDetail } from "@/components/email-detail";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  
  const { data, isLoading, mutate } = useSWR("emails", getEmails, {
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  const emails = data?.emails ?? [];

  const handleDelete = useCallback(
    (id: string) => {
      mutate(
        { emails: emails.filter((e) => e.id !== id), cursor: data?.cursor ?? null },
        false
      );
      setSelectedEmail(null);
    },
    [emails, data?.cursor, mutate]
  );

  return (
    <div className="h-screen flex">
      {/* Email List */}
      <div
        className={cn(
          "w-full md:w-96 border-r bg-background overflow-y-auto",
          selectedEmail && "hidden md:block"
        )}
      >
        <div className="sticky top-0 bg-background border-b px-4 py-3 lg:pl-4">
          <h1 className="text-lg font-semibold pl-10 lg:pl-0">Inbox</h1>
        </div>
        <EmailList
          emails={emails}
          selectedId={selectedEmail?.id ?? null}
          onSelect={setSelectedEmail}
          isLoading={isLoading}
        />
      </div>

      {/* Email Detail */}
      <div
        className={cn(
          "flex-1 bg-background",
          !selectedEmail && "hidden md:flex md:items-center md:justify-center"
        )}
      >
        {selectedEmail ? (
          <EmailDetail
            email={selectedEmail}
            onClose={() => setSelectedEmail(null)}
            onDelete={handleDelete}
          />
        ) : (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium">Select an email</p>
            <p className="text-sm">Choose an email from the list to view its contents</p>
          </div>
        )}
      </div>
    </div>
  );
}
