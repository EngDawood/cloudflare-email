"use client";

import { useState } from "react";
import { format } from "date-fns";
import { type Email, replyToEmail, forwardEmail, deleteEmail as deleteEmailApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { Reply, Forward, Trash2, X, Loader2 } from "lucide-react";

interface EmailDetailProps {
  email: Email;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function EmailDetail({ email, onClose, onDelete }: EmailDetailProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReply() {
    if (!replyBody.trim()) return;
    setLoading(true);
    try {
      await replyToEmail(email.id, replyBody);
      toast({ title: "Reply sent", description: `Reply sent to ${email.from}` });
      setReplyOpen(false);
      setReplyBody("");
    } catch {
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleForward() {
    if (!forwardTo.trim()) return;
    setLoading(true);
    try {
      await forwardEmail(email.id, forwardTo);
      toast({ title: "Email forwarded", description: `Forwarded to ${forwardTo}` });
      setForwardOpen(false);
      setForwardTo("");
    } catch {
      toast({ title: "Failed to forward email", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteEmailApi(email.id);
      toast({ title: "Email deleted" });
      onDelete(email.id);
    } catch {
      toast({ title: "Failed to delete email", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold truncate">{email.subject}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* Meta */}
        <div className="p-4 border-b space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium">{email.fromName || email.from}</p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(email.date), "PPpp")}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">To: {email.to}</p>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 overflow-auto">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{email.body}</p>
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setReplyOpen(true)}>
            <Reply className="h-4 w-4 mr-2" />
            Reply
          </Button>
          <Button variant="outline" size="sm" onClick={() => setForwardOpen(true)}>
            <Forward className="h-4 w-4 mr-2" />
            Forward
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Reply Dialog */}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to {email.fromName || email.from}</DialogTitle>
            <DialogDescription>Re: {email.subject}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reply-body">Message</Label>
              <Textarea
                id="reply-body"
                placeholder="Write your reply..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReply} disabled={loading || !replyBody.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forward Dialog */}
      <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forward Email</DialogTitle>
            <DialogDescription>Fwd: {email.subject}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forward-to">To</Label>
              <Input
                id="forward-to"
                type="email"
                placeholder="recipient@example.com"
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
              />
            </div>
            <div className="p-3 bg-muted rounded-md text-sm">
              <p className="font-medium mb-2">Original message:</p>
              <p className="text-muted-foreground whitespace-pre-wrap truncate">
                {email.body.slice(0, 200)}...
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForwardOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleForward} disabled={loading || !forwardTo.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Forward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
