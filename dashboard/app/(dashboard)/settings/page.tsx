"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { getSettings, saveSettings as saveSettingsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { Loader2, Save } from "lucide-react";

export default function SettingsPage() {
  const { data, isLoading, mutate } = useSWR("settings", getSettings);
  
  const [autoForwardEnabled, setAutoForwardEnabled] = useState(false);
  const [autoForwardAddress, setAutoForwardAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setAutoForwardEnabled(!!data.autoForward);
      setAutoForwardAddress(data.autoForward ?? "");
    }
  }, [data]);

  function handleToggle(enabled: boolean) {
    setAutoForwardEnabled(enabled);
    setHasChanges(true);
  }

  function handleAddressChange(address: string) {
    setAutoForwardAddress(address);
    setHasChanges(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const newSettings = {
        autoForward: autoForwardEnabled ? autoForwardAddress : null,
      };
      await saveSettingsApi(newSettings);
      mutate(newSettings);
      toast({ title: "Settings saved" });
      setHasChanges(false);
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="pl-10 lg:pl-0 mb-6">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground">Manage your email preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Auto-Forward</CardTitle>
            <CardDescription>
              Automatically forward incoming emails to another address
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-forward">Enable auto-forward</Label>
                    <p className="text-sm text-muted-foreground">
                      Forward all incoming emails automatically
                    </p>
                  </div>
                  <Switch
                    id="auto-forward"
                    checked={autoForwardEnabled}
                    onCheckedChange={handleToggle}
                  />
                </div>

                {autoForwardEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="forward-address">Forward to</Label>
                    <Input
                      id="forward-address"
                      type="email"
                      placeholder="forward@example.com"
                      value={autoForwardAddress}
                      onChange={(e) => handleAddressChange(e.target.value)}
                    />
                  </div>
                )}

                <div className="pt-4 border-t">
                  <Button
                    onClick={handleSave}
                    disabled={saving || (!hasChanges && !saving)}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
