import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type RequestBody =
  | { type: 'product_created'; productId: string }
  | { type: 'purchase_order_assigned'; orderId: string };

type PushTokenRow = { user_id: string; token: string };

const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request: Request, ctx: any) => {
    const callerId = getCallerId(ctx.userClaims);
    if (!callerId) {
      return Response.json({ error: 'No se pudo identificar al usuario.' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null) as RequestBody | null;
    if (!payload || !isValidPayload(payload)) {
      return Response.json({ error: 'Solicitud de notificaci\u00f3n inv\u00e1lida.' }, { status: 400 });
    }

    const notification = payload.type === 'product_created'
      ? await getProductNotification(ctx.supabaseAdmin, callerId, payload.productId)
      : await getOrderNotification(ctx.supabaseAdmin, callerId, payload.orderId);

    if ('error' in notification) {
      return Response.json({ error: notification.error }, { status: notification.status });
    }

    const { data: tokens, error: tokensError } = await ctx.supabaseAdmin
      .from('device_push_tokens')
      .select('user_id, token')
      .in('user_id', notification.recipientIds);
    if (tokensError) {
      throw new Error(tokensError.message);
    }

    const tokensByUser = new Map<string, string[]>();
    for (const token of (tokens ?? []) as PushTokenRow[]) {
      tokensByUser.set(token.user_id, [...(tokensByUser.get(token.user_id) ?? []), token.token]);
    }

    let delivered = 0;
    for (const recipientId of notification.recipientIds) {
      const recipientTokens = tokensByUser.get(recipientId) ?? [];
      if (!recipientTokens.length) {
        continue;
      }
      const { data: delivery, error: deliveryError } = await ctx.supabaseAdmin
        .from('push_notification_deliveries')
        .insert({ event_type: payload.type, source_id: notification.sourceId, recipient_id: recipientId })
        .select('recipient_id')
        .maybeSingle();
      if (deliveryError && deliveryError.code !== '23505') {
        throw new Error(deliveryError.message);
      }
      if (!delivery) {
        continue;
      }

      try {
        await sendExpoPushNotification(recipientTokens, notification.title, notification.body, notification.data);
        delivered += recipientTokens.length;
      } catch (error) {
        await ctx.supabaseAdmin
          .from('push_notification_deliveries')
          .delete()
          .eq('event_type', payload.type)
          .eq('source_id', notification.sourceId)
          .eq('recipient_id', recipientId);
        throw error;
      }
    }

    return Response.json({ delivered });
  }),
};

function getCallerId(claims: Record<string, unknown> | undefined): string | null {
  const id = claims?.sub ?? claims?.id;
  return typeof id === 'string' ? id : null;
}

function isValidPayload(payload: RequestBody): boolean {
  return (payload.type === 'product_created' && Boolean(payload.productId))
    || (payload.type === 'purchase_order_assigned' && Boolean(payload.orderId));
}

async function getProductNotification(admin: any, callerId: string, productId: string) {
  const { data: product, error } = await admin
    .from('products')
    .select('id, owner_id, name')
    .eq('id', productId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!product || product.owner_id !== callerId) {
    return { error: 'No puedes notificar este producto.', status: 403 } as const;
  }
  const { data: recipients, error: recipientsError } = await admin.from('device_push_tokens').select('user_id');
  if (recipientsError) {
    throw new Error(recipientsError.message);
  }
  return {
    recipientIds: [...new Set((recipients ?? []).map((recipient: { user_id: string }) => recipient.user_id))],
    sourceId: product.id,
    title: 'Nuevo producto disponible',
    body: `${product.name} ya est\u00e1 disponible en Shopiando.`,
    data: { type: 'product_created', productId: product.id },
  };
}

async function getOrderNotification(admin: any, callerId: string, orderId: string) {
  const { data: order, error } = await admin
    .from('purchase_orders')
    .select('id, requester_id, assignee_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!order || order.requester_id !== callerId || !order.assignee_id) {
    return { error: 'No puedes notificar este pedido.', status: 403 } as const;
  }
  return {
    recipientIds: [order.assignee_id],
    sourceId: order.id,
    title: 'Nuevo pedido asignado',
    body: 'Tienes un pedido pendiente de compra.',
    data: { type: 'purchase_order_assigned', orderId: order.id },
  };
}

async function sendExpoPushNotification(tokens: string[], title: string, body: string, data: Record<string, string>): Promise<void> {
  for (let start = 0; start < tokens.length; start += 100) {
    const response = await fetch(expoPushUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tokens.slice(start, start + 100).map((to) => ({
        to,
        title,
        body,
        data,
        sound: 'notification.wav',
        channelId: 'default',
        priority: 'high',
      }))),
    });
    if (!response.ok) {
      throw new Error(`Expo Push Service respondi\u00f3 con ${response.status}.`);
    }
  }
}
