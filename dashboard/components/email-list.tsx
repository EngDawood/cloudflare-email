"use client";

import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { type Email } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Inbox } from "lucide-react";

interface EmailListProps {
  emails: Email[];
  selectedId: string | null;
  onSelect: (email: Email) => void;
  isLoading: boolean;
}

export function EmailList({ emails, selectedId, onSelect, isLoading }: EmailListProps) {
  if (isLoading) {
    return (
      <div className="divide-y">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium">No emails yet</p>
        <p className="text-sm">{"Emails sent to admin@engdawood.com will appear here"}</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {emails.map((email) => (
        <button
          key={email.id}
          type="button"
          onClick={() => onSelect(email)}
          className={cn(
            "w-full text-left p-4 hover:bg-muted/50 transition-colors",
            selectedId === email.id && "bg-muted"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm truncate max-w-[200px]">
              {email.fromName || email.from}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {format(new Date(email.date), "PPpp")}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm font-medium truncate mb-1">{email.subject}</p>
          <p className="text-xs text-muted-foreground truncate">
            {email.body.slice(0, 100)}
          </p>
        </button>
      ))}
    </div>
  );
}
