import type { Metadata } from "next";
import { NotificationsList } from "@/components/notifications-list";
import { Card, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth/server";
import { listNotifications } from "@/modules/notifications/service";
import { markAllReadAction } from "../../notification-actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireStaff();
  const items = await listNotifications(ctx.userId);
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          items.some((n) => !n.readAt) && (
            <form action={markAllReadAction}>
              <button className="btn-secondary btn-sm">Tout marquer comme lu</button>
            </form>
          )
        }
      />
      <Card padded={false}>
        <NotificationsList items={items} />
      </Card>
    </>
  );
}
